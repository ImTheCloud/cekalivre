"""Calcul de l'ordre de passage optimal avec OR-Tools (problème du voyageur de commerce).

Nœuds : 0 = départ (position GPS), 1..n = arrêts, et éventuellement un nœud d'arrivée.
Sans arrivée imposée, on ajoute une arrivée "virtuelle" à coût nul depuis n'importe quel arrêt :
la tournée se termine alors naturellement au dernier arrêt.
"""

from __future__ import annotations

from ortools.constraint_solver import pywrapcp, routing_enums_pb2


class SolverError(Exception):
    pass


def time_limit_for(stop_count: int, max_seconds: float) -> float:
    """Plus il y a d'arrêts, plus on laisse de temps au solveur (0,5 s à `max_seconds`)."""
    return min(max_seconds, max(0.5, stop_count * 0.08))


def solve_order(cost: list[list[int]], end_index: int | None, time_limit_s: float) -> list[int]:
    """Renvoie les indices des arrêts (hors départ et arrivée) dans l'ordre de passage optimal.

    `cost[i][j]` = coût (secondes) pour aller de i à j. Le départ est toujours l'indice 0.
    `end_index` = indice de l'arrivée dans `cost`, ou None pour finir au dernier arrêt.
    """
    size = len(cost)
    if end_index is None:
        # Arrivée virtuelle : y aller ne coûte rien, depuis n'importe quel nœud.
        cost = [row + [0] for row in cost] + [[0] * (size + 1)]
        end = size
        size += 1
    else:
        end = end_index

    stops = [i for i in range(size) if i not in (0, end)]
    if len(stops) <= 1:
        return stops

    manager = pywrapcp.RoutingIndexManager(size, 1, [0], [end])
    routing = pywrapcp.RoutingModel(manager)

    def transit(from_index: int, to_index: int) -> int:
        return cost[manager.IndexToNode(from_index)][manager.IndexToNode(to_index)]

    callback = routing.RegisterTransitCallback(transit)
    routing.SetArcCostEvaluatorOfAllVehicles(callback)

    params = pywrapcp.DefaultRoutingSearchParameters()
    params.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    params.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    params.time_limit.FromMilliseconds(int(time_limit_s * 1000))

    solution = routing.SolveWithParameters(params)
    if solution is None:
        raise SolverError("OR-Tools n'a trouvé aucune solution.")

    order: list[int] = []
    index = solution.Value(routing.NextVar(routing.Start(0)))
    while not routing.IsEnd(index):
        order.append(manager.IndexToNode(index))
        index = solution.Value(routing.NextVar(index))
    return order
