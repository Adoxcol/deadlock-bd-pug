<script setup lang="ts">
import UiSelect from '../components/UiSelect.vue';
import { computed, onMounted, ref } from 'vue';
import { BadgeCheck, FlaskConical, Hourglass, Radio } from 'lucide-vue-next';
import { api } from '../lib/api';
import { duration, dateShort } from '../lib/format';
import { useHeroes } from '../stores/heroes';
import { useSession } from '../stores/session';
import HeroPortrait from '../components/HeroPortrait.vue';
import Metric from '../components/Metric.vue';
import PageState from '../components/PageState.vue';
import StatusBadge from '../components/StatusBadge.vue';
import SimBadge from '../components/SimBadge.vue';

const props = defineProps<{ matchId: string }>();
const heroes = useHeroes();
const session = useSession();
const m = ref<any>(null);
const error = ref<string | null>(null);
const pug = ref<any>(null);
const winner = ref<'amber' | 'sapphire'>('amber');
const submitMsg = ref<string | null>(null);
async function load() {
  try { m.value = await api(`/matches/${props.matchId}`); if (m.value.pugId) pug.value = await api(`/pugs/${m.value.pugId}`); }
  catch (e) { error.value = (e as Error).message; }
}
onMounted(() => { heroes.load().catch(() => {}); load(); });
const team = (side: 'AMBER' | 'SAPPHIRE') => (m.value?.result?.stats ?? []).filter((s: any) => s.team === side);
const teamName = (side: 'AMBER' | 'SAPPHIRE') => m.value?.pug?.teams?.find((t: any) => t.side === side)?.name ?? (side === 'AMBER' ? 'Team Amber' : 'Team Sapphire');
const roster = (side: string) => (pug.value?.participants ?? []).filter((p: any) => p.team === side).map((p: any) => p.userId);
const canSubmit = computed(() => session.can('MODERATOR') && !m.value?.result && roster('AMBER').length && roster('SAPPHIRE').length);
async function submit() {
  try { const r = await api<any>(`/matches/${props.matchId}/result`, { method: 'POST', body: { winner: winner.value, amber: roster('AMBER'), sapphire: roster('SAPPHIRE') } }); submitMsg.value = r.status === 'rated' ? 'Result saved and ratings updated.' : r.status === 'duplicate' ? 'A result already exists.' : `Result saved (not rated: ${r.reason}).`; await load(); }
  catch (e) { submitMsg.value = (e as Error).message; }
}
</script>
<template>
  <PageState :loading="!m && !error" :error="!m ? error : null">
    <div v-if="m" class="space-y-4">
      <header class="flex flex-wrap items-center gap-3">
        <h1 class="text-2xl font-semibold tracking-tight">Match {{ m.deadlockMatchId ?? m.id.slice(-6) }}</h1>
        <StatusBadge :status="m.trackingState" /><SimBadge v-if="m.isSimulated" />
        <RouterLink :to="`/matches/${matchId}/live`" class="btn-ghost !h-8 ml-auto"><Radio class="w-4 h-4" />Live view</RouterLink>
      </header>
      <div v-if="m.result" class="card p-4 flex flex-wrap items-center gap-x-8 gap-y-2">
        <div><div class="text-xs text-muted">Winner</div><div :class="['text-lg font-semibold', m.result.winner === 'AMBER' ? 'text-amber-team' : 'text-sapphire-team']">{{ teamName(m.result.winner) }}</div></div>
        <div><div class="text-xs text-muted">Duration</div><div class="font-medium tabular-nums">{{ duration(m.durationSec) }}</div></div>
        <div><div class="text-xs text-muted">Date</div><div class="font-medium">{{ dateShort(m.result.createdAt) }}</div></div>
        <div class="sm:ml-auto">
          <span v-if="m.result.source === 'API'" class="inline-flex items-center gap-1 text-sm text-accent"><BadgeCheck class="w-4 h-4" />Official data (Deadlock API)</span>
          <span v-else-if="m.result.source === 'MANUAL'" class="inline-flex items-center gap-1 text-sm text-warn"><BadgeCheck class="w-4 h-4" />Manually verified by a moderator</span>
          <span v-else class="inline-flex items-center gap-1 text-sm text-warn"><FlaskConical class="w-4 h-4" />Simulated — {{ m.result.rated ? 'rated in simulation season only' : 'not rated' }}</span>
        </div>
      </div>
      <div v-else class="card p-4 flex items-center gap-2 text-sm text-muted"><Hourglass class="w-4 h-4" />Match data pending. Final statistics for private custom matches may not be published; a moderator can submit the result manually.</div>

      <div v-if="m.result" class="grid xl:grid-cols-2 gap-4">
        <section v-for="side in (['AMBER', 'SAPPHIRE'] as const)" :key="side" :class="['card overflow-hidden border-t-2', side === 'AMBER' ? '!border-t-amber-team' : '!border-t-sapphire-team']">
          <h2 :class="['px-4 py-2.5 font-semibold flex items-center gap-2', side === 'AMBER' ? 'text-amber-team' : 'text-sapphire-team']">{{ teamName(side) }}<span v-if="m.result.winner === side" class="text-[11px] uppercase text-accent border border-accent/40 rounded px-1.5">Victory</span></h2>
          <div class="overflow-x-auto"><table class="w-full table-compact">
            <thead><tr><th>Player</th><th class="text-right">K</th><th class="text-right">D</th><th class="text-right">A</th><th class="text-right">Net worth</th><th class="text-right">Hero dmg</th></tr></thead>
            <tbody><tr v-for="s in team(side)" :key="s.id">
              <td><RouterLink v-if="s.userId" :to="`/players/${s.userId}`" class="flex items-center gap-2 hover:text-accent"><HeroPortrait :name="heroes.byId(s.heroId)?.name ?? '?'" :src="heroes.byId(s.heroId)?.imageUrl" size="sm" /><span class="truncate max-w-[160px]">{{ s.displayNameSnapshot }}</span></RouterLink></td>
              <td class="text-right"><Metric :value="s.kills" /></td><td class="text-right"><Metric :value="s.deaths" /></td><td class="text-right"><Metric :value="s.assists" /></td><td class="text-right"><Metric :value="s.netWorth" /></td><td class="text-right"><Metric :value="s.heroDamage" /></td>
            </tr></tbody>
          </table></div>
        </section>
      </div>

      <form v-if="canSubmit" class="card p-4 space-y-3" @submit.prevent="submit">
        <h2 class="font-semibold">Submit result manually</h2>
        <p class="text-xs text-muted">Uses the PUG roster ({{ roster('AMBER').length }} vs {{ roster('SAPPHIRE').length }}). The result is marked as manually verified, recorded in the audit log, and processed once only.</p>
        <div class="flex flex-wrap gap-2 items-center">
          <UiSelect v-model="winner" class="!w-48" :options="[{ value: 'amber', label: `${teamName('AMBER')} won` }, { value: 'sapphire', label: `${teamName('SAPPHIRE')} won` }]" />
          <button class="btn-primary">Submit verified result</button>
        </div>
      </form>
      <p v-if="submitMsg" class="text-sm">{{ submitMsg }}</p>
    </div>
  </PageState>
</template>
