<script setup lang="ts">
import { onMounted, onUnmounted, ref } from 'vue';
import { Users, Swords, Radio, CheckCircle2, UserRound, ArrowRight, FlaskConical } from 'lucide-vue-next';
import { api } from '../lib/api';
import { realtime } from '../lib/ws';
import { duration, dateShort, elapsedSince } from '../lib/format';
import StatusBadge from '../components/StatusBadge.vue';
import PageState from '../components/PageState.vue';
import SimBadge from '../components/SimBadge.vue';
import { useSession } from '../stores/session';

const session = useSession();
const data = ref<any>(null);
const error = ref<string | null>(null);
const simBusy = ref(false);
const now = ref(Date.now());
let refreshTimer: number | undefined;

async function load() { try { data.value = await api('/dashboard'); error.value = null; } catch (e) { error.value = (e as Error).message; } }
// Debounce bursts of realtime events into one refetch.
function schedule() { clearTimeout(refreshTimer); refreshTimer = window.setTimeout(load, 400); }
let unsub = () => {};
let tick: number;
onMounted(() => { load(); unsub = realtime.subscribe('dashboard', schedule); tick = window.setInterval(() => (now.value = Date.now()), 1000); });
onUnmounted(() => { unsub(); clearInterval(tick); clearTimeout(refreshTimer); });

