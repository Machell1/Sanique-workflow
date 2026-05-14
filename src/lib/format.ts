import { format, formatDistanceToNow, isThisYear } from 'date-fns';

export function fmtDate(ms: number | null | undefined): string {
  if (!ms) return '—';
  const d = new Date(ms);
  return isThisYear(d) ? format(d, 'd MMM') : format(d, 'd MMM yyyy');
}

export function fmtDateTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  return format(new Date(ms), 'd MMM yyyy, HH:mm');
}

export function fmtTime(ms: number | null | undefined): string {
  if (!ms) return '—';
  return format(new Date(ms), 'HH:mm');
}

export function fmtRelative(ms: number | null | undefined): string {
  if (!ms) return '—';
  return formatDistanceToNow(new Date(ms), { addSuffix: true });
}

export function fmtBytes(n: number | null | undefined): string {
  if (n == null) return '—';
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 10 ? 0 : 1)} ${units[i]}`;
}
