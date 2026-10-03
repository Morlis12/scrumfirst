/** Colonnes Kanban pouvant accueillir une note de Daily (DONE exclu : Incrément livré). */
export const DAILY_COLUMNS = ["TODO", "IN_PROGRESS", "REVIEW"] as const;
export type DailyColumn = (typeof DAILY_COLUMNS)[number];

/** Natures d'un point Daily (sélecteur « Nature du point » de la modale d'étape). */
export const NOTE_NATURES = ["AVANCEMENT", "OBSTACLE", "ANNONCE"] as const;
export type NoteNature = (typeof NOTE_NATURES)[number];

export const NOTE_NATURE_LABEL: Record<NoteNature, string> = {
  AVANCEMENT: "🔵 Avancement général",
  OBSTACLE: "⚠️ Obstacle / Blocage",
  ANNONCE: "📢 Annonce / Rappel",
};

export function noteNatureLabel(nature: string): string {
  return (NOTE_NATURE_LABEL as Record<string, string>)[nature] ?? nature;
}

/** Tag auto généré à la création : "📅 Daily du 03/10/2026" (date système). */
export function dailyNoteTitleFor(date: Date = new Date()): string {
  return `📅 Daily du ${date.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  })}`;
}

