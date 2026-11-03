import { defineStore } from 'pinia';
import { api } from '../lib/api';

export type Role = 'SPECTATOR' | 'PLAYER' | 'CAPTAIN' | 'MODERATOR' | 'ADMIN' | 'OWNER';
const ORDER: Role[] = ['SPECTATOR', 'PLAYER', 'CAPTAIN', 'MODERATOR', 'ADMIN', 'OWNER'];

interface Me { user: { id: string; displayName: string; avatarUrl?: string | null; role: Role; isSimulated: boolean } | null; discord?: { username: string } | null; steam?: { steamId64: string; personaName: string | null } | null; simulationMode: boolean; discordEnabled: boolean; discordInvite?: string | null }

export const useSession = defineStore('session', {
  state: () => ({ me: null as Me | null, loaded: false }),
  getters: {
    user: (s) => s.me?.user ?? null,
    can: (s) => (min: Role) => !!s.me?.user && ORDER.indexOf(s.me.user.role) >= ORDER.indexOf(min),
  },
  actions: {
    async load() { try { this.me = await api<Me>('/me'); } finally { this.loaded = true; } },
    async logout() { await api('/auth/logout', { method: 'POST' }); await this.load(); },
  },
});
