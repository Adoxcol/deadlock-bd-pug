<script setup lang="ts">
import { onUnmounted, reactive, ref, watch } from 'vue';
import UiSelect from '../UiSelect.vue';
import { api } from '../../lib/api';

export type LobbyRules = { bansPerTeam: number; timerSeconds: number; timeoutBehavior: string; banPhases: 1 | 2; allowMirrorPicks: boolean; visibility: string };
const props = defineProps<{ id: string; number: number; name: string | null; format: string; settings: LobbyRules }>();
const emit = defineEmits<{ saved: [] }>();
const f = reactive({ name: props.name ?? '', format: props.format, ...props.settings });
const status = ref<'idle' | 'saving' | 'saved'>('idle');
const err = ref<string | null>(null);
async function save() {
  status.value = 'saving'; err.value = null;
  try {
    const { name, format, ...rules } = f;
    await api(`/pugs/${props.id}`, { method: 'PATCH', body: { name: name.trim(), format, settings: { ...rules, banPhases: rules.bansPerTeam >= 2 ? rules.banPhases : 1 } } });
    status.value = 'saved'; emit('saved');
  } catch (e) {
    err.value = (e as Error).message; status.value = 'idle';
    // A refused format goes back to what the room is really using.
    f.format = props.format;
  }
}
// Every change saves itself; the short wait keeps typing a name to one request.
let timer: ReturnType<typeof setTimeout>;
watch(f, () => { clearTimeout(timer); timer = setTimeout(save, 500); });
onUnmounted(() => clearTimeout(timer));
</script>

<template>
  <form class="card-ornate p-4 space-y-3" aria-label="Lobby settings" @submit.prevent>
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h2 class="h-section">Lobby settings</h2>
      <p v-if="err" role="alert" class="text-danger text-xs">{{ err }}</p>
      <p v-else role="status" class="font-mono text-[10px] uppercase tracking-wider text-muted">{{ status === 'saving' ? 'Saving…' : status === 'saved' ? 'Saved' : 'Changes save automatically' }}</p>
    </div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-x-5 gap-y-3 items-end">
      <div class="min-w-0"><label class="label" for="lname">Lobby name</label><input id="lname" v-model="f.name" class="w-full h-9 bg-transparent border-0 border-b-2 border-line focus:border-primary focus:outline-none font-display text-xl uppercase text-text placeholder:text-muted/50 transition-colors" maxlength="48" :placeholder="`PUG #${number}`" autocomplete="off" /></div>
      <div><span class="label">Format</span>
        <div class="flex gap-1">
          <button v-for="x in ['6v6', '4v4', '2v2']" :key="x" type="button" :aria-pressed="f.format === x" :class="['h-9 px-2.5 rounded border font-display transition-colors', f.format === x ? 'border-primary bg-primary text-bg' : 'border-line text-muted hover:text-text hover:border-primary/40']" @click="f.format = x">{{ x }}</button>
        </div>
      </div>
      <div><span class="label">Bans per team</span>
        <div class="flex flex-wrap gap-1">
          <button v-for="n in [0, 1, 2, 3, 4, 5, 6]" :key="n" type="button" :aria-pressed="f.bansPerTeam === n" :class="['w-8 h-9 rounded border font-mono text-sm font-bold', f.bansPerTeam === n ? 'border-danger bg-danger/20 text-text' : 'border-line text-muted hover:text-text']" @click="f.bansPerTeam = n">{{ n === 0 ? '–' : n }}</button>
        </div></div>
      <div><span class="label">Timer</span>
        <div class="flex flex-wrap gap-1">
          <button v-for="t in [0, 30, 45, 60, 90]" :key="t" type="button" :aria-pressed="f.timerSeconds === t" :class="['px-2 h-9 rounded border font-mono text-sm font-bold', f.timerSeconds === t ? 'border-primary bg-primary/20 text-text' : 'border-line text-muted hover:text-text']" @click="f.timerSeconds = t">{{ t === 0 ? 'Off' : `${t}s` }}</button>
        </div></div>
    </div>
    <div class="grid sm:grid-cols-2 lg:grid-cols-4 gap-x-5 gap-y-3 items-end">
      <div v-if="f.bansPerTeam >= 2"><label class="label" for="bp">Ban phases</label><UiSelect id="bp" v-model="f.banPhases" :options="[{ value: 2, label: 'Bans, picks, bans, picks' }, { value: 1, label: 'All bans first' }]" /></div>
      <div><label class="label" for="to">Ban timer runs out</label><UiSelect id="to" v-model="f.timeoutBehavior" :options="[{ value: 'skip', label: 'Ban is lost' }, { value: 'random', label: 'Hovered hero, else random' }, { value: 'pause', label: 'Pause for a moderator' }]" /></div>
      <div><label class="label" for="vis">Visibility</label><UiSelect id="vis" v-model="f.visibility" :options="[{ value: 'public', label: 'Public' }, { value: 'private', label: 'Logged-in members only' }]" /></div>
      <div><span class="label">Mirror picks</span>
        <div class="flex gap-1">
          <button v-for="o in [{ v: false, l: 'Off' }, { v: true, l: 'On' }]" :key="o.l" type="button" :aria-pressed="f.allowMirrorPicks === o.v" title="Both teams may pick the same hero" :class="['px-3 h-9 rounded border font-mono text-sm font-bold', f.allowMirrorPicks === o.v ? 'border-primary bg-primary/20 text-text' : 'border-line text-muted hover:text-text']" @click="f.allowMirrorPicks = o.v">{{ o.l }}</button>
        </div></div>
    </div>
  </form>
</template>