async function runSim() {
  simBusy.value = true;
  try { const r = await api<{ draftId: string }>('/sim/workflow', { method: 'POST', body: { format: '6v6', speedMs: 700 } }); window.open(`/draft/${r.draftId}/spectate`, '_blank'); }
  catch (e) { error.value = (e as Error).message; } finally { simBusy.value = false; }
}
const stat = (k: string) => data.value?.stats?.[k] ?? 0;
const sessionStatus = (s: any) => s.match?.state ? s.match.state : s.draft?.status ?? s.status;
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-semibold tracking-tight">Community Dashboard</h1>
        <p class="text-sm text-muted mt-1">PUGs, drafts and matches for the Bangladesh Deadlock community.</p>
      </div>
      <div class="flex gap-2">
        <button v-if="session.me?.simulationMode && session.can('MODERATOR')" class="btn-ghost" :disabled="simBusy" @click="runSim"><FlaskConical class="w-4 h-4 text-warn" />Run simulated PUG</button>
        <RouterLink v-if="session.can('PLAYER')" to="/drafts/new" class="btn-draft"><Swords class="w-4 h-4" />New draft</RouterLink>
      </div>
    </div>

    <PageState :loading="!data && !error" :error="!data ? error : null">
      <section class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3" aria-label="Overview">
        <div v-for="s in [
          { k: 'activePugs', l: 'Active PUGs', i: Users, c: 'text-accent' },
          { k: 'playersDrafting', l: 'Players drafting', i: Swords, c: 'text-draft' },
          { k: 'matchesLive', l: 'Matches in progress', i: Radio, c: 'text-accent' },
          { k: 'completedToday', l: 'Completed today', i: CheckCircle2, c: 'text-text' },
          { k: 'members', l: 'Registered members', i: UserRound, c: 'text-text' },
        ]" :key="s.k" class="card p-4">
          <div class="flex items-center gap-2 text-xs text-muted"><component :is="s.i" :class="['w-4 h-4', s.c]" :stroke-width="1.75" />{{ s.l }}</div>
          <div class="text-2xl font-semibold mt-2 tabular-nums">{{ stat(s.k) }}</div>
        </div>
      </section>

      <div class="grid lg:grid-cols-3 gap-6">
        <section class="lg:col-span-2 space-y-3">
          <h2 class="h-section">Active sessions</h2>
          <PageState :empty="!data.sessions.length && !data.drafts.length" empty-text="No active PUGs right now.">
            <div class="grid sm:grid-cols-2 gap-3">
              <article v-for="s in data.sessions" :key="s.id" class="card p-4 flex flex-col gap-3">
                <div class="flex items-center justify-between gap-2">
                  <div class="flex items-center gap-2"><span class="font-semibold">PUG #{{ s.number }}</span><SimBadge v-if="s.isSimulated" /></div>
                  <StatusBadge :status="sessionStatus(s)" />
                </div>
                <div class="flex items-center gap-2 text-sm">
                  <span class="text-amber-team font-medium truncate">{{ s.teams.amber ?? 'Amber' }}</span><span class="text-muted">vs</span><span class="text-sapphire-team font-medium truncate">{{ s.teams.sapphire ?? 'Sapphire' }}</span>
                </div>
                <dl class="grid grid-cols-3 gap-2 text-xs">
                  <div><dt class="text-muted">Players</dt><dd class="font-medium mt-0.5">{{ s.players }} · {{ s.format }}</dd></div>
                  <div><dt class="text-muted">Draft</dt><dd class="font-medium mt-0.5 capitalize">{{ s.draft?.status ?? 'none' }}</dd></div>
                  <div><dt class="text-muted">Elapsed</dt><dd class="font-medium mt-0.5 tabular-nums">{{ (now, elapsedSince(s.createdAt)) }}</dd></div>
                </dl>
                <div class="flex gap-2 mt-auto">
                  <RouterLink v-if="s.match" :to="`/matches/${s.match.id}/live`" class="btn-primary !h-8 flex-1">View match<ArrowRight class="w-4 h-4" /></RouterLink>
                  <RouterLink v-if="s.draft" :to="`/draft/${s.draft.id}/spectate`" class="btn-ghost !h-8 flex-1">Watch draft</RouterLink>
                </div>
              </article>
              <article v-for="d in data.drafts.filter((d: any) => !data.sessions.some((s: any) => s.draft?.id === d.id))" :key="d.id" class="card p-4 flex flex-col gap-3">
                <div class="flex items-center justify-between gap-2"><div class="flex items-center gap-2 min-w-0"><span class="font-semibold truncate">{{ d.name }}</span><SimBadge v-if="d.simulated" /></div><StatusBadge :status="d.status" /></div>
                <div class="text-sm"><span class="text-amber-team">{{ d.teamNames.amber }}</span> <span class="text-muted">vs</span> <span class="text-sapphire-team">{{ d.teamNames.sapphire }}</span></div>
                <RouterLink :to="`/draft/${d.id}/spectate`" class="btn-ghost !h-8">Watch draft</RouterLink>
              </article>
            </div>
          </PageState>

          <h2 class="h-section pt-3">Recent results</h2>
          <div class="card overflow-x-auto">
            <PageState :empty="!data.recent.length" empty-text="No completed matches yet.">
              <table class="w-full table-compact">
                <thead><tr><th>PUG</th><th>Winner</th><th class="hidden sm:table-cell">Loser</th><th>Duration</th><th class="hidden sm:table-cell">Date</th><th></th></tr></thead>
                <tbody>
                  <tr v-for="r in data.recent" :key="r.matchId" class="hover:bg-raised/50">
                    <td><div class="flex items-center gap-2">#{{ r.pugNumber ?? '—' }}<SimBadge v-if="r.isSimulated" /></div></td>
                    <td :class="r.winner === 'AMBER' ? 'text-amber-team' : 'text-sapphire-team'" class="font-medium">{{ r.winner === 'AMBER' ? r.teams.amber ?? 'Amber' : r.teams.sapphire ?? 'Sapphire' }}</td>
                    <td class="hidden sm:table-cell text-muted">{{ r.winner === 'AMBER' ? r.teams.sapphire ?? 'Sapphire' : r.teams.amber ?? 'Amber' }}</td>
                    <td class="tabular-nums">{{ duration(r.durationSec) }}</td>
                    <td class="hidden sm:table-cell text-muted">{{ dateShort(r.date) }}</td>
                    <td class="text-right"><RouterLink :to="`/matches/${r.matchId}`" class="text-accent text-xs hover:underline">Details</RouterLink></td>
                  </tr>
                </tbody>
              </table>
            </PageState>
          </div>
        </section>

        <section class="space-y-3">
          <div class="flex items-center justify-between"><h2 class="h-section">Leaderboard</h2><RouterLink to="/leaderboard" class="text-xs text-accent hover:underline">View all</RouterLink></div>
          <div class="card divide-y divide-line">
            <PageState :empty="!data.leaderboard.length" :empty-text="data.season ? 'No rated players yet.' : 'No active season.'">
              <RouterLink v-for="(p, i) in data.leaderboard" :key="p.userId" :to="`/players/${p.userId}`" class="flex items-center gap-3 px-4 py-3 hover:bg-raised/50">
                <span class="w-6 text-sm font-semibold tabular-nums" :class="i === 0 ? 'text-warn' : 'text-muted'">{{ i + 1 }}</span>
                <span class="flex-1 truncate text-sm font-medium">{{ p.displayName }}</span>
                <span class="text-xs text-muted tabular-nums">{{ p.wins }}W {{ p.losses }}L</span>
                <span class="w-12 text-right font-semibold tabular-nums">{{ p.rating }}</span>
              </RouterLink>
            </PageState>
          </div>
          <p v-if="data.season" class="text-xs text-muted flex items-center gap-2">Season: {{ data.season.name }} <SimBadge v-if="data.season.isSimulated" /></p>
        </section>
      </div>
    </PageState>
  </div>
</template>
