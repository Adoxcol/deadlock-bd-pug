<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { api } from '../lib/api';
import { dateShort, duration } from '../lib/format';
import { useHeroes } from '../stores/heroes';
import HeroCard from './HeroCard.vue';

const heroes = useHeroes();
const matchId = ref('');
const preview = ref<any>(null);
const names = reactive<Record<string, string>>({});
const busy = ref(false);
const error = ref<string | null>(null);
const imported = ref<{ id: string; matchId: string } | null>(null);
onMounted(() => { heroes.load().catch(() => {}); });

const teams = computed(() => (['AMBER', 'SAPPHIRE'] as const).map((side) => ({ side, players: (preview.value?.players ?? []).filter((p: any) => p.team === side) })));
const ready = computed(() => !!preview.value && preview.value.players.every((p: any) => names[p.accountId]?.trim()));
const stat = (n: number | null) => n ?? '—';

async function attempt(fn: () => Promise<void>) {
  busy.value = true; error.value = null;
  try { await fn(); } catch (e) { error.value = (e as Error).message; } finally { busy.value = false; }
}
const load = () => attempt(async () => {
  imported.value = null; preview.value = null;
  const p = await api<any>(`/admin/match-import/${encodeURIComponent(matchId.value.trim())}`);
  for (const k of Object.keys(names)) delete names[k];
  for (const x of p.players) names[x.accountId] = x.name ?? '';
  preview.value = p;
});
const submit = () => attempt(async () => {
  const id = preview.value.matchId;
  const out = await api<{ id: string }>('/admin/match-import', { method: 'POST', body: { matchId: id, names } });
  imported.value = { id: out.id, matchId: id }; preview.value = null; matchId.value = '';
});
</script>

<template>
  <div class="space-y-4">
    <form class="card-ornate p-5 grid sm:grid-cols-[minmax(0,1fr)_auto] gap-4 items-end" @submit.prevent="load">
      <div><label class="label" for="import-id">Match ID</label><input id="import-id" v-model="matchId" class="input font-mono" inputmode="numeric" required /></div>
      <button class="btn-primary" :disabled="busy">Load match</button>
      <p class="sm:col-span-2 text-sm text-muted">Deadlock's data has no player names, so type them from the scoreboard. Players already known are filled in. The result counts towards the active season.</p>
    </form>
    <p v-if="error" class="card px-4 py-2 text-sm text-danger" role="alert">{{ error }}</p>
    <p v-if="imported" class="card px-4 py-2 text-sm" role="status">Match {{ imported.matchId }} imported. <RouterLink :to="`/matches/${imported.id}`" class="text-primary hover:underline">View match</RouterLink></p>

    <form v-if="preview" class="card-ornate" @submit.prevent="submit">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5 font-mono text-[11px] uppercase tracking-wider text-muted">
        <span class="font-display text-base normal-case text-text">{{ preview.matchId }}</span>
        <span class="tabular-nums">{{ duration(preview.durationSec) }}</span><span>{{ dateShort(preview.startedAt) }}</span>
      </div>
      <div class="grid md:grid-cols-2 border-t border-line/70 md:divide-x divide-line/70">
        <section v-for="t in teams" :key="t.side" class="min-w-0" :aria-label="t.side === 'AMBER' ? 'Team Amber' : 'Team Sapphire'">
          <header :class="['flex items-center gap-2 px-3 py-1.5 border-b border-line/40', t.side === 'AMBER' ? 'bg-amber-team/10' : 'bg-sapphire-team/10']">
            <span :class="['font-display uppercase', t.side === 'AMBER' ? 'text-amber-team' : 'text-sapphire-team']">{{ t.side === 'AMBER' ? 'Amber' : 'Sapphire' }}</span>
            <span :class="['ml-auto font-mono text-[10px] font-bold uppercase tracking-[0.2em]', preview.winner === t.side ? 'text-accent' : 'text-danger']">{{ preview.winner === t.side ? 'Win' : 'Loss' }}</span>
          </header>
          <ul class="p-3 space-y-2">
            <li v-for="p in t.players" :key="p.accountId" class="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2">
              <HeroCard size="xs" :name="heroes.byId(p.heroId)?.name ?? '?'" :src="heroes.byId(p.heroId)?.imageUrl" />
              <input v-model="names[p.accountId]" class="input" maxlength="32" required :aria-label="`Player on ${heroes.byId(p.heroId)?.name ?? 'unknown hero'}`" :placeholder="heroes.byId(p.heroId)?.name ?? 'Player name'" />
              <span class="font-mono text-xs tabular-nums">{{ stat(p.kills) }}/{{ stat(p.deaths) }}/{{ stat(p.assists) }}</span>
            </li>
          </ul>
        </section>
      </div>
      <div class="border-t border-line/70 p-4 flex justify-end"><button class="btn-primary" :disabled="busy || !ready">Import match</button></div>
    </form>
  </div>
</template>
