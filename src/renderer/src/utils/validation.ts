export function requireText(value: string, label: string): string | null {
  return value.trim() ? null : `${label} is required.`;
}

export function requirePositiveNumber(value: number, label: string): string | null {
  if (!Number.isFinite(value) || value <= 0) {
    return `${label} must be a positive number.`;
  }

  return null;
}

export function requireNonNegativeNumber(value: number, label: string): string | null {
  if (!Number.isFinite(value) || value < 0) {
    return `${label} cannot be negative.`;
  }

  return null;
}
