<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { BadgeCheck, FlaskConical, Hourglass, Map as MapIcon, Radio, Trophy } from 'lucide-vue-next';
import { api } from '../lib/api';
import { duration, dateShort } from '../lib/format';
import { useHeroes } from '../stores/heroes';
import { useItems } from '../stores/items';
import { useSession } from '../stores/session';
import HeroCard from '../components/HeroCard.vue';
import Scoreboard from '../components/match/Scoreboard.vue';
import PageState from '../components/PageState.vue';
import PageHeader from '../components/PageHeader.vue';
import StatusBadge from '../components/StatusBadge.vue';
import SimBadge from '../components/SimBadge.vue';
import TeamCrest from '../components/draft/TeamCrest.vue';

type Side = 'AMBER' | 'SAPPHIRE';
const props = defineProps<{ matchId: string }>();
const heroes = useHeroes();
const items = useItems();
const session = useSession();
const m = ref<any>(null);
const error = ref<string | null>(null);
const pug = ref<any>(null);
const winner = ref<'amber' | 'sapphire'>('amber');
const submitMsg = ref<string | null>(null);
const busy = ref(false);

async function load() {
  try { m.value = await api(`/matches/${props.matchId}`); if (m.value.pugId) pug.value = await api(`/pugs/${m.value.pugId}`); }
  catch (e) { error.value = (e as Error).message; }
}
onMounted(() => { heroes.load().catch(() => {}); items.load().catch(() => {}); load(); });

const lower = (side: Side) => (side === 'AMBER' ? 'amber' : 'sapphire') as 'amber' | 'sapphire';
const teamName = (side: Side) => m.value?.draft?.teamNames?.[lower(side)] ?? m.value?.pug?.teams?.find((t: any) => t.side === side)?.name ?? (side === 'AMBER' ? 'Team Amber' : 'Team Sapphire');
const stats = (side: Side) => (m.value?.result?.stats ?? []).filter((s: any) => s.team === side);

/** Who played: the PUG roster if the match belongs to one, otherwise the linked draft's captains and joined players. */
const rosterSource = computed<'pug' | 'draft' | null>(() => {
  const pugCount = (pug.value?.participants ?? []).length;
  if (pugCount) return 'pug';
  return m.value?.draft ? 'draft' : null;
});
function roster(side: Side): string[] {
  if (rosterSource.value === 'pug') return pug.value.participants.filter((p: any) => p.team === side).map((p: any) => p.userId);
  const st = m.value?.draft?.state; if (!st) return [];
  const t = lower(side);
  return [st.captains[t], ...st.members[t]].filter(Boolean);
}
const canSubmit = computed(() => session.can('MODERATOR') && !m.value?.result && roster('AMBER').length > 0 && roster('SAPPHIRE').length > 0);
const draftHeroes = (side: Side): number[] => m.value?.draft?.state?.picks?.[lower(side)] ?? [];

const hasDetails = computed(() => (m.value?.result?.stats ?? []).some((s: any) => s.details));
const importing = ref(false);
const importMsg = ref<string | null>(null);
async function importStats() {
  importing.value = true; importMsg.value = null;
  try {
    const r = await api<any>(`/matches/${props.matchId}/stats/import`, { method: 'POST', body: {} });
    importMsg.value = r.status === 'imported' ? `Stats imported for ${r.players} players.` : r.message;
    await load();
  } catch (e) { importMsg.value = (e as Error).message; } finally { importing.value = false; }
}

async function submit() {
  busy.value = true; submitMsg.value = null;
  try {
    const r = await api<any>(`/matches/${props.matchId}/result`, { method: 'POST', body: { winner: winner.value, amber: roster('AMBER'), sapphire: roster('SAPPHIRE') } });
    submitMsg.value = r.status === 'rated' ? 'Result saved and ratings updated.' : r.status === 'duplicate' ? 'A result already exists.' : `Result saved (not rated: ${r.reason}).`;
    await load();
  } catch (e) { submitMsg.value = (e as Error).message; } finally { busy.value = false; }
}
</script>

