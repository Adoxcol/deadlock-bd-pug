<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  Search, Play, Pause, Square, Lock, Ban, Timer, Eye, Link2, Tv, History, AlertTriangle, ExternalLink, Copy,
  Users, Check, LogOut, ArrowLeftRight, Crown, UserPlus, UserMinus, RotateCcw, Plus, SkipForward, Settings2, Circle,
} from 'lucide-vue-next';
import { api, ApiError } from '../lib/api';
import { realtime } from '../lib/ws';
import { useHeroes } from '../stores/heroes';
import { useSession } from '../stores/session';
import HeroPortrait from '../components/HeroPortrait.vue';
import StatusBadge from '../components/StatusBadge.vue';
import PageState from '../components/PageState.vue';
import SimBadge from '../components/SimBadge.vue';
import OrderTimeline from '../components/draft/OrderTimeline.vue';

type Side = 'amber' | 'sapphire';
const SIDES: Side[] = ['amber', 'sapphire'];
const props = defineProps<{ draftId: string; spectate: boolean }>();
const router = useRouter();
const heroes = useHeroes();
const session = useSession();
const rec = ref<any>(null);
const people = ref<Record<string, string>>({});
const presence = ref<{ watchers: number; online: string[] }>({ watchers: 0, online: [] });
const error = ref<string | null>(null);
const actionError = ref<string | null>(null);
const notice = ref<string | null>(null);
const pending = ref(false);
const selected = ref<number | null>(null);
const query = ref('');
const heroType = ref<string>('all');
const now = ref(realtime.now());
const matchId = ref<string | null>(null);
const searchEl = ref<HTMLInputElement | null>(null);
const broadcast = computed(() => new URLSearchParams(location.search).get('broadcast') === '1');

const s = computed(() => rec.value?.state);
const me = computed(() => session.user?.id ?? null);
const isMod = computed(() => session.can('MODERATOR'));
const step = computed(() => (s.value && (s.value.status === 'drafting' || s.value.status === 'paused') ? s.value.config.sequence[s.value.step] : null));
const mySeat = computed<Side | null>(() => (!me.value || !s.value ? null : SIDES.find((t) => s.value.captains[t] === me.value) ?? null));
const myTeam = computed<Side | null>(() => mySeat.value ?? (!me.value || !s.value ? null : SIDES.find((t) => s.value.members[t].includes(me.value)) ?? null));
const myTurn = computed(() => !props.spectate && s.value?.status === 'drafting' && !!step.value && mySeat.value === step.value.team);
const remaining = computed(() => (s.value?.turnEndsAt ? Math.min(s.value.config.timerSeconds || Infinity, Math.max(0, Math.ceil((s.value.turnEndsAt - now.value) / 1000))) : null));
const timerPct = computed(() => (remaining.value === null || !s.value?.config.timerSeconds ? 0 : (remaining.value / s.value.config.timerSeconds) * 100));
const teamSize = computed(() => ({ '6v6': 6, '4v4': 4, '2v2': 2 } as Record<string, number>)[s.value?.config.format] ?? 6);
const nameOf = (id: string | null | undefined) => (id ? people.value[id] ?? 'Player' : null);
const heroName = (id: number | null) => (id == null ? '—' : heroes.byId(id)?.name ?? `#${id}`);
const online = (id: string | null) => !!id && presence.value.online.includes(id);

// ---- availability (mirrors the server rules; the server still validates everything) ----
function unavailableReason(id: number): string | null {
  if (!s.value) return null;
  const st = s.value;
  if ([...st.bans.amber, ...st.bans.sapphire].includes(id)) return 'banned';
  for (const t of SIDES) if (st.picks[t].includes(id)) {
    const cur = step.value;
    if (cur && cur.type === 'pick' && st.config.allowMirrorPicks && t !== cur.team) continue;
    return rec.value.teamNames[t];
  }
  return null;
}
const freeCount = computed(() => heroes.list.filter((h) => !unavailableReason(h.id)).length);
const heroTypes = computed(() => [...new Set(heroes.list.map((h) => h.heroType).filter((x): x is string => !!x))].sort());
const roster = computed(() => heroes.list
  .filter((h) => h.name.toLowerCase().includes(query.value.trim().toLowerCase()))
  .filter((h) => heroType.value === 'all' || h.heroType === heroType.value));

