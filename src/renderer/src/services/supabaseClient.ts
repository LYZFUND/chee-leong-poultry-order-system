import { createClient } from '@supabase/supabase-js';
import type { Database } from '@renderer/types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;
const legacySupabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const supabaseKey = supabasePublishableKey ?? legacySupabaseAnonKey;

export const hasSupabaseConfig = Boolean(supabaseUrl && supabaseKey);

export const supabase = createClient<Database>(
  supabaseUrl ?? 'https://missing-supabase-url.supabase.co',
  supabaseKey ?? 'missing-publishable-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
