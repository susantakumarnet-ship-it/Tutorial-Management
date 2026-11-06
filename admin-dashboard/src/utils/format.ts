const inr = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 });
const inrPaise = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 2 });
const num = new Intl.NumberFormat('en-IN');

export const formatNumber = (n: number | null | undefined) => (n == null ? '-' : num.format(n));
export const formatRupees = (n: number | null | undefined) => (n == null ? '-' : inr.format(n));
export const formatPaise = (paise: number | null | undefined) => (paise == null ? '-' : inrPaise.format(paise / 100));

export function formatDate(iso: string | null | undefined) {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return '-';
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? '-'
    : d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

/** +919876543210 -> +91 98765 43210 */
export function formatPhone(phone: string | null | undefined) {
  if (!phone) return '-';
  const m = /^\+91(\d{5})(\d{5})$/.exec(phone);
  return m ? `+91 ${m[1]} ${m[2]}` : phone;
}

export function formatBytes(bytes: number | null | undefined) {
  if (bytes == null) return '-';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** SNAKE_CASE enum -> "Snake case" */
export function humanize(value: string | null | undefined) {
  if (!value) return '-';
  const s = value.replace(/_/g, ' ').toLowerCase();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function initials(name: string | null | undefined) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}

/** Validates a 10-digit Indian mobile number (starts with 6-9). Accepts optional +91 / 0 prefix and spaces. */
export function normaliseIndianMobile(input: string): string | null {
  const v = input.replace(/[\s-]/g, '');
  const m = /^(?:\+91|91|0)?([6-9]\d{9})$/.exec(v);
  return m ? m[1] : null;
}
