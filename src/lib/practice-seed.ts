/**
 * Marker string embedded in Close lead `description` by `scripts/seed-practice-leads.ts`.
 * Match prefix so older runs with different dates still classify as practice.
 */
export const PRACTICE_SEED_MARKER = "[Comeketo practice seed";

/** Full description tag for a given seed run (keep marker prefix in sync). */
export function practiceSeedTagForRun(isoDate: string): string {
  return `${PRACTICE_SEED_MARKER} ${isoDate}]`;
}

export function isPracticeSeedLead(description: string | undefined | null): boolean {
  return Boolean(description?.includes(PRACTICE_SEED_MARKER));
}
