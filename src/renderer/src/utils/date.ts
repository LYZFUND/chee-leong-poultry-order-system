const MALAYSIA_TIMEZONE = 'Asia/Kuala_Lumpur';

export function toDateInputValue(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: MALAYSIA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);

  const year = parts.find((part) => part.type === 'year')?.value ?? '';
  const month = parts.find((part) => part.type === 'month')?.value ?? '';
  const day = parts.find((part) => part.type === 'day')?.value ?? '';
  return `${year}-${month}-${day}`;
}

export function getDateParts(dateValue: string): { dayName: string; month: number; year: number } {
  const date = new Date(`${dateValue}T00:00:00+08:00`);
  const dayName = new Intl.DateTimeFormat('en-MY', {
    weekday: 'long',
    timeZone: MALAYSIA_TIMEZONE,
  }).format(date);

  return {
    dayName,
    month: Number(dateValue.slice(5, 7)),
    year: Number(dateValue.slice(0, 4)),
  };
}

export function formatBusinessDate(dateValue?: string | null): string {
  if (!dateValue) {
    return '-';
  }

  const date = new Date(`${dateValue}T00:00:00+08:00`);
  const dayName = new Intl.DateTimeFormat('en-MY', {
    weekday: 'long',
    timeZone: MALAYSIA_TIMEZONE,
  }).format(date);

  return `${dateValue}, ${dayName}`;
}

export function getCurrentYear(): number {
  return Number(toDateInputValue().slice(0, 4));
}

export function getCurrentMonth(): number {
  return Number(toDateInputValue().slice(5, 7));
}
