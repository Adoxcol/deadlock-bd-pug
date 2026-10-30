<script setup lang="ts">
import { reactive, ref } from 'vue';
import { Crosshair, Info, ArrowRight } from 'lucide-vue-next';
import { api } from '../lib/api';
import StatusBadge from '../components/StatusBadge.vue';
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
  <div class="max-w-3xl mx-auto space-y-4">
    <h1 class="text-2xl font-semibold tracking-tight">Track a Deadlock match</h1>
    <div v-if="!session.can('MODERATOR')" class="card p-4 text-sm text-muted">Moderators only.</div>
    <form v-else class="card p-5 space-y-4" @submit.prevent="track">
      <div class="grid sm:grid-cols-[1fr_180px] gap-3">
        <div><label class="label" for="id">Identifier</label><input id="id" v-model="f.identifier" class="input font-mono" required maxlength="40" placeholder="Match ID, party ID or lobby ID" /></div>
        <div><label class="label" for="t">Identifier type</label><select id="t" v-model="f.type" class="input"><option value="auto">Auto-detect</option><option value="match">Match ID</option><option value="party">Party ID</option><option value="lobby">Lobby ID</option></select></div>
        <div><label class="label" for="p">PUG ID (optional)</label><input id="p" v-model="f.pugId" class="input" /></div>
        <div><label class="label" for="d">Draft ID (optional)</label><input id="d" v-model="f.draftId" class="input" /></div>
      </div>
      <div class="flex justify-end"><button class="btn-primary" :disabled="busy"><Crosshair class="w-4 h-4" />Track match</button></div>
    </form>
    <p v-if="err" class="text-sm text-danger" role="alert">{{ err }}</p>
    <div v-if="out" class="card p-5 space-y-3">
      <div class="flex items-center gap-3"><StatusBadge :status="out.match?.trackingState ?? out.resolution.state" /><span class="text-sm font-medium">{{ (out.match?.trackingState ?? out.resolution.state).replace(/_/g, ' ').toLowerCase() }}</span></div>
      <p class="text-sm text-muted">{{ out.match?.trackingNote ?? out.resolution.explanation }}</p>
      <dl class="text-sm grid grid-cols-2 gap-2"><dt class="text-muted">Match ID</dt><dd class="font-mono">{{ out.resolution.matchId ?? '—' }}</dd><dt class="text-muted">Party ID</dt><dd class="font-mono">{{ out.resolution.partyId ?? '—' }}</dd></dl>
      <RouterLink v-if="out.match" :to="`/matches/${out.match.id}/live`" class="btn-primary">Open live dashboard<ArrowRight class="w-4 h-4" /></RouterLink>
      <p v-else class="text-sm">Enter the Match ID manually (shown in-game / match history) using type “Match ID”.</p>
    </div>
    <div class="card p-4 text-xs text-muted space-y-1.5">
      <p class="flex items-center gap-1.5 text-text font-medium"><Info class="w-4 h-4" />Which identifier?</p>
      <p><b class="text-text">Match ID</b> — works best. Required for live stats and final results.</p>
      <p><b class="text-text">Party ID</b> — only resolves for lobbies created through the Deadlock API bot, after the match starts.</p>
      <p><b class="text-text">Lobby ID / party code</b> — no public API can look these up; you will be asked for the Match ID.</p>
      <p>Live statistics for private custom matches are not yet verified to be available.</p>
    </div>
  </div>
</template>
