<script setup lang="ts">
import PlayerAvatar from '../components/PlayerAvatar.vue';
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { Users, Swords, Radio, CalendarCheck, Trophy, FlaskConical, MessageCircle, ArrowRight, Plus, ChevronRight } from 'lucide-vue-next';
import { api } from '../lib/api';
import { realtime } from '../lib/ws';
import { duration, elapsedSince, timeAgo } from '../lib/format';
import StatusBadge from '../components/StatusBadge.vue';
import PageState from '../components/PageState.vue';
import SimBadge from '../components/SimBadge.vue';
import HeroCard from '../components/HeroCard.vue';
import PageHeader from '../components/PageHeader.vue';
import { useSession } from '../stores/session';
import { useHeroes } from '../stores/heroes';

const session = useSession();
const heroes = useHeroes();
const data = ref<any>(null);
const error = ref<string | null>(null);
const simBusy = ref(false);
const now = ref(Date.now());
let refreshTimer: number | undefined;

async function load() { try { data.value = await api('/dashboard'); error.value = null; } catch (e) { error.value = (e as Error).message; } }
function schedule() { clearTimeout(refreshTimer); refreshTimer = window.setTimeout(load, 400); }
let unsub = () => {};
let tick: number;
onMounted(() => { load(); heroes.load().catch(() => {}); unsub = realtime.subscribe('dashboard', schedule); tick = window.setInterval(() => (now.value = Date.now()), 1000); });
onUnmounted(() => { unsub(); clearInterval(tick); clearTimeout(refreshTimer); });

async function runSim() {
  simBusy.value = true;
  try { const r = await api<{ draftId: string }>('/sim/workflow', { method: 'POST', body: { format: '6v6', speedMs: 700 } }); window.open(`/draft/${r.draftId}/spectate`, '_blank'); }
  catch (e) { error.value = (e as Error).message; } finally { simBusy.value = false; }
}
const stat = (k: string) => data.value?.stats?.[k] ?? 0;
const landing = computed(() => !session.user);
// One list of live things: PUG sessions plus standalone public drafts.
const activity = computed(() => {
  if (!data.value) return [];
  const pugDraftIds = new Set(data.value.sessions.map((s: any) => s.draft?.id).filter(Boolean));
  return [
    ...data.value.sessions.map((s: any) => ({ key: s.id, title: s.name ?? `PUG #${s.number}`, status: s.match?.state ?? s.draft?.status ?? s.status.toLowerCase(), teams: s.teams, sub: `${s.players} players · ${s.format}`, since: s.createdAt, simulated: s.isSimulated, picks: null, link: s.match ? `/matches/${s.match.id}/live` : s.draft ? `/draft/${s.draft.id}/spectate` : `/pugs/${s.id}`, action: s.match ? 'View Live' : s.draft ? 'View Draft' : 'Join PUG' })),
    ...data.value.drafts.filter((d: any) => !pugDraftIds.has(d.id)).map((d: any) => ({ key: d.id, title: d.name, status: d.status, teams: d.teamNames, sub: `${d.players} in lobby · ${d.format}`, since: d.startedAt, simulated: d.simulated, picks: d.picks, link: `/draft/${d.id}${d.status === 'waiting' ? '' : '/spectate'}`, action: d.status === 'waiting' ? 'Join' : 'View Draft' })),
  ];
});
const heroOf = (id: number) => heroes.byId(id);
</script>