<template>
  <PageState :loading="!m && !error" :error="!m ? error : null">
    <div v-if="m" class="max-w-6xl mx-auto space-y-5">
      <PageHeader :eyebrow="m.pug ? `PUG #${m.pug.number}` : 'Match'" :title="`Match ${m.deadlockMatchId ?? m.id.slice(-6)}`">
        <StatusBadge :status="m.trackingState" /><SimBadge v-if="m.isSimulated" />
        <RouterLink :to="`/matches/${matchId}/live`" class="btn-ghost !h-9"><Radio class="w-4 h-4" />Live view</RouterLink>
        <RouterLink v-if="m.result && m.deadlockMatchId && !m.isSimulated" :to="`/matches/${matchId}/replay`" class="btn-ghost !h-9"><MapIcon class="w-4 h-4" />Replay</RouterLink>
      </PageHeader>

      <!-- Scoreline banner -->
      <section class="relative grid grid-cols-[1fr_auto_1fr] items-center gap-4 border border-line/70 px-5 py-5 bg-[linear-gradient(90deg,rgba(232,163,58,.14),rgba(14,12,10,.6)_45%,rgba(14,12,10,.6)_55%,rgba(90,143,224,.14))]">
        <div v-for="(side, i) in (['AMBER', 'SAPPHIRE'] as const)" :key="side" :class="['flex items-center gap-3 min-w-0', i === 1 && 'order-3 flex-row-reverse text-right']">
          <TeamCrest :team="lower(side)" :size="48" class="shrink-0" />
          <div class="min-w-0">
            <div :class="['font-display text-2xl sm:text-3xl uppercase truncate', side === 'AMBER' ? 'text-amber-team' : 'text-sapphire-team']">{{ teamName(side) }}</div>
            <div v-if="m.result" :class="['font-mono text-[11px] font-bold uppercase tracking-[0.2em]', m.result.winner === side ? 'text-accent' : 'text-muted']">{{ m.result.winner === side ? 'Victory' : 'Defeat' }}</div>
          </div>
        </div>
        <div class="order-2 w-16 h-16 grid place-items-center bg-bg border border-line rotate-[8deg] shadow-[0_8px_24px_rgba(0,0,0,.6)]">
          <span class="-rotate-[8deg] font-display text-xl uppercase">VS</span>
        </div>
      </section>

      <div v-if="m.result" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div class="card px-4 py-3"><div class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Duration</div><div class="font-display text-2xl tabular-nums mt-1">{{ duration(m.durationSec) }}</div></div>
        <div class="card px-4 py-3"><div class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Played</div><div class="font-display text-lg mt-1.5">{{ dateShort(m.result.createdAt) }}</div></div>
        <div class="card px-4 py-3 col-span-2 flex items-center gap-2">
          <template v-if="m.result.source === 'API'"><BadgeCheck class="w-5 h-5 text-accent shrink-0" /><span class="text-sm">Official data from the Deadlock API</span></template>
          <template v-else-if="m.result.source === 'MANUAL'"><BadgeCheck class="w-5 h-5 text-warn shrink-0" /><span class="text-sm">Manually verified by a moderator</span></template>
          <template v-else><FlaskConical class="w-5 h-5 text-warn shrink-0" /><span class="text-sm">Simulated — {{ m.result.rated ? 'rated in the simulation season only' : 'not rated' }}</span></template>
        </div>
      </div>
      <div v-else class="card px-4 py-3 flex items-center gap-2 text-sm text-muted"><Hourglass class="w-4 h-4 shrink-0" />Match data pending. The result is recorded automatically once official data is published. If it never is, a moderator can submit it below.</div>

      <!-- Scoreboards -->
      <div v-if="m.result" class="space-y-4">
        <div v-if="!hasDetails" class="card px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted">
          <span class="flex items-center gap-2"><Hourglass class="w-4 h-4 shrink-0" />Detailed stats not published for this match.</span>
          <button v-if="session.can('MODERATOR') && m.deadlockMatchId" type="button" class="btn-ghost !h-9" :disabled="importing" @click="importStats">Check for stats</button>
          <p v-if="importMsg" class="w-full" role="status">{{ importMsg }}</p>
        </div>
        <Scoreboard v-for="side in (['AMBER', 'SAPPHIRE'] as const)" :key="side" :team="lower(side)" :name="teamName(side)" :won="m.result.winner === side" :stats="stats(side)" />
      </div>

      <!-- Draft summary when there is no result yet -->
      <section v-else-if="m.draft" class="card-ornate p-4 space-y-3">
        <h2 class="h-section">Drafted heroes</h2>
        <div class="grid sm:grid-cols-2 gap-4">
          <div v-for="side in (['AMBER', 'SAPPHIRE'] as const)" :key="side">
            <div :class="['font-display uppercase mb-2', side === 'AMBER' ? 'text-amber-team' : 'text-sapphire-team']">{{ teamName(side) }}</div>
            <div class="grid grid-cols-6 gap-1.5"><HeroCard v-for="h in draftHeroes(side)" :key="h" :name="heroes.byId(h)?.name" :src="heroes.byId(h)?.imageUrl" /></div>
          </div>
        </div>
      </section>

      <!-- Moderator result submission -->
      <form v-if="canSubmit" class="card-ornate p-5 space-y-4" @submit.prevent="submit">
        <div>
          <h2 class="h-section">Submit result</h2>
          <p class="text-xs text-muted mt-1">Uses the {{ rosterSource === 'pug' ? 'PUG roster' : 'draft teams (captains and players who joined)' }}: {{ roster('AMBER').length }} vs {{ roster('SAPPHIRE').length }}. The result is marked as manually verified, written to the audit log, and processed once only.</p>
        </div>
        <div><span class="label">Winner</span>
          <div class="grid grid-cols-2 gap-2 max-w-xl">
            <button v-for="t in (['amber', 'sapphire'] as const)" :key="t" type="button" :aria-pressed="winner === t"
              :class="['h-12 rounded border font-display uppercase text-lg truncate px-3 transition-colors',
                winner === t ? (t === 'amber' ? 'border-amber-team bg-amber-team/20 text-amber-team' : 'border-sapphire-team bg-sapphire-team/20 text-sapphire-team') : 'border-line text-muted hover:text-text']"
              @click="winner = t">{{ teamName(t === 'amber' ? 'AMBER' : 'SAPPHIRE') }}</button>
          </div>
        </div>
        <button class="btn-primary" :disabled="busy"><Trophy class="w-4 h-4" />Submit verified result</button>
      </form>
      <p v-else-if="session.can('MODERATOR') && !m.result" class="text-sm text-muted">To submit a result, the match needs a PUG roster or a linked draft with players on both teams.</p>
      <p v-if="submitMsg" class="text-sm" role="status">{{ submitMsg }}</p>
    </div>
  </PageState>
</template>
