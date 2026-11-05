export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

export function isMatchDate(date: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(date) && Number.isFinite(Date.parse(date)) && new Date(date).toISOString().slice(0, 10) === date;
}

export function monthsBefore(date: string, months: number): string {
  const start = new Date(date);
  const day = start.getUTCDate();
  start.setUTCDate(1);
  start.setUTCMonth(start.getUTCMonth() - months);
  const endOfMonth = new Date(start);
  endOfMonth.setUTCMonth(endOfMonth.getUTCMonth() + 1, 0);
  start.setUTCDate(Math.min(day, endOfMonth.getUTCDate()));
  return start.toISOString().slice(0, 10);
}
