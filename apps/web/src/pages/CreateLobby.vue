<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';
import PageState from '../components/PageState.vue';

const router = useRouter();
const error = ref<string | null>(null);
// Replacing keeps the back button from landing here and creating a second lobby.
onMounted(async () => {
  try { const r = await api<{ id: string }>('/pugs', { method: 'POST', body: {} }); await router.replace(`/pugs/${r.id}`); }
  catch (e) { error.value = (e as Error).message; }
});
</script>

<template>
  <PageState :loading="!error" :error="error" />
</template>
