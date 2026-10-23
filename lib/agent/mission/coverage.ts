/** Radii tried when the requested area has too few sellers (requested first, then wider). */
export const COVERAGE_STEPS = [1000, 2000, 3000, 5000, 8000];

export function coverageRadii(requested: number): number[] {
  return [requested, ...COVERAGE_STEPS.filter((r) => r > requested)];
}

export type CoverageOutcome<T> = { rows: T[]; used: number; inRequested: number; tried: Array<{ radius_m: number; sellers: number }> };

/**
 * Widens the radius until at least `min` sellers are found or the steps run out (then the widest
 * radius is used). `fetchAt` runs the real seller search at one radius.
 */
export async function widenUntil<T>(requested: number, fetchAt: (radiusM: number) => Promise<T[]>, min = 3): Promise<CoverageOutcome<T>> {
  const tried: CoverageOutcome<T>['tried'] = [];
  let rows: T[] = [];
  let used = requested;
  let inRequested = 0;
  for (const r of coverageRadii(requested)) {
    rows = await fetchAt(r);
    used = r;
    tried.push({ radius_m: r, sellers: rows.length });
    if (r === requested) inRequested = rows.length;
    if (rows.length >= min) break;
  }
  return { rows, used, inRequested, tried };
}
