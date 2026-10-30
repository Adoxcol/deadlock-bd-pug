import type { DraftState, TeamSide } from './types.js';

export type ProviderId = 'native' | 'deadlocklabs' | 'external';

export interface ImportedDraft { picks: Record<TeamSide, number[]>; bans: Record<TeamSide, number[]> }

/** Capabilities are explicit: callers must check before invoking optional operations. */
export interface DraftProvider {
  id: ProviderId;
  displayName: string;
  capabilities: { create: boolean; status: boolean; results: boolean; subscribe: boolean; linkUrl: boolean; manualImport: boolean };
  validateUrl?(url: string): boolean;
}

export const nativeProvider: DraftProvider = {
  id: 'native', displayName: 'Native Draft',
  capabilities: { create: true, status: true, results: true, subscribe: true, linkUrl: false, manualImport: false },
};

/** No documented API/webhook exists (docs/API_FEASIBILITY.md §4): link + manual import only. */
export const deadlockLabsProvider: DraftProvider = {
  id: 'deadlocklabs', displayName: 'Deadlock Labs',
  capabilities: { create: false, status: false, results: false, subscribe: false, linkUrl: true, manualImport: true },
  validateUrl: (u) => { try { const x = new URL(u); return x.protocol === 'https:' && /(^|\.)deadlocklabs\.gg$/.test(x.hostname); } catch { return false; } },
};

export const externalProvider: DraftProvider = {
  id: 'external', displayName: 'External Draft',
  capabilities: { create: false, status: false, results: false, subscribe: false, linkUrl: true, manualImport: true },
  validateUrl: (u) => { try { return new URL(u).protocol === 'https:'; } catch { return false; } },
};

export const providers: Record<ProviderId, DraftProvider> = { native: nativeProvider, deadlocklabs: deadlockLabsProvider, external: externalProvider };

export function validateImport(d: ImportedDraft, teamSize: number, bansPerTeam: number, heroIds: number[]): string[] {
  const errs: string[] = [];
  const known = new Set(heroIds);
  for (const t of ['amber', 'sapphire'] as const) {
    if (d.picks[t].length !== teamSize) errs.push(`${t}: expected ${teamSize} picks`);
    if (d.bans[t].length > bansPerTeam) errs.push(`${t}: at most ${bansPerTeam} bans`);
    if (new Set(d.picks[t]).size !== d.picks[t].length) errs.push(`${t}: duplicate pick`);
    for (const h of [...d.picks[t], ...d.bans[t]]) if (!known.has(h)) errs.push(`unknown hero ${h}`);
  }
  const banned = new Set([...d.bans.amber, ...d.bans.sapphire]);
  for (const h of [...d.picks.amber, ...d.picks.sapphire]) if (banned.has(h)) errs.push(`hero ${h} is both banned and picked`);
  return errs;
}

export function summarize(s: DraftState): ImportedDraft { return { picks: s.picks, bans: s.bans }; }
