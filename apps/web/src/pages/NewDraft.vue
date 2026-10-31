<script setup lang="ts">
import UiSelect from '../components/UiSelect.vue';
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Swords, ExternalLink } from 'lucide-vue-next';
import { api } from '../lib/api';
import OrderTimeline from '../components/draft/OrderTimeline.vue';
import FactionMark from '../components/draft/FactionMark.vue';
import { useSession } from '../stores/session';

const router = useRouter();
const session = useSession();
const users = ref<Array<{ id: string; displayName: string }>>([]);
const err = ref<string | null>(null);
const busy = ref(false);
const provider = ref<'NATIVE' | 'DEADLOCKLABS' | 'EXTERNAL'>('NATIVE');
const externalUrl = ref('');
const f = reactive({
  name: 'PUG Draft', amberName: '', sapphireName: '', format: '6v6', bansPerTeam: 2, timerSeconds: 30,
  timeoutBehavior: 'skip', banPhases: 2 as 1 | 2, allowMirrorPicks: false, firstTeam: 'amber', amberCaptainId: '' as string, sapphireCaptainId: '' as string, visibility: 'public',
});
const captainOptions = computed(() => [{ value: '', label: 'Open seat' }, ...users.value.map((u) => ({ value: u.id, label: u.displayName }))]);
onMounted(async () => { if (session.can('MODERATOR')) users.value = await api<typeof users.value>('/users').catch(() => []); });
const orderPreview = computed(() => {
  const size = { '6v6': 6, '4v4': 4, '2v2': 2 }[f.format as '6v6']!; const first = f.firstTeam, other = first === 'amber' ? 'sapphire' : 'amber';
  const out: Array<{ team: 'amber' | 'sapphire'; type: 'pick' | 'ban' }> = [];
  const bans = (n: number) => { for (let i = 0; i < n * 2; i++) out.push({ team: (i % 2 ? other : first) as 'amber', type: 'ban' }); };
  const picks = (a: number, b: number) => { for (let i = a; i < b; i++) out.push({ team: (Math.floor((i + 1) / 2) % 2 ? other : first) as 'amber', type: 'pick' }); };
  // Must match buildDefaultSequence on the server (the server is authoritative; this is only a preview).
  if (f.banPhases === 2 && f.bansPerTeam >= 2) { const b1 = Math.ceil(f.bansPerTeam / 2), p1 = 2 * Math.ceil(size / 2); bans(b1); picks(0, p1); bans(f.bansPerTeam - b1); picks(p1, size * 2); }
  else { bans(f.bansPerTeam); picks(0, size * 2); }
  return out;
});
// Blank names fall back to the placeholders shown in the inputs.
const names = computed(() => ({ amberName: f.amberName.trim() || 'Team 1', sapphireName: f.sapphireName.trim() || 'Team 2' }));
async function submit() {
  busy.value = true; err.value = null;
  try {
    if (provider.value === 'NATIVE') {
      const r = await api<{ id: string }>('/drafts', { method: 'POST', body: { ...f, ...names.value, banPhases: f.banPhases, amberCaptainId: f.amberCaptainId || null, sapphireCaptainId: f.sapphireCaptainId || null } });
      router.push(`/draft/${r.id}`);
    } else {
      await api('/pugs', { method: 'POST', body: { format: f.format, draftProvider: provider.value, ...names.value, externalUrl: externalUrl.value } });
      router.push('/');
    }
  } catch (e) { err.value = (e as Error).message; } finally { busy.value = false; }
}
</script>
<template>
  <form class="max-w-5xl mx-auto space-y-5" @submit.prevent="submit">
    <header class="text-center space-y-1 pt-2">
      <div class="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-muted">New PUG</div>
      <h1 class="text-4xl sm:text-5xl text-text">Create lobby</h1>
      <div class="rule-brass max-w-xs mx-auto mt-3" />
    </header>

    <!-- Factions -->
    <div class="relative grid md:grid-cols-[1fr_auto_1fr] items-end gap-4 md:gap-8 border border-line/70 px-6 py-6 bg-[linear-gradient(90deg,rgba(232,163,58,.16),rgba(14,12,10,.6)_45%,rgba(14,12,10,.6)_55%,rgba(90,143,224,.16))]">
      <template v-for="(t, i) in (['amber', 'sapphire'] as const)" :key="t">
        <div v-if="i === 1" class="hidden md:grid self-center w-16 h-16 place-items-center bg-bg border border-line rotate-[8deg] shadow-[0_8px_24px_rgba(0,0,0,.6)]">
          <span class="-rotate-[8deg] font-display text-xl uppercase text-text">{{ f.format }}</span>
        </div>
        <div :class="['min-w-0 space-y-2', t === 'sapphire' && 'md:text-right']">
          <label :for="t + 'n'" class="block"><FactionMark :team="t" :size="18" /></label>
          <input :id="t + 'n'" v-model="f[t === 'amber' ? 'amberName' : 'sapphireName']" maxlength="32" :placeholder="t === 'amber' ? 'TEAM 1' : 'TEAM 2'"
            :class="['w-full bg-transparent border-0 border-b-2 focus:outline-none font-display text-3xl xl:text-4xl uppercase pb-2 transition-colors',
              t === 'amber' ? 'text-amber-team placeholder:text-amber-team/45 border-amber-team/40 focus:border-amber-team' : 'text-sapphire-team placeholder:text-sapphire-team/45 border-sapphire-team/40 focus:border-sapphire-team md:text-right']" />
        </div>
      </template>
    </div>

    <div class="grid lg:grid-cols-[1fr_1.4fr] gap-4">
      <!-- Provider -->
      <div class="card-ornate p-5 space-y-4">
        <h2 class="h-section">Draft provider</h2>
        <div class="space-y-2">
          <label v-for="p in [{ v: 'NATIVE', l: 'Native Draft', d: 'Real-time, synced, stored automatically' }, { v: 'DEADLOCKLABS', l: 'Deadlock Labs', d: 'Link only · results entered manually' }, { v: 'EXTERNAL', l: 'External', d: 'Any URL · results entered manually' }]" :key="p.v"
            :class="['flex items-center gap-3 rounded border p-3 cursor-pointer transition-colors', provider === p.v ? 'border-primary bg-primary/10 shadow-[inset_3px_0_0_#d4a24c]' : 'border-line hover:bg-raised', p.v !== 'NATIVE' && !session.can('MODERATOR') && 'opacity-50 cursor-not-allowed']">
            <input v-model="provider" type="radio" :value="p.v" class="sr-only" :disabled="p.v !== 'NATIVE' && !session.can('MODERATOR')" />
            <span :class="['w-3 h-3 rotate-45 border-2 shrink-0', provider === p.v ? 'bg-primary border-primary' : 'border-line']" />
            <div><div class="font-display uppercase tracking-wide">{{ p.l }}</div><div class="text-xs text-muted mt-0.5">{{ p.d }}</div></div>
          </label>
        </div>
        <div v-if="provider !== 'NATIVE'" class="space-y-2">
          <label class="label" for="xurl">Draft room URL</label>
          <input id="xurl" v-model="externalUrl" class="input" type="url" required :placeholder="provider === 'DEADLOCKLABS' ? 'https://deadlocklabs.gg/draft-pick/…' : 'https://…'" />
          <p class="text-xs text-muted flex items-start gap-1"><ExternalLink class="w-3 h-3 mt-0.5 shrink-0" />External drafts are not synchronized automatically — no supported API exists. A moderator imports final picks/bans after the draft.</p>
        </div>
        <div v-if="provider === 'NATIVE'"><label class="label" for="n">Draft name</label><input id="n" v-model="f.name" class="input" required maxlength="64" /></div>
        <div><span class="label">Format</span>
          <div class="grid grid-cols-3 gap-1.5">
            <button v-for="x in ['6v6', '4v4', '2v2']" :key="x" type="button" :class="['h-11 rounded border font-display text-xl transition-colors', f.format === x ? 'border-primary bg-primary text-bg' : 'border-line text-muted hover:text-text hover:border-primary/40']" @click="f.format = x">{{ x }}</button>
          </div>
        </div>
      </div>

      <!-- Rules -->
      <div v-if="provider === 'NATIVE'" class="card-ornate p-5 space-y-4">
        <h2 class="h-section">Rules</h2>
        <div class="grid sm:grid-cols-2 gap-4">
          <div><span class="label">Bans per team</span>
            <div class="flex flex-wrap gap-1">
              <button v-for="n in [0, 1, 2, 3, 4, 5, 6]" :key="n" type="button" :class="['w-9 h-9 rounded border font-mono text-sm font-bold', f.bansPerTeam === n ? 'border-danger bg-danger/20 text-text' : 'border-line text-muted hover:text-text']" @click="f.bansPerTeam = n">{{ n === 0 ? '–' : n }}</button>
            </div></div>
          <div><span class="label">Timer</span>
            <div class="flex flex-wrap gap-1">
              <button v-for="t in [0, 30, 45, 60, 90]" :key="t" type="button" :class="['px-2.5 h-9 rounded border font-mono text-sm font-bold', f.timerSeconds === t ? 'border-primary bg-primary/20 text-text' : 'border-line text-muted hover:text-text']" @click="f.timerSeconds = t">{{ t === 0 ? 'Off' : `${t}s` }}</button>
            </div></div>
          <div><span class="label">First pick/ban</span>
            <div class="grid grid-cols-2 gap-1">
              <button v-for="t in (['amber', 'sapphire'] as const)" :key="t" type="button" :class="['h-9 rounded border font-display uppercase text-sm truncate px-2', f.firstTeam === t ? (t === 'amber' ? 'border-amber-team bg-amber-team/20 text-amber-team' : 'border-sapphire-team bg-sapphire-team/20 text-sapphire-team') : 'border-line text-muted hover:text-text']" @click="f.firstTeam = t">{{ t === 'amber' ? names.amberName : names.sapphireName }}</button>
            </div></div>
          <div v-if="f.bansPerTeam >= 2"><label class="label" for="bp">Ban phases</label><UiSelect id="bp" v-model="f.banPhases" :options="[{ value: 2, label: 'Two phases (bans → picks → bans → picks)' }, { value: 1, label: 'One phase (all bans first)' }]" /></div>
          <div><label class="label" for="to">When a ban timer runs out</label><UiSelect id="to" v-model="f.timeoutBehavior" :options="[{ value: 'skip', label: 'No ban (ban is lost)' }, { value: 'random', label: 'Ban the hero being looked at, else random' }, { value: 'pause', label: 'Pause for a moderator' }]" /></div>
          <template v-if="session.can('MODERATOR')">
          <div><label class="label" for="ac">{{ names.amberName }} captain</label><UiSelect id="ac" v-model="f.amberCaptainId" :options="captainOptions" /></div>
          <div><label class="label" for="sc">{{ names.sapphireName }} captain</label><UiSelect id="sc" v-model="f.sapphireCaptainId" :options="captainOptions" /></div>
          </template>
          <div><label class="label" for="vis">Visibility</label><UiSelect id="vis" v-model="f.visibility" :options="[{ value: 'public', label: 'Public — anyone can spectate' }, { value: 'private', label: 'Private — logged-in members only' }]" /></div>
          <label class="flex items-center gap-2 text-sm sm:col-span-2"><input v-model="f.allowMirrorPicks" type="checkbox" class="accent-[#d4a24c]" />Allow both teams to pick the same hero</label>
        </div>
      </div>
    </div>

    <div v-if="provider === 'NATIVE'" class="card p-5 space-y-2"><h2 class="h-section">Draft order</h2>
      <OrderTimeline :sequence="orderPreview" :team-names="{ amber: names.amberName, sapphire: names.sapphireName }" />
      <p class="text-xs text-muted">After creating, share the code or link. Captains take a seat and ready up; players join a team so their captain can assign them a hero.</p>
    </div>
    <p v-if="err" class="text-sm text-danger" role="alert">{{ err }}</p>
    <div class="flex justify-end items-center gap-3"><RouterLink to="/drafts" class="btn-ghost">Cancel</RouterLink><button class="btn-draft !h-12 !px-8 !text-lg" :disabled="busy"><Swords class="w-5 h-5" />Create lobby</button></div>
  </form>
</template>
