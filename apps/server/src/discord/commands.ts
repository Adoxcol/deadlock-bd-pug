import type { Role } from '../auth/rbac.js';
import { atLeast } from '../auth/rbac.js';

/** Minimum community role per slash command. Checked server-side against the linked User. */
export const COMMAND_PERMISSIONS: Record<string, Role> = {
  'pug create': 'MODERATOR', 'pug status': 'SPECTATOR',
  'draft create': 'CAPTAIN', 'draft view': 'SPECTATOR',
  'match track': 'MODERATOR', 'match live': 'SPECTATOR', 'match history': 'SPECTATOR',
  leaderboard: 'SPECTATOR', stats: 'SPECTATOR',
};

export function canRunCommand(command: string, role: Role | undefined): boolean {
  const need = COMMAND_PERMISSIONS[command];
  if (!need) return false;
  return need === 'SPECTATOR' ? true : atLeast(role, need);
}
