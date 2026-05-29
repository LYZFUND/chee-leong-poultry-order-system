import type { Session, User } from '@supabase/supabase-js';
import { supabase } from './supabaseClient';

export interface AuthState {
  session: Session | null;
  user: User | null;
}

export const authService = {
  async getSession(): Promise<AuthState> {
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      throw new Error(error.message);
    }

    return {
      session: data.session,
      user: data.session?.user ?? null,
    };
  },

  async login(email: string, password: string): Promise<AuthState> {
    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      throw new Error(error.message);
    }

    return {
      session: data.session,
      user: data.user,
    };
  },

  async logout(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) {
      throw new Error(error.message);
    }
  },
};
