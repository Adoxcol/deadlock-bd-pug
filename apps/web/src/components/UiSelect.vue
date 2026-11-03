<script setup lang="ts" generic="T extends string | number | null">
/** Themed replacement for <select>: brass-trimmed listbox, keyboard navigable, panel teleported so cards never clip it. */
import { computed, nextTick, onBeforeUnmount, ref } from 'vue';
import { Check } from 'lucide-vue-next';

defineOptions({ inheritAttrs: false }); // two roots (button + teleported panel): class/aria go on the button
const props = defineProps<{ modelValue: T; options: Array<{ value: T; label: string }>; id?: string; disabled?: boolean; size?: 'sm' }>();
const emit = defineEmits<{ 'update:modelValue': [T] }>();

const open = ref(false);
const active = ref(0);
const btn = ref<HTMLButtonElement | null>(null);
const panel = ref<HTMLUListElement | null>(null);
const pos = ref({ left: 0, top: 0, width: 0, up: false });
const current = computed(() => props.options.find((o) => o.value === props.modelValue));

/**
 * Position the panel from the button. Opening upward uses the panel's measured height rather than a CSS
 * transform, because the panel's enter animation also animates `transform` and would override it.
 */
function place() {
  const r = btn.value!.getBoundingClientRect();
  const h = panel.value?.offsetHeight ?? 260;
  const up = r.bottom + Math.min(h, 260) > window.innerHeight && r.top > Math.min(h, 260);
  let left = r.left;
  const w = panel.value?.offsetWidth ?? r.width; // keep long labels inside the window
  if (left + w > window.innerWidth - 8) left = Math.max(8, window.innerWidth - 8 - w);
  pos.value = { left, top: up ? r.top - 6 - h : r.bottom + 6, width: r.width, up };
}
/** Follow the button when anything scrolls (layout shifts, animated pages); close only once it leaves the screen. */
function onScroll(e: Event) {
  if (panel.value?.contains(e.target as Node)) return;
  const r = btn.value?.getBoundingClientRect();
  if (!r || r.bottom < 0 || r.top > window.innerHeight) { close(); return; }
  place();
}
function show() {
  if (props.disabled) return;
  place(); open.value = true;
  active.value = Math.max(0, props.options.findIndex((o) => o.value === props.modelValue));
  nextTick(() => {
    place(); // re-measure now that the panel exists
    panel.value?.children[active.value]?.scrollIntoView({ block: 'nearest' });
  });
  window.addEventListener('pointerdown', outside, true); window.addEventListener('scroll', onScroll, true); window.addEventListener('resize', close);
}
function close() {
  open.value = false;
  window.removeEventListener('pointerdown', outside, true); window.removeEventListener('scroll', onScroll, true); window.removeEventListener('resize', close);
}
function outside(e: Event) { const t = e.target as Node; if (!btn.value?.contains(t) && !panel.value?.contains(t)) close(); }
function choose(i: number) { const o = props.options[i]; if (o) emit('update:modelValue', o.value); close(); btn.value?.focus(); }
function onKey(e: KeyboardEvent) {
  if (!open.value) { if (['Enter', ' ', 'ArrowDown', 'ArrowUp'].includes(e.key)) { e.preventDefault(); show(); } return; }
  if (e.key === 'Escape' || e.key === 'Tab') { close(); return; }
  e.preventDefault();
  if (e.key === 'ArrowDown') active.value = Math.min(props.options.length - 1, active.value + 1);
  else if (e.key === 'ArrowUp') active.value = Math.max(0, active.value - 1);
  else if (e.key === 'Home') active.value = 0;
  else if (e.key === 'End') active.value = props.options.length - 1;
  else if (e.key === 'Enter' || e.key === ' ') { choose(active.value); return; }
  panel.value?.children[active.value]?.scrollIntoView({ block: 'nearest' });
}
onBeforeUnmount(close);
</script>

<template>
  <button v-bind="$attrs" :id="id" ref="btn" type="button" role="combobox" aria-haspopup="listbox" :aria-expanded="open" :disabled="disabled"
    :class="['input flex items-center gap-2 text-left uppercase tracking-wider disabled:opacity-50 disabled:cursor-not-allowed', size === 'sm' && '!h-8 text-xs', open && '!border-primary/70']"
    @click="open ? close() : show()" @keydown="onKey">
    <span class="flex-1 truncate">{{ current?.label ?? '—' }}</span>
    <svg width="10" height="10" viewBox="0 0 12 12" :class="['shrink-0 text-primary transition-transform', open && 'rotate-180']"><path d="M6 9 1.5 3.5h9Z" fill="currentColor" /></svg>
  </button>
  <Teleport to="body">
    <ul v-if="open" ref="panel" role="listbox"
      class="fixed z-[70] max-h-64 overflow-auto py-1 border border-primary/50 bg-surface shadow-[0_18px_40px_-12px_rgba(0,0,0,.9),0_0_0_1px_rgba(0,0,0,.6)] animate-fade-up"
      :style="{ left: pos.left + 'px', top: pos.top + 'px', minWidth: pos.width + 'px' }">
      <li v-for="(o, i) in options" :key="String(o.value)" role="option" :aria-selected="o.value === modelValue"
        :class="['relative flex items-center gap-2 pl-7 pr-3 py-2 font-display text-[13px] uppercase tracking-wider cursor-pointer whitespace-nowrap', i === active ? 'bg-primary/15 text-text' : 'text-text/85',
          o.value === modelValue && 'text-primary']"
        @pointerenter="active = i" @click="choose(i)">
        <span v-if="i === active" class="absolute left-0 top-1 bottom-1 w-0.5 bg-primary" />
        <Check v-if="o.value === modelValue" class="absolute left-2 w-3.5 h-3.5" />{{ o.label }}
      </li>
    </ul>
  </Teleport>
</template>
