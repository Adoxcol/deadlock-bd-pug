export const duration = (sec: number | null | undefined) => {
  if (sec == null) return '—';
  const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
};
/** Time since a moment: m:ss under an hour, then "3h 12m", then "4d". */
export const elapsedSince = (iso: string | number | null) => {
  if (!iso) return '—';
  const sec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 3600) return duration(sec);
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ${Math.floor((sec % 3600) / 60)}m`;
  return `${Math.floor(sec / 86400)}d`;
};
export const dateShort = (iso: string) => new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const pct = (x: number | null | undefined) => (x == null ? '—' : `${Math.round(x * 100)}%`);
export const metric = (x: number | null | undefined) => (x == null ? null : x.toLocaleString());
export const timeAgo = (iso: string | number) => {
  const sec = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return 'just now';
  const [n, u] = sec < 3600 ? [sec / 60, 'minute'] : sec < 86400 ? [sec / 3600, 'hour'] : [sec / 86400, 'day'];
  const v = Math.floor(n); return `${v} ${u}${v === 1 ? '' : 's'} ago`;
};
