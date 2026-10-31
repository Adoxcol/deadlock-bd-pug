<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';
import { useSession } from '../stores/session';
import PageHeader from '../components/PageHeader.vue';
import PageState from '../components/PageState.vue';
import SimBadge from '../components/SimBadge.vue';
import { pickingCaptain, type Formation, type FormationCommand, type CaptainSeat } from '../../../server/src/draft/formation';

const props = defineProps<{ pugId: string }>();
const session = useSession();
const router = useRouter();
const room = ref<{ number: number; format: string; status: string; isSimulated: boolean; formation: Formation | null; participants: { userId: string; user: { displayName: string } }[] } | null>(null);
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
const captainName = (t: CaptainSeat | null) => t ? name(state.value?.captains[t] ?? null) : '';
const active = computed(() => room.value?.status === 'WAITING' && state.value?.phase !== 'complete');
const phaseText = computed(() => {
  const s = state.value;
  if (!s) return 'This older PUG uses manual team setup.';
  if (room.value?.status === 'CANCELLED') return 'This PUG has been cancelled.';
  if (s.phase === 'waiting') return 'Join the player pool, then claim two captain seats.';
  if (s.phase === 'choice') return `${captainName(s.winner)} won the toss. Choose first player pick or side choice.`;
  if (s.phase === 'side') return `${captainName(s.sideChooser)} chooses Amber or Sapphire. ${captainName(s.first)} picks players first.`;
  if (s.phase === 'picking') return `${captainName(pickingCaptain(s))} picks next. Pick ${s.picks.length + 1} of ${size.value * 2 - 2}.`;
  return 'Teams are locked. Continue to the hero draft and ready up.';
});
async function load() {
  try {
    const wasForming = room.value?.formation && room.value.formation.phase !== 'complete';
    room.value = await api(`/pugs/${props.pugId}`); error.value = null;
    const next = room.value?.formation;
    if (wasForming && next?.draftId && next.players.includes(me.value)) await router.push(`/draft/${next.draftId}`);
  }
  catch (e) { error.value = (e as Error).message; }
}
async function command(cmd: FormationCommand) {
  if (!state.value || pending.value) return;
  pending.value = true; actionError.value = null;
  try { await api(`/pugs/${props.pugId}/formation`, { method: 'POST', body: { command: cmd, expectedSeq: state.value.seq } }); }
  catch (e) { actionError.value = (e as Error).message; }
  finally { await load(); pending.value = false; }
}
let timer: ReturnType<typeof setInterval>;
onMounted(() => { void load(); timer = setInterval(() => { if (!pending.value) void load(); }, 2000); });
onUnmounted(() => clearInterval(timer));
</script>

