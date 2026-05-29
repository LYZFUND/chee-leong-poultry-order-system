export function formatMoney(value?: number | string | null): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('en-MY', {
    style: 'currency',
    currency: 'MYR',
    currencyDisplay: 'narrowSymbol',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })
    .format(Number.isFinite(amount) ? amount : 0)
    .replace('MYR', 'RM');
}

export function formatNumber(value?: number | string | null, maximumFractionDigits = 3): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('en-MY', {
    maximumFractionDigits,
  }).format(Number.isFinite(amount) ? amount : 0);
}

export function labelFromValue(value: string): string {
  return value
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