<template>
  <div>
    <!-- Landing hero (logged out) -->
    <section v-if="landing" class="relative overflow-hidden border-b border-line">
      <div class="absolute inset-0 pointer-events-none" aria-hidden="true">
        <div class="absolute -right-32 -top-32 w-[640px] h-[640px] rounded-full bg-primary/10 blur-3xl" />
        <div class="absolute right-10 bottom-[-200px] w-[480px] h-[480px] rounded-full bg-sapphire-team/10 blur-3xl" />
        <div class="absolute inset-0 opacity-[0.06]" style="background-image: linear-gradient(#fff 1px, transparent 1px), linear-gradient(90deg, #fff 1px, transparent 1px); background-size: 48px 48px; mask-image: radial-gradient(ellipse at 70% 40%, black, transparent 70%)" />
      </div>
      <div class="relative max-w-[1400px] mx-auto px-4 lg:px-10 py-16 lg:py-24 grid lg:grid-cols-[1.2fr_1fr] gap-10 items-center">
        <div class="animate-fade-up">
          <div class="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-muted mb-3">Deadlock PUGs · Bangladesh</div>
          <h1 class="text-4xl sm:text-5xl lg:text-7xl leading-[0.95]">Bangladesh's<br /><span class="text-primary">Deadlock PUG</span><br />Community</h1>
          <div class="rule-brass w-64 mt-5" />
          <p class="text-xl sm:text-2xl text-text/90 mt-4">Play. Compete. Improve. Together.</p>
          <p class="text-muted mt-4 max-w-xl">Organize PUGs, draft heroes live, track matches and climb the community leaderboard. A home for the Bangladeshi Deadlock community.</p>
          <div class="flex flex-wrap gap-3 mt-8">
            <a v-if="session.me?.discordInvite" :href="session.me.discordInvite" target="_blank" rel="noopener" class="btn-primary !h-11 !px-5"><MessageCircle class="w-4 h-4" />Join Discord</a>
            <RouterLink v-else to="/login" class="btn-primary !h-11 !px-5"><MessageCircle class="w-4 h-4" />Login with Discord</RouterLink>
            <RouterLink to="/drafts" class="btn-ghost !h-11 !px-5">View Active PUGs</RouterLink>
          </div>
        </div>
        <div class="hidden lg:grid grid-cols-4 gap-2 rotate-[-4deg] opacity-90" aria-hidden="true">
          <HeroCard v-for="(h, i) in heroes.list.slice(0, 12)" :key="h.id" :name="h.name" :src="h.imageUrl" :class="i % 2 ? 'translate-y-6' : ''" />
        </div>
      </div>
      <div class="relative max-w-[1400px] mx-auto px-4 lg:px-10 pb-12 grid grid-cols-2 lg:grid-cols-4 gap-6">
        <div v-for="s in [
          { k: 'members', l: 'Community Members', i: Users },
          { k: 'pugsPlayed', l: 'PUGs Played', i: Swords },
          { k: 'activePugs', l: 'Active PUGs', i: CalendarCheck },
          { k: 'matchesLive', l: 'Matches Live', i: Radio },
        ]" :key="s.k" class="flex items-center gap-3">
          <component :is="s.i" class="w-7 h-7 text-primary" :stroke-width="1.5" />
          <div><div class="font-display text-3xl tabular-nums leading-none">{{ stat(s.k).toLocaleString() }}</div><div class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted mt-1.5">{{ s.l }}</div></div>
        </div>
      </div>
    </section>

    <div :class="landing ? 'max-w-[1400px] mx-auto px-4 lg:px-10 py-10' : ''" class="space-y-6">
      <PageHeader v-if="!landing" eyebrow="Live overview" title="Community Dashboard">
        <button v-if="session.me?.simulationMode && session.can('MODERATOR')" class="btn-ghost" :disabled="simBusy" @click="runSim"><FlaskConical class="w-4 h-4 text-warn" />Run simulated PUG</button>
        <RouterLink v-if="session.can('PLAYER')" to="/drafts/new" class="btn-primary"><Plus class="w-4 h-4" />Create lobby</RouterLink>
      </PageHeader>

      <PageState :loading="!data && !error" :error="!data ? error : null">
        <section v-if="!landing" class="grid grid-cols-2 xl:grid-cols-4 gap-3" aria-label="Overview">
          <div v-for="s in [
            { k: 'playersDrafting', l: 'Players drafting', i: Swords, c: 'border-danger/50 text-danger' },
            { k: 'matchesLive', l: 'Matches live', i: Radio, c: 'border-accent/50 text-accent' },
            { k: 'activePugs', l: 'Active PUGs', i: CalendarCheck, c: 'border-sapphire-team/50 text-sapphire-team' },
            { k: 'members', l: 'Community members', i: Users, c: 'border-primary/50 text-primary' },
          ]" :key="s.k" class="card-ornate p-4 flex items-center gap-4">
            <div :class="['w-11 h-11 grid place-items-center shrink-0 border rotate-45', s.c]"><component :is="s.i" class="w-5 h-5 -rotate-45" :stroke-width="1.75" /></div>
            <div><div class="font-display text-3xl tabular-nums leading-none">{{ stat(s.k).toLocaleString() }}</div><div class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted mt-1.5">{{ s.l }}</div></div>
          </div>
        </section>

        <section v-if="data.upcoming?.length" class="card-ornate p-4" aria-label="Next PUG">
          <h2 class="h-section text-lg mb-3">Next PUG</h2>
          <ul class="space-y-2">
            <li v-for="s in data.upcoming" :key="s.id" class="flex flex-wrap items-center gap-x-4 gap-y-2">
              <span class="font-semibold">{{ s.format }}</span>
              <span class="text-muted text-sm">{{ s.scheduledAt ? new Date(s.scheduledAt).toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' }) : 'Starts when full' }}</span>
              <span class="font-mono text-sm">{{ s.players }}/{{ s.total }} signed up</span>
              <a v-if="session.me?.discordInvite" :href="session.me.discordInvite" target="_blank" rel="noopener" class="text-xs text-primary hover:underline sm:ml-auto">Sign up on Discord</a>
            </li>
          </ul>
        </section>

        <div class="grid xl:grid-cols-[1fr_420px] gap-6">
          <section class="card-ornate p-4 space-y-3 min-w-0">
            <div class="flex items-center justify-between"><h2 class="h-section text-lg">Active PUGs</h2><RouterLink to="/drafts" class="text-xs text-primary hover:underline">View all</RouterLink></div>
            <PageState :empty="!activity.length" empty-text="No active PUGs right now.">
              <ul class="space-y-2">
                <li v-for="a in activity" :key="a.key" class="flex flex-wrap items-center gap-4 rounded border border-line bg-bg/40 p-3 hover:border-primary/40 transition-colors">
                  <div :class="['w-12 h-12 rounded-full grid place-items-center border-2 shrink-0', a.status === 'drafting' ? 'border-danger/60 text-danger' : a.status.includes('live') || a.status === 'match_detected' ? 'border-accent/60 text-accent' : 'border-line text-muted']">
                    <Swords class="w-5 h-5" :stroke-width="1.75" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <div class="flex items-center gap-2 flex-wrap"><span class="font-display uppercase truncate">{{ a.title }}</span><SimBadge v-if="a.simulated" /></div>
                    <div class="flex items-center gap-2 mt-1 flex-wrap"><StatusBadge :status="a.status" /><span class="text-xs text-muted">{{ a.sub }}</span></div>
                    <div class="text-[11px] text-muted mt-1"><span class="text-amber-team">{{ a.teams.amber ?? 'Amber' }}</span> vs <span class="text-sapphire-team">{{ a.teams.sapphire ?? 'Sapphire' }}</span><template v-if="a.since"> · {{ (now, elapsedSince(a.since)) }}</template></div>
                  </div>
                  <div v-if="a.picks" class="hidden md:flex items-center gap-3">
                    <div v-for="t in (['amber', 'sapphire'] as const)" :key="t" class="flex gap-1">
                      <HeroCard v-for="h in a.picks[t].slice(0, 6)" :key="h" size="xs" :name="heroOf(h)?.name" :src="heroOf(h)?.imageUrl" :title="heroOf(h)?.name" />
                    </div>
                  </div>
                  <RouterLink v-if="a.link" :to="a.link" :class="[a.action === 'View Live' ? 'btn-accent' : a.action === 'Join' ? 'btn-primary' : 'btn-ghost', '!h-9']">{{ a.action }}</RouterLink>
                </li>
              </ul>
            </PageState>
          </section>

          <div class="space-y-6">
            <section class="card-ornate p-4">
              <div class="flex items-center justify-between mb-3"><h2 class="h-section text-lg">Recent Results</h2><RouterLink to="/matches" class="text-xs text-primary hover:underline">View all</RouterLink></div>
              <PageState :empty="!data.recent.length" empty-text="No completed matches yet.">
                <ul class="divide-y divide-line">
                  <li v-for="r in data.recent" :key="r.matchId">
                    <RouterLink :to="`/matches/${r.matchId}`" class="flex items-center gap-3 py-2.5 hover:bg-raised/40 -mx-2 px-2 rounded-lg">
                      <Trophy :class="['w-5 h-5 shrink-0', r.winner === 'AMBER' ? 'text-amber-team' : 'text-sapphire-team']" />
                      <div class="min-w-0 flex-1">
                        <div class="text-sm font-semibold flex items-center gap-2">PUG #{{ r.pugNumber ?? '—' }}<SimBadge v-if="r.isSimulated" /></div>
                        <div class="text-xs"><span :class="r.winner === 'AMBER' ? 'text-amber-team' : 'text-sapphire-team'">{{ r.winner === 'AMBER' ? r.teams.amber ?? 'Amber' : r.teams.sapphire ?? 'Sapphire' }}</span> <span class="text-muted">won</span></div>
                      </div>
                      <div class="text-right text-xs text-muted"><div class="tabular-nums">{{ duration(r.durationSec) }}</div><div>{{ timeAgo(r.date) }}</div></div>
                      <ChevronRight class="w-4 h-4 text-muted" />
                    </RouterLink>
                  </li>
                </ul>
              </PageState>
            </section>

            <section class="card-ornate p-4">
              <div class="flex items-center justify-between mb-3"><h2 class="h-section text-lg">Top Players <span class="font-sans normal-case tracking-normal text-sm font-normal text-muted">{{ data.season ? `(${data.season.name})` : '' }}</span></h2><RouterLink to="/leaderboard" class="text-xs text-primary hover:underline">View all</RouterLink></div>
              <PageState :empty="!data.leaderboard.length" :empty-text="data.season ? 'No rated players yet.' : 'No active season.'">
                <table class="w-full table-compact">
                  <thead><tr><th>#</th><th>Player</th><th class="text-right">Points</th><th class="text-right">W/L</th></tr></thead>
                  <tbody>
                    <tr v-for="(p, i) in data.leaderboard" :key="p.userId" class="hover:bg-raised/40">
                      <td :class="['font-display tabular-nums', i === 0 ? 'text-primary' : 'text-muted']">{{ i + 1 }}</td>
                      <td><RouterLink :to="`/players/${p.userId}`" class="font-medium hover:text-primary flex items-center gap-2 max-w-[160px]"><PlayerAvatar :name="p.displayName" :src="p.avatarUrl" class="w-6 h-6 text-[10px]" /><span class="truncate">{{ p.displayName }}</span></RouterLink></td>
                      <td class="text-right font-display tabular-nums">{{ p.points.toLocaleString() }}</td>
                      <td class="text-right tabular-nums text-muted">{{ p.wins }} / {{ p.losses }}</td>
                    </tr>
                  </tbody>
                </table>
              </PageState>
            </section>
          </div>
        </div>
        <RouterLink v-if="landing" to="/leaderboard" class="inline-flex items-center gap-1 text-sm text-primary hover:underline">See the full leaderboard<ArrowRight class="w-4 h-4" /></RouterLink>
      </PageState>
    </div>
  </div>
</template>
