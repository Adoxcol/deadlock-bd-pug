export const ROLES = ['SPECTATOR', 'PLAYER', 'CAPTAIN', 'MODERATOR', 'ADMIN', 'OWNER'] as const;
export type Role = (typeof ROLES)[number];
export const atLeast = (role: Role | undefined, min: Role) => !!role && ROLES.indexOf(role) >= ROLES.indexOf(min);
/** Only owners may grant ADMIN/OWNER; admins may grant up to MODERATOR. */
export function canAssignRole(actor: Role, target: Role): boolean {
  if (actor === 'OWNER') return true;
  if (actor === 'ADMIN') return ROLES.indexOf(target) <= ROLES.indexOf('MODERATOR');
  return false;
}
