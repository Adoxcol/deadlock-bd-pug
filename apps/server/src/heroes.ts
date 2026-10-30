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

/**
 * Offline roster: the current hero list with real Deadlock hero IDs, from deadlock-api's own roster
 * (website/src/lib/deadlockdle/roster.ts, MIT, synced 2026-10-30, 44 heroes).
 * Used when the assets API is unreachable. No portraits: images only come from the assets API at runtime.
 */
export const BUILTIN_HEROES: Hero[] = ([
  [1, "Infernus"],
  [2, "Seven"],
  [3, "Vindicta"],
  [4, "Lady Geist"],
  [6, "Abrams"],
  [7, "Wraith"],
  [8, "McGinnis"],
  [10, "Paradox"],
  [11, "Dynamo"],
  [12, "Kelvin"],
  [13, "Haze"],
  [14, "Holliday"],
  [15, "Bebop"],
  [16, "Calico"],
  [17, "Grey Talon"],
  [18, "Mo & Krill"],
  [19, "Shiv"],
  [20, "Ivy"],
  [25, "Warden"],
  [27, "Yamato"],
  [31, "Lash"],
  [35, "Viscous"],
  [50, "Pocket"],
  [52, "Mirage"],
  [58, "Vyper"],
  [60, "Sinclair"],
  [63, "Mina"],
  [64, "Drifter"],
  [65, "Venator"],
  [66, "Victor"],
  [67, "Paige"],
  [69, "The Doorman"],
  [72, "Billy"],
  [76, "Graves"],
  [77, "Apollo"],
  [78, "Deadman Danny"],
  [79, "Rem"],
  [80, "Silver"],
  [81, "Celeste"],
  [84, "Rat King"],
  [85, "Solomon"],
  [86, "Violet"],
  [87, "Nurse Harrow"],
  [88, "Baba"],
] as const).map(([id, name]) => ({ id, name, imageUrl: null, simulated: false }));
