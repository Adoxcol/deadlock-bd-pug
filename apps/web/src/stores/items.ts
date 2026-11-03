import { defineStore } from 'pinia';
import { api } from '../lib/api';
export interface Item { id: number; name: string; imageUrl: string | null; slot: string | null; tier: number | null; cost: number | null }
export const useItems = defineStore('items', {
  state: () => ({ list: [] as Item[], loaded: false }),
  getters: { byId: (s) => (id: number) => s.list.find((i) => i.id === id) },
  actions: { async load() { if (this.loaded) return; this.list = (await api<{ items: Item[] }>('/items')).items; this.loaded = this.list.length > 0; } },
});
