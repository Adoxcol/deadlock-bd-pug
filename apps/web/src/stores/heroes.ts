import { defineStore } from 'pinia';
import { api } from '../lib/api';
export interface Hero { id: number; name: string; imageUrl: string | null; simulated: boolean; heroType?: string | null; verticalUrl?: string | null; nameUrl?: string | null; backgroundUrl?: string | null; tags?: string[]; vo?: { pick: string[]; ban: string[] } }
export const useHeroes = defineStore('heroes', {
  state: () => ({ list: [] as Hero[], source: '' as string, loaded: false }),
  getters: { byId: (s) => (id: number | null | undefined) => s.list.find((h) => h.id === id) },
  actions: { async load() { if (this.loaded) return; const r = await api<{ source: string; heroes: Hero[] }>('/heroes'); this.list = r.heroes; this.source = r.source; this.loaded = true; } },
});
