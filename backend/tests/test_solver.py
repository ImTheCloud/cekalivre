import itertools

from app.solver import solve_order, time_limit_for


def line_cost(positions: list[float]) -> list[list[int]]:
    """Points sur une droite : coût = distance absolue."""
    return [[round(abs(a - b)) for b in positions] for a in positions]


def route_cost(cost: list[list[int]], order: list[int], end: int | None) -> int:
    path = [0, *order] + ([end] if end is not None else [])
    return sum(cost[a][b] for a, b in itertools.pairwise(path))


def test_single_stop():
    assert solve_order(line_cost([0, 10]), end_index=None, time_limit_s=0.5) == [1]


def test_stops_on_a_line_without_end_are_visited_outward():
    # Départ en 0, arrêts mélangés : l'ordre optimal est croissant.
    positions = [0, 50, 10, 40, 20, 30]
    order = solve_order(line_cost(positions), end_index=None, time_limit_s=0.5)
    assert [positions[i] for i in order] == [10, 20, 30, 40, 50]


def test_end_point_is_respected():
    # Départ en 0, arrivée en 100 : on doit parcourir les arrêts dans l'ordre croissant.
    positions = [0, 70, 30, 90, 10, 100]
    order = solve_order(line_cost(positions), end_index=5, time_limit_s=0.5)
    assert sorted(order) == [1, 2, 3, 4]
    assert [positions[i] for i in order] == [10, 30, 70, 90]


def test_end_near_start_makes_a_loop():
    # Arrivée au même endroit que le départ : aller au plus loin puis revenir, coût = 2 x 50.
    positions = [0, 20, 50, 30, 0]
    cost = line_cost(positions)
    order = solve_order(cost, end_index=4, time_limit_s=0.5)
    assert sorted(order) == [1, 2, 3]
    assert route_cost(cost, order, 4) == 100


def test_matches_brute_force_on_random_asymmetric_instance():
    import random

    rng = random.Random(42)
    size = 8
    cost = [[0 if i == j else rng.randint(1, 100) for j in range(size)] for i in range(size)]
    order = solve_order(cost, end_index=None, time_limit_s=1)
    best = min(route_cost(cost, list(p), None) for p in itertools.permutations(range(1, size)))
    assert sorted(order) == list(range(1, size))
    assert route_cost(cost, order, None) == best


def test_time_limit_scales_with_stop_count():
    assert time_limit_for(1, 8) == 0.5
    assert time_limit_for(50, 8) == 4
    assert time_limit_for(300, 8) == 8
