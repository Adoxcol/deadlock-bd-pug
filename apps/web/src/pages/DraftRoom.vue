<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  Search, Play, Pause, Square, Lock, Ban, Timer, Eye, Link2, Tv, History, AlertTriangle, ExternalLink, Copy,
  Users, Check, LogOut, ArrowLeftRight, Crown, UserPlus, UserMinus, RotateCcw, Plus, SkipForward, Settings2, Circle,
  Volume2, VolumeX,
} from 'lucide-vue-next';
import { sfx, volume } from '../lib/sfx';
import RevealSplash from '../components/draft/RevealSplash.vue';
import { api, ApiError } from '../lib/api';
import { realtime } from '../lib/ws';
import { useHeroes } from '../stores/heroes';
import { useSession } from '../stores/session';
import HeroCard from '../components/HeroCard.vue';
import StatusBadge from '../components/StatusBadge.vue';
import PageState from '../components/PageState.vue';
import SimBadge from '../components/SimBadge.vue';
import OrderTimeline from '../components/draft/OrderTimeline.vue';
import LobbyPanel from '../components/draft/LobbyPanel.vue';

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
/** Hero for sequence step i (latest entry wins, so moderator corrections show), null if empty or skipped. */
const stepEntry = (i: number) => { const h = s.value?.history as Array<{ step: number; heroId: number | null }> | undefined; return h ? [...h].reverse().find((x) => x.step === i) ?? null : null; };
const stepHero = (i: number) => stepEntry(i)?.heroId ?? null;
const stepSkipped = (i: number) => !!stepEntry(i) && stepEntry(i)!.heroId === null;
/** 1-based number of step i among the same team's bans or picks (B1, P3, ...). */
const stepOrdinal = (i: number) => { const seq = s.value.config.sequence; const st = seq[i]; return seq.slice(0, i + 1).filter((x: any) => x.team === st.team && x.type === st.type).length; };
/** Identifies the slot filled by the latest action, so only that card animates. */
const lastStepKey = computed(() => {
  const last = s.value?.history?.filter((h: any) => h.reason !== 'correction').at(-1);
  return last ? `${last.team}-${last.type}-${stepOrdinal(last.step) - 1}` : null;
});
const clock = (sec: number) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`;
const logTime = (at: number) => { const t = s.value?.startedAt; if (!t) return ''; const sec = Math.max(0, Math.round((at - t) / 1000)); return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, '0')}`; };
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
function flash(label: string) { notice.value = `${label} copied`; setTimeout(() => (notice.value = null), 2000); }
async function copy(text: string, label: string) {
  try { await navigator.clipboard.writeText(text); flash(label); } catch { notice.value = 'Copy failed — select and copy manually'; setTimeout(() => (notice.value = null), 2000); }
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

// ---------- Effects: reveal splash, sounds, confetti ----------
const reducedMotion = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const splash = ref<{ key: number; heroId: number; type: 'pick' | 'ban'; team: Side } | null>(null);
let splashTimer: number | undefined;
const confetti = ref(0);
const confettiBits = Array.from({ length: 70 }, (_, i) => ({
  left: `${(i * 37) % 100}%`, delay: `${(i % 14) * 0.08}s`, size: 6 + (i % 4) * 2,
  color: ['#e8a33a', '#5a8fe0', '#d4a24c', '#ece2cc', '#cf4a3c'][i % 5], round: i % 3 === 0,
}));
// Only react to new actions after the initial load, so reopening a finished draft stays quiet.
watch(() => s.value?.history?.length ?? 0, (len, prev) => {
  if (!prev || len <= prev) return;
  const last = s.value.history.at(-1);
  if (!last || last.reason === 'correction') return;
  if (last.heroId === null) { sfx.tick(); return; }
  last.type === 'ban' ? sfx.ban() : sfx.pick();
  if (reducedMotion) return;
  clearTimeout(splashTimer);
  splash.value = { key: last.seq, heroId: last.heroId, type: last.type, team: last.team };
  splashTimer = window.setTimeout(() => (splash.value = null), 1650);
});
watch(myTurn, (v) => { if (v) sfx.turn(); });
watch(remaining, (r, prev) => { if (r !== null && prev !== null && r < prev && r <= 5 && r > 0 && s.value?.status === 'drafting') sfx.tick(r <= 3); });
watch(() => s.value?.status, (st, prev) => {
  if (st !== 'completed' || !prev || prev === 'completed') return;
  setTimeout(() => sfx.complete(), 700);
  if (!reducedMotion) { confetti.value++; setTimeout(() => (confetti.value = 0), 3800); }
});
const muted = computed(() => volume.value === 0);
let lastVolume = volume.value || 0.6;
function toggleSound() { if (muted.value) volume.value = lastVolume; else { lastVolume = volume.value; volume.value = 0; } }

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
onUnmounted(() => { unsub(); clearInterval(tick); clearTimeout(hoverTimer); clearTimeout(splashTimer); window.removeEventListener('keydown', onKey); });
const teamText = (t: Side) => (t === 'amber' ? 'text-amber-team' : 'text-sapphire-team');
const teamBorder = (t: Side) => (t === 'amber' ? '!border-t-amber-team' : '!border-t-sapphire-team');
</script>

<template>
  <div :class="broadcast ? 'min-h-screen bg-bg p-6' : ''">
    <RevealSplash v-if="splash" :key="splash.key" :type="splash.type" :team="splash.team" :team-name="rec.teamNames[splash.team]"
      :name="heroName(splash.heroId)" :src="heroes.byId(splash.heroId)?.imageUrl" />
    <div v-if="confetti" :key="confetti" class="fixed inset-0 z-50 pointer-events-none overflow-hidden" aria-hidden="true">
      <span v-for="(c, i) in confettiBits" :key="i" class="absolute -top-4 animate-confetti"
        :style="{ left: c.left, animationDelay: c.delay, width: `${c.size}px`, height: `${c.round ? c.size : c.size * 1.8}px`, background: c.color, borderRadius: c.round ? '9999px' : '2px' }" />
    </div>
    <PageState :loading="!rec && !error" :error="!rec ? error : null">
      <div v-if="s" class="space-y-4">
        <!-- Header -->
        <div class="flex flex-wrap items-center gap-3">
          <div class="min-w-0">
            <div class="flex items-center gap-2 flex-wrap">
              <h1 class="text-2xl sm:text-3xl font-extrabold tracking-wider truncate">{{ rec.name }}</h1>
              <StatusBadge :status="s.status" />
              <SimBadge v-if="rec.simulated" />
            </div>
            <p class="text-xs text-muted mt-1 flex flex-wrap items-center gap-x-2">
              <span>{{ s.config.format }} · {{ s.config.bansPerTeam ? `${s.config.bansPerTeam} ban${s.config.bansPerTeam > 1 ? 's' : ''} per team` : 'no bans' }} · {{ s.config.timerSeconds ? `${s.config.timerSeconds}s timer` : 'No timer' }}</span>
              <span class="inline-flex items-center gap-1"><Eye class="w-3.5 h-3.5" />{{ presence.watchers }} watching</span>
            </p>
          </div>
          <div v-if="!broadcast" class="ml-auto flex flex-wrap items-center gap-2">
            <button v-if="rec.code" class="h-8 px-2.5 rounded-lg border border-line font-mono text-sm tracking-[0.2em] hover:bg-raised flex items-center gap-2" title="Copy room code" @click="copy(rec.code, 'Code')">{{ rec.code }}<Copy class="w-3.5 h-3.5 text-muted" /></button>
            <button class="btn-ghost !h-8" @click="copy(roomLink, 'Link')"><Link2 class="w-4 h-4" />Copy link</button>
            <div class="flex items-center gap-1.5 h-8 px-2 rounded-lg border border-line">
              <button class="text-muted hover:text-text" :title="muted ? 'Unmute draft sounds' : 'Mute draft sounds'" :aria-label="muted ? 'Unmute draft sounds' : 'Mute draft sounds'" @click="toggleSound"><component :is="muted ? VolumeX : Volume2" class="w-4 h-4" /></button>
              <input v-model.number="volume" type="range" min="0" max="1" step="0.05" class="w-16 sm:w-20 accent-primary" aria-label="Draft sound volume" />
            </div>
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
              <h2 :class="['font-display text-2xl', teamText(t)]">{{ rec.teamNames[t] }}</h2>
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
        <template v-else-if="s.status === 'drafting' || s.status === 'paused'">
          <div class="grid gap-4 lg:grid-cols-[minmax(240px,300px)_1fr_minmax(240px,300px)] 2xl:grid-cols-[360px_1fr_360px]">
            <!-- Team panels -->
            <aside v-for="team in SIDES" :key="team"
              :class="['card p-3 space-y-3 transition-shadow', team === 'amber' ? 'lg:order-1 border-amber-team/50 bg-gradient-to-b from-amber-team/[0.12] via-surface/90 to-surface/90' : 'lg:order-3 border-sapphire-team/50 bg-gradient-to-b from-sapphire-team/[0.12] via-surface/90 to-surface/90',
                step?.team === team && s.status === 'drafting' ? (team === 'amber' ? 'shadow-[0_0_0_1px_#e8a33a,0_0_28px_-6px_#e8a33a]' : 'shadow-[0_0_0_1px_#5a8fe0,0_0_28px_-6px_#5a8fe0]') : '']">
              <div class="flex items-center gap-2.5">
                <div :class="['w-9 h-9 rounded-lg grid place-items-center border', team === 'amber' ? 'border-amber-team/50 bg-amber-team/10 text-amber-team' : 'border-sapphire-team/50 bg-sapphire-team/10 text-sapphire-team']"><Crown class="w-4 h-4" /></div>
                <div class="min-w-0">
                  <h2 :class="['font-display text-xl leading-tight truncate', teamText(team)]">{{ rec.teamNames[team] }}</h2>
                  <p class="text-[11px] text-muted truncate">Captain: {{ nameOf(s.captains[team]) ?? 'Unassigned' }}</p>
                </div>
                <span class="ml-auto text-xs text-muted tabular-nums">{{ s.picks[team].length }}/{{ teamSize }}</span>
              </div>
              <ul class="space-y-1">
                <li v-for="pid in teamPeople(team)" :key="pid" class="flex items-center gap-2 h-8 px-2 rounded-md bg-bg/50 border border-line/60 text-sm">
                  <span :class="['w-1.5 h-1.5 rounded-full shrink-0', online(pid) ? 'bg-accent' : 'bg-line']" :title="online(pid) ? 'Online' : 'Offline'" />
                  <span class="truncate">{{ nameOf(pid) }}</span>
                  <span v-if="s.captains[team] === pid" class="ml-auto text-[10px] text-muted">(Captain)</span>
                </li>
              </ul>
              <div>
                <div class="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1.5 flex items-center gap-1"><Ban class="w-3 h-3" />Bans</div>
                <div class="grid grid-cols-6 lg:grid-cols-4 gap-1.5">
                  <HeroCard v-for="(b, i) in slots(team, 'ban')" :key="`b${i}-${b.heroId}`" size="sm" class="!w-full"
                    :name="b.heroId !== null ? heroName(b.heroId) : null" :src="b.heroId !== null ? heroes.byId(b.heroId)?.imageUrl : null"
                    :state="b.active ? 'active-ban' : b.heroId !== null ? 'banned' : 'empty'" :label="b.skipped ? 'None' : b.heroId === null ? `B${i + 1}` : null"
                    :animate="b.heroId !== null && lastStepKey === `${team}-ban-${i}`" :title="b.heroId !== null ? heroName(b.heroId) : undefined" />
                  <span v-if="!slots(team, 'ban').length" class="col-span-full text-xs text-muted">No bans</span>
                </div>
              </div>
              <div>
                <div class="text-[10px] font-semibold uppercase tracking-wider text-muted mb-1.5">Picks</div>
                <div class="grid grid-cols-6 lg:grid-cols-3 gap-1.5">
                  <HeroCard v-for="(p, i) in slots(team, 'pick')" :key="`p${i}-${p.heroId}`" size="md"
                    :name="p.heroId !== null ? heroName(p.heroId) : null" :src="p.heroId !== null ? heroes.byId(p.heroId)?.imageUrl : null"
                    :state="p.active ? 'active-pick' : p.heroId !== null ? 'normal' : 'empty'" :label="p.heroId === null ? `P${i + 1}` : null"
                    :animate="p.heroId !== null && lastStepKey === `${team}-pick-${i}`" />
                </div>
              </div>
            </aside>

            <!-- Center -->
            <section class="order-first lg:order-2 card-ornate p-3 sm:p-4 space-y-4 min-w-0">
              <div class="flex flex-wrap items-stretch gap-3">
                <div :key="s.step" :class="['flex-1 min-w-[200px] flex items-center gap-3 rounded-xl border px-4 py-3 animate-fade-up',
                  step?.type === 'ban' ? 'border-danger/40 bg-danger/[0.07]' : 'border-primary/40 bg-primary/[0.08]']">
                  <component :is="step?.type === 'ban' ? Ban : Lock" :class="['w-6 h-6 shrink-0', step?.type === 'ban' ? 'text-danger' : 'text-primary']" />
                  <div class="min-w-0">
                    <div :class="['font-display text-2xl font-extrabold uppercase tracking-wider leading-none mb-1', step?.type === 'ban' ? 'text-danger' : 'text-primary']">{{ step?.type === 'ban' ? 'Ban Phase' : 'Pick Phase' }}</div>
                    <div class="text-sm">
                      <template v-if="s.status === 'paused'"><span class="text-warn">Paused by a moderator</span></template>
                      <template v-else-if="myTurn">Your turn to {{ step!.type }}</template>
                      <template v-else-if="step"><span :class="teamText(step.team)">{{ rec.teamNames[step.team] }}</span> is {{ step.type === 'ban' ? 'banning' : 'picking' }}</template>
                    </div>
                    <div class="text-[11px] text-muted">{{ phaseLabel }}<template v-if="run && run.length > 1"> · <span class="text-primary">Turn {{ run.index }} of {{ run.length }} in a row</span></template></div>
                  </div>
                </div>
                <div class="relative w-[112px] rounded-xl border border-line bg-bg/60 grid place-items-center py-2" aria-live="polite">
                  <svg v-if="remaining !== null && s.status === 'drafting'" viewBox="0 0 100 100" class="absolute inset-1.5 w-[calc(100%-12px)] h-[calc(100%-12px)] -rotate-90" aria-hidden="true">
                    <rect x="3" y="3" width="94" height="94" rx="12" fill="none" stroke="currentColor" stroke-width="3" class="text-line" />
                    <rect x="3" y="3" width="94" height="94" rx="12" fill="none" stroke="currentColor" stroke-width="3" pathLength="100" :stroke-dasharray="`${timerPct} 100`" :class="['transition-[stroke-dasharray] duration-300 ease-linear', remaining <= 10 ? 'text-danger' : 'text-primary']" />
                  </svg>
                  <div v-if="s.status === 'paused'" class="text-lg font-bold text-warn flex items-center gap-1"><Pause class="w-4 h-4" />Paused</div>
                  <div v-else-if="remaining !== null" :key="remaining <= 10 ? remaining : 'x'" :class="['font-display text-5xl font-extrabold tabular-nums', remaining <= 10 ? 'text-danger animate-tick' : '']">{{ clock(remaining) }}</div>
                  <div v-else class="text-xs text-muted flex flex-col items-center gap-1"><Timer class="w-5 h-5" />No timer</div>
                </div>
              </div>

              <!-- Sequence strip: every ban/pick in order -->
              <ol class="flex gap-1.5 overflow-x-auto pb-1" aria-label="Draft sequence">
                <li v-for="(st, i) in s.config.sequence" :key="i" class="shrink-0 w-11 text-center">
                  <HeroCard size="xs" class="!w-11 !h-14"
                    :name="stepHero(i) !== null ? heroName(stepHero(i)) : null" :src="stepHero(i) !== null ? heroes.byId(stepHero(i)!)?.imageUrl : null"
                    :state="i === s.step && s.status === 'drafting' ? (st.type === 'ban' ? 'active-ban' : 'active-pick') : stepHero(i) !== null ? (st.type === 'ban' ? 'banned' : 'normal') : 'empty'"
                    :label="stepHero(i) === null ? (stepSkipped(i) ? '—' : '') : null" :title="stepHero(i) !== null ? heroName(stepHero(i)) : undefined" />
                  <span :class="['block text-[10px] font-semibold mt-1', st.team === 'amber' ? 'text-amber-team' : 'text-sapphire-team', i < s.step && 'opacity-50']">{{ st.type === 'ban' ? 'B' : 'P' }}{{ stepOrdinal(i) }}</span>
                </li>
              </ol>

              <div v-if="!spectate && !myTurn && s.status === 'drafting'" class="rounded-lg px-3 py-2 text-sm border border-line text-muted">
                {{ mySeat ? "Other team's turn…" : 'You are watching. Only captains can ban and pick.' }}
              </div>

              <div class="flex flex-wrap gap-2">
                <label class="relative flex-1 min-w-[160px]"><span class="sr-only">Search hero</span>
                  <Search class="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                  <input ref="searchEl" v-model="query" class="input !pl-9 !pr-8" placeholder="Search heroes…" />
                  <kbd class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted border border-line rounded px-1">/</kbd>
                </label>
                <div v-if="heroTypes.length" class="flex rounded-lg border border-line overflow-hidden text-sm">
                  <button v-for="f in ['all', ...heroTypes]" :key="f" :class="['px-3 h-9 capitalize', heroType === f ? 'bg-primary text-bg' : 'text-muted hover:text-text']" @click="heroType = f">{{ f }}</button>
                </div>
                <span class="self-center text-xs text-muted tabular-nums">{{ freeCount }} free</span>
              </div>
              <p v-if="heroes.source === 'builtin'" class="text-xs text-muted">Hero portraits load once the server can reach the Deadlock assets API.</p>

              <PageState :empty="!roster.length" empty-text="No heroes match your search.">
                <div class="grid grid-cols-[repeat(auto-fill,minmax(84px,1fr))] sm:grid-cols-[repeat(auto-fill,minmax(96px,1fr))] 2xl:grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-2 max-h-[56vh] lg:max-h-[calc(100vh-22rem)] lg:min-h-[320px] overflow-y-auto pr-1">
                  <button v-for="h in roster" :key="h.id" type="button" data-hero
                    :disabled="!myTurn || !!unavailableReason(h.id) || pending"
                    :title="unavailableReason(h.id) ? `${h.name} (${unavailableReason(h.id)})` : h.name"
                    :class="['rounded-lg text-left transition-transform duration-150', myTurn && !unavailableReason(h.id) ? 'hover:-translate-y-0.5 hover:brightness-110 cursor-pointer' : 'cursor-default', selected === h.id && 'scale-[1.03]']"
                    @click="choose(h.id)">
                    <HeroCard :name="h.name" :src="h.imageUrl"
                      :state="selected === h.id ? (step?.type === 'ban' ? 'selected-ban' : 'selected-pick') : unavailableReason(h.id) === 'banned' ? 'banned' : unavailableReason(h.id) ? 'taken' : 'normal'"
                      :label="unavailableReason(h.id) && unavailableReason(h.id) !== 'banned' ? unavailableReason(h.id) : null" />
                  </button>
                </div>
              </PageState>

              <div v-if="myTurn" class="sticky bottom-0 -mx-3 sm:-mx-4 -mb-3 sm:-mb-4 p-3 border-t border-line bg-surface/95 backdrop-blur rounded-b-xl flex flex-wrap items-center gap-3">
                <HeroCard v-if="selected !== null" :key="selected" size="sm" class="animate-fade-up" :name="heroName(selected)" :src="heroes.byId(selected)?.imageUrl" :state="step?.type === 'ban' ? 'selected-ban' : 'selected-pick'" />
                <span class="text-sm font-semibold truncate">{{ selected !== null ? heroName(selected) : 'Select a hero' }}</span>
                <div class="ml-auto flex gap-2">
                  <button v-if="step?.type === 'ban'" class="btn-ghost" :disabled="pending" @click="command({ kind: 'skip', expectedSeq: s.seq })"><SkipForward class="w-4 h-4" />Skip this ban</button>
                  <button :class="step?.type === 'ban' ? 'btn-danger-solid' : 'btn-primary'" :disabled="selected === null || pending" @click="lockIn">
                    <component :is="step?.type === 'ban' ? Ban : Lock" class="w-4 h-4" />{{ step?.type === 'ban' ? 'Ban' : 'Lock in' }} {{ selected !== null ? heroName(selected) : '' }}
                    <kbd class="text-[10px] opacity-70 border border-current rounded px-1">Enter</kbd>
                  </button>
                </div>
              </div>
            </section>
          </div>

          <!-- Progress / current turn / log -->
          <div v-if="!broadcast" class="grid gap-4 lg:grid-cols-[1.4fr_260px_1fr]">
            <section class="card p-4 min-w-0">
              <h2 class="h-section mb-3">Draft Progress</h2>
              <ol class="flex items-start overflow-x-auto pb-1">
                <li v-for="(st, i) in s.config.sequence" :key="i" class="flex-1 min-w-[34px] flex flex-col items-center relative">
                  <div v-if="i > 0" :class="['absolute top-[7px] right-1/2 w-full h-0.5', i <= s.step ? (st.team === 'amber' ? 'bg-amber-team/70' : 'bg-sapphire-team/70') : 'bg-line']" />
                  <span :class="['relative z-[1] w-4 h-4 rounded-full border-2 transition-colors',
                    i < s.step ? (st.team === 'amber' ? 'bg-amber-team border-amber-team' : 'bg-sapphire-team border-sapphire-team') : i === s.step ? 'bg-bg border-primary animate-glow' : 'bg-bg border-line']" />
                  <span :class="['text-[10px] font-semibold mt-1.5', st.team === 'amber' ? 'text-amber-team' : 'text-sapphire-team', i > s.step && 'opacity-40']">{{ st.type === 'ban' ? 'B' : 'P' }}{{ stepOrdinal(i) }}</span>
                </li>
              </ol>
            </section>
            <section class="card p-4">
              <h2 class="font-display text-xs font-semibold uppercase tracking-widest text-muted mb-2">Current Turn</h2>
              <div v-if="step" :key="s.step" class="flex items-center gap-3 animate-fade-up">
                <div :class="['w-10 h-10 rounded-full grid place-items-center border-2', step.team === 'amber' ? 'border-amber-team text-amber-team' : 'border-sapphire-team text-sapphire-team']"><component :is="step.type === 'ban' ? Ban : Lock" class="w-4 h-4" /></div>
                <div class="min-w-0"><div :class="['font-bold truncate', teamText(step.team)]">{{ rec.teamNames[step.team] }}</div><div class="text-sm text-muted">{{ step.type === 'ban' ? 'Ban' : 'Pick' }} a hero</div></div>
              </div>
            </section>
            <section class="card p-4 min-w-0">
              <h2 class="h-section mb-2">Draft Log</h2>
              <ol class="space-y-1 max-h-40 overflow-y-auto text-sm">
                <li v-for="h in [...s.history].reverse()" :key="h.seq" class="flex items-center gap-2 animate-fade-up">
                  <span class="text-[11px] text-muted tabular-nums w-10 shrink-0">{{ logTime(h.at) }}</span>
                  <span :class="['font-medium shrink-0', teamText(h.team)]">{{ rec.teamNames[h.team] }}</span>
                  <span class="text-muted truncate">{{ h.heroId === null ? 'skipped a ban' : `${h.reason === 'correction' ? 'corrected to' : h.type === 'ban' ? 'banned' : 'picked'} ${heroName(h.heroId)}` }}</span>
                  <span v-if="h.reason === 'timeout'" class="ml-auto text-[10px] uppercase text-warn">timeout</span>
                </li>
                <li v-if="s.startedAt" class="flex items-center gap-2 text-muted"><span class="text-[11px] tabular-nums w-10">{{ logTime(s.startedAt) }}</span>Draft started</li>
              </ol>
            </section>
          </div>
        </template>

        <!-- ================= RESULT ================= -->
        <template v-else-if="s.status === 'completed'">
          <div class="text-center"><span class="inline-flex items-center gap-1.5 h-7 px-3 rounded-md border border-accent/50 text-accent text-xs font-semibold uppercase tracking-wide"><Check class="w-3.5 h-3.5" />Draft complete</span></div>
          <div class="grid md:grid-cols-2 gap-4">
            <section v-for="t in SIDES" :key="t" :class="['card p-4 space-y-3 border-t-2', teamBorder(t)]">
              <div class="flex items-center justify-between gap-2">
                <h2 :class="['font-display text-2xl', teamText(t)]">{{ rec.teamNames[t] }}</h2>
                <div class="flex items-center gap-1.5 text-xs text-muted">Bans
                  <template v-for="(b, i) in slots(t, 'ban')" :key="i">
                    <HeroCard v-if="b.heroId !== null" size="xs" :name="heroName(b.heroId)" :src="heroes.byId(b.heroId)?.imageUrl" state="banned" :title="heroName(b.heroId)" />
                    <span v-else class="h-11 w-9 grid place-items-center rounded-lg border border-dashed border-line text-[9px] uppercase">None</span>
                  </template>
                  <span v-if="!slots(t, 'ban').length">None</span>
                </div>
              </div>
              <ul class="space-y-1.5">
                <li v-for="(h, i) in s.picks[t]" :key="h" class="flex items-center gap-3 rounded-lg border border-line bg-bg/40 p-2">
                  <span class="text-xs text-muted tabular-nums w-4">{{ i + 1 }}</span>
                  <HeroCard size="sm" :name="heroName(h)" :src="heroes.byId(h)?.imageUrl" class="animate-slot-in" :style="{ animationDelay: `${i * 70}ms` }" />
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
          <LobbyPanel v-if="!broadcast" :draft-id="rec.id" :can-create="!spectate && (!!mySeat || isMod)" :simulated="rec.simulated" @copied="flash" />
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
        <section v-if="!broadcast && s.history.length && s.status === 'completed'" class="card p-4">
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