// ---- turn info ----
const run = computed(() => {
  const seq = s.value?.config.sequence; const cur = step.value;
  if (!seq || !cur) return null;
  const same = (i: number) => seq[i]?.team === cur.team && seq[i]?.type === cur.type;
  let a = s.value.step; while (a > 0 && same(a - 1)) a--;
  let b = s.value.step; while (same(b + 1)) b++;
  return { index: s.value.step - a + 1, length: b - a + 1 };
});
const phaseLabel = computed(() => {
  if (!s.value || !step.value) return '';
  const seq = s.value.config.sequence as Array<{ type: string }>;
  let phase = 1; for (let i = 1; i <= s.value.step; i++) if (seq[i]!.type !== seq[i - 1]!.type) phase++;
  const banPhase = Math.ceil(phase / 2), kind = step.value.type === 'ban' ? 'Bans' : 'Picks';
  return `${kind}${seq.some((x, i) => i > 0 && x.type === 'ban' && seq[i - 1]!.type === 'pick') ? ` ${banPhase}` : ''} · Turn ${s.value.step + 1} of ${seq.length}`;
});

function slots(team: Side, type: 'pick' | 'ban') {
  if (!s.value) return [];
  const total = s.value.config.sequence.filter((x: any) => x.team === team && x.type === type).length;
  const entries = s.value.history.filter((h: any) => h.team === team && h.type === type && h.reason !== 'correction');
  const active = step.value && step.value.team === team && step.value.type === type ? entries.length : -1;
  const list: number[] = (type === 'pick' ? s.value.picks : s.value.bans)[team];
  let k = 0;
  return Array.from({ length: total }, (_, i) => {
    const e = entries[i];
    const heroId = e ? (e.heroId === null ? null : list[k++] ?? e.heroId) : null;
    return { heroId, skipped: !!e && e.heroId === null, active: i === active };
  });
}
const assignedTo = (heroId: number) => s.value?.assignments.find((a: any) => a.heroId === heroId)?.userId ?? null;
const teamPeople = (t: Side) => [s.value.captains[t], ...s.value.members[t]].filter(Boolean) as string[];

// ---- data ----
async function load() {
  try {
    const r = await api<any>(`/drafts/${props.draftId}`);
    realtime.clockOffset.value = r.serverNow - Date.now();
    rec.value = r; people.value = r.people; presence.value = r.presence; error.value = null;
  } catch (e) { error.value = (e as Error).message; }
}
const ERRORS: Record<string, string> = {
  STALE_SEQ: 'The draft moved on before your action arrived. Please choose again.',
  SEAT_TAKEN: 'Someone else just took that spot.',
  LOGIN_REQUIRED: 'Log in to take part.',
};
async function command(body: any) {
  if (!session.user) { router.push('/login'); return; }
  pending.value = true; actionError.value = null;
  try {
    const r = await api<any>(`/drafts/${rec.value.id}/command`, { method: 'POST', body });
    if (r.id !== rec.value.id) { router.replace(`/draft/${r.id}`); return; }
    rec.value = { ...rec.value, ...r };
    if (body.kind === 'select' || body.kind === 'skip') selected.value = null;
  } catch (e) {
    const c = e instanceof ApiError ? e.code : undefined;
    actionError.value = (c && ERRORS[c]) ?? (e as Error).message;
    if (c === 'STALE_SEQ') await load();
  } finally { pending.value = false; }
}
let hoverTimer: number | undefined;
function choose(id: number) {
  if (!myTurn.value || unavailableReason(id)) return;
  selected.value = id;
  // Tell the server what we're looking at (used if the timer runs out). Debounced; never blocks lock-in.
  clearTimeout(hoverTimer);
  hoverTimer = window.setTimeout(() => api(`/drafts/${rec.value.id}/command`, { method: 'POST', body: { kind: 'hover', heroId: id } }).catch(() => {}), 150);
}
function lockIn() { if (selected.value !== null && s.value && myTurn.value) command({ kind: 'select', heroId: selected.value, expectedSeq: s.value.seq }); }

// ---- sharing ----
const roomLink = computed(() => `${location.origin}/d/${rec.value?.code ?? ''}`);
async function copy(text: string, label: string) {
  try { await navigator.clipboard.writeText(text); notice.value = `${label} copied`; } catch { notice.value = 'Copy failed — select and copy manually'; }
  setTimeout(() => (notice.value = null), 2000);
}
const resultText = computed(() => {
  if (!s.value) return '';
  const st = s.value, t = rec.value.teamNames;
  const line = (side: Side) => `${t[side]}: ${st.picks[side].map((h: number) => { const p = assignedTo(h); return p ? `${heroName(h)} (${nameOf(p)})` : heroName(h); }).join(', ')}`;
  const bans = (side: Side) => { const b = slots(side, 'ban'); return b.length ? b.map((x) => (x.heroId === null ? 'None' : heroName(x.heroId))).join(', ') : 'None'; };
  return `${line('amber')}\n${line('sapphire')}\n\nBans — ${t.amber}: ${bans('amber')} · ${t.sapphire}: ${bans('sapphire')}\n\n${roomLink.value}`;
});

