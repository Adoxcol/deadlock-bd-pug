<script setup lang="ts">
import UiSelect from '../components/UiSelect.vue';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { FlaskConical } from 'lucide-vue-next';
import { api } from '../lib/api';
import { useSession, type Role } from '../stores/session';
const session = useSession();
const router = useRouter();
const name = ref('Moderator');
const role = ref<Role>('OWNER');
const err = ref<string | null>(null);
async function devLogin() {
  try { await api('/dev/login', { method: 'POST', body: { name: name.value, role: role.value } }); await session.load(); router.push('/'); }
  catch (e) { err.value = (e as Error).message; }
}
</script>
<template>
  <div class="max-w-sm mx-auto mt-12 space-y-4">
    <div class="card p-6 space-y-4">
      <h1 class="text-xl font-semibold">Log in</h1>
      <p class="text-sm text-muted">Sign in with the Discord account you use in the community server. You can link Steam from your profile afterwards.</p>
      <a href="/api/auth/discord" class="btn w-full bg-[#5865F2] text-white hover:bg-[#4752c4]" :class="!session.me?.discordEnabled && 'pointer-events-none opacity-50'">Continue with Discord</a>
      <p v-if="!session.me?.discordEnabled" class="text-xs text-warn">Discord OAuth is not configured on this server.</p>
    </div>
    <div v-if="session.me?.simulationMode" class="card p-6 space-y-3 border-warn/40">
      <h2 class="text-sm font-semibold flex items-center gap-2 text-warn"><FlaskConical class="w-4 h-4" />Development login</h2>
      <p class="text-xs text-muted">Simulation mode only. Creates a simulated user flagged as such; its data never affects real ratings.</p>
      <div><label class="label" for="dn">Display name</label><input id="dn" v-model="name" class="input" /></div>
      <div><label class="label" for="dr">Role</label>
        <UiSelect id="dr" v-model="role" :options="['SPECTATOR','PLAYER','CAPTAIN','MODERATOR','ADMIN','OWNER'].map((r) => ({ value: r, label: r }))" /></div>
      <button class="btn-ghost w-full" @click="devLogin">Sign in as simulated user</button>
      <p v-if="err" class="text-xs text-danger">{{ err }}</p>
    </div>
  </div>
</template>
