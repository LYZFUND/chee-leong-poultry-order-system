import type { PostgrestError } from '@supabase/supabase-js';

export function ensureData<T>(data: unknown, error: PostgrestError | null, fallback: T): T {
  if (error) {
    throw new Error(error.message);
  }

  return (data ?? fallback) as T;
}

export function nowIso(): string {
  return new Date().toISOString();
}
