<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue';
import { Search, Play, Pause, Square, Lock, Ban, Timer, Eye, Share2, Tv, History, AlertTriangle, ExternalLink } from 'lucide-vue-next';
import { api, ApiError } from '../lib/api';
import { realtime } from '../lib/ws';
import { useHeroes } from '../stores/heroes';
import { useSession } from '../stores/session';
import HeroPortrait from '../components/HeroPortrait.vue';
import StatusBadge from '../components/StatusBadge.vue';
import PageState from '../components/PageState.vue';
import SimBadge from '../components/SimBadge.vue';

type Side = 'amber' | 'sapphire';
const props = defineProps<{ draftId: string; spectate: boolean }>();
const heroes = useHeroes();
const session = useSession();
const rec = ref<any>(null);
const participants = ref<any[]>([]);
const error = ref<string | null>(null);
const actionError = ref<string | null>(null);
const pending = ref(false);
const selected = ref<number | null>(null);
const query = ref('');
const filter = ref<'all' | 'available'>('all');
const now = ref(realtime.now());
const matchId = ref<string | null>(null);
const broadcast = computed(() => new URLSearchParams(location.search).get('broadcast') === '1');

const s = computed(() => rec.value?.state);
const step = computed(() => (s.value && (s.value.status === 'drafting' || s.value.status === 'paused') ? s.value.config.sequence[s.value.step] : null));
const isMod = computed(() => session.can('MODERATOR'));
const myTeam = computed<Side | null>(() => { const u = session.user?.id; if (!u || !s.value) return null; return s.value.captains.amber === u ? 'amber' : s.value.captains.sapphire === u ? 'sapphire' : null; });
const myTurn = computed(() => !props.spectate && s.value?.status === 'drafting' && step.value && myTeam.value === step.value.team);
const remaining = computed(() => (s.value?.turnEndsAt ? Math.min(s.value.config.timerSeconds || Infinity, Math.max(0, Math.ceil((s.value.turnEndsAt - now.value) / 1000))) : null));
const timerPct = computed(() => (remaining.value === null || !s.value?.config.timerSeconds ? 0 : (remaining.value / s.value.config.timerSeconds) * 100));

function unavailableReason(id: number): 'banned' | 'picked' | null {
  if (!s.value) return null;
  const st = s.value;
  if ([...st.bans.amber, ...st.bans.sapphire].includes(id)) return 'banned';
  if (!step.value) return [...st.picks.amber, ...st.picks.sapphire].includes(id) ? 'picked' : null;
  const team: Side = step.value.team, other: Side = team === 'amber' ? 'sapphire' : 'amber';
  if (st.picks[team].includes(id)) return 'picked';
  if (st.picks[other].includes(id) && (step.value.type === 'ban' || !st.config.allowMirrorPicks)) return 'picked';
  return null;
}
const roster = computed(() => heroes.list
  .filter((h) => h.name.toLowerCase().includes(query.value.trim().toLowerCase()))
  .filter((h) => filter.value === 'all' || !unavailableReason(h.id)));

function slots(team: Side, type: 'pick' | 'ban') {
  if (!s.value) return [];
  const total = s.value.config.sequence.filter((x: any) => x.team === team && x.type === type).length;
  const list: number[] = (type === 'pick' ? s.value.picks : s.value.bans)[team];
  // Which slot is currently being chosen
  const active = step.value && step.value.team === team && step.value.type === type ? list.length : -1;
  const skipped = s.value.history.filter((h: any) => h.team === team && h.type === type && h.heroId === null && h.reason !== 'correction').length;
  return Array.from({ length: total }, (_, i) => ({ heroId: list[i] ?? null, active: i === active, skipped: i >= list.length && i < list.length + skipped && i !== active }));
}
const captainName = (team: Side) => participants.value.find((p) => p.userId === s.value?.captains[team])?.displayNameSnapshot ?? 'Unassigned';
const teamPlayers = (team: Side) => participants.value.filter((p) => p.team === team.toUpperCase());
const heroName = (id: number | null) => (id == null ? '—' : heroes.byId(id)?.name ?? `#${id}`);
const phaseLabel = computed(() => {
  if (!s.value) return '';
  if (s.value.status === 'waiting') return 'Waiting to start';
  if (s.value.status === 'completed') return 'Draft complete';
  if (s.value.status === 'cancelled') return 'Draft cancelled';
  const banSteps = s.value.config.sequence.filter((x: any) => x.type === 'ban').length;
  return step.value?.type === 'ban' ? `Ban phase · ${s.value.step + 1}/${banSteps}` : `Pick phase · ${s.value.step - banSteps + 1}/${s.value.config.sequence.length - banSteps}`;
});

