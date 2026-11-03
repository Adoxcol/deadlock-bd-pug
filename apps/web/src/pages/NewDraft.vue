<script setup lang="ts">
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { ExternalLink } from 'lucide-vue-next';
import { api } from '../lib/api';
import PageHeader from '../components/PageHeader.vue';

const router = useRouter();
const err = ref<string | null>(null);
const busy = ref(false);
const provider = ref<'DEADLOCKLABS' | 'EXTERNAL'>('DEADLOCKLABS');
const externalUrl = ref('');
const name = ref('');
const format = ref('6v6');
async function submit() {
  busy.value = true; err.value = null;
  try {
    await api('/pugs', { method: 'POST', body: { name: name.value.trim(), format: format.value, draftProvider: provider.value, externalUrl: externalUrl.value } });
    router.push('/');
  } catch (e) { err.value = (e as Error).message; } finally { busy.value = false; }
}
</script>
<template>
  <form class="max-w-2xl mx-auto space-y-5" @submit.prevent="submit">
    <PageHeader eyebrow="Moderators" title="Link external draft" subtitle="Run the draft elsewhere and enter the result here afterwards." />
    <div class="card-ornate p-5 space-y-4">
      <div class="space-y-2">
        <label v-for="p in [{ v: 'DEADLOCKLABS', l: 'Deadlock Labs', d: 'Link only · results entered manually' }, { v: 'EXTERNAL', l: 'External', d: 'Any URL · results entered manually' }]" :key="p.v"
          :class="['flex items-center gap-3 rounded border p-3 cursor-pointer transition-colors', provider === p.v ? 'border-primary bg-primary/10 shadow-[inset_3px_0_0_#d4a24c]' : 'border-line hover:bg-raised']">
          <input v-model="provider" type="radio" :value="p.v" class="sr-only" />
          <span :class="['w-3 h-3 rotate-45 border-2 shrink-0', provider === p.v ? 'bg-primary border-primary' : 'border-line']" />
          <div><div class="font-display uppercase tracking-wide">{{ p.l }}</div><div class="text-xs text-muted mt-0.5">{{ p.d }}</div></div>
        </label>
      </div>
      <div><label class="label" for="pn">Name <span class="normal-case tracking-normal font-normal">· optional</span></label><input id="pn" v-model="name" class="input" maxlength="48" /></div>
      <div class="space-y-2">
        <label class="label" for="xurl">Draft room URL</label>
        <input id="xurl" v-model="externalUrl" class="input" type="url" required :placeholder="provider === 'DEADLOCKLABS' ? 'https://deadlocklabs.gg/draft-pick/…' : 'https://…'" />
        <p class="text-xs text-muted flex items-start gap-1"><ExternalLink class="w-3 h-3 mt-0.5 shrink-0" />External drafts are not synchronized automatically — no supported API exists. A moderator imports final picks/bans after the draft.</p>
      </div>
      <div><span class="label">Format</span>
        <div class="grid grid-cols-3 gap-1.5">
          <button v-for="x in ['6v6', '4v4', '2v2']" :key="x" type="button" :class="['h-11 rounded border font-display text-xl transition-colors', format === x ? 'border-primary bg-primary text-bg' : 'border-line text-muted hover:text-text hover:border-primary/40']" @click="format = x">{{ x }}</button>
        </div>
      </div>
    </div>
    <p v-if="err" class="text-sm text-danger" role="alert">{{ err }}</p>
    <div class="flex justify-end items-center gap-3"><RouterLink to="/drafts" class="btn-ghost">Cancel</RouterLink><button class="btn-primary" :disabled="busy">Link draft</button></div>
  </form>
</template>
