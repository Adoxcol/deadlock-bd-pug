<script setup lang="ts">
import UiSelect from '../components/UiSelect.vue';
import { ref } from 'vue';
import { useRouter } from 'vue-router';
import { FlaskConical, MessageCircle } from 'lucide-vue-next';
import Logo from '../components/Logo.vue';
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
  <div class="max-w-md mx-auto pt-10 space-y-5">
    <div class="flex justify-center"><Logo /></div>
    <section class="card-ornate p-6 space-y-4 text-center">
      <div class="font-mono text-[11px] font-bold uppercase tracking-[0.3em] text-muted">Welcome back</div>
      <h1 class="text-3xl leading-none">Log in</h1>
      <div class="rule-brass w-40 mx-auto" />
      <p class="text-sm text-muted">Sign in with the Discord account you use in the community server. You can link Steam from your profile afterwards.</p>
      <a href="/api/auth/discord" :class="['btn-primary w-full !h-11', !session.me?.discordEnabled && 'pointer-events-none opacity-50']"><MessageCircle class="w-4 h-4" />Continue with Discord</a>
      <p v-if="!session.me?.discordEnabled" class="text-xs text-warn">Discord login is not configured on this server.</p>
    </section>
    <section v-if="session.me?.simulationMode" class="card p-5 space-y-3 border-warn/40">
      <h2 class="text-sm flex items-center gap-2 text-warn"><FlaskConical class="w-4 h-4" />Development login</h2>
      <p class="text-xs text-muted">Simulation mode only. Creates a user marked as simulated; its results never affect real ratings.</p>
      <div><label class="label" for="dn">Display name</label><input id="dn" v-model="name" class="input" /></div>
      <div><span class="label">Role</span><UiSelect id="dr" v-model="role" aria-label="Role" :options="['SPECTATOR','PLAYER','CAPTAIN','MODERATOR','ADMIN','OWNER'].map((r) => ({ value: r as Role, label: r }))" /></div>
      <button class="btn-ghost w-full" @click="devLogin">Sign in as simulated user</button>
      <p v-if="err" class="text-xs text-danger">{{ err }}</p>
    </section>
  </div>
</template>
