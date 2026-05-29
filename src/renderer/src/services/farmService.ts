import type { Farm, FarmBalance, ProfitReportRow, UUID } from '@renderer/types/entities';
import { nowIso, ensureData } from './supabaseQuery';
import { supabase } from './supabaseClient';

type FarmInput = Pick<
  Farm,
  'farm_name' | 'contact_person' | 'phone' | 'address' | 'notes' | 'deduction_policy' | 'is_active'
>;

export const farmService = {
  async listFarms(includeInactive = true): Promise<Farm[]> {
    let query = supabase.from('farms').select('*').is('deleted_at', null).order('farm_name');
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    return ensureData<Farm[]>(data, error, []);
  },

  async getFarm(id: UUID): Promise<Farm | null> {
    const { data, error } = await supabase
      .from('farms')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    return ensureData<Farm | null>(data, error, null);
  },

  async createFarm(input: FarmInput): Promise<Farm> {
    const { data, error } = await supabase.from('farms').insert(input).select('*').single();
    return ensureData<Farm>(data, error, {} as Farm);
  },

  async updateFarm(id: UUID, input: Partial<FarmInput>): Promise<Farm> {
    const { data, error } = await supabase.from('farms').update(input).eq('id', id).select('*').single();
    return ensureData<Farm>(data, error, {} as Farm);
  },

  async softDeleteFarm(id: UUID): Promise<void> {
    const { error } = await supabase.from('farms').update({ deleted_at: nowIso(), is_active: false }).eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
  },

  async getFarmBalance(id: UUID): Promise<FarmBalance | null> {
    const { data, error } = await supabase.from('farm_balance_view').select('*').eq('farm_id', id).maybeSingle();
    return ensureData<FarmBalance | null>(data, error, null);
  },

  async getFarmReportRows(id: UUID): Promise<ProfitReportRow[]> {
    const { data, error } = await supabase
      .from('daily_order_profit_view')
      .select('*')
      .eq('farm_id', id)
      .order('order_date', { ascending: false });
    return ensureData<ProfitReportRow[]>(data, error, []);
  },
};
