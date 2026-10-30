<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { useRoute } from 'vue-router';
import { LayoutDashboard, Swords, Crosshair, Trophy, Shield, LogOut, Menu, X, Wifi, WifiOff, Radio, Plus, MessageCircle } from 'lucide-vue-next';
import { useSession } from './stores/session';
import { realtime } from './lib/ws';
import Logo from './components/Logo.vue';

const session = useSession();
const route = useRoute();
const open = ref(false);
watch(() => route.fullPath, () => (open.value = false));
const bare = computed(() => route.query.broadcast === '1');
const landing = computed(() => route.path === '/' && !session.user);
const nav = computed(() => [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/drafts', label: 'Drafts', icon: Swords },
  { to: '/matches', label: 'Matches', icon: Radio },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/tracker', label: 'Tracker', icon: Crosshair, min: 'MODERATOR' as const },
  { to: '/admin', label: 'Admin', icon: Shield, min: 'MODERATOR' as const },
].filter((n) => !n.min || session.can(n.min)));
const isActive = (to: string) => (to === '/' ? route.path === '/' : route.path.startsWith(to) || (to === '/drafts' && route.path.startsWith('/draft')));
const initial = computed(() => session.user?.displayName.replace('[SIM] ', '').charAt(0).toUpperCase() ?? '?');
</script>

<template>
  <RouterView v-if="bare" />
  <div v-else class="min-h-screen flex flex-col">
    <header class="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div class="h-16 px-4 lg:px-6 flex items-center gap-6">
        <button class="lg:hidden btn-ghost !h-9 !px-2" :aria-label="open ? 'Close menu' : 'Open menu'" @click="open = !open"><component :is="open ? X : Menu" class="w-5 h-5" /></button>
        <RouterLink to="/" aria-label="Home"><Logo /></RouterLink>
        <nav v-if="landing" class="hidden md:flex items-center gap-1 ml-4">
          <RouterLink v-for="n in nav" :key="n.to" :to="n.to" class="h-9 px-3 rounded-lg text-sm text-muted hover:text-text grid place-items-center">{{ n.label }}</RouterLink>
        </nav>
        <div class="ml-auto flex items-center gap-2">
          <span v-if="session.me?.simulationMode" class="hidden xl:inline text-[10px] font-bold uppercase tracking-wide text-warn border border-warn/40 rounded px-1.5 py-0.5">Simulation mode</span>
          <span class="hidden sm:flex items-center gap-1.5 text-xs" :class="realtime.connected.value ? 'text-accent' : 'text-muted'" :title="realtime.connected.value ? 'Realtime connected' : 'Realtime disconnected'">
            <component :is="realtime.connected.value ? Wifi : WifiOff" class="w-3.5 h-3.5" />{{ realtime.connected.value ? 'Connected' : 'Offline' }}
          </span>
          <template v-if="session.user">
            <RouterLink v-if="session.can('PLAYER')" to="/drafts/new" class="btn-primary !h-9 hidden sm:inline-flex"><Plus class="w-4 h-4" />Create lobby</RouterLink>
            <RouterLink :to="`/players/${session.user.id}`" class="flex items-center gap-2 h-10 pl-1 pr-3 rounded-lg hover:bg-raised">
              <span class="w-8 h-8 rounded-full bg-primary/20 border border-primary/40 grid place-items-center text-sm font-bold">{{ initial }}</span>
              <span class="hidden md:block leading-tight text-left"><span class="block text-sm font-semibold max-w-[140px] truncate">{{ session.user.displayName }}</span><span class="block text-[11px] text-muted capitalize">{{ session.user.role.toLowerCase() }}</span></span>
            </RouterLink>
            <button class="btn-ghost !h-9 !px-2" title="Log out" aria-label="Log out" @click="session.logout()"><LogOut class="w-4 h-4" /></button>
          </template>
          <RouterLink v-else to="/login" class="btn-primary"><MessageCircle class="w-4 h-4" />Login with Discord</RouterLink>
        </div>
      </div>
    </header>

    <div class="flex-1 flex">
      <aside v-if="!landing" :class="['fixed lg:sticky top-16 z-20 h-[calc(100vh-4rem)] w-60 shrink-0 border-r border-line bg-bg/95 lg:bg-transparent p-3 transition-transform lg:translate-x-0', open ? 'translate-x-0' : '-translate-x-full']">
        <nav class="flex flex-col gap-1" aria-label="Main">
          <RouterLink v-for="n in nav" :key="n.to" :to="n.to"
            :class="['flex items-center gap-3 h-10 px-3 rounded-lg text-sm font-medium transition-colors', isActive(n.to) ? 'bg-primary/15 text-text border border-primary/30' : 'text-muted hover:text-text hover:bg-raised border border-transparent']">
            <component :is="n.icon" :class="['w-[18px] h-[18px]', isActive(n.to) ? 'text-primary' : '']" :stroke-width="1.75" />{{ n.label }}
          </RouterLink>
        </nav>
        <a v-if="session.me?.discordInvite" :href="session.me.discordInvite" target="_blank" rel="noopener" class="mt-4 flex items-center gap-3 h-10 px-3 rounded-lg text-sm text-muted hover:text-text hover:bg-raised"><MessageCircle class="w-[18px] h-[18px]" />Discord</a>
      </aside>
      <div v-if="open && !landing" class="fixed inset-0 top-16 z-10 bg-black/50 lg:hidden" @click="open = false" />
      <main :class="['flex-1 min-w-0', landing ? '' : 'px-4 lg:px-6 py-6']"><RouterView /></main>
    </div>
    <footer class="border-t border-line text-xs text-muted py-4 px-4 text-center">Community project · Not affiliated with Valve. Hero data via deadlock-api.com.</footer>
  </div>
</template>
