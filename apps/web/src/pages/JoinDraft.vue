<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { api } from '../lib/api';
import PageState from '../components/PageState.vue';
// Short share links (/d/ABC123) resolve to the newest room with that code, so rematches keep the same link.
const props = defineProps<{ code: string }>();
const router = useRouter();
const error = ref<string | null>(null);
onMounted(async () => {
  try { const r = await api<{ id: string }>(`/drafts/code/${encodeURIComponent(props.code)}`); router.replace(`/draft/${r.id}`); }
  catch (e) { error.value = (e as Error).message; }
});
</script>
<template>
  <PageState :loading="!error" :error="error" />
  <div v-if="error" class="text-center"><RouterLink to="/drafts" class="btn-ghost">Enter another code</RouterLink></div>
</template>