<template>
  <div class="max-w-6xl mx-auto space-y-5">
    <PageHeader eyebrow="PUG lobby" :title="room ? `PUG #${room.number}` : 'PUG room'" subtitle="Join here to form teams. You will join the in-game Deadlock lobby after hero drafting.">
      <SimBadge v-if="room?.isSimulated" />
    </PageHeader>
    <PageState :loading="!room && !error" :error="error">
      <template v-if="room && state">
        <section class="card-ornate p-5 space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-3">
            <h2 class="h-section">{{ state.phase === 'complete' ? 'Teams ready' : 'Team selection' }}</h2>
            <span class="font-mono text-sm">{{ state.players.length }}/{{ size * 2 }} players · {{ room.format }}</span>
          </div>
          <p role="status" class="text-sm">{{ phaseText }}</p>
          <p v-if="state.winner && state.first" class="text-sm text-muted">Toss winner: {{ captainName(state.winner) }} · First player pick: {{ captainName(state.first) }}</p>
          <p v-if="actionError" role="alert" class="text-danger text-sm">{{ actionError }}</p>
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
              <button v-for="side in (['amber', 'sapphire'] as const)" :key="side" class="btn-primary" :disabled="pending" @click="command({ kind: 'side', side })">Choose {{ side }}</button>
            </template>
          </div>
          <RouterLink v-if="state.draftId" :to="`/draft/${state.draftId}`" class="btn-primary inline-flex">Open hero draft</RouterLink>
          <p class="text-xs text-muted">Player picks use snake order: A, B, B, A, A, B… Hero drafting is separate; Amber starts hero bans and picks.</p>
        </section>

        <div class="grid md:grid-cols-2 gap-5">
          <section v-for="t in orderedSeats" :key="t" class="card-ornate p-5 space-y-4">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <h2 class="h-section" :class="state.sides[t] === 'amber' ? 'text-amber-team' : 'text-sapphire-team'">{{ state.phase === 'choice' || state.phase === 'side' ? `Captain ${t.toUpperCase()}` : state.sides[t] }} <span class="text-muted text-sm">{{ state.teams[t].length }}/{{ size }}</span></h2>
              <span v-if="state.votes.includes(t)" class="text-accent text-xs">Skip agreed</span>
            </div>
            <p class="text-sm break-words">Captain: {{ name(state.captains[t]) }}</p>
            <ul class="divide-y divide-line text-sm">
              <li v-for="id in state.teams[t]" :key="id" class="py-2 break-words">{{ name(id) }} <span v-if="id === me" class="text-muted">(you)</span></li>
            </ul>
            <div v-if="active && state.phase === 'waiting' && joined" class="flex flex-wrap gap-2">
              <button v-if="!seat && !state.captains[t]" class="btn-ghost" :disabled="pending" @click="command({ kind: 'captain', seat: t })">Become captain</button>
              <button v-if="!seat && !state.teams[t].includes(me)" class="btn-ghost" :disabled="pending" @click="command({ kind: 'team', seat: t })">Join this team</button>
              <button v-if="!seat && state.teams[t].includes(me)" class="btn-ghost" :disabled="pending" @click="command({ kind: 'team', seat: null })">Return to pool</button>
            </div>
          </section>
        </div>

        <section v-if="state.phase !== 'complete'" class="card-ornate p-5 space-y-3">
          <h2 class="h-section">Available players · {{ available.length }}</h2>
          <p v-if="!available.length" class="text-sm text-muted">{{ state.phase === 'waiting' ? 'Players can join the pool above or arrange teams below the captain seats.' : 'No unassigned players.' }}</p>
          <ul class="divide-y divide-line">
            <li v-for="id in available" :key="id" class="flex items-center justify-between gap-3 py-3">
              <span class="text-sm break-words min-w-0">{{ name(id) }}</span>
              <button v-if="active && state.phase === 'picking' && seat === pickingCaptain(state)" class="btn-primary shrink-0" :disabled="pending" :aria-label="`Pick ${name(id)}`" @click="command({ kind: 'pick', userId: id })">Pick</button>
            </li>
          </ul>
        </section>

        <section v-if="active && state.phase === 'waiting'" class="card-ornate p-5 space-y-3">
          <h2 class="h-section">Already have teams?</h2>
          <p class="text-sm text-muted">Join your arranged sides above. With two full teams, both captains can agree to skip the toss and player picks. Roster changes clear both approvals.</p>
          <button v-if="seat" class="btn-ghost" :disabled="pending || !canSkip" @click="command({ kind: 'skip', agree: !state.votes.includes(seat) })">{{ state.votes.includes(seat) ? 'Withdraw agreement' : 'Agree to skip' }}</button>
          <p v-if="state.votes.length === 1" role="status" class="text-sm text-accent">Waiting for the other captain to agree.</p>
        </section>
        <section v-if="state.picks.length" class="card-ornate p-5">
          <h2 class="h-section mb-3">Player pick history</h2>
          <ol class="space-y-2 text-sm"><li v-for="(pick, i) in state.picks" :key="pick.userId">{{ i + 1 }}. {{ captainName(pick.captain) }} picked {{ name(pick.userId) }}</li></ol>
        </section>
      </template>
      <p v-else-if="room" class="card p-5">This PUG uses the older manual team setup.</p>
    </PageState>
  </div>
</template>
