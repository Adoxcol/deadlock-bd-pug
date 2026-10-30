<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { useRouter } from 'vue-router';
import { Swords, ExternalLink } from 'lucide-vue-next';
import { api } from '../lib/api';
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
  timeoutBehavior: 'random', allowMirrorPicks: false, firstTeam: 'amber', amberCaptainId: '' as string, sapphireCaptainId: '' as string, visibility: 'public',
});
onMounted(async () => { try { users.value = await api('/users'); if (!session.can('MODERATOR') && session.user) f.amberCaptainId = session.user.id; } catch (e) { err.value = (e as Error).message; } });
const orderPreview = computed(() => {
  const size = { '6v6': 6, '4v4': 4, '2v2': 2 }[f.format as '6v6']!; const first = f.firstTeam, other = first === 'amber' ? 'sapphire' : 'amber';
  const out: string[] = [];
  for (let i = 0; i < f.bansPerTeam * 2; i++) out.push(`${i % 2 ? other[0] : first[0]}B`.toUpperCase());
  for (let i = 0; i < size * 2; i++) out.push(`${Math.floor((i + 1) / 2) % 2 ? other[0] : first[0]}P`.toUpperCase());
  return out;
});
async function submit() {
  busy.value = true; err.value = null;
  try {
    if (provider.value === 'NATIVE') {
      const r = await api<{ id: string }>('/drafts', { method: 'POST', body: { ...f, amberCaptainId: f.amberCaptainId || null, sapphireCaptainId: f.sapphireCaptainId || null } });
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
    <h1 class="text-2xl font-semibold tracking-tight">Create draft</h1>
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
          <div><label class="label" for="bans">Bans per team</label><input id="bans" v-model.number="f.bansPerTeam" type="number" min="0" max="6" class="input" /></div>
          <div><label class="label" for="tm">Turn timer</label><select id="tm" v-model.number="f.timerSeconds" class="input"><option :value="0">Disabled</option><option v-for="t in [30, 45, 60, 90]" :key="t" :value="t">{{ t }} seconds</option></select></div>
          <div><label class="label" for="to">On timeout</label><select id="to" v-model="f.timeoutBehavior" class="input"><option value="random">Random available hero</option><option value="skip">Skip ban (picks still random)</option><option value="pause">Pause for moderator</option></select></div>
          <div><label class="label" for="ac">Amber captain</label><select id="ac" v-model="f.amberCaptainId" class="input"><option value="">Unassigned</option><option v-for="u in users" :key="u.id" :value="u.id">{{ u.displayName }}</option></select></div>
          <div><label class="label" for="sc">Sapphire captain</label><select id="sc" v-model="f.sapphireCaptainId" class="input"><option value="">Unassigned</option><option v-for="u in users" :key="u.id" :value="u.id">{{ u.displayName }}</option></select></div>
          <div><label class="label" for="ft">First pick/ban</label><select id="ft" v-model="f.firstTeam" class="input"><option value="amber">Amber</option><option value="sapphire">Sapphire</option></select></div>
          <div><label class="label" for="vis">Visibility</label><select id="vis" v-model="f.visibility" class="input"><option value="public">Public — anyone can spectate</option><option value="private">Private — logged-in members only</option></select></div>
          <label class="flex items-center gap-2 text-sm sm:col-span-2"><input v-model="f.allowMirrorPicks" type="checkbox" class="accent-[#a78bfa]" />Allow both teams to pick the same hero</label>
        </template>
      </div>
      <div v-if="provider === 'NATIVE'"><span class="label">Order preview (B = ban, P = pick; snake order)</span>
        <div class="flex flex-wrap gap-1">
          <span v-for="(o, i) in orderPreview" :key="i" :class="['text-[11px] font-semibold rounded px-1.5 py-0.5 border', o[0] === 'A' ? 'text-amber-team border-amber-team/40' : 'text-sapphire-team border-sapphire-team/40', o[1] === 'B' && 'line-through decoration-danger']">{{ o }}</span>
        </div>
      </div>
    </div>
    <p v-if="err" class="text-sm text-danger" role="alert">{{ err }}</p>
    <div class="flex justify-end gap-2"><RouterLink to="/drafts" class="btn-ghost">Cancel</RouterLink><button class="btn-draft" :disabled="busy"><Swords class="w-4 h-4" />Create</button></div>
  </form>
</template>
