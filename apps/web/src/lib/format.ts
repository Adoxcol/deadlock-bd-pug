export const duration = (sec: number | null | undefined) => {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};
export const elapsedSince = (iso: string | number | null) => (iso ? duration((Date.now() - new Date(iso).getTime()) / 1000) : '—');
export const dateShort = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)}%`);
export const metric = (x: number | null | undefined) => (x == null ? null : x.toLocaleString());
