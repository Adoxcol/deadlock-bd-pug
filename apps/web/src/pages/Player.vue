<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { Link2, Eye } from 'lucide-vue-next';
import { api } from '../lib/api';
import { dateShort, pct } from '../lib/format';
import { useSession } from '../stores/session';
import PageState from '../components/PageState.vue';
import Metric from '../components/Metric.vue';
import SimBadge from '../components/SimBadge.vue';
const props = defineProps<{ playerId: string }>();
const session = useSession();
const p = ref<any>(null);
const error = ref<string | null>(null);
async function load() { p.value = null; error.value = null; try { p.value = await api(`/players/${props.playerId}`); } catch (e) { error.value = (e as Error).message; } }
onMounted(load); watch(() => props.playerId, load);
const self = computed(() => session.user?.id === props.playerId);
const current = computed(() => p.value?.ratings?.find((r: any) => r.season.isActive));
const favorites = computed(() => {
  const c = new Map<string, number>(); for (const h of p.value?.history ?? []) if (h.heroName) c.set(h.heroName, (c.get(h.heroName) ?? 0) + 1);
  return [...c].sort((a, b) => b[1] - a[1]).slice(0, 5);
});
const spark = computed(() => {
  const xs = (p.value?.ratingHistory ?? []).map((t: any) => t.after as number); if (xs.length < 2) return '';
  const min = Math.min(...xs), max = Math.max(...xs), span = max - min || 1;
  return xs.map((v: number, i: number) => `${(i / (xs.length - 1)) * 300},${60 - ((v - min) / span) * 56 - 2}`).join(' ');
});
async function setVis(v: string) { await api('/me/visibility', { method: 'PATCH', body: { visibility: v } }); await load(); }
</script>
<template>
  <PageState :loading="!p && !error" :error="error">
    <div v-if="p" class="space-y-4">
      <header class="card p-5 flex flex-wrap items-center gap-4">
        <div class="w-14 h-14 rounded-xl bg-raised border border-line grid place-items-center text-xl font-semibold">{{ p.user.displayName.replace('[SIM] ', '')[0] }}</div>
        <div class="min-w-0"><h1 class="text-xl font-semibold flex items-center gap-2">{{ p.user.displayName }}<SimBadge v-if="p.user.isSimulated" /></h1>
          <p class="text-xs text-muted mt-1">{{ p.user.role.toLowerCase() }} · Discord: {{ p.discord?.username ?? 'not linked' }} · Steam: {{ p.steam ? 'linked' : 'not linked' }}</p></div>
        <div class="flex gap-6 sm:ml-auto text-sm">
          <div><div class="text-xs text-muted">Rating</div><div class="text-2xl font-semibold tabular-nums">{{ current?.rating ?? '—' }}</div></div>
          <div><div class="text-xs text-muted">Record</div><div class="font-semibold tabular-nums">{{ current ? `${current.wins}W ${current.losses}L` : '—' }}</div></div>
          <div><div class="text-xs text-muted">Win rate</div><div class="font-semibold">{{ current?.gamesPlayed ? pct(current.wins / current.gamesPlayed) : '—' }}</div></div>
        </div>
      </header>
      <div v-if="self" class="card p-4 flex flex-wrap items-center gap-3 text-sm">
        <a v-if="!p.steam" href="/api/auth/steam" class="btn-ghost"><Link2 class="w-4 h-4" />Link Steam account</a>
        <span class="flex items-center gap-2 text-muted"><Eye class="w-4 h-4" />Profile visibility</span>
        <select :value="p.visibility" class="input !w-auto" @change="setVis(($event.target as HTMLSelectElement).value)"><option value="PUBLIC">Public</option><option value="MEMBERS">Members only</option><option value="PRIVATE">Private</option></select>
      </div>
      <div class="grid lg:grid-cols-3 gap-4">
        <section class="card p-4 lg:col-span-2"><h2 class="h-section mb-3">Rating history</h2>
          <PageState :empty="!spark" empty-text="Not enough rated matches yet."><svg viewBox="0 0 300 60" class="w-full h-24" preserveAspectRatio="none" role="img" aria-label="Rating over time"><polyline :points="spark" fill="none" stroke="#2dd4bf" stroke-width="1.5" vector-effect="non-scaling-stroke" /></svg></PageState>
        </section>
        <section class="card p-4"><h2 class="h-section mb-3">Favorite heroes</h2>
          <PageState :empty="!favorites.length" empty-text="No hero data yet."><ul class="space-y-1.5 text-sm"><li v-for="[h, n] in favorites" :key="h" class="flex justify-between"><span>{{ h }}</span><span class="text-muted tabular-nums">{{ n }}</span></li></ul></PageState>
        </section>
      </div>
      <section class="card overflow-x-auto"><h2 class="h-section px-4 pt-4 pb-2">Match history</h2>
        <PageState :empty="!p.history.length" empty-text="No matches yet.">
          <table class="w-full table-compact"><thead><tr><th>Date</th><th>Result</th><th>Hero</th><th class="text-right">K/D/A</th><th></th></tr></thead>
            <tbody><tr v-for="h in p.history" :key="h.id"><td class="text-muted">{{ dateShort(h.result.createdAt) }}</td>
              <td :class="h.won ? 'text-accent' : 'text-danger'">{{ h.won ? 'Win' : 'Loss' }}<span v-if="h.result.source !== 'API'" class="text-[10px] text-warn ml-1 uppercase">{{ h.result.source.toLowerCase() }}</span></td>
              <td>{{ h.heroName ?? '—' }}</td><td class="text-right tabular-nums"><Metric :value="h.kills" />/<Metric :value="h.deaths" />/<Metric :value="h.assists" /></td>
              <td class="text-right"><RouterLink :to="`/matches/${h.result.matchId}`" class="text-xs text-accent hover:underline">Details</RouterLink></td></tr></tbody></table>
        </PageState>
      </section>
    </div>
  </PageState>
</template>
