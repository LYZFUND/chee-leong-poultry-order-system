import type { CustomerArea, FarmArea, UUID } from '@renderer/types/entities';
import { nowIso, ensureData } from './supabaseQuery';
import { supabase } from './supabaseClient';

type AreaInput = Pick<CustomerArea, 'farm_id' | 'area_name' | 'notes' | 'is_active'>;

export const areaService = {
  async listAreas(includeInactive = true): Promise<CustomerArea[]> {
    let query = supabase
      .from('customer_areas')
      .select('*, farms(id, farm_name)')
      .is('deleted_at', null)
      .order('area_name');
    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    return ensureData<CustomerArea[]>(data, error, []);
  },

  async listAreasByFarm(farmId: UUID): Promise<CustomerArea[]> {
    const { data, error } = await supabase
      .from('farm_areas')
      .select('*, customer_areas(id, farm_id, area_name, notes, is_active, created_at, updated_at, deleted_at, farms(id, farm_name))')
      .eq('farm_id', farmId)
      .is('deleted_at', null)
      .order('created_at');

    if (!error) {
      return ensureData<FarmArea[]>(data, error, [])
        .map((row) => row.customer_areas)
        .filter((area): area is CustomerArea => Boolean(area && area.is_active && !area.deleted_at));
    }

    const fallback = await supabase
      .from('customer_areas')
      .select('*, farms(id, farm_name)')
      .eq('farm_id', farmId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('area_name');
    return ensureData<CustomerArea[]>(fallback.data, fallback.error, []);
  },

  async createArea(input: AreaInput): Promise<CustomerArea> {
    const { data, error } = await supabase.from('customer_areas').insert(input).select('*').single();
    return ensureData<CustomerArea>(data, error, {} as CustomerArea);
  },

  async updateArea(id: UUID, input: Partial<AreaInput>): Promise<CustomerArea> {
    const { data, error } = await supabase.from('customer_areas').update(input).eq('id', id).select('*').single();
    return ensureData<CustomerArea>(data, error, {} as CustomerArea);
  },

  async softDeleteArea(id: UUID): Promise<void> {
    const { error } = await supabase
      .from('customer_areas')
      .update({ deleted_at: nowIso(), is_active: false })
      .eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
  },
};