// ---- keyboard: "/" focuses search, Enter confirms ----
function onKey(e: KeyboardEvent) {
  const typing = (e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'SELECT';
  if (e.key === '/' && !typing) { e.preventDefault(); searchEl.value?.focus(); }
  else if (e.key === 'Enter' && myTurn.value && selected.value !== null) { e.preventDefault(); lockIn(); }
  else if (e.key === 'Enter' && myTurn.value && typing && roster.value.length === 1 && !unavailableReason(roster.value[0]!.id)) { e.preventDefault(); choose(roster.value[0]!.id); }
}

watch(() => s.value?.seq, () => { if (selected.value !== null && unavailableReason(selected.value)) selected.value = null; });
watch(myTurn, (v) => { if (!v) selected.value = null; });

let unsub = () => {};
let tick: number;
function subscribe(id: string) {
  unsub();
  unsub = realtime.subscribe(`draft:${id}`, (m) => {
    if (m.type === 'draft.state') { rec.value = { ...rec.value, ...m.payload }; if (m.payload.state.captains && Object.values(m.payload.state.captains).some((c: any) => c && !people.value[c])) load(); }
    if (m.type === 'draft.people') people.value = { ...people.value, ...m.payload };
    if (m.type === 'draft.presence') presence.value = m.payload;
    if (m.type === 'draft.match') matchId.value = m.payload.matchId;
    if (m.type === 'draft.redirect') router.replace(`/draft/${m.payload.id}${props.spectate ? '/spectate' : ''}${broadcast.value ? '?broadcast=1' : ''}`);
  });
}
watch(() => props.draftId, async (id) => { rec.value = null; await load(); subscribe(id); });
onMounted(async () => {
  await Promise.all([heroes.load().catch((e) => (error.value = e.message)), load()]);
  subscribe(props.draftId);
  tick = window.setInterval(() => (now.value = realtime.now()), 250);
  window.addEventListener('keydown', onKey);
});
onUnmounted(() => { unsub(); clearInterval(tick); clearTimeout(hoverTimer); window.removeEventListener('keydown', onKey); });
const teamText = (t: Side) => (t === 'amber' ? 'text-amber-team' : 'text-sapphire-team');
const teamBorder = (t: Side) => (t === 'amber' ? '!border-t-amber-team' : '!border-t-sapphire-team');
</script>

<template>
  <div :class="broadcast ? 'min-h-screen bg-bg p-6' : ''">
    <PageState :loading="!rec && !error" :error="!rec ? error : null">
      <div v-if="s" class="space-y-4">
        <!-- Header -->
        <div class="flex flex-wrap items-center gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-xl font-semibold tracking-tight truncate">{{ rec.name }}</h1>
              <StatusBadge :status="s.status" />
              <SimBadge v-if="rec.simulated || heroes.source === 'simulated'" />
            </div>
            <p class="text-xs text-muted mt-1 flex flex-wrap items-center gap-x-2">
              <span>{{ s.config.format }} · {{ s.config.bansPerTeam ? `${s.config.bansPerTeam} ban${s.config.bansPerTeam > 1 ? 's' : ''} per team` : 'no bans' }} · {{ s.config.timerSeconds ? `${s.config.timerSeconds}s timer` : 'No timer' }}</span>
              <span class="inline-flex items-center gap-1"><Eye class="w-3.5 h-3.5" />{{ presence.watchers }} watching</span>
            </p>
          </div>
          <div v-if="!broadcast" class="ml-auto flex flex-wrap items-center gap-2">
            <button v-if="rec.code" class="h-8 px-2.5 rounded-lg border border-line font-mono text-sm tracking-[0.2em] hover:bg-raised flex items-center gap-2" title="Copy room code" @click="copy(rec.code, 'Code')">{{ rec.code }}<Copy class="w-3.5 h-3.5 text-muted" /></button>
            <button class="btn-ghost !h-8" @click="copy(roomLink, 'Link')"><Link2 class="w-4 h-4" />Copy link</button>
            <a :href="`/draft/${rec.id}/spectate?broadcast=1`" target="_blank" class="btn-ghost !h-8" title="Clean view for OBS"><Tv class="w-4 h-4" /><span class="hidden sm:inline">Broadcast</span></a>
            <RouterLink v-if="matchId" :to="`/matches/${matchId}/live`" class="btn-primary !h-8">Live match<ExternalLink class="w-3.5 h-3.5" /></RouterLink>
            <template v-if="isMod && !spectate">
              <button v-if="s.status === 'waiting' && s.captains.amber && s.captains.sapphire" class="btn-ghost !h-8" :disabled="pending" title="Start without waiting for ready" @click="command({ kind: 'start' })"><Play class="w-4 h-4" />Force start</button>
              <button v-if="s.status === 'drafting'" class="btn-ghost !h-8" :disabled="pending" @click="command({ kind: 'pause' })"><Pause class="w-4 h-4" />Pause</button>
              <button v-if="s.status === 'paused'" class="btn-draft !h-8" :disabled="pending" @click="command({ kind: 'resume' })"><Play class="w-4 h-4" />Resume</button>
              <button v-if="['waiting','drafting','paused'].includes(s.status)" class="btn-danger !h-8" :disabled="pending" @click="command({ kind: 'cancel' })"><Square class="w-4 h-4" />Cancel</button>
            </template>
          </div>
        </div>

        <div v-if="notice" class="fixed bottom-4 left-1/2 -translate-x-1/2 z-40 card px-4 py-2 text-sm flex items-center gap-2 shadow-lg" role="status"><Check class="w-4 h-4 text-accent" />{{ notice }}</div>
        <div v-if="actionError" class="card border-danger/40 px-4 py-2 text-sm text-danger flex items-center gap-2" role="alert"><AlertTriangle class="w-4 h-4" />{{ actionError }}</div>

        <!-- ================= LOBBY ================= -->
        <template v-if="s.status === 'waiting'">
          <p class="text-sm text-muted text-center">
            <template v-if="!s.captains.amber || !s.captains.sapphire">Waiting for captains. Share the code <b class="font-mono text-text">{{ rec.code }}</b> or the link with the other captain.</template>
            <template v-else>Both captains are in. Ready up and the draft starts.</template>
          </p>
          <div class="grid md:grid-cols-2 gap-4">
            <section v-for="t in SIDES" :key="t" :class="['card p-4 space-y-4 border-t-2', teamBorder(t)]">
              <h2 :class="['text-lg font-semibold', teamText(t)]">{{ rec.teamNames[t] }}</h2>
              <!-- Captain seat -->
              <div class="rounded-lg border border-line bg-bg/40 p-3 space-y-3">
                <div class="flex items-center gap-2">
                  <Crown class="w-4 h-4 text-warn" />
                  <span class="text-sm font-medium">Captain</span>
                  <span v-if="s.captains[t]" class="ml-auto inline-flex items-center gap-1.5 text-xs" :class="s.ready[t] ? 'text-accent' : 'text-muted'">
                    <component :is="s.ready[t] ? Check : Circle" class="w-3.5 h-3.5" />{{ s.ready[t] ? 'Ready' : 'Not ready' }}
                  </span>
                </div>
                <div v-if="!s.captains[t]" class="flex items-center gap-3">
                  <span class="text-sm text-muted">Seat's free</span>
                  <button v-if="!spectate" class="btn-primary !h-8 ml-auto" :disabled="pending" @click="command({ kind: 'claimSeat', team: t })"><Crown class="w-4 h-4" />{{ mySeat ? 'Switch here' : 'Take the seat' }}</button>
                </div>
                <div v-else class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-medium flex items-center gap-1.5"><span :class="['w-2 h-2 rounded-full', online(s.captains[t]) ? 'bg-accent' : 'bg-line']" :title="online(s.captains[t]) ? 'Online' : 'Offline'" />{{ nameOf(s.captains[t]) }}</span>
                  <span v-if="mySeat === t" class="text-xs text-draft">You're captain</span>
                  <template v-if="mySeat === t && !spectate">
                    <button :class="[s.ready[t] ? 'btn-ghost' : 'btn-primary', '!h-8 ml-auto']" :disabled="pending" @click="command({ kind: 'setReady', ready: !s.ready[t] })"><Check class="w-4 h-4" />{{ s.ready[t] ? 'Not ready' : "I'm ready" }}</button>
                    <button class="btn-ghost !h-8" :disabled="pending" @click="command({ kind: 'leaveSeat' })"><LogOut class="w-4 h-4" />Leave seat</button>
                  </template>
                </div>
              </div>
              <!-- Players -->
              <div class="space-y-2">
                <div class="flex items-center gap-2 text-sm"><Users class="w-4 h-4 text-muted" />Players <span class="text-muted text-xs">{{ s.members[t].length + (s.captains[t] ? 1 : 0) }}/{{ teamSize }}</span>
                  <template v-if="!spectate && !mySeat">
                    <button v-if="myTeam !== t" class="btn-ghost !h-7 !px-2 ml-auto text-xs" :disabled="pending || s.members[t].length >= teamSize - 1" @click="command({ kind: 'joinTeam', team: t })"><UserPlus class="w-3.5 h-3.5" />Join</button>
                    <button v-else class="btn-ghost !h-7 !px-2 ml-auto text-xs" :disabled="pending" @click="command({ kind: 'joinTeam', team: null })"><UserMinus class="w-3.5 h-3.5" />Leave team</button>
                  </template>
                </div>
                <ul class="flex flex-wrap gap-1.5">
                  <li v-for="m in s.members[t]" :key="m" :class="['h-7 px-2 rounded-md border text-xs flex items-center gap-1.5', m === me ? 'border-draft/60' : 'border-line']">
                    <span :class="['w-1.5 h-1.5 rounded-full', online(m) ? 'bg-accent' : 'bg-line']" />{{ nameOf(m) }}
                  </li>
                  <li v-if="!s.members[t].length" class="text-xs text-muted">No players yet — players join here so their captain can assign them a hero after the draft.</li>
                </ul>
              </div>
            </section>
          </div>
          <section class="card p-4 space-y-3">
            <div class="flex flex-wrap items-center gap-3">
              <h2 class="h-section">Draft order</h2>
              <button v-if="(mySeat || isMod) && !spectate" class="btn-ghost !h-8 ml-auto" :disabled="pending" @click="command({ kind: 'swapSides' })"><ArrowLeftRight class="w-4 h-4" />Swap sides</button>
            </div>
            <OrderTimeline :sequence="s.config.sequence" :team-names="rec.teamNames" />
            <div class="flex flex-wrap items-center gap-3 pt-1 text-sm">
              <Settings2 class="w-4 h-4 text-muted" /><span class="text-muted">When a ban timer runs out:</span>
              <div class="flex rounded-lg border border-line overflow-hidden" role="radiogroup" aria-label="Ban timeout">
                <button v-for="o in [{ v: 'skip', l: 'No ban' }, { v: 'random', l: 'Random hero' }]" :key="o.v" role="radio" :aria-checked="s.config.timeoutBehavior === o.v"
                  :disabled="!(mySeat || isMod) || spectate || pending" :class="['px-3 h-8 text-sm disabled:cursor-not-allowed', s.config.timeoutBehavior === o.v ? 'bg-raised text-text' : 'text-muted']"
                  @click="command({ kind: 'setTimeoutBehavior', behavior: o.v })">{{ o.l }}</button>
              </div>
              <span class="text-xs text-muted">{{ s.config.timeoutBehavior === 'random' ? 'The hero being looked at gets banned, otherwise a random one.' : s.config.timeoutBehavior === 'pause' ? 'The draft pauses for a moderator.' : 'The ban is lost.' }} Picks always lock the hero being looked at, or a random one.</span>
            </div>
          </section>
        </template>

        <!-- ================= DRAFTING ================= -->
        <div v-else-if="s.status === 'drafting' || s.status === 'paused'" class="grid gap-4 lg:grid-cols-[minmax(220px,280px)_1fr_minmax(220px,280px)]">
          <aside v-for="team in SIDES" :key="team" :class="['card p-3 space-y-3 border-t-2', teamBorder(team), team === 'amber' ? 'lg:order-1' : 'lg:order-3', step?.team === team && s.status === 'drafting' && 'ring-1 ring-draft/50']">
            <div class="flex items-center justify-between gap-2">
              <h2 :class="['font-semibold truncate', teamText(team)]">{{ rec.teamNames[team] }}</h2>
              <span class="text-xs text-muted tabular-nums">{{ s.picks[team].length }}/{{ teamSize }}</span>
            </div>
            <p class="text-xs text-muted flex items-center gap-1.5"><span :class="['w-2 h-2 rounded-full', online(s.captains[team]) ? 'bg-accent' : 'bg-line']" :title="online(s.captains[team]) ? 'Captain online' : 'Captain offline'" />Captain: <span class="text-text truncate">{{ nameOf(s.captains[team]) ?? 'Unassigned' }}</span></p>
            <div>
              <div class="text-[11px] uppercase tracking-wide text-muted mb-1.5 flex items-center gap-1"><Ban class="w-3 h-3" />Bans</div>
              <div class="flex flex-wrap gap-1.5">
                <div v-for="(b, i) in slots(team, 'ban')" :key="i" :class="['rounded-lg', b.active && 'ring-2 ring-danger/70']">
                  <HeroPortrait v-if="b.heroId !== null" :name="heroName(b.heroId)" :src="heroes.byId(b.heroId)?.imageUrl" size="sm" state="banned" :title="heroName(b.heroId)" />
                  <div v-else class="w-8 h-8 rounded-lg border border-dashed border-line grid place-items-center text-[9px] uppercase text-muted" :title="b.skipped ? 'No ban' : 'Empty'">{{ b.skipped ? 'None' : '' }}</div>
                </div>
                <span v-if="!slots(team, 'ban').length" class="text-xs text-muted">No bans</span>
              </div>
            </div>
            <div>
              <div class="text-[11px] uppercase tracking-wide text-muted mb-1.5">Picks</div>
              <ul class="grid grid-cols-2 lg:grid-cols-1 gap-1.5">
                <li v-for="(p, i) in slots(team, 'pick')" :key="i" :class="['flex items-center gap-2 rounded-lg border p-1.5', p.active ? 'border-draft/70 bg-draft/10' : 'border-line bg-bg/40']">
                  <HeroPortrait v-if="p.heroId !== null" :name="heroName(p.heroId)" :src="heroes.byId(p.heroId)?.imageUrl" size="sm" />
                  <div v-else class="w-8 h-8 rounded-lg border border-dashed border-line" />
                  <div class="min-w-0 text-sm font-medium truncate">{{ p.heroId !== null ? heroName(p.heroId) : p.active ? 'Selecting…' : `Pick ${i + 1}` }}</div>
                </li>
              </ul>
            </div>
          </aside>

          <section class="order-first lg:order-2 card p-3 sm:p-4 space-y-4 min-w-0">
            <div class="flex flex-wrap items-center gap-4">
              <div class="min-w-0">
                <div class="text-xs text-muted">{{ phaseLabel }}</div>
                <div v-if="step" class="text-lg font-semibold mt-0.5">
                  <template v-if="myTurn">Your turn to <span :class="step.type === 'ban' ? 'text-danger' : 'text-draft'">{{ step.type }}</span></template>
                  <template v-else><span :class="teamText(step.team)">{{ rec.teamNames[step.team] }}</span>{{ ' ' }}<span :class="step.type === 'ban' ? 'text-danger' : 'text-draft'">{{ step.type === 'ban' ? 'bans' : 'picks' }}</span></template>
                </div>
                <div v-if="run && run.length > 1" class="text-xs text-draft mt-0.5">Turn {{ run.index }} of {{ run.length }} in a row</div>
              </div>
              <div class="ml-auto flex items-center gap-3" aria-live="polite">
                <Timer class="w-5 h-5 text-muted" />
                <div v-if="s.status === 'paused'" class="text-2xl font-semibold text-warn">Paused</div>
                <div v-else-if="remaining !== null" :class="['text-3xl font-semibold tabular-nums w-16 text-right', remaining <= 5 ? 'text-danger' : 'text-text']">{{ remaining }}s</div>
                <div v-else class="text-sm text-muted">No timer</div>
              </div>
            </div>
            <div v-if="remaining !== null && s.status === 'drafting'" class="h-1 rounded bg-line overflow-hidden"><div class="h-full bg-draft transition-[width] duration-200 ease-linear" :style="{ width: `${timerPct}%` }" /></div>
            <OrderTimeline :sequence="s.config.sequence" :step="s.step" :team-names="rec.teamNames" />
            <div v-if="!spectate && !myTurn && s.status === 'drafting'" class="rounded-lg px-3 py-2 text-sm border border-line text-muted">
              {{ mySeat ? "Other team's turn…" : 'You are watching. Only captains can ban and pick.' }}
            </div>

            <div class="flex flex-wrap gap-2">
              <label class="relative flex-1 min-w-[160px]"><span class="sr-only">Search hero</span>
                <Search class="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input ref="searchEl" v-model="query" class="input !pl-9 !pr-8" placeholder="Search hero" />
                <kbd class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted border border-line rounded px-1">/</kbd>
              </label>
              <div v-if="heroTypes.length" class="flex rounded-lg border border-line overflow-hidden text-sm">
                <button v-for="f in ['all', ...heroTypes]" :key="f" :class="['px-3 h-9 capitalize', heroType === f ? 'bg-raised text-text' : 'text-muted hover:text-text']" @click="heroType = f">{{ f }}</button>
              </div>
              <span class="self-center text-xs text-muted tabular-nums">{{ freeCount }} free</span>
            </div>
            <p v-if="heroes.source === 'simulated'" class="text-xs text-warn">Simulated hero roster: hero IDs are placeholders, not Deadlock IDs.</p>

            <PageState :empty="!roster.length" empty-text="No heroes match your search.">
              <div class="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2 max-h-[52vh] lg:max-h-none overflow-y-auto pr-1">
                <button v-for="h in roster" :key="h.id" type="button"
                  :disabled="!myTurn || !!unavailableReason(h.id) || pending"
                  :title="unavailableReason(h.id) ? `${h.name} (${unavailableReason(h.id)})` : h.name"
                  :class="['flex flex-col items-center gap-1 p-1.5 rounded-lg border text-center transition-colors',
                    selected === h.id ? (step?.type === 'ban' ? 'border-danger bg-danger/10' : 'border-draft bg-draft/15') : 'border-transparent',
                    myTurn && !unavailableReason(h.id) ? 'hover:border-line hover:bg-raised cursor-pointer' : 'cursor-default']"
                  @click="choose(h.id)">
                  <HeroPortrait :name="h.name" :src="h.imageUrl" :state="unavailableReason(h.id) === 'banned' ? 'banned' : 'normal'" :class="unavailableReason(h.id) && unavailableReason(h.id) !== 'banned' && 'opacity-30'" />
                  <span class="text-[11px] leading-tight truncate w-full" :class="unavailableReason(h.id) ? 'text-muted line-through' : ''">{{ h.name }}</span>
                </button>
              </div>
            </PageState>

            <div v-if="myTurn" class="sticky bottom-0 -mx-3 sm:-mx-4 -mb-3 sm:-mb-4 p-3 border-t border-line bg-surface rounded-b-xl flex flex-wrap items-center gap-3">
              <HeroPortrait v-if="selected !== null" :name="heroName(selected)" :src="heroes.byId(selected)?.imageUrl" size="sm" />
              <span class="text-sm truncate">{{ selected !== null ? heroName(selected) : 'Select a hero' }}</span>
              <div class="ml-auto flex gap-2">
                <button v-if="step?.type === 'ban'" class="btn-ghost" :disabled="pending" @click="command({ kind: 'skip', expectedSeq: s.seq })"><SkipForward class="w-4 h-4" />Skip this ban</button>
                <button :class="step?.type === 'ban' ? 'btn-danger' : 'btn-draft'" :disabled="selected === null || pending" @click="lockIn">
                  <component :is="step?.type === 'ban' ? Ban : Lock" class="w-4 h-4" />{{ step?.type === 'ban' ? 'Ban' : 'Lock in' }} {{ selected !== null ? heroName(selected) : '' }}
                  <kbd class="text-[10px] opacity-70 border border-current rounded px-1">Enter</kbd>
                </button>
              </div>
            </div>
          </section>
        </div>

        <!-- ================= RESULT ================= -->
        <template v-else-if="s.status === 'completed'">
          <div class="text-center"><span class="inline-flex items-center gap-1.5 h-7 px-3 rounded-md border border-accent/50 text-accent text-xs font-semibold uppercase tracking-wide"><Check class="w-3.5 h-3.5" />Draft complete</span></div>
          <div class="grid md:grid-cols-2 gap-4">
            <section v-for="t in SIDES" :key="t" :class="['card p-4 space-y-3 border-t-2', teamBorder(t)]">
              <div class="flex items-center justify-between gap-2">
                <h2 :class="['text-lg font-semibold', teamText(t)]">{{ rec.teamNames[t] }}</h2>
                <div class="flex items-center gap-1.5 text-xs text-muted">Bans
                  <template v-for="(b, i) in slots(t, 'ban')" :key="i">
                    <HeroPortrait v-if="b.heroId !== null" :name="heroName(b.heroId)" :src="heroes.byId(b.heroId)?.imageUrl" size="sm" state="banned" :title="heroName(b.heroId)" />
                    <span v-else class="h-8 px-1.5 grid place-items-center rounded-lg border border-dashed border-line text-[10px] uppercase">None</span>
                  </template>
                  <span v-if="!slots(t, 'ban').length">None</span>
                </div>
              </div>
              <ul class="space-y-1.5">
                <li v-for="(h, i) in s.picks[t]" :key="h" class="flex items-center gap-3 rounded-lg border border-line bg-bg/40 p-2">
                  <span class="text-xs text-muted tabular-nums w-4">{{ i + 1 }}</span>
                  <HeroPortrait :name="heroName(h)" :src="heroes.byId(h)?.imageUrl" />
                  <span class="font-medium flex-1 truncate">{{ heroName(h) }}</span>
                  <select v-if="(mySeat === t || isMod) && !spectate" class="input !h-8 !w-auto max-w-[160px]" :aria-label="`Player for ${heroName(h)}`" :value="assignedTo(h) ?? ''"
                    :disabled="pending" @change="command({ kind: 'assign', heroId: h, userId: ($event.target as HTMLSelectElement).value || null })">
                    <option value="">Unassigned</option>
                    <option v-for="p in teamPeople(t)" :key="p" :value="p">{{ nameOf(p) }}</option>
                  </select>
                  <span v-else :class="['text-sm truncate max-w-[160px]', assignedTo(h) ? '' : 'text-muted']">{{ nameOf(assignedTo(h)) ?? 'Unassigned' }}</span>
                </li>
              </ul>
              <p v-if="mySeat === t && teamPeople(t).length < teamSize" class="text-xs text-muted">Only {{ teamPeople(t).length }} of {{ teamSize }} players joined this team. Others can still join from the lobby link before you assign.</p>
              <p v-if="myTeam === t && !mySeat && s.assignments.find((a: any) => a.userId === me)" class="text-sm text-draft">You're playing {{ heroName(s.assignments.find((a: any) => a.userId === me).heroId) }}.</p>
            </section>
          </div>
          <div class="flex flex-wrap justify-center gap-2">
            <button class="btn-ghost" @click="copy(resultText, 'Result')"><Copy class="w-4 h-4" />Copy result</button>
            <button class="btn-ghost" @click="copy(roomLink, 'Link')"><Link2 class="w-4 h-4" />Copy link</button>
            <template v-if="mySeat && !spectate">
              <button v-if="s.rematchVotes[mySeat]" class="btn-ghost" disabled><Check class="w-4 h-4" />Rematch voted</button>
              <button v-else class="btn-primary" :disabled="pending" @click="command({ kind: 'voteRematch' })"><RotateCcw class="w-4 h-4" />{{ s.rematchVotes[mySeat === 'amber' ? 'sapphire' : 'amber'] ? 'Accept rematch' : 'Rematch' }}</button>
            </template>
            <RouterLink to="/drafts/new" class="btn-ghost"><Plus class="w-4 h-4" />New draft</RouterLink>
          </div>
          <p v-for="t in SIDES.filter((x) => s.rematchVotes[x])" :key="t" class="text-center text-sm text-muted"><span :class="teamText(t)">{{ rec.teamNames[t] }}</span> wants a rematch.</p>
        </template>

        <div v-else class="card p-6 text-center text-muted">This draft was cancelled.</div>

        <!-- History -->
        <section v-if="!broadcast && s.history.length" class="card p-4">
          <h2 class="h-section flex items-center gap-2 mb-3"><History class="w-4 h-4" />Timeline</h2>
          <ol class="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
            <li v-for="h in s.history" :key="h.seq" class="flex items-center gap-2 text-sm rounded-lg border border-line px-2 py-1.5">
              <span class="text-xs text-muted tabular-nums w-5">{{ h.step + 1 }}</span>
              <span :class="teamText(h.team)" class="text-xs font-medium w-14 shrink-0 truncate">{{ h.team === 'amber' ? 'Amber' : 'Sapphire' }}</span>
              <span :class="h.type === 'ban' ? 'text-danger' : 'text-draft'" class="text-xs uppercase w-8">{{ h.type }}</span>
              <span class="truncate">{{ h.heroId === null ? 'No ban' : heroName(h.heroId) }}</span>
              <span v-if="h.reason !== 'manual'" class="ml-auto text-[10px] uppercase text-warn">{{ h.reason }}</span>
            </li>
          </ol>
        </section>
      </div>
    </PageState>
  </div>
</template>
