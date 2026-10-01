// Exam-date countdown (GTM: the single best retention hook in the OET/exam-prep
// category). Stored as an ISO yyyy-mm-dd string in app state (vorto.examDate).

const MS_DAY = 24 * 60 * 60 * 1000;

// yyyy-mm-dd for a date N days from today (local).
export function isoInDays(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

// Whole days from today until the exam (can be negative if past).
export function daysUntil(iso: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso + 'T00:00:00');
  if (isNaN(target.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / MS_DAY);
}

// Short human label for the countdown.
export function examCountdownLabel(iso: string | null): string | null {
  const n = daysUntil(iso);
  if (n == null) return null;
  if (n < 0) return 'Exam passed';
  if (n === 0) return 'Exam today';
  if (n === 1) return '1 day to your exam';
  if (n <= 90) return `${n} days to your exam`;
  const weeks = Math.round(n / 7);
  return `${weeks} weeks to your exam`;
}

// The quick options offered at onboarding / in settings — no native date picker
// needed. Each maps to a concrete date so the countdown is real.
export const EXAM_OPTIONS: { label: string; days: number | null }[] = [
  { label: 'In 4 weeks', days: 28 },
  { label: 'In 8 weeks', days: 56 },
  { label: 'In 3 months', days: 91 },
  { label: 'In 6 months', days: 182 },
  { label: 'Not booked yet', days: null },
];
