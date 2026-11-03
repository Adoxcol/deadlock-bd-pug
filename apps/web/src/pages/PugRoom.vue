<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { Copy, Crown, LogIn, Users } from 'lucide-vue-next';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import PageHeader from '../components/PageHeader.vue';
import PageState from '../components/PageState.vue';
import SimBadge from '../components/SimBadge.vue';
import InviteLinks from '../components/pug/InviteLinks.vue';
import LobbySeats from '../components/pug/LobbySeats.vue';
import LobbySettings, { type LobbyRules } from '../components/pug/LobbySettings.vue';
import TeamNameInput from '../components/pug/TeamNameInput.vue';
import TossPanel from '../components/pug/TossPanel.vue';
import PickBoard from '../components/pug/PickBoard.vue';
import { rememberReturn } from '../lib/returnTo';
import RankIcon from '../components/RankIcon.vue';
import { STARTING_RATING, rankOf, underdogBonus } from '../../../server/src/rating/points';
import { defaultTeamName, pickingCaptain, type Formation, type FormationCommand, type CaptainSeat } from '../../../server/src/draft/formation';

const props = defineProps<{ pugId: string }>();
const session = useSession();
const router = useRouter();
const route = useRoute();
const room = ref<{ id: string; name: string | null; code: string | null; invites: { captainA: string; captainB: string; player: string } | null; inviteRole: 'captainA' | 'captainB' | 'player' | null; number: number; format: string; settings: LobbyRules | null; status: string; isSimulated: boolean; formation: Formation | null; participants: { userId: string; user: { displayName: string } }[]; ratings: Record<string, { rating: number; rank: string }> } | null>(null);
const error = ref<string | null>(null);
const actionError = ref<string | null>(null);
const pending = ref(false);
const state = computed(() => room.value?.formation);
const me = computed(() => session.user?.id ?? '');
const seats: CaptainSeat[] = ['a', 'b'];
const seat = computed(() => seats.find((t) => state.value?.captains[t] === me.value));
const size = computed(() => Number(room.value?.format.split('v')[0] ?? 6));
const joined = computed(() => state.value?.players.includes(me.value));
const available = computed(() => state.value?.players.filter((id) => ![...state.value!.teams.a, ...state.value!.teams.b].includes(id)) ?? []);
const full = computed(() => state.value?.players.length === size.value * 2 && state.value.captains.a && state.value.captains.b);
const canSkip = computed(() => full.value && state.value?.teams.a.length === size.value && state.value.teams.b.length === size.value);
const orderedSeats = computed(() => [...seats].sort((a, b) => (state.value?.sides[a] === 'amber' ? -1 : 1) - (state.value?.sides[b] === 'amber' ? -1 : 1)));
const name = (id: string | null) => room.value?.participants.find((p) => p.userId === id)?.user.displayName ?? 'Open seat';
const rating = (id: string) => room.value?.ratings[id]?.rating ?? STARTING_RATING;
const teamTotal = (t: CaptainSeat) => (state.value?.teams[t] ?? []).reduce((n, id) => n + rating(id), 0);
// What a win would pay, shown once both teams have the same number of players.
const teamBonus = (t: CaptainSeat) => {
  const f = state.value!; const n = f.teams.a.length;
  if (!n || n !== f.teams.b.length) return null;
  return underdogBonus(t === 'a' ? 'AMBER' : 'SAPPHIRE', true, Math.round(teamTotal('a') / n), Math.round(teamTotal('b') / n));
};
const captainName = (t: CaptainSeat | null) => t ? name(state.value?.captains[t] ?? null) : '';
const inviteToken = computed(() => (typeof route.query.k === 'string' ? route.query.k : null));
const invited = computed(() => !!room.value?.code);
const waiting = computed(() => active.value && state.value?.phase === 'waiting');
const inviteLabel = computed(() => ({ captainA: 'Captain A', captainB: 'Captain B', player: 'a player' })[room.value?.inviteRole ?? 'player']);
// The offer disappears once the link has done its job.
const inviteOpen = computed(() => {
  const r = room.value?.inviteRole;
  if (!r || !waiting.value) return false;
  return r === 'player' ? !joined.value : state.value?.captains[r === 'captainA' ? 'a' : 'b'] !== me.value;
});
const teamName = (t: CaptainSeat) => state.value?.teamNames?.[t] ?? defaultTeamName(captainName(t));
const initial = (t: CaptainSeat) => captainName(t).replace('[SIM] ', '').charAt(0).toUpperCase();
const tossing = computed(() => invited.value && active.value && (state.value?.phase === 'choice' || state.value?.phase === 'side'));
const picking = computed(() => invited.value && active.value && state.value?.phase === 'picking');
const clean = (n: string) => n.replace('[SIM] ', '');
const boardTeams = computed(() => orderedSeats.value.map((t) => ({
  seat: t, total: teamTotal(t), bonus: teamBonus(t), side: state.value!.sides[t], name: teamName(t), customName: state.value!.teamNames?.[t] ?? '', defaultName: defaultTeamName(captainName(t)),
  players: state.value!.teams[t].map((id) => ({ id, name: clean(name(id)), rating: rating(id), isCaptain: id === state.value!.captains[t], isMe: id === me.value })),
  picking: pickingCaptain(state.value!) === t, mine: seat.value === t,
})));
const rulesText = computed(() => {
  const r = room.value?.settings;
  return r ? [`${r.bansPerTeam} bans per team`, r.timerSeconds ? `${r.timerSeconds}s timer` : 'No timer', r.allowMirrorPicks ? 'Mirror picks on' : 'No mirror picks'].join(' · ') : '';
});
const seatRows = computed(() => seats.map((t) => {
  const id = state.value?.captains[t] ?? null;
  return { team: id ? teamName(t) : null, customTeam: state.value?.teamNames?.[t] ?? '', defaultTeam: id ? defaultTeamName(name(id)) : '', key: t, label: `Captain ${t.toUpperCase()}`, name: id ? name(id) : null, isMe: !!id && id === me.value, canTake: !id && !!room.value?.invites && !seat.value && !!waiting.value };
}));
const pool = computed(() => (state.value?.players ?? []).filter((id) => id !== state.value?.captains.a && id !== state.value?.captains.b).map((id) => ({ id, name: name(id), isMe: id === me.value, rating: rating(id), rank: rankOf(rating(id)) })));
const poolSlots = computed(() => size.value * 2 - 2);
const showTeams = ref(false);
const waitingText = computed(() => {
  const empty = seats.filter((t) => !state.value?.captains[t]).length;
  const need = poolSlots.value - pool.value.length;
  if (!empty && !need) return 'Everyone is here. A captain can start the toss.';
  return `Waiting for ${[empty ? `${empty} captain${empty > 1 ? 's' : ''}` : '', need ? `${need} player${need > 1 ? 's' : ''}` : ''].filter(Boolean).join(' and ')}.`;
});
const codeCopied = ref(false);
async function copyCode() {
  await navigator.clipboard?.writeText(room.value?.code ?? '').catch(() => {});
  codeCopied.value = true; setTimeout(() => (codeCopied.value = false), 1600);
}
function signIn() { rememberReturn(route.fullPath); void router.push('/login'); }
async function accept(token: string) {
  if (pending.value || !room.value) return;
  pending.value = true; actionError.value = null;
  try {
    await api(`/pugs/${room.value.id}/invite`, { method: 'POST', body: { token } });
    // The link has done its job; don't leave the token in the address bar.
    if (inviteToken.value) await router.replace({ path: route.path, query: {} });
  }
  catch (e) { actionError.value = (e as Error).message; }
  finally { await load(); pending.value = false; }
}
const active = computed(() => room.value?.status === 'WAITING' && state.value?.phase !== 'complete');
const phaseText = computed(() => {
  const s = state.value;
  if (!s) return 'This older PUG uses manual team setup.';
  if (room.value?.status === 'CANCELLED') return 'This PUG has been cancelled.';
  if (s.phase === 'waiting') return 'Join the player pool, then claim two captain seats.';
  if (s.phase === 'choice') return `${captainName(s.winner)} won the toss. Choose first player pick or side choice.`;
  if (s.phase === 'side') return `${captainName(s.sideChooser)} chooses the Hidden King or the Archmother. ${captainName(s.first)} picks players first.`;
  if (s.phase === 'picking') return `${captainName(pickingCaptain(s))} picks next. Pick ${s.picks.length + 1} of ${size.value * 2 - 2}.`;
  return 'Teams are locked. Continue to the hero draft and ready up.';
});
async function load() {
  try {
    const wasForming = room.value?.formation && room.value.formation.phase !== 'complete';
    room.value = await api(`/pugs/${props.pugId}${inviteToken.value ? `?k=${encodeURIComponent(inviteToken.value)}` : ''}`); error.value = null;
    const next = room.value?.formation;
    if (wasForming && next?.draftId && next.players.includes(me.value)) await router.push(`/draft/${next.draftId}`);
  }
  catch (e) { error.value = (e as Error).message; }
}
async function command(cmd: FormationCommand) {
  if (!state.value || pending.value) return;
  pending.value = true; actionError.value = null;
  try { await api(`/pugs/${room.value!.id}/formation`, { method: 'POST', body: { command: cmd, expectedSeq: state.value.seq } }); }
  catch (e) { actionError.value = (e as Error).message; }
  finally { await load(); pending.value = false; }
}
let timer: ReturnType<typeof setInterval>;
onMounted(() => { void load(); timer = setInterval(() => { if (!pending.value) void load(); }, 2000); });
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-5">
    <PageHeader :eyebrow="room?.code ? `Lobby · ${room.format}` : 'PUG lobby'" :title="room ? (room.name ?? `PUG #${room.number}`) : 'PUG room'" subtitle="Form the teams here. You join the in-game Deadlock lobby after the hero draft.">
      <SimBadge v-if="room?.isSimulated" />
      <button v-if="room?.code" type="button" class="group flex items-center gap-3 h-11 px-4 bg-bg border border-line hover:border-primary/50 transition-colors" :title="codeCopied ? 'Copied' : 'Copy room code'" aria-label="Copy room code" @click="copyCode">
        <span class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{{ codeCopied ? 'Copied' : 'Room' }}</span>
        <span class="font-display text-xl tracking-[0.25em] text-primary">{{ room.code }}</span>
        <Copy class="w-3.5 h-3.5 text-muted group-hover:text-primary" />
      </button>
    </PageHeader>
    <PageState :loading="!room && !error" :error="error">
      <template v-if="room && state">
        <!-- Someone arrived on an invite link -->
        <section v-if="inviteOpen" class="relative overflow-hidden border border-primary/60 bg-primary/10 p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4 animate-fade-up">
          <div class="flex items-center gap-4 min-w-0">
            <component :is="room.inviteRole === 'player' ? Users : Crown" class="w-7 h-7 shrink-0 text-primary" />
            <div class="min-w-0">
              <div class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">You're invited</div>
              <div class="font-display text-2xl uppercase">Join as {{ inviteLabel }}</div>
            </div>
          </div>
          <button v-if="!session.user" type="button" class="btn-primary !h-11" @click="signIn"><LogIn class="w-4 h-4" />Sign in to join</button>
          <button v-else type="button" class="btn-primary !h-11" :disabled="pending || !session.can('PLAYER')" @click="accept(inviteToken!)">{{ room.inviteRole === 'player' ? 'Join the pool' : 'Take the seat' }}</button>
        </section>
        <p v-if="invited && actionError" role="alert" class="text-danger text-sm">{{ actionError }}</p>

        <TossPanel v-if="tossing" :phase="state.phase as 'choice' | 'side'" :winner="state.winner!" :you-choose="seat === (state.phase === 'choice' ? state.winner : state.sideChooser)" :pending="pending"
          :winner-team="clean(captainName(state.winner))" :chooser-team="clean(captainName(state.sideChooser))" :first-team="clean(captainName(state.first))" :initials="{ a: initial('a'), b: initial('b') }"
          @first="command({ kind: 'choice', advantage: 'first' })"
          @side="(side) => state!.phase === 'choice' ? command({ kind: 'choice', advantage: 'side', side }) : command({ kind: 'side', side })" />

        <PickBoard v-if="picking" :teams="boardTeams" :size="size" :pool="available.map((id) => ({ id, name: clean(name(id)), rating: rating(id) }))" :can-pick="seat === pickingCaptain(state)" :pending="pending"
          :pick-number="state.picks.length + 1" :total-picks="size * 2 - 2" :turn-name="teamName(pickingCaptain(state)!)"
          @pick="(userId) => command({ kind: 'pick', userId })" @team-name="(n) => command({ kind: 'teamName', name: n })" />

        <InviteLinks v-if="waiting && room.invites && room.code" :code="room.code" :invites="room.invites" />
        <LobbySettings v-if="waiting && room.invites && room.settings" :id="room.id" :number="room.number" :name="room.name" :format="room.format" :settings="room.settings" @saved="load" />

        <LobbySeats v-if="waiting && invited" :format="room.format" :seats="seatRows" :pool="pool" :slots="poolSlots" :pending="pending"
          @team-name="(n) => command({ kind: 'teamName', name: n })"
          @take="(t) => accept(room!.invites![t === 'a' ? 'captainA' : 'captainB'])">
          <button v-if="room.invites && !joined" type="button" class="btn-ghost !h-8" :disabled="pending || pool.length >= poolSlots" @click="accept(room.invites.player)">Join the pool</button>
          <button v-else-if="joined" type="button" class="btn-ghost !h-8" :disabled="pending" @click="command({ kind: 'leave' })">Leave</button>
        </LobbySeats>

        <section v-if="waiting && invited" class="flex flex-wrap items-center justify-between gap-3 border-y border-line/70 py-3" role="status">
          <div class="space-y-1">
            <p class="font-mono text-xs font-bold uppercase tracking-[0.14em] text-muted">{{ waitingText }}</p>
            <p v-if="rulesText" class="text-xs text-muted">{{ rulesText }}</p>
          </div>
          <button v-if="seat" class="btn-primary" :disabled="pending || !full" @click="command({ kind: 'toss' })">Start the toss</button>
        </section>

        <section v-if="!(waiting && invited) && !tossing && !picking" class="card-ornate p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="h-section">{{ state.phase === 'complete' ? 'Teams ready' : 'Team selection' }}</h2>
            <span class="font-mono text-sm">{{ state.players.length }}/{{ size * 2 }} players · {{ room.format }}</span>
          </div>
          <p role="status" class="text-sm">{{ phaseText }}</p>
          <p v-if="state.winner && state.first" class="text-sm text-muted">Toss winner: {{ captainName(state.winner) }} · First player pick: {{ captainName(state.first) }}</p>
          <p v-if="actionError && !invited" role="alert" class="text-danger text-sm">{{ actionError }}</p>
          <div v-if="active" class="flex flex-wrap gap-2">
            <template v-if="state.phase === 'waiting'">
              <RouterLink v-if="!session.user" to="/login" class="btn-primary">Sign in to join</RouterLink>
              <button v-else-if="!joined" class="btn-primary" :disabled="pending || !session.can('PLAYER') || state.players.length >= size * 2" @click="command({ kind: 'join' })">Join player pool</button>
              <button v-else class="btn-ghost" :disabled="pending" @click="command({ kind: 'leave' })">Leave room</button>
              <button v-if="seat" class="btn-primary" :disabled="pending || !full" @click="command({ kind: 'toss' })">Toss for first pick / side</button>
            </template>
            <template v-if="state.phase === 'choice' && seat === state.winner">
              <button class="btn-primary" :disabled="pending" @click="command({ kind: 'choice', advantage: 'first' })">Pick players first</button>
              <button class="btn-ghost" :disabled="pending" @click="command({ kind: 'choice', advantage: 'side' })">Choose side</button>
            </template>
            <template v-if="state.phase === 'side' && seat === state.sideChooser">
              <button v-for="side in (['amber', 'sapphire'] as const)" :key="side" :disabled="pending"
                :class="['btn rounded-none px-5 text-bg [clip-path:polygon(8px_0,100%_0,calc(100%-8px)_100%,0_100%)]', side === 'amber' ? 'bg-amber-team hover:brightness-110' : 'bg-sapphire-team hover:brightness-110']"
                @click="command({ kind: 'side', side })">{{ side === 'amber' ? 'Hidden King' : 'Archmother' }}</button>
            </template>
          </div>
          <RouterLink v-if="state.draftId" :to="`/draft/${state.draftId}`" class="btn-primary inline-flex">Open hero draft</RouterLink>
          <p class="text-xs text-muted">Player picks use snake order: A, B, B, A, A, B… Hero drafting is separate and follows the lobby's rules.</p>
        </section>

        <section v-if="active && state.phase === 'waiting'" class="card-ornate p-5 space-y-3">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="h-section">Already have teams?</h2>
            <button v-if="invited" type="button" class="btn-ghost !h-8" :aria-expanded="showTeams" @click="showTeams = !showTeams">{{ showTeams ? 'Hide teams' : 'Arrange teams' }}</button>
          </div>
          <p class="text-sm text-muted">Everyone picks a side. With two full teams, both captains can agree to skip the toss and player picks. Roster changes clear both approvals.</p>
          <button v-if="seat" class="btn-ghost" :disabled="pending || !canSkip" @click="command({ kind: 'skip', agree: !state.votes.includes(seat) })">{{ state.votes.includes(seat) ? 'Withdraw agreement' : 'Agree to skip' }}</button>
          <p v-if="state.votes.length === 1" role="status" class="text-sm text-accent">Waiting for the other captain to agree.</p>
        </section>

        <div v-if="!tossing && !picking && (!(waiting && invited) || showTeams)" class="grid md:grid-cols-2 gap-5">
          <section v-for="t in orderedSeats" :key="t" class="card-ornate p-5 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="h-section" :class="state.sides[t] === 'amber' ? 'text-amber-team' : 'text-sapphire-team'">{{ state.phase === 'choice' || state.phase === 'side' || (waiting && invited) ? (invited ? teamName(t) : `Captain ${t.toUpperCase()}`) : `${invited ? teamName(t) + ' · ' : ''}${state.sides[t] === 'amber' ? 'Hidden King' : 'Archmother'}` }} <span class="text-muted text-sm">{{ state.teams[t].length }}/{{ size }} · {{ teamTotal(t).toLocaleString() }} rating</span></h2>
              <span v-if="state.votes.includes(t)" class="text-accent text-xs">Skip agreed</span>
            </div>
            <p class="text-sm break-words">Captain: {{ name(state.captains[t]) }}</p>
            <TeamNameInput v-if="invited && active && seat === t" :value="state.teamNames?.[t] ?? ''" :placeholder="defaultTeamName(name(state.captains[t]))" label="Team name" @save="(n) => command({ kind: 'teamName', name: n })" />
            <ul class="divide-y divide-line text-sm">
              <li v-for="id in state.teams[t]" :key="id" class="py-2 break-words flex justify-between gap-3"><span>{{ name(id) }} <span v-if="id === me" class="text-muted">(you)</span></span><span class="font-mono text-xs tabular-nums text-muted"><RankIcon :rank="rankOf(rating(id))" :size="16" /> {{ rating(id) }}</span></li>
            </ul>
            <div v-if="active && state.phase === 'waiting' && joined" class="flex flex-wrap gap-2">
              <button v-if="!invited && !seat && !state.captains[t]" class="btn-ghost" :disabled="pending" @click="command({ kind: 'captain', seat: t })">Become captain</button>
              <button v-if="!seat && !state.teams[t].includes(me)" class="btn-ghost" :disabled="pending" @click="command({ kind: 'team', seat: t })">Join this team</button>
              <button v-if="!seat && state.teams[t].includes(me)" class="btn-ghost" :disabled="pending" @click="command({ kind: 'team', seat: null })">Return to pool</button>
            </div>
          </section>
        </div>

        <section v-if="state.phase !== 'complete' && !(waiting && invited) && !tossing && !picking" class="card-ornate p-5 space-y-3">
          <h2 class="h-section">Available players · {{ available.length }}</h2>
          <p v-if="!available.length" class="text-sm text-muted">{{ state.phase === 'waiting' ? 'Players can join the pool above or arrange teams below the captain seats.' : 'No unassigned players.' }}</p>
          <ul class="divide-y divide-line">
            <li v-for="id in available" :key="id" class="flex items-center justify-between gap-3 py-3">
              <span class="text-sm break-words min-w-0">{{ name(id) }} <span class="font-mono text-xs tabular-nums text-muted">{{ rating(id) }}</span></span>
              <button v-if="active && state.phase === 'picking' && seat === pickingCaptain(state)" class="btn-primary shrink-0" :disabled="pending" :aria-label="`Pick ${name(id)}`" @click="command({ kind: 'pick', userId: id })">Pick</button>
            </li>
          </ul>
        </section>

        <section v-if="state.picks.length && !picking" class="card-ornate p-5">
          <h2 class="h-section mb-3">Player pick history</h2>
          <ol class="space-y-2 text-sm"><li v-for="(pick, i) in state.picks" :key="pick.userId">{{ i + 1 }}. {{ captainName(pick.captain) }} picked {{ name(pick.userId) }}</li></ol>
        </section>
      </template>
      <p v-else-if="room" class="card p-5">This PUG uses the older manual team setup.</p>
    </PageState>
  </div>
</template>
