<script setup lang="ts">
import { computed, ref } from 'vue';
import { Check, Copy, Crown, Eye, Users } from 'lucide-vue-next';

const props = defineProps<{ code: string; invites: { captainA: string; captainB: string; player: string } }>();
const copied = ref<string | null>(null);
const base = computed(() => `${window.location.origin}/pugs/${props.code}`);
const rows = computed(() => [
  { key: 'captainA', label: 'Captain A', note: 'Takes the first seat', icon: Crown, url: `${base.value}?k=${props.invites.captainA}` },
  { key: 'captainB', label: 'Captain B', note: 'Takes the second seat', icon: Crown, url: `${base.value}?k=${props.invites.captainB}` },
  { key: 'player', label: 'Players', note: 'Fills the player pool', icon: Users, url: `${base.value}?k=${props.invites.player}` },
  { key: 'viewer', label: 'Viewers', note: 'Watch only', icon: Eye, url: base.value },
]);
let timer: ReturnType<typeof setTimeout>;
async function copy(key: string, url: string) {
  await navigator.clipboard?.writeText(url).catch(() => {});
  copied.value = key;
  clearTimeout(timer); timer = setTimeout(() => (copied.value = null), 1600);
}
</script>

<template>
  <section class="card-ornate p-4 sm:p-5 space-y-3" aria-label="Invite links">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="h-section">Invite links</h2>
      <p class="text-xs text-muted">Only you can see these. Send each one to the right people.</p>
    </div>
    <ul class="divide-y divide-line/60">
      <li v-for="r in rows" :key="r.key" class="grid grid-cols-[minmax(0,1fr)_auto] sm:grid-cols-[10rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 py-2.5">
        <div class="flex items-center gap-2.5 min-w-0">
          <component :is="r.icon" class="w-4 h-4 shrink-0 text-primary" />
          <div class="min-w-0 leading-tight">
            <div class="font-display text-sm uppercase">{{ r.label }}</div>
            <div class="font-mono text-[10px] uppercase tracking-wider text-muted truncate">{{ r.note }}</div>
          </div>
        </div>
        <input :value="r.url" readonly :aria-label="`${r.label} invite link`" class="input !h-9 font-mono text-xs col-span-2 row-start-2 sm:col-span-1 sm:row-start-auto" @focus="($event.target as HTMLInputElement).select()" />
        <button type="button" :class="['btn-ghost !h-9 w-24 col-start-2 row-start-1 sm:col-start-auto sm:row-start-auto', copied === r.key && '!border-accent/60 text-accent']" :aria-label="`Copy ${r.label} link`" @click="copy(r.key, r.url)">
          <component :is="copied === r.key ? Check : Copy" class="w-3.5 h-3.5" />{{ copied === r.key ? 'Copied' : 'Copy' }}
        </button>
      </li>
    </ul>
  </section>
</template>
