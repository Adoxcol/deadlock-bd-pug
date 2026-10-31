<script setup lang="ts">
import UiSelect from '../components/UiSelect.vue';
import { reactive, ref } from 'vue';
import { Crosshair, Info, ArrowRight } from 'lucide-vue-next';
import { api } from '../lib/api';
import StatusBadge from '../components/StatusBadge.vue';
import PageHeader from '../components/PageHeader.vue';
import { useSession } from '../stores/session';
const session = useSession();
const f = reactive({ identifier: '', type: 'auto', pugId: '', draftId: '' });
const busy = ref(false);
const err = ref<string | null>(null);
const out = ref<any>(null);
async function track() {
  busy.value = true; err.value = null; out.value = null;
  try { out.value = await api('/tracker/resolve', { method: 'POST', body: { identifier: f.identifier, type: f.type, pugId: f.pugId || undefined, draftId: f.draftId || undefined } }); }
  catch (e) { err.value = (e as Error).message; } finally { busy.value = false; }
}
</script>
<template>
  <div class="max-w-3xl mx-auto space-y-5">
    <PageHeader eyebrow="Moderator tool" title="Track a match" subtitle="Link a Deadlock match to a PUG or draft when it wasn't created through the website." />
    <div v-if="!session.can('MODERATOR')" class="card-ornate p-4 text-sm text-muted">Moderators only.</div>
    <form v-else class="card-ornate p-5 space-y-4" @submit.prevent="track">
      <div class="grid sm:grid-cols-[1fr_200px] gap-4">
        <div><label class="label" for="id">Identifier</label><input id="id" v-model="f.identifier" class="input font-mono text-base tracking-wider" required maxlength="40" placeholder="Match ID, party ID or lobby ID" /></div>
        <div><span class="label">Identifier type</span><UiSelect id="t" v-model="f.type" aria-label="Identifier type" :options="[{ value: 'auto', label: 'Auto-detect' }, { value: 'match', label: 'Match ID' }, { value: 'party', label: 'Party ID' }, { value: 'lobby', label: 'Lobby ID' }]" /></div>
        <div><label class="label" for="p">PUG ID (optional)</label><input id="p" v-model="f.pugId" class="input font-mono" /></div>
        <div><label class="label" for="d">Draft ID (optional)</label><input id="d" v-model="f.draftId" class="input font-mono" /></div>
      </div>
      <div class="flex justify-end"><button class="btn-primary" :disabled="busy"><Crosshair class="w-4 h-4" />Track match</button></div>
    </form>
    <p v-if="err" class="text-sm text-danger" role="alert">{{ err }}</p>
    <section v-if="out" class="card-ornate p-5 space-y-3 animate-fade-up">
      <div class="flex items-center gap-3"><StatusBadge :status="out.match?.trackingState ?? out.resolution.state" /><span class="font-display uppercase tracking-wide">{{ (out.match?.trackingState ?? out.resolution.state).replace(/_/g, ' ').toLowerCase() }}</span></div>
      <p class="text-sm text-muted">{{ out.match?.trackingNote ?? out.resolution.explanation }}</p>
      <dl class="grid grid-cols-2 gap-3">
        <div class="card px-3 py-2"><dt class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Match ID</dt><dd class="font-mono">{{ out.resolution.matchId ?? '—' }}</dd></div>
        <div class="card px-3 py-2"><dt class="font-mono text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Party ID</dt><dd class="font-mono truncate">{{ out.resolution.partyId ?? '—' }}</dd></div>
      </dl>
      <RouterLink v-if="out.match" :to="`/matches/${out.match.id}/live`" class="btn-primary">Open live dashboard<ArrowRight class="w-4 h-4" /></RouterLink>
      <p v-else class="text-sm">Enter the Match ID (shown in-game and in match history) with type “Match ID”.</p>
    </section>
    <aside class="card p-4 text-xs text-muted space-y-1.5">
      <p class="flex items-center gap-1.5 font-display uppercase tracking-wide text-sm text-text"><Info class="w-4 h-4 text-primary" />Which identifier?</p>
      <p><b class="text-text">Match ID</b> — works best. Needed for live stats and results.</p>
      <p><b class="text-text">Party ID</b> — only resolves for lobbies created through the Deadlock API bot (the “Create Deadlock lobby” button on a finished draft does this for you).</p>
      <p><b class="text-text">Lobby ID / party code</b> — no public API can look these up; you'll be asked for the Match ID.</p>
    </aside>
  </div>
</template>
