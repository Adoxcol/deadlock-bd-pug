<script setup lang="ts">
import UiSelect from '../components/UiSelect.vue';
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import {
  Search, Play, Pause, Square, Lock, Ban, Timer, Eye, Link2, Tv, History, AlertTriangle, ExternalLink, Copy,
  Users, Check, LogOut, ArrowLeftRight, Crown, UserPlus, UserMinus, RotateCcw, Plus, SkipForward, Settings2, Circle,
  Volume2, VolumeX, X,
} from 'lucide-vue-next';
import { sfx, volume, playVoice } from '../lib/sfx';
import RevealSplash from '../components/draft/RevealSplash.vue';
import { preloadImages } from '../lib/preload';
import TeamCrest, { FACTION } from '../components/draft/TeamCrest.vue';
import DraftIntro from '../components/draft/DraftIntro.vue';
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
import ScoutPanel from '../components/draft/ScoutPanel.vue';

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
const hovered = ref<number | null>(null);
/** Hero shown in the big preview: your selection, else whatever you're hovering. */
const art = (id: number | null) => (id === null ? null : heroes.byId(id)?.verticalUrl ?? heroes.byId(id)?.imageUrl ?? null);
const preview = computed(() => selected.value ?? hovered.value);
// Heroes without a render fall back to the large backdrop, so fetch that only when a captain is about to lock it.
watch(preview, (id) => { if (id != null) preloadImages([heroes.byId(id)?.renderUrl ?? heroes.byId(id)?.backgroundUrl]); });
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
/** The other team that acts after the current run ("then Team Sapphire"). */
const nextTeam = computed<Side | null>(() => {
  const seq = s.value?.config.sequence; const cur = step.value;
  if (!seq || !cur) return null;
  for (let i = s.value.step + 1; i < seq.length; i++) if (seq[i].team !== cur.team) return seq[i].team;
  return null;
});
/** Sequence split into phases (Bans 1, Picks 1, Bans 2, ...) for the order strip. */
const phases = computed(() => {
  const seq = (s.value?.config.sequence ?? []) as Array<{ team: Side; type: 'pick' | 'ban' }>;
  const out: Array<{ type: 'pick' | 'ban'; label: string; steps: number[] }> = []; const n = { pick: 0, ban: 0 };
  seq.forEach((st, i) => {
    const last = out.at(-1);
    if (last && last.type === st.type) last.steps.push(i);
    else out.push({ type: st.type, label: `${st.type === 'ban' ? 'Bans' : 'Picks'} ${++n[st.type]}`, steps: [i] });
  });
  return out;
});
const phaseTitle = computed(() => phases.value.find((p) => p.steps.includes(s.value?.step))?.label ?? '');
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
  if (!myTurn.value || pending.value || unavailableReason(id)) return;
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
// Only react to single new actions, so the initial load of an in-progress or finished draft stays quiet.
watch(() => s.value?.history?.length ?? 0, (len, prev) => {
  if (len !== prev + 1) return;
  const last = s.value.history.at(-1);
  if (!last || last.reason === 'correction') return;
  if (last.heroId === null) { sfx.tick(); return; }
  last.type === 'ban' ? sfx.ban() : sfx.pick();
  const vo = heroes.byId(last.heroId)?.vo;
  playVoice(last.type === 'ban' ? vo?.ban : vo?.pick);
  if (reducedMotion) return;
  clearTimeout(splashTimer);
  splash.value = { key: last.seq, heroId: last.heroId, type: last.type, team: last.team };
  splashTimer = window.setTimeout(() => (splash.value = null), 2250);
});
watch(myTurn, (v) => { if (v) sfx.turn(); });
watch(remaining, (r, prev) => { if (r !== null && prev !== null && r < prev && r <= 5 && r > 0 && s.value?.status === 'drafting') sfx.tick(r <= 3); });
// Versus intro when the lobby turns into a live draft.
const intro = ref(0);
watch(() => s.value?.status, (st, prev) => {
  if (st !== 'drafting' || prev !== 'waiting' || reducedMotion) return;
  intro.value++; setTimeout(() => sfx.ban(), 400); setTimeout(() => (intro.value = 0), 2600);
});
// Keep the board on screen until the final pick's reveal has played, then show the results.
const holdBoard = ref(false);
const view = computed(() => (holdBoard.value ? 'drafting' : s.value?.status));
watch(() => s.value?.status, (st, prev) => {
  if (st !== 'completed' || !prev || prev === 'completed') return;
  const hold = reducedMotion ? 0 : 2300;
  holdBoard.value = hold > 0;
  setTimeout(() => {
    holdBoard.value = false;
    setTimeout(() => sfx.complete(), 300);
    if (!reducedMotion) { confetti.value++; setTimeout(() => (confetti.value = 0), 3800); }
  }, hold);
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
  const saveData = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection?.saveData;
  preloadImages(heroes.list.flatMap((h) => [h.imageUrl, h.nameUrl, saveData ? null : h.renderUrl]));
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
    <DraftIntro v-if="intro" :key="intro" :team-names="rec.teamNames"
      :subtitle="`${s.config.format} · ${s.config.bansPerTeam} bans per team · ${s.config.timerSeconds ? s.config.timerSeconds + 's per turn' : 'no timer'}`" />
    <RevealSplash v-if="splash" :key="splash.key" :type="splash.type" :team="splash.team" :team-name="rec.teamNames[splash.team]"
      :name="heroName(splash.heroId)" :src="heroes.byId(splash.heroId)?.imageUrl" :name-url="heroes.byId(splash.heroId)?.nameUrl" :bg-url="heroes.byId(splash.heroId)?.backgroundUrl" :render-url="heroes.byId(splash.heroId)?.renderUrl" />
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
        <template v-if="view === 'waiting'">
          <div class="text-center space-y-1">
            <div class="font-mono text-[11px] font-bold uppercase tracking-[0.25em] text-muted">Room code</div>
            <div class="font-display text-4xl tracking-[0.15em] text-primary">{{ rec.code }}</div>
            <p class="text-sm text-muted">
              <template v-if="!s.captains.amber || !s.captains.sapphire">Waiting for captains. Share the code or the link.</template>
              <template v-else>Both captains are in. Ready up and the draft starts.</template>
            </p>
          </div>
          <div class="relative grid md:grid-cols-2 gap-4 md:gap-10">
            <div class="hidden md:grid absolute left-1/2 top-16 -translate-x-1/2 z-10 w-14 h-14 rotate-45 place-items-center border-2 border-primary/70 bg-bg shadow-[0_0_24px_-4px_rgba(212,162,76,.6)]">
              <span class="-rotate-45 font-display text-xl text-primary">VS</span>
            </div>
            <section v-for="t in SIDES" :key="t" :class="['card overflow-hidden space-y-4 border-t-2 animate-fade-up', teamBorder(t),
              t === 'amber' ? 'bg-gradient-to-b from-amber-team/[0.14] via-surface/90 to-surface/90' : 'bg-gradient-to-b from-sapphire-team/[0.14] via-surface/90 to-surface/90']">
              <header :class="['relative flex items-center gap-4 px-4 pt-5', t === 'sapphire' && 'md:flex-row-reverse md:text-right']">
                <TeamCrest :team="t" :size="72" :class="['shrink-0 drop-shadow-[0_0_14px_currentColor]', s.ready[t] && 'animate-glow rounded-full']" />
                <div class="min-w-0">
                  <div :class="['font-mono text-[11px] font-bold uppercase tracking-[0.25em] opacity-80', teamText(t)]">{{ FACTION[t] }}</div>
                  <h2 :class="['font-display text-2xl xl:text-3xl leading-none truncate', teamText(t)]">{{ rec.teamNames[t] }}</h2>
                </div>
              </header>
              <div class="px-4 pb-4 space-y-4">
              <!-- Captain seat -->
              <div class="rounded-lg border border-line bg-bg/50 p-3 space-y-3">
                <div class="flex items-center gap-2">
                  <Crown class="w-4 h-4 text-warn" />
                  <span class="text-sm font-medium">Captain</span>
                  <span v-if="s.captains[t]" class="ml-auto inline-flex items-center gap-1.5 text-xs" :class="s.ready[t] ? 'text-accent' : 'text-muted'">
                    <component :is="s.ready[t] ? Check : Circle" class="w-3.5 h-3.5" />{{ s.ready[t] ? 'Ready' : 'Not ready' }}
                  </span>
                </div>
                <div v-if="!s.captains[t]" class="flex items-center gap-3">
                  <span class="text-sm text-muted">Seat's free</span>
                  <button v-if="!spectate && !s.rosterLocked" class="btn-primary !h-8 ml-auto" :disabled="pending" @click="command({ kind: 'claimSeat', team: t })"><Crown class="w-4 h-4" />{{ mySeat ? 'Switch here' : 'Take the seat' }}</button>
                </div>
                <div v-else class="flex flex-wrap items-center gap-2">
                  <span class="text-sm font-medium flex items-center gap-1.5"><span :class="['w-2 h-2 rounded-full', online(s.captains[t]) ? 'bg-accent' : 'bg-line']" :title="online(s.captains[t]) ? 'Online' : 'Offline'" />{{ nameOf(s.captains[t]) }}</span>
                  <span v-if="mySeat === t" class="text-xs text-draft">You're captain</span>
                  <template v-if="mySeat === t && !spectate">
                    <button :class="[s.ready[t] ? 'btn-ghost' : 'btn-primary', '!h-8 ml-auto']" :disabled="pending" @click="command({ kind: 'setReady', ready: !s.ready[t] })"><Check class="w-4 h-4" />{{ s.ready[t] ? 'Not ready' : "I'm ready" }}</button>
                    <button v-if="!s.rosterLocked" class="btn-ghost !h-8" :disabled="pending" @click="command({ kind: 'leaveSeat' })"><LogOut class="w-4 h-4" />Leave seat</button>
                  </template>
                </div>
              </div>
              <!-- Players -->
              <div class="space-y-2">
                <div class="flex items-center gap-2 text-sm"><Users class="w-4 h-4 text-muted" />Players <span class="text-muted text-xs">{{ s.members[t].length + (s.captains[t] ? 1 : 0) }}/{{ teamSize }}</span>
                  <template v-if="!spectate && !mySeat">
                    <button v-if="!s.rosterLocked && myTeam !== t" class="btn-ghost !h-7 !px-2 ml-auto text-xs" :disabled="pending || s.members[t].length >= teamSize - 1" @click="command({ kind: 'joinTeam', team: t })"><UserPlus class="w-3.5 h-3.5" />Join</button>
                    <button v-else-if="!s.rosterLocked" class="btn-ghost !h-7 !px-2 ml-auto text-xs" :disabled="pending" @click="command({ kind: 'joinTeam', team: null })"><UserMinus class="w-3.5 h-3.5" />Leave team</button>
                  </template>
                </div>
                <ul class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                  <li v-for="m in s.members[t]" :key="m" :class="['h-9 px-2.5 rounded border text-sm flex items-center gap-2 animate-fade-up bg-bg/40', m === me ? 'border-draft/70' : 'border-line']">
                    <span :class="['w-1.5 h-1.5 rounded-full shrink-0', online(m) ? 'bg-accent' : 'bg-line']" /><span class="truncate">{{ nameOf(m) }}</span>
                  </li>
                  <li v-for="i in Math.max(0, teamSize - 1 - s.members[t].length)" :key="'open' + i" class="h-9 px-2.5 rounded border border-dashed border-line/70 text-xs text-muted/70 flex items-center font-mono uppercase tracking-wider">Open slot</li>
                </ul>
              </div>
              </div>
            </section>
          </div>
          <section class="card p-4 space-y-3">
            <div class="flex flex-wrap items-center gap-3">
              <h2 class="h-section">Draft order</h2>
              <button v-if="(mySeat || isMod) && !spectate && !s.rosterLocked" class="btn-ghost !h-8 ml-auto" :disabled="pending" @click="command({ kind: 'swapSides' })"><ArrowLeftRight class="w-4 h-4" />Swap sides</button>
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
          <ScoutPanel v-if="!broadcast" :draft-id="rec.id" :teams="{ amber: teamPeople('amber'), sapphire: teamPeople('sapphire') }" :team-names="rec.teamNames" :name-of="nameOf" />
        </template>

        <!-- ================= DRAFTING ================= -->
        <template v-else-if="view === 'drafting' || view === 'paused'">
          <!-- Top bar: teams, bans, timer -->
          <div class="card overflow-hidden grid grid-cols-[1fr_auto_1fr] items-stretch">
            <div v-for="t in SIDES" :key="t" :class="['flex items-center gap-3 px-3 sm:px-4 py-2 min-w-0', t === 'amber' ? 'order-1 bg-gradient-to-r from-amber-team/20 to-transparent' : 'order-3 flex-row-reverse text-right bg-gradient-to-l from-sapphire-team/20 to-transparent',
              step?.team === t && 'shadow-[inset_0_-3px_0_currentColor]', teamText(t)]">
              <TeamCrest :team="t" :size="40" class="shrink-0 hidden sm:block" />
              <div class="min-w-0">
                <div class="font-display text-xl sm:text-2xl leading-none truncate">{{ rec.teamNames[t] }}</div>
                <div class="mt-1 flex items-center gap-1.5 font-mono text-[10px] font-bold uppercase tracking-wider" :class="t === 'sapphire' && 'justify-end'">
                  <span :class="['w-1.5 h-1.5 rounded-full', online(s.captains[t]) ? 'bg-accent' : 'bg-line']" />
                  <span :class="online(s.captains[t]) ? 'text-accent' : 'text-muted'">Captain {{ online(s.captains[t]) ? 'online' : 'offline' }}</span>
                </div>
              </div>
              <div :class="['flex gap-1.5 shrink-0', t === 'amber' ? 'ml-auto' : 'mr-auto']">
                <div v-for="(b, i) in slots(t, 'ban')" :key="`tb${i}-${b.heroId}`" :title="b.heroId !== null ? heroName(b.heroId) : undefined"
                  :class="['relative w-9 h-9 sm:w-11 sm:h-11 rounded-sm overflow-hidden border bg-bg/70', b.active ? 'border-danger animate-glow-danger' : 'border-danger/40']">
                  <img v-if="b.heroId !== null" :src="heroes.byId(b.heroId)?.imageUrl ?? undefined" alt="" :class="['absolute inset-0 w-full h-full object-cover object-top grayscale opacity-70', lastStepKey === `${t}-ban-${i}` && 'animate-slot-in']" />
                  <span v-if="b.heroId !== null" class="ban-slash" /><X v-else class="absolute inset-0 m-auto w-4 h-4 text-danger/50" />
                </div>
              </div>
            </div>
            <div class="order-2 w-28 sm:w-36 border-x border-line bg-bg/70 flex flex-col items-center justify-center py-1.5" aria-live="polite">
              <div :class="['font-mono text-[10px] font-bold uppercase tracking-[0.2em]', step?.type === 'ban' ? 'text-danger' : 'text-primary']">{{ phaseTitle }}</div>
              <div v-if="s.status === 'paused'" class="font-display text-xl text-warn flex items-center gap-1 py-1"><Pause class="w-4 h-4" />Paused</div>
              <div v-else-if="remaining !== null" :key="remaining <= 10 ? remaining : 'x'" :class="['font-display text-4xl leading-none tabular-nums', remaining <= 10 ? 'text-danger animate-tick' : 'text-text']">{{ remaining }}</div>
              <div v-else class="text-xs text-muted flex items-center gap-1 py-2"><Timer class="w-4 h-4" />No timer</div>
              <div class="text-[11px] text-muted">Turn {{ s.step + 1 }} of {{ s.config.sequence.length }}</div>
            </div>
            <div class="order-4 col-span-3 h-0.5 bg-line"><div :class="['h-full transition-[width] duration-300 ease-linear', (remaining ?? 99) <= 10 ? 'bg-danger' : step?.team === 'amber' ? 'bg-amber-team' : 'bg-sapphire-team']" :style="{ width: `${remaining === null ? 100 : timerPct}%` }" /></div>
          </div>

          <div class="grid gap-3 lg:grid-cols-[minmax(150px,220px)_minmax(0,1fr)_minmax(150px,220px)]">
            <!-- Pick columns -->
            <aside v-for="team in SIDES" :key="team" :class="['space-y-2 min-w-0', team === 'amber' ? 'lg:order-1' : 'lg:order-3']">
              <div :class="['flex items-center justify-between font-display text-sm uppercase', teamText(team)]" :dir="team === 'sapphire' ? 'rtl' : undefined">
                <span>{{ mySeat === team ? 'Your team' : rec.teamNames[team] }}</span><span class="font-mono text-xs text-muted">{{ s.picks[team].length }}/{{ teamSize }}</span>
              </div>
              <div class="grid grid-cols-3 sm:grid-cols-6 lg:grid-cols-1 gap-2">
                <div v-for="(p, i) in slots(team, 'pick')" :key="`p${i}-${p.heroId}`"
                  :class="['relative overflow-hidden rounded-sm border aspect-[3/4] lg:aspect-auto lg:h-[calc((100vh-23.125rem)/6)] min-[1680px]:h-[calc((100vh-20.5rem)/6)] lg:min-h-[64px] bg-gradient-to-br',
                    team === 'amber' ? 'from-amber-team/[0.08] to-surface/80' : 'from-sapphire-team/[0.08] to-surface/80',
                    p.active ? (team === 'amber' ? 'border-amber-team border-2 animate-glow' : 'border-sapphire-team border-2 animate-glow') : p.heroId !== null ? (team === 'amber' ? 'border-amber-team/50' : 'border-sapphire-team/50') : 'border-line']">
                  <template v-if="p.heroId !== null">
                    <div :class="['absolute inset-0', lastStepKey === `${team}-pick-${i}` && 'animate-slot-in']">
                      <img v-if="heroes.byId(p.heroId)?.backgroundUrl" :src="heroes.byId(p.heroId)!.backgroundUrl!" alt="" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover object-right" />
                      <img v-else :src="heroes.byId(p.heroId)?.imageUrl ?? undefined" alt="" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover blur-xl scale-125 opacity-40" />
                      <img :src="heroes.byId(p.heroId)?.imageUrl ?? undefined" alt="" :class="['absolute top-0 h-[130%] w-auto object-cover object-top drop-shadow-[0_6px_16px_rgba(0,0,0,.6)]', team === 'amber' ? 'right-[6%]' : 'left-[6%]']" />
                      <div :class="['absolute inset-0', team === 'amber' ? 'bg-gradient-to-r from-black/70 via-black/10 to-transparent' : 'bg-gradient-to-l from-black/70 via-black/10 to-transparent']" />
                      <img v-if="heroes.byId(p.heroId)?.nameUrl" :src="heroes.byId(p.heroId)!.nameUrl!" :alt="heroName(p.heroId)"
                        :class="['absolute bottom-2 h-[32%] max-h-9 max-w-[75%] w-auto object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,.9)]', team === 'amber' ? 'left-2.5 object-left' : 'right-2.5 object-right']" />
                      <div v-else :class="['absolute bottom-1.5 font-display text-sm uppercase leading-none text-text drop-shadow', team === 'amber' ? 'left-2' : 'right-2']">{{ heroName(p.heroId) }}</div>
                    </div>
                  </template>
                  <template v-else-if="p.active">
                    <div :class="['absolute inset-0', team === 'amber' ? 'bg-[repeating-linear-gradient(135deg,rgba(232,163,58,.16)_0_10px,transparent_10px_22px)]' : 'bg-[repeating-linear-gradient(135deg,rgba(90,143,224,.18)_0_10px,transparent_10px_22px)]']" />
                    <span :class="['absolute top-2 px-2 py-0.5 font-display text-xs uppercase -skew-x-6 text-bg', team === 'amber' ? 'left-0 bg-amber-team' : 'right-0 bg-sapphire-team']">{{ step?.type === 'ban' ? 'Up next' : 'Choosing' }}</span>
                  </template>
                  <span :class="['absolute top-1/2 -translate-y-1/2 font-display text-4xl lg:text-5xl leading-none', p.heroId !== null ? 'opacity-0' : team === 'amber' ? 'right-3 text-amber-team/25' : 'left-3 text-sapphire-team/25']">{{ i + 1 }}</span>
                </div>
              </div>
            </aside>

            <!-- Center -->
            <section class="order-first lg:order-2 space-y-3 min-w-0">
              <!-- Turn banner -->
              <div :key="s.step" :class="['relative rounded-sm px-4 py-3 text-center animate-fade-up border',
                myTurn ? (step?.type === 'ban' ? 'bg-danger border-danger text-white' : 'bg-primary border-primary text-bg') : step?.team === 'amber' ? 'bg-amber-team/10 border-amber-team/60' : 'bg-sapphire-team/10 border-sapphire-team/60']">
                <div class="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
                  <span v-if="s.status === 'paused'" class="font-display text-3xl sm:text-4xl uppercase text-warn">Paused</span>
                  <template v-else>
                    <span :class="['font-display text-3xl sm:text-4xl uppercase leading-none', !myTurn && step && teamText(step.team)]">{{ myTurn ? 'Your turn' : step ? rec.teamNames[step.team] : '' }}</span>
                    <span :class="['font-display text-base sm:text-lg uppercase px-2.5 py-1 leading-none', myTurn ? 'bg-black/80 text-white' : step?.type === 'ban' ? 'bg-danger text-white' : 'bg-primary text-bg']">{{ myTurn ? (step?.type === 'ban' ? 'Ban a hero' : 'Pick a hero') : step?.type === 'ban' ? 'Bans' : 'Picks' }}</span>
                  </template>
                </div>
                <div v-if="nextTeam && s.status !== 'paused'" :class="['text-sm mt-1', myTurn ? 'opacity-90' : 'text-muted']">
                  <template v-if="run && run.length > 1">Turn {{ run.index }} of {{ run.length }} · </template>then <b>{{ rec.teamNames[nextTeam] }}</b>
                </div>
              </div>

              <!-- Order strip grouped by phase -->
              <div class="card px-3 py-2.5 flex flex-wrap justify-center gap-x-5 gap-y-2 overflow-x-auto">
                <div v-for="(ph, pi) in phases" :key="pi" :class="['flex flex-col gap-1.5', pi > 0 && 'pl-5 border-l border-line']">
                  <span :class="['font-mono text-[10px] font-bold uppercase tracking-[0.2em]', ph.steps.includes(s.step) ? (ph.type === 'ban' ? 'text-danger' : 'text-primary') : 'text-muted']">{{ ph.label }}</span>
                  <div class="flex gap-1">
                    <div v-for="i in ph.steps" :key="i" :title="stepHero(i) !== null ? heroName(stepHero(i)) : undefined"
                      :class="['relative w-7 h-7 overflow-hidden border-2 -skew-x-6 bg-bg/70', s.config.sequence[i].team === 'amber' ? 'border-amber-team/70' : 'border-sapphire-team/70',
                        i === s.step && s.status === 'drafting' && (ph.type === 'ban' ? '!border-danger bg-danger/30 animate-glow-danger' : '!border-primary bg-primary/30 animate-glow'), i < s.step && 'opacity-80']">
                      <img v-if="stepHero(i) !== null" :src="heroes.byId(stepHero(i)!)?.imageUrl ?? undefined" alt="" :class="['absolute inset-0 w-full h-full object-cover object-top skew-x-6 scale-125', ph.type === 'ban' && 'grayscale']" />
                      <span v-if="stepHero(i) !== null && ph.type === 'ban'" class="ban-slash" />
                      <span v-else-if="stepSkipped(i)" class="absolute inset-0 grid place-items-center skew-x-6 text-muted text-xs">—</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Grid + preview -->
              <div class="grid gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] xl:h-[max(380px,calc(100vh-31.125rem))] min-[1680px]:h-[max(380px,calc(100vh-28.5rem))]">
                <div class="card p-3 min-w-0 flex flex-col gap-3 xl:min-h-0">
                  <div class="flex flex-wrap items-center gap-1.5">
                    <label class="relative flex-1 min-w-[150px]"><span class="sr-only">Search hero</span>
                      <Search class="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                      <input ref="searchEl" v-model="query" class="input !h-9 !pl-9 !pr-8" placeholder="Search hero" />
                      <kbd class="absolute right-2.5 top-1/2 -translate-y-1/2 text-[10px] text-muted border border-line rounded px-1">/</kbd>
                    </label>
                    <button v-for="f in ['all', ...heroTypes]" :key="f" :class="['h-9 px-3 font-display text-xs uppercase -skew-x-6 border', heroType === f ? 'bg-text text-bg border-text' : 'border-line text-muted hover:text-text bg-raised/60']" @click="heroType = f"><span class="inline-block skew-x-6">{{ f }}</span></button>
                    <span class="ml-auto text-xs text-muted tabular-nums"><b class="text-text">{{ freeCount }}</b> free</span>
                  </div>
                  <p v-if="!spectate && !myTurn && s.status === 'drafting'" class="text-xs text-muted">{{ mySeat ? 'Not your turn yet.' : 'You are watching. Only captains can ban and pick.' }}</p>
                  <PageState :empty="!roster.length" empty-text="No heroes match your search.">
                    <div class="grid grid-cols-[repeat(auto-fill,minmax(46px,1fr))] xl:grid-cols-8 xl:[grid-template-rows:var(--hero-rows)] gap-1 max-h-[50vh] xl:max-h-none xl:flex-1 xl:min-h-0 content-start overflow-y-auto xl:overflow-hidden p-1 -m-1"
                      :style="{ '--hero-rows': `repeat(${Math.max(5, Math.ceil(roster.length / 8))}, minmax(0, 1fr))` }" @pointerleave="hovered = null">
                      <button v-for="h in roster" :key="h.id" type="button" data-hero
                        :aria-disabled="!myTurn || !!unavailableReason(h.id) || pending"
                        :title="unavailableReason(h.id) ? `${h.name} (${unavailableReason(h.id)})` : h.name"
                        :class="['group relative aspect-[5/6] xl:aspect-auto overflow-hidden border bg-gradient-to-b from-[#2a2622] to-[#141210] transition-[transform,border-color,filter] duration-150 ease-out',
                          selected === h.id ? (step?.type === 'ban' ? 'border-danger ring-2 ring-danger z-10 -translate-y-0.5' : 'border-primary ring-2 ring-primary z-10 -translate-y-0.5') : 'border-black/60',
                          unavailableReason(h.id) === 'banned' ? 'opacity-60 grayscale' : unavailableReason(h.id) ? 'opacity-30 grayscale' : 'hover:border-text/80 hover:-translate-y-0.5 hover:z-10 brightness-[.85] hover:brightness-110 cursor-pointer']"
                        @click="choose(h.id)" @pointerenter="hovered = h.id">
                        <img v-if="h.imageUrl" :src="h.imageUrl" alt="" class="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-200 group-hover:scale-110" loading="lazy" />
                        <span v-else class="absolute inset-0 grid place-items-center font-display text-xs text-muted">{{ h.name.slice(0, 2) }}</span>
                        <span v-if="unavailableReason(h.id) === 'banned'" class="ban-slash" />
                        <span class="absolute inset-x-0 bottom-0 pt-3 pb-0.5 bg-gradient-to-t from-black via-black/70 to-transparent font-display text-[8.5px] uppercase text-center truncate px-0.5 opacity-0 group-hover:opacity-100 transition-opacity">{{ h.name }}</span>
                      </button>
                    </div>
                  </PageState>
                </div>

                <!-- Preview / action -->
                <div class="relative card overflow-hidden min-h-[320px] xl:min-h-0 flex flex-col justify-end p-5">
                  <Transition enter-active-class="transition-opacity duration-200" leave-active-class="transition-opacity duration-200 absolute inset-0" enter-from-class="opacity-0" leave-to-class="opacity-0">
                    <div v-if="preview !== null" :key="preview" class="absolute inset-0">
                      <img v-if="heroes.byId(preview)?.renderUrl" :src="heroes.byId(preview)!.renderUrl!" alt="" class="absolute inset-0 w-full h-full object-cover object-top" />
                      <template v-else>
                      <img v-if="heroes.byId(preview)?.backgroundUrl" :src="heroes.byId(preview)!.backgroundUrl!" alt="" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover object-right opacity-90" />
                      <img v-else :src="heroes.byId(preview)?.imageUrl ?? undefined" alt="" aria-hidden="true" class="absolute inset-0 w-full h-full object-cover blur-2xl scale-110 opacity-50" />
                      <img :src="heroes.byId(preview)?.imageUrl ?? undefined" alt="" class="absolute right-[4%] bottom-0 h-[92%] max-h-[560px] w-auto object-contain object-bottom drop-shadow-[0_10px_40px_rgba(0,0,0,.7)]" />
                      </template>
                      <div class="absolute inset-0 bg-gradient-to-t from-bg via-bg/30 to-transparent" />
                    </div>
                  </Transition>
                  <div v-if="preview === null" :class="['absolute inset-0', step?.type === 'ban' ? 'bg-[radial-gradient(ellipse_at_50%_35%,rgba(207,74,60,.22),transparent_65%)]' : 'bg-[radial-gradient(ellipse_at_50%_35%,rgba(212,162,76,.25),transparent_65%)]']" />
                  <div class="relative flex flex-wrap items-end justify-between gap-4">
                    <div class="min-w-0 space-y-2">
                      <template v-if="preview !== null">
                        <div class="text-sm text-muted">{{ selected !== null ? (step?.type === 'ban' ? 'Your ban' : 'Your pick') : unavailableReason(preview) ? `Unavailable · ${unavailableReason(preview)}` : myTurn ? 'Click to select' : 'Previewing' }}</div>
                        <img v-if="heroes.byId(preview)?.nameUrl" :src="heroes.byId(preview)!.nameUrl!" :alt="heroName(preview)" class="h-14 sm:h-16 w-auto max-w-full object-contain object-left drop-shadow-[0_4px_20px_rgba(0,0,0,.9)]" />
                        <div v-else class="font-display text-5xl sm:text-6xl uppercase leading-[0.9] italic -skew-x-6 text-text drop-shadow-[0_4px_20px_rgba(0,0,0,.8)] truncate">{{ heroName(preview) }}</div>
                        <div class="flex flex-wrap items-center gap-1.5">
                          <span v-if="heroes.byId(preview)?.heroType" class="font-display text-xs uppercase bg-text text-bg px-2 py-0.5 -skew-x-6">{{ heroes.byId(preview)?.heroType }}</span>
                          <span v-for="tg in heroes.byId(preview)?.tags ?? []" :key="tg" class="font-display text-xs uppercase bg-danger/25 text-danger px-2 py-0.5 -skew-x-6">{{ tg }}</span>
                        </div>
                      </template>
                      <template v-else>
                        <div :class="['font-display text-4xl sm:text-5xl uppercase leading-none', myTurn ? 'text-primary' : step ? teamText(step.team) : 'text-muted']">{{ myTurn ? 'Your turn' : s.status === 'paused' ? 'Paused' : `${step ? rec.teamNames[step.team] : ''}` }}</div>
                        <p class="text-sm text-muted">{{ myTurn ? `Click a hero to ${step?.type}, or type a name${step?.type === 'ban' ? ', or skip the ban' : ''}.` : step ? `${step.type === 'ban' ? 'Banning' : 'Picking'} a hero…` : '' }}</p>
                      </template>
                      <button v-if="myTurn && step?.type === 'ban'" class="btn-ghost !h-9" :disabled="pending" @click="command({ kind: 'skip', expectedSeq: s.seq })"><SkipForward class="w-4 h-4" />Skip this ban</button>
                    </div>
                    <button v-if="myTurn" :disabled="selected === null || pending" @click="lockIn"
                      :class="['shrink-0 flex flex-col items-center justify-center px-9 py-3 -rotate-2 [clip-path:polygon(3%_0,100%_4%,97%_100%,0_94%)] transition disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:scale-105 enabled:hover:rotate-0',
                        step?.type === 'ban' ? 'bg-danger text-white' : 'bg-primary text-bg', selected !== null && 'shadow-[0_0_40px_-6px_currentColor]']">
                      <span class="font-display text-3xl sm:text-4xl uppercase leading-none">{{ step?.type === 'ban' ? 'Ban' : 'Lock in' }}</span>
                      <span class="mt-1 flex items-center gap-1.5 text-xs font-semibold">{{ selected !== null ? heroName(selected) : 'Select a hero' }}<kbd class="text-[10px] opacity-70 border border-current rounded px-1">Enter</kbd></span>
                    </button>
                  </div>
                </div>
              </div>
            </section>
          </div>

          <!-- Progress / current turn / log -->
          <div v-if="!broadcast">
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
          <ScoutPanel v-if="!broadcast" :draft-id="rec.id" :teams="{ amber: teamPeople('amber'), sapphire: teamPeople('sapphire') }" :team-names="rec.teamNames" :name-of="nameOf" />
        </template>

        <!-- ================= RESULT ================= -->
        <template v-else-if="view === 'completed'">
          <div class="relative flex flex-col items-center animate-fade-up">
            <div class="relative z-10 -mb-3 px-3 py-1 bg-text text-bg font-display text-xs uppercase tracking-wider -rotate-1 shadow-lg flex items-center gap-1.5"><Check class="w-3.5 h-3.5" />Draft complete</div>
            <template v-for="(t, ti) in SIDES" :key="t">
              <div v-if="ti === 1" class="relative z-10 -my-4 w-14 h-14 grid place-items-center bg-bg border border-line rotate-45 shadow-xl"><span class="-rotate-45 font-display text-xl text-text">VS</span></div>
              <section :class="['w-full border border-line/70 px-4 sm:px-8 py-6 flex flex-col lg:flex-row items-center gap-6',
                t === 'amber' ? 'bg-gradient-to-r from-amber-team/[0.10] via-surface/80 to-surface/60' : 'bg-gradient-to-l from-sapphire-team/[0.10] via-surface/80 to-surface/60 lg:flex-row-reverse']">
                <header :class="['shrink-0 lg:w-56 flex flex-col gap-2', t === 'amber' ? 'items-center lg:items-start text-left' : 'items-center lg:items-end text-right']">
                  <div :class="['flex items-center gap-2 font-mono text-[10.5px] font-bold uppercase tracking-[0.25em]', teamText(t)]"><TeamCrest :team="t" :size="22" />{{ FACTION[t] }}</div>
                  <h2 :class="['font-display text-3xl xl:text-4xl uppercase leading-none max-w-full break-words', teamText(t)]">{{ rec.teamNames[t] }}</h2>
                  <div class="flex items-center gap-1.5">
                    <span class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted mr-1">Bans</span>
                    <template v-for="(b, i) in slots(t, 'ban')" :key="i">
                      <div v-if="b.heroId !== null" class="relative w-8 h-10 overflow-hidden border border-danger/60 bg-raised" :title="heroName(b.heroId)">
                        <img :src="art(b.heroId) ?? undefined" alt="" class="absolute inset-0 w-full h-full object-cover object-top grayscale opacity-70" />
                        <span class="ban-slash" />
                      </div>
                      <span v-else class="w-8 h-10 grid place-items-center border border-line bg-raised/60 font-mono text-[7px] font-bold uppercase text-muted">None</span>
                    </template>
                  </div>
                </header>
                <ul class="flex-1 min-w-0 w-full grid grid-cols-3 sm:grid-cols-6 gap-3 lg:max-w-[920px]">
                  <li v-for="(h, i) in s.picks[t]" :key="h" class="flex flex-col gap-1.5 animate-slot-in" :style="{ animationDelay: `${(ti * 6 + i) * 70}ms` }">
                    <div :class="['relative aspect-[9/16] overflow-hidden bg-raised group shadow-[0_10px_30px_-10px_rgba(0,0,0,.9)] [clip-path:polygon(2%_1%,99%_0,100%_99%,0_100%)]', assignedTo(h) === me && 'ring-2 ring-draft']">
                      <img :src="art(h) ?? undefined" alt="" class="absolute inset-0 w-full h-full object-cover object-top transition-transform duration-300 group-hover:scale-105" />
                      <div class="absolute inset-x-0 bottom-0 h-1/3 bg-gradient-to-t from-black/90 to-transparent" />
                      <span :class="['absolute top-1.5 left-1.5 min-w-5 h-5 px-1 grid place-items-center font-mono text-[11px] font-bold text-bg', t === 'amber' ? 'bg-amber-team' : 'bg-sapphire-team']">{{ i + 1 }}</span>
                      <div class="absolute inset-x-0 bottom-0 p-2 flex flex-col items-center">
                        <img v-if="heroes.byId(h)?.nameUrl" :src="heroes.byId(h)!.nameUrl!" :alt="heroName(h)" class="h-7 w-full object-contain drop-shadow-[0_2px_6px_rgba(0,0,0,.9)]" />
                        <div v-else class="font-display text-sm uppercase leading-tight truncate text-text">{{ heroName(h) }}</div>
                        <div v-if="!((mySeat === t || isMod) && !spectate)" :class="['mt-0.5 font-mono text-[10px] truncate max-w-full', assignedTo(h) ? 'text-draft' : 'text-muted']">{{ nameOf(assignedTo(h)) ?? 'Unassigned' }}</div>
                      </div>
                    </div>
                    <UiSelect v-if="(mySeat === t || isMod) && !spectate" size="sm" class="!px-2 !pr-2" :aria-label="`Player for ${heroName(h)}`" :model-value="assignedTo(h) ?? ''"
                      :disabled="pending" :options="[{ value: '', label: 'Unassigned' }, ...teamPeople(t).map((p) => ({ value: p, label: nameOf(p) ?? p }))]"
                      @update:model-value="(v) => command({ kind: 'assign', heroId: h, userId: v || null })" />
                  </li>
                </ul>
              </section>
              <div class="w-full px-1 pt-1 space-y-1 text-center">
                <p v-if="mySeat === t && teamPeople(t).length < teamSize" class="text-xs text-muted">Only {{ teamPeople(t).length }} of {{ teamSize }} players joined {{ rec.teamNames[t] }}. Others can still join from the lobby link before you assign.</p>
                <p v-if="myTeam === t && !mySeat && s.assignments.find((a: any) => a.userId === me)" class="text-sm text-draft">You're playing {{ heroName(s.assignments.find((a: any) => a.userId === me).heroId) }}.</p>
              </div>
            </template>
          </div>
          <LobbyPanel v-if="!broadcast" :draft-id="rec.id" :can-create="!spectate && (!!mySeat || isMod || [...rec.state.members.amber, ...rec.state.members.sapphire].includes(session.user?.id ?? ''))" :simulated="rec.simulated" @copied="flash" />
          <div class="flex flex-wrap justify-center gap-2 [&>*]:-skew-x-6">
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
        <section v-if="!broadcast && s.history.length && view === 'completed'" class="card p-4">
          <h2 class="h-section flex items-center gap-2 mb-3"><History class="w-4 h-4" />Pick &amp; ban order</h2>
          <ol class="flex gap-1.5 overflow-x-auto pb-2">
            <li v-for="h in s.history" :key="h.seq" class="shrink-0 w-[68px] flex flex-col items-center gap-1" :title="`${rec.teamNames[h.team]} ${h.type}: ${h.heroId === null ? 'no ban' : heroName(h.heroId)}`">
              <span :class="['font-mono text-[10px] font-bold', h.type === 'ban' ? 'text-danger' : teamText(h.team)]">{{ h.type === 'ban' ? 'B' : 'P' }}{{ stepOrdinal(h.step) }}</span>
              <div :class="['relative w-full aspect-[3/4] rounded overflow-hidden border bg-raised', h.type === 'ban' ? 'border-danger/50' : h.team === 'amber' ? 'border-amber-team/60' : 'border-sapphire-team/60']">
                <img v-if="h.heroId !== null" :src="art(h.heroId) ?? undefined" alt="" :class="['absolute inset-0 w-full h-full object-cover object-top', h.type === 'ban' && 'grayscale opacity-60']" />
                <span v-else class="absolute inset-0 grid place-items-center font-mono text-[9px] uppercase text-muted">No ban</span>
                <div v-if="h.type === 'ban' && h.heroId !== null" class="absolute left-[-25%] w-[150%] top-1/2 h-0.5 bg-danger rotate-[-45deg]" />
                <div :class="['absolute inset-x-0 bottom-0 h-1', h.team === 'amber' ? 'bg-amber-team' : 'bg-sapphire-team']" />
                <span v-if="h.reason !== 'manual'" class="absolute top-0.5 right-0.5 px-1 rounded-sm bg-warn text-bg font-mono text-[8px] font-bold uppercase">{{ h.reason }}</span>
              </div>
              <span class="w-full text-center font-display text-[10px] uppercase leading-tight truncate text-muted">{{ h.heroId === null ? '—' : heroName(h.heroId) }}</span>
            </li>
          </ol>
        </section>
      </div>
    </PageState>
  </div>
</template>
