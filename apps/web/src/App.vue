<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute } from 'vue-router';
import { LayoutDashboard, Swords, Crosshair, Trophy, Shield, LogIn, LogOut, Menu, X, Wifi, WifiOff, User } from 'lucide-vue-next';
import { useSession } from './stores/session';
import { realtime } from './lib/ws';

const session = useSession();
const route = useRoute();
const open = ref(false);
const bare = computed(() => route.query.broadcast === '1');
const nav = computed(() => [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/drafts', label: 'Drafts', icon: Swords },
  { to: '/tracker', label: 'Tracker', icon: Crosshair, min: 'MODERATOR' as const },
  { to: '/leaderboard', label: 'Leaderboard', icon: Trophy },
  { to: '/admin', label: 'Admin', icon: Shield, min: 'MODERATOR' as const },
].filter((n) => !n.min || session.can(n.min)));
</script>

<template>
  <RouterView v-if="bare" />
  <div v-else class="min-h-screen flex flex-col">
    <header class="sticky top-0 z-30 border-b border-line bg-bg/95 backdrop-blur">
      <div class="max-w-[1600px] mx-auto h-14 px-4 flex items-center gap-6">
        <RouterLink to="/" class="flex items-center gap-2 font-semibold tracking-tight shrink-0">
          <span class="w-7 h-7 rounded-lg bg-accent/15 border border-accent/40 grid place-items-center text-accent text-xs font-bold">DB</span>
          <span class="hidden sm:inline">Deadlock <span class="text-muted font-normal">Bangladesh</span></span>
        </RouterLink>
        <nav class="hidden md:flex items-center gap-1">
          <RouterLink v-for="n in nav" :key="n.to" :to="n.to" class="flex items-center gap-2 h-9 px-3 rounded-lg text-sm text-muted hover:text-text hover:bg-raised" active-class="!text-text bg-raised" :exact-active-class="n.to === '/' ? '!text-text bg-raised' : ''">
            <component :is="n.icon" class="w-4 h-4" :stroke-width="1.75" />{{ n.label }}
          </RouterLink>
        </nav>
        <div class="ml-auto flex items-center gap-2">
          <span v-if="session.me?.simulationMode" class="hidden lg:inline text-[11px] font-semibold uppercase tracking-wide text-warn border border-warn/40 rounded px-1.5 py-0.5">Simulation mode</span>
          <span class="hidden sm:flex items-center gap-1 text-xs" :class="realtime.connected.value ? 'text-accent' : 'text-muted'" :title="realtime.connected.value ? 'Realtime connected' : 'Realtime disconnected'">
            <component :is="realtime.connected.value ? Wifi : WifiOff" class="w-3.5 h-3.5" />{{ realtime.connected.value ? 'Live' : 'Offline' }}
          </span>
          <template v-if="session.user">
            <RouterLink :to="`/players/${session.user.id}`" class="btn-ghost !h-8"><User class="w-4 h-4" /><span class="hidden sm:inline max-w-[140px] truncate">{{ session.user.displayName }}</span></RouterLink>
            <button class="btn-ghost !h-8 !px-2" title="Log out" @click="session.logout()"><LogOut class="w-4 h-4" /></button>
          </template>
          <RouterLink v-else to="/login" class="btn-primary !h-8"><LogIn class="w-4 h-4" />Log in</RouterLink>
          <button class="md:hidden btn-ghost !h-8 !px-2" aria-label="Menu" @click="open = !open"><component :is="open ? X : Menu" class="w-4 h-4" /></button>
        </div>
      </div>
      <nav v-if="open" class="md:hidden border-t border-line px-4 py-2 grid gap-1" @click="open = false">
        <RouterLink v-for="n in nav" :key="n.to" :to="n.to" class="flex items-center gap-2 h-10 px-3 rounded-lg text-sm text-muted" active-class="!text-text bg-raised">
          <component :is="n.icon" class="w-4 h-4" />{{ n.label }}
        </RouterLink>
      </nav>
    </header>
    <main class="flex-1 w-full max-w-[1600px] mx-auto px-4 py-6"><RouterView /></main>
    <footer class="border-t border-line text-xs text-muted py-4 px-4 text-center">Community project · Not affiliated with Valve. Match data via deadlock-api.com where available.</footer>
  </div>
</template>
