export interface Hero { id: number; name: string; imageUrl: string | null; simulated: boolean; heroType?: string | null }

/**
 * Live roster: deadlock-api assets service (`GET {ASSETS_API_URL}/v2/heroes`, unverified from the
 * build sandbox — see docs/API_FEASIBILITY.md). Results are cached in memory and in the Hero table.
 */
export async function fetchHeroes(assetsUrl: string, fetchImpl: typeof fetch = fetch): Promise<Hero[]> {
  const res = await fetchImpl(`${assetsUrl}/v2/heroes?only_active=true`, { signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`Hero assets returned ${res.status}`);
  const raw = (await res.json()) as Array<{ id: number; name: string; disabled?: boolean; in_development?: boolean; hero_type?: string | null; images?: Record<string, string> }>;
  return raw
    .filter((h) => !h.disabled && !h.in_development)
    .map((h) => ({ id: h.id, name: h.name, imageUrl: h.images?.icon_hero_card ?? h.images?.icon_image_small ?? null, simulated: false, heroType: h.hero_type ?? null }));
}

/** Development/simulation roster. IDs are NOT real Deadlock hero IDs; everything is flagged simulated. */
export const SIMULATED_HEROES: Hero[] = [
  'Abrams', 'Bebop', 'Calico', 'Dynamo', 'Grey Talon', 'Haze', 'Holliday', 'Infernus', 'Ivy', 'Kelvin', 'Lady Geist',
  'Lash', 'McGinnis', 'Mirage', 'Mo & Krill', 'Paradox', 'Pocket', 'Seven', 'Shiv', 'Vindicta', 'Viscous', 'Warden',
  'Wraith', 'Yamato', 'Sinclair', 'Vyper',
].map((name, i) => ({ id: 9001 + i, name, imageUrl: null, simulated: true }));
