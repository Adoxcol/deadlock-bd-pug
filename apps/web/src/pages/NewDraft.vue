<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Swords, ExternalLink } from 'lucide-vue-next';
import { api } from '../lib/api';
import OrderTimeline from '../components/draft/OrderTimeline.vue';
import { useSession } from '../stores/session';

const router = useRouter();
const session = useSession();
const users = ref<Array<{ id: string; displayName: string }>>([]);
const err = ref<string | null>(null);
const busy = ref(false);
const provider = ref<'NATIVE' | 'DEADLOCKLABS' | 'EXTERNAL'>('NATIVE');
const externalUrl = ref('');
const f = reactive({
  name: 'PUG Draft', amberName: 'Team Amber', sapphireName: 'Team Sapphire', format: '6v6', bansPerTeam: 2, timerSeconds: 30,
  timeoutBehavior: 'skip', banPhases: 2 as 1 | 2, allowMirrorPicks: false, firstTeam: 'amber', amberCaptainId: '' as string, sapphireCaptainId: '' as string, visibility: 'public',
});
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
async function submit() {
  busy.value = true; err.value = null;
  try {
    if (provider.value === 'NATIVE') {
      const r = await api<{ id: string }>('/drafts', { method: 'POST', body: { ...f, banPhases: f.banPhases, amberCaptainId: f.amberCaptainId || null, sapphireCaptainId: f.sapphireCaptainId || null } });
      router.push(`/draft/${r.id}`);
    } else {
      await api('/pugs', { method: 'POST', body: { format: f.format, draftProvider: provider.value, amberName: f.amberName, sapphireName: f.sapphireName, externalUrl: externalUrl.value } });
      router.push('/');
    }
  } catch (e) { err.value = (e as Error).message; } finally { busy.value = false; }
}
</script>
<template>
  <form class="max-w-3xl mx-auto space-y-4" @submit.prevent="submit">
    <h1 class="text-2xl font-semibold tracking-tight">Create lobby</h1>
    <div class="card p-5 space-y-4">
      <div><span class="label">Draft provider</span>
        <div class="grid sm:grid-cols-3 gap-2">
          <label v-for="p in [{ v: 'NATIVE', l: 'Native Draft', d: 'Real-time, synced, stored automatically' }, { v: 'DEADLOCKLABS', l: 'Deadlock Labs', d: 'Link only · results entered manually' }, { v: 'EXTERNAL', l: 'External', d: 'Any URL · results entered manually' }]" :key="p.v"
            :class="['rounded-lg border p-3 cursor-pointer', provider === p.v ? 'border-draft bg-draft/10' : 'border-line hover:bg-raised']">
            <input v-model="provider" type="radio" :value="p.v" class="sr-only" :disabled="p.v !== 'NATIVE' && !session.can('MODERATOR')" />
            <div class="text-sm font-medium">{{ p.l }}</div><div class="text-xs text-muted mt-0.5">{{ p.d }}</div>
          </label>
        </div>
      </div>
      <div v-if="provider !== 'NATIVE'" class="space-y-2">
        <label class="label" for="xurl">Draft room URL</label>
        <input id="xurl" v-model="externalUrl" class="input" type="url" required :placeholder="provider === 'DEADLOCKLABS' ? 'https://deadlocklabs.gg/draft-pick/…' : 'https://…'" />
        <p class="text-xs text-muted flex items-center gap-1"><ExternalLink class="w-3 h-3" />External drafts are not synchronized automatically — no supported API exists. A moderator imports final picks/bans after the draft.</p>
      </div>
      <div class="grid sm:grid-cols-2 gap-4">
        <div v-if="provider === 'NATIVE'" class="sm:col-span-2"><label class="label" for="n">Draft name</label><input id="n" v-model="f.name" class="input" required maxlength="64" /></div>
        <div><label class="label" for="an">Amber team name</label><input id="an" v-model="f.amberName" class="input" maxlength="32" /></div>
        <div><label class="label" for="sn">Sapphire team name</label><input id="sn" v-model="f.sapphireName" class="input" maxlength="32" /></div>
        <div><label class="label" for="fmt">Format</label><select id="fmt" v-model="f.format" class="input"><option>6v6</option><option>4v4</option><option>2v2</option></select></div>
        <template v-if="provider === 'NATIVE'">
          <div class="sm:col-span-2"><span class="label">Bans per team</span>
            <div class="flex flex-wrap rounded-lg border border-line overflow-hidden w-fit">
              <button v-for="n in [0, 1, 2, 3, 4, 5, 6]" :key="n" type="button" :class="['w-11 h-9 text-sm', f.bansPerTeam === n ? 'bg-raised text-text' : 'text-muted hover:text-text']" @click="f.bansPerTeam = n">{{ n === 0 ? 'Off' : n }}</button>
            </div></div>
          <div class="sm:col-span-2"><span class="label">Timer</span>
            <div class="flex flex-wrap rounded-lg border border-line overflow-hidden w-fit">
              <button v-for="t in [0, 30, 45, 60, 90]" :key="t" type="button" :class="['px-3 h-9 text-sm', f.timerSeconds === t ? 'bg-raised text-text' : 'text-muted hover:text-text']" @click="f.timerSeconds = t">{{ t === 0 ? 'Off' : `${t}s` }}</button>
            </div></div>
          <div v-if="f.bansPerTeam >= 2"><label class="label" for="bp">Ban phases</label><select id="bp" v-model.number="f.banPhases" class="input"><option :value="2">Two phases (bans → picks → bans → picks)</option><option :value="1">One phase (all bans first)</option></select></div>
          <div><label class="label" for="to">When a ban timer runs out</label><select id="to" v-model="f.timeoutBehavior" class="input"><option value="skip">No ban (ban is lost)</option><option value="random">Ban the hero being looked at, else random</option><option value="pause">Pause for a moderator</option></select></div>
          <template v-if="session.can('MODERATOR')">
          <div><label class="label" for="ac">Amber captain (optional)</label><select id="ac" v-model="f.amberCaptainId" class="input"><option value="">Open seat</option><option v-for="u in users" :key="u.id" :value="u.id">{{ u.displayName }}</option></select></div>
          <div><label class="label" for="sc">Sapphire captain (optional)</label><select id="sc" v-model="f.sapphireCaptainId" class="input"><option value="">Unassigned</option><option v-for="u in users" :key="u.id" :value="u.id">{{ u.displayName }}</option></select></div>
          </template>
          <div><label class="label" for="ft">First pick/ban</label><select id="ft" v-model="f.firstTeam" class="input"><option value="amber">Amber</option><option value="sapphire">Sapphire</option></select></div>
          <div><label class="label" for="vis">Visibility</label><select id="vis" v-model="f.visibility" class="input"><option value="public">Public — anyone can spectate</option><option value="private">Private — logged-in members only</option></select></div>
          <label class="flex items-center gap-2 text-sm sm:col-span-2"><input v-model="f.allowMirrorPicks" type="checkbox" class="accent-[#a78bfa]" />Allow both teams to pick the same hero</label>
        </template>
      </div>
      <div v-if="provider === 'NATIVE'"><span class="label">Draft order</span>
        <OrderTimeline :sequence="orderPreview" :team-names="{ amber: f.amberName || 'Amber', sapphire: f.sapphireName || 'Sapphire' }" />
        <p class="text-xs text-muted mt-2">After creating, share the code or link. Captains take a seat and ready up; players join a team so their captain can assign them a hero.</p>
      </div>
    </div>
    <p v-if="err" class="text-sm text-danger" role="alert">{{ err }}</p>
    <div class="flex justify-end gap-2"><RouterLink to="/drafts" class="btn-ghost">Cancel</RouterLink><button class="btn-draft" :disabled="busy"><Swords class="w-4 h-4" />Create lobby</button></div>
  </form>
</template>
