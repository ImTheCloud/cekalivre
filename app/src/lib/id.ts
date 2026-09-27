let counter = 0;

/** Identifiant unique local (suffisant pour des arrêts stockés sur un seul téléphone). */
export function createId(): string {
  counter = (counter + 1) % 1_000_000;
  return `${Date.now().toString(36)}-${counter.toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
