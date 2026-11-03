// Keeps an invite link alive through the Discord login round trip.
const KEY = 'returnTo';
export function rememberReturn(path: string) { try { localStorage.setItem(KEY, path); } catch { /* storage unavailable */ } }
export function takeReturn(): string | null {
  try { const path = localStorage.getItem(KEY); localStorage.removeItem(KEY); return path; } catch { return null; }
}
