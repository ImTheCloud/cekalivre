export type LatLng = { lat: number; lng: number };

/** Qualité du géocodage renvoyée par le backend. */
export type GeocodePrecision = 'exact' | 'street' | 'approximate';

export type Stop = {
  id: string;
  /** Adresse telle que saisie par le chauffeur. */
  address: string;
  note: string;
  /** Nom du fichier photo dans le dossier `photos/` de l'app (pas une URI complète). */
  photo: string | null;
  /** Coordonnées trouvées par le géocodage (null tant que la tournée n'a pas été optimisée). */
  location: LatLng | null;
  /** Adresse reconnue par le géocodeur, pour que le chauffeur puisse vérifier. */
  label: string | null;
  precision: GeocodePrecision | null;
  /** Doute sur le géocodage (rue ou code postal différent, très loin du départ…), à montrer au chauffeur. */
  warning: string | null;
  /** Le géocodeur n'a rien trouvé pour cette adresse. */
  notFound: boolean;
  deliveredAt: number | null;
};

/** Point d'arrivée choisi pour la tournée en cours. */
export type EndPoint =
  | { mode: 'default' }
  | { mode: 'none' }
  | { mode: 'custom'; address: string };

export type RouteSummary = {
  optimizedAt: number;
  start: LatLng;
  end: (LatLng & { label: string }) | null;
  totalDurationS: number;
  totalDistanceM: number;
  /** 'osrm' = vrais temps de trajet routiers ; 'haversine' = estimation à vol d'oiseau. */
  matrixSource: 'osrm' | 'haversine';
};
