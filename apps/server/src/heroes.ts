export interface Hero {
  id: number; name: string; imageUrl: string | null; simulated: boolean; heroType?: string | null;
  /** Tall art with its painted background, and the stylised name logo (SVG). */
  verticalUrl?: string | null; nameUrl?: string | null;
  /** 4K hero-select backdrop (transparent on the left); the API has no larger portrait than the 280×380 card cutout. */
  backgroundUrl?: string | null;
  /** Full hero-select render with its scene painted in, about 200 KB. Null for heroes the render set doesn't cover. */
  renderUrl?: string | null;
  tags?: string[];
  /** Hero-select voicelines: `select` plays on pick, `unselect` on ban. */
  vo?: { pick: string[]; ban: string[] };
}

/**
 * Live roster from deadlock-api: `GET {DEADLOCK_API_URL}/v1/assets/heroes?only_active=true` (verified in the
 * deadlock-api source, api/src/routes/v1/assets/heroes/route.rs).
 * Portrait field names match deadlock-api's own HeroImage component (icon_hero_card_webp / icon_hero_card).
 */
export async function fetchHeroes(apiUrl: string, fetchImpl: typeof fetch = fetch): Promise<Hero[]> {
  const res = await fetchImpl(`${apiUrl}/v1/assets/heroes?only_active=true`, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Hero assets returned ${res.status}`);
  const raw = (await res.json()) as Array<{ id: number; name: string; class_name?: string; tags?: string[]; disabled?: boolean; in_development?: boolean; player_selectable?: boolean; hero_type?: string | null; images?: Record<string, string | null | undefined> }>;
  if (!Array.isArray(raw)) throw new Error('Unexpected hero assets response');
  const vo = await fetchVoicelines(apiUrl, fetchImpl);
  const heroes = raw
    // Not in_development: only_active already drops unreleased heroes, while Violet and Baba keep that flag and are played.
    .filter((h) => !h.disabled && h.player_selectable !== false)
    .map((h) => ({
      id: h.id, name: h.name, simulated: false, heroType: h.hero_type ?? null,
      imageUrl: h.images?.icon_hero_card_webp ?? h.images?.icon_hero_card ?? h.images?.top_bar_vertical_image ?? h.images?.icon_image_small ?? null,
      verticalUrl: h.images?.top_bar_vertical_image_webp ?? h.images?.top_bar_vertical_image ?? null,
      nameUrl: h.images?.name_image ?? null,
      tags: Array.isArray(h.tags) ? h.tags : [],
      backgroundUrl: h.images?.background_image_webp ?? h.images?.background_image ?? null,
      renderUrl: renderUrlFor(h.name),
      vo: voFor(vo, h.class_name),
    }));
  if (!heroes.length) throw new Error('Hero assets returned no heroes');
  return heroes;
}

/** JustGDX/DeadlockWiki, pinned to a commit so jsDelivr can cache it for good. The list is what that commit contains. */
const RENDER_BASE = 'https://cdn.jsdelivr.net/gh/JustGDX/DeadlockWiki@e0e9625c8b82aff873fb4be70f9d95850332af90/heroes';
const RENDERS = new Set('abrams apollo baba bebop billy calico celeste drifter dynamo graves grey-talon haze holliday infernus ivy kelvin lady-geist lash mcginnis mina mirage mo-and-krill paige paradox pocket rat-king rem seven shiv silver sinclair solomon the-doorman venator victor vindicta viscous vyper warden wraith yamato'.split(' '));
function renderUrlFor(name: string): string | null {
  const slug = name.toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9]+/g, '-');
  return RENDERS.has(slug) ? `${RENDER_BASE}/${slug}.webp` : null;
}

type VoTable = Record<string, Record<string, unknown>>;
/** The sounds index is ~18MB, so only the hero-select lines are kept. Voicelines are optional: failure yields none. */
async function fetchVoicelines(apiUrl: string, fetchImpl: typeof fetch): Promise<VoTable> {
  try {
    const res = await fetchImpl(`${apiUrl}/v1/assets/sounds`, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return {};
    const all = ((await res.json()) as { vo?: VoTable }).vo ?? {};
    const out: VoTable = {};
    for (const [k, lines] of Object.entries(all)) out[k] = Object.fromEntries(Object.entries(lines).filter(([n, u]) => typeof u === 'string' && /_(un)?select_\d+$/.test(n)));
    return out;
  } catch { return {}; }
}
function voFor(vo: VoTable, className?: string): Hero['vo'] {
  const k = className?.replace(/^hero_/, ''); const lines = k ? vo[k] : undefined;
  if (!k || !lines) return undefined;
  const pick = Object.entries(lines).filter(([n]) => n.startsWith(`${k}_select_`)).map(([, u]) => u as string);
  const ban = Object.entries(lines).filter(([n]) => n.startsWith(`${k}_unselect_`)).map(([, u]) => u as string);
  return pick.length || ban.length ? { pick, ban } : undefined;
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
