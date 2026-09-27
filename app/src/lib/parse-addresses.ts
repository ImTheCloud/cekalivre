/**
 * Transforme un texte collé (une adresse par ligne) en liste d'adresses.
 * Les doublons sont conservés volontairement : plusieurs colis peuvent aller à la même adresse.
 */
export function parseAddresses(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) =>
      line
        // puces et numérotations en début de ligne : "- ", "• ", "12. ", "3) "
        .replace(/^\s*(?:[-•*]|\d{1,3}[.)])\s+/, '')
        .replace(/\s+/g, ' ')
        .trim(),
    )
    .filter((line) => line.length >= 3);
}