async function load() {
  try {
    const r = await api<any>(`/drafts/${props.draftId}`);
    realtime.clockOffset.value = r.serverNow - Date.now();
    rec.value = r; participants.value = r.participants; error.value = null;
  } catch (e) { error.value = (e as Error).message; }
}
async function command(body: any) {
  pending.value = true; actionError.value = null;
  try { rec.value = { ...rec.value, ...(await api<any>(`/drafts/${props.draftId}/command`, { method: 'POST', body })) }; selected.value = null; }
  catch (e) {
    actionError.value = e instanceof ApiError && e.code === 'STALE_SEQ' ? 'The draft moved on before your action arrived. Please choose again.' : (e as Error).message;
    if (e instanceof ApiError && e.code === 'STALE_SEQ') await load();
  } finally { pending.value = false; }
}
function lockIn() { if (selected.value !== null && s.value) command({ kind: 'select', heroId: selected.value, expectedSeq: s.value.seq }); }
function choose(id: number) { if (myTurn.value && !unavailableReason(id)) selected.value = id; }
function share() { navigator.clipboard?.writeText(`${location.origin}/draft/${props.draftId}/spectate`); }

watch(() => s.value?.seq, () => { if (selected.value !== null && unavailableReason(selected.value)) selected.value = null; });

let unsub = () => {};
let tick: number;
onMounted(async () => {
  await Promise.all([heroes.load().catch((e) => (error.value = e.message)), load()]);
  unsub = realtime.subscribe(`draft:${props.draftId}`, (m) => {
    if (m.type === 'draft.state') rec.value = { ...rec.value, ...m.payload };
    if (m.type === 'draft.match') matchId.value = m.payload.matchId;
  });
  tick = window.setInterval(() => (now.value = realtime.now()), 250);
});
onUnmounted(() => { unsub(); clearInterval(tick); });
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
              <span v-if="spectate" class="inline-flex items-center gap-1 text-xs text-muted"><Eye class="w-3.5 h-3.5" />Spectating</span>
            </div>
            <p class="text-xs text-muted mt-1">{{ s.config.format }} · {{ s.config.bansPerTeam }} bans per team · {{ s.config.timerSeconds ? `${s.config.timerSeconds}s timer` : 'no timer' }} · timeout: {{ s.config.timeoutBehavior }}</p>
          </div>
          <div v-if="!broadcast" class="ml-auto flex flex-wrap gap-2">
            <RouterLink v-if="matchId" :to="`/matches/${matchId}/live`" class="btn-primary !h-8">Live match<ExternalLink class="w-3.5 h-3.5" /></RouterLink>
            <button class="btn-ghost !h-8" @click="share"><Share2 class="w-4 h-4" />Copy link</button>
            <a :href="`/draft/${draftId}/spectate?broadcast=1`" target="_blank" class="btn-ghost !h-8"><Tv class="w-4 h-4" />Broadcast view</a>
            <template v-if="isMod && !spectate">
              <button v-if="s.status === 'waiting'" class="btn-draft !h-8" :disabled="pending" @click="command({ kind: 'start' })"><Play class="w-4 h-4" />Start</button>
              <button v-if="s.status === 'drafting'" class="btn-ghost !h-8" :disabled="pending" @click="command({ kind: 'pause' })"><Pause class="w-4 h-4" />Pause</button>
              <button v-if="s.status === 'paused'" class="btn-draft !h-8" :disabled="pending" @click="command({ kind: 'resume' })"><Play class="w-4 h-4" />Resume</button>
              <button v-if="['waiting','drafting','paused'].includes(s.status)" class="btn-danger !h-8" :disabled="pending" @click="command({ kind: 'cancel' })"><Square class="w-4 h-4" />Cancel</button>
            </template>
          </div>
        </div>

        <div v-if="actionError" class="card border-danger/40 px-4 py-2 text-sm text-danger flex items-center gap-2" role="alert"><AlertTriangle class="w-4 h-4" />{{ actionError }}</div>

        <!-- Main grid: teams flank the roster -->
        <div class="grid gap-4 lg:grid-cols-[minmax(220px,280px)_1fr_minmax(220px,280px)]">
          <aside v-for="team in (['amber', 'sapphire'] as Side[])" :key="team" :class="['card p-3 space-y-3', team === 'amber' ? 'lg:order-1 border-t-2 !border-t-amber-team' : 'lg:order-3 border-t-2 !border-t-sapphire-team', step?.team === team && s.status === 'drafting' && 'ring-1 ring-draft/50']">
            <div class="flex items-center justify-between">
              <h2 :class="['font-semibold', team === 'amber' ? 'text-amber-team' : 'text-sapphire-team']">{{ rec.teamNames[team] }}</h2>
              <span v-if="step?.team === team && s.status === 'drafting'" class="text-[11px] font-semibold uppercase tracking-wide text-draft">On the clock</span>
            </div>
            <p class="text-xs text-muted">Captain: <span class="text-text">{{ captainName(team) }}</span></p>
            <div>
              <div class="text-[11px] uppercase tracking-wide text-muted mb-1.5 flex items-center gap-1"><Ban class="w-3 h-3" />Bans</div>
              <div class="flex flex-wrap gap-1.5">
                <div v-for="(b, i) in slots(team, 'ban')" :key="i" :class="['rounded-lg', b.active && 'ring-2 ring-danger/70 animate-pulse']">
                  <HeroPortrait v-if="b.heroId !== null" :name="heroName(b.heroId)" :src="heroes.byId(b.heroId)?.imageUrl" size="sm" state="banned" :title="heroName(b.heroId)" />
                  <div v-else class="w-8 h-8 rounded-lg border border-dashed border-line grid place-items-center text-[10px] text-muted" :title="b.skipped ? 'Skipped (timeout)' : 'Empty'">{{ b.skipped ? 'skip' : '' }}</div>
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
                  <div class="min-w-0">
                    <div class="text-sm font-medium truncate">{{ p.heroId !== null ? heroName(p.heroId) : p.active ? 'Selecting…' : `Pick ${i + 1}` }}</div>
                    <div class="text-[11px] text-muted truncate">{{ teamPlayers(team)[i]?.displayNameSnapshot ?? '' }}</div>
                  </div>
                </li>
              </ul>
            </div>
          </aside>

          <!-- Center -->
          <section class="order-first lg:order-2 card p-3 sm:p-4 space-y-4 min-w-0">
            <div class="flex flex-wrap items-center gap-4">
              <div class="min-w-0">
                <div class="text-xs text-muted">{{ phaseLabel }}</div>
                <div v-if="step" class="text-lg font-semibold mt-0.5">
                  <span :class="step.team === 'amber' ? 'text-amber-team' : 'text-sapphire-team'">{{ rec.teamNames[step.team] }}</span>
                  {{ ' ' }}<span :class="step.type === 'ban' ? 'text-danger' : 'text-draft'">{{ step.type === 'ban' ? 'bans' : 'picks' }}</span>
                </div>
                <div v-else-if="s.status === 'completed'" class="text-lg font-semibold mt-0.5 text-accent">Final compositions locked</div>
              </div>
              <div class="ml-auto flex items-center gap-3" aria-live="polite">
                <Timer class="w-5 h-5 text-muted" />
                <div v-if="s.status === 'paused'" class="text-2xl font-semibold text-warn">Paused</div>
                <div v-else-if="remaining !== null" :class="['text-3xl font-semibold tabular-nums w-16 text-right', remaining <= 5 ? 'text-danger' : 'text-text']">{{ remaining }}s</div>
                <div v-else class="text-sm text-muted">{{ s.status === 'drafting' ? 'No timer' : '—' }}</div>
              </div>
            </div>
            <div v-if="remaining !== null && s.status === 'drafting'" class="h-1 rounded bg-line overflow-hidden"><div class="h-full bg-draft transition-[width] duration-200 ease-linear" :style="{ width: `${timerPct}%` }" /></div>

            <div v-if="!spectate && s.status === 'drafting'" :class="['rounded-lg px-3 py-2 text-sm border', myTurn ? 'border-draft/50 bg-draft/10 text-draft' : 'border-line text-muted']">
              {{ myTurn ? `Your turn — choose a hero to ${step!.type}, then lock in.` : myTeam ? 'Waiting for the other captain…' : 'You are viewing this draft. Only captains can select.' }}
            </div>

            <div class="flex flex-wrap gap-2">
              <label class="relative flex-1 min-w-[160px]"><span class="sr-only">Search heroes</span>
                <Search class="w-4 h-4 text-muted absolute left-3 top-1/2 -translate-y-1/2" /><input v-model="query" class="input !pl-9" placeholder="Search heroes" />
              </label>
              <div class="flex rounded-lg border border-line overflow-hidden text-sm">
                <button v-for="f in (['all', 'available'] as const)" :key="f" :class="['px-3 h-9 capitalize', filter === f ? 'bg-raised text-text' : 'text-muted hover:text-text']" @click="filter = f">{{ f }}</button>
              </div>
            </div>
            <p v-if="heroes.source === 'simulated'" class="text-xs text-warn">Simulated hero roster: hero IDs are placeholders, not Deadlock IDs.</p>

            <PageState :empty="!roster.length" empty-text="No heroes match your search.">
              <div class="grid grid-cols-[repeat(auto-fill,minmax(76px,1fr))] gap-2 max-h-[52vh] lg:max-h-none overflow-y-auto pr-1">
                <button v-for="h in roster" :key="h.id" type="button"
                  :disabled="!myTurn || !!unavailableReason(h.id) || pending"
                  :title="unavailableReason(h.id) ? `${h.name} — ${unavailableReason(h.id)}` : h.name"
                  :class="['group flex flex-col items-center gap-1 p-1.5 rounded-lg border text-center transition-colors',
                    selected === h.id ? (step?.type === 'ban' ? 'border-danger bg-danger/10' : 'border-draft bg-draft/15') : 'border-transparent',
                    myTurn && !unavailableReason(h.id) ? 'hover:border-line hover:bg-raised cursor-pointer' : 'cursor-default']"
                  @click="choose(h.id)">
                  <HeroPortrait :name="h.name" :src="h.imageUrl" :state="unavailableReason(h.id) === 'banned' ? 'banned' : 'normal'" :class="unavailableReason(h.id) === 'picked' && 'opacity-30'" />
                  <span class="text-[11px] leading-tight truncate w-full" :class="unavailableReason(h.id) ? 'text-muted line-through' : ''">{{ h.name }}</span>
                </button>
              </div>
            </PageState>

            <div v-if="myTurn" class="sticky bottom-0 -mx-3 sm:-mx-4 -mb-3 sm:-mb-4 p-3 border-t border-line bg-surface rounded-b-xl flex items-center gap-3">
              <HeroPortrait v-if="selected !== null" :name="heroName(selected)" :src="heroes.byId(selected)?.imageUrl" size="sm" />
              <span class="text-sm truncate">{{ selected !== null ? heroName(selected) : 'No hero selected' }}</span>
              <button :class="['ml-auto', step?.type === 'ban' ? 'btn-danger' : 'btn-draft']" :disabled="selected === null || pending" @click="lockIn"><Lock class="w-4 h-4" />{{ step?.type === 'ban' ? 'Lock ban' : 'Lock pick' }}</button>
            </div>
          </section>
        </div>

        <!-- History -->
        <section v-if="!broadcast" class="card p-4">
          <h2 class="h-section flex items-center gap-2 mb-3"><History class="w-4 h-4" />Draft history</h2>
          <PageState :empty="!s.history.length" empty-text="No actions yet.">
            <ol class="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <li v-for="h in s.history" :key="h.seq" class="flex items-center gap-2 text-sm rounded-lg border border-line px-2 py-1.5">
                <span class="text-xs text-muted tabular-nums w-5">{{ h.step + 1 }}</span>
                <span :class="h.team === 'amber' ? 'text-amber-team' : 'text-sapphire-team'" class="text-xs font-medium w-14 shrink-0">{{ h.team === 'amber' ? 'Amber' : 'Sapphire' }}</span>
                <span :class="h.type === 'ban' ? 'text-danger' : 'text-draft'" class="text-xs uppercase w-8">{{ h.type }}</span>
                <span class="truncate">{{ h.heroId === null ? 'Skipped' : heroName(h.heroId) }}</span>
                <span v-if="h.reason !== 'manual'" class="ml-auto text-[10px] uppercase text-warn">{{ h.reason }}</span>
              </li>
            </ol>
          </PageState>
        </section>
      </div>
    </PageState>
  </div>
</template>
