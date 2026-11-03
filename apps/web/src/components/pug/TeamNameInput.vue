<script setup lang="ts">
import { ref, watch } from 'vue';

const props = defineProps<{ value: string; placeholder: string; label: string }>();
const emit = defineEmits<{ save: [string] }>();
const draft = ref(props.value);
const focused = ref(false);
// The room polls every two seconds; don't overwrite what the captain is typing.
watch(() => props.value, (v) => { if (!focused.value) draft.value = v; });
function commit() { focused.value = false; if (draft.value.trim() !== props.value) emit('save', draft.value.trim()); }
</script>

<template>
  <input v-model="draft" maxlength="32" autocomplete="off" :aria-label="label" :placeholder="placeholder" class="w-full bg-transparent border-0 border-b-2 border-primary/40 focus:border-primary focus:outline-none font-display text-lg uppercase text-primary placeholder:text-primary/50 pb-1 transition-colors"
    @focus="focused = true" @blur="commit" @keydown.enter.prevent="($event.target as HTMLInputElement).blur()" />
</template>
