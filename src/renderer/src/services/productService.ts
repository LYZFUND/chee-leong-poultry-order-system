import type { FarmProduct, UUID } from '@renderer/types/entities';
import { nowIso, ensureData } from './supabaseQuery';
import { supabase } from './supabaseClient';

type ProductInput = Pick<
  FarmProduct,
  'farm_id' | 'product_name' | 'product_category' | 'pricing_method' | 'default_cage_weight' | 'notes' | 'is_active'
>;

export const productService = {
  async listProducts(includeInactive = true): Promise<FarmProduct[]> {
    let query = supabase
      .from('farm_products')
      .select('*, farms(id, farm_name)')
      .is('deleted_at', null)
      .order('product_name');

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    return ensureData<FarmProduct[]>(data, error, []);
  },

  async listProductsByFarm(farmId: UUID): Promise<FarmProduct[]> {
    const { data, error } = await supabase
      .from('farm_products')
      .select('*, farms(id, farm_name)')
      .eq('farm_id', farmId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .order('product_name');
    return ensureData<FarmProduct[]>(data, error, []);
  },

  async createProduct(input: ProductInput): Promise<FarmProduct> {
    const { data, error } = await supabase.from('farm_products').insert(input).select('*').single();
    return ensureData<FarmProduct>(data, error, {} as FarmProduct);
  },

  async updateProduct(id: UUID, input: Partial<ProductInput>): Promise<FarmProduct> {
    const { data, error } = await supabase.from('farm_products').update(input).eq('id', id).select('*').single();
    return ensureData<FarmProduct>(data, error, {} as FarmProduct);
  },

  async softDeleteProduct(id: UUID): Promise<void> {
    const { error } = await supabase
      .from('farm_products')
      .update({ deleted_at: nowIso(), is_active: false })
      .eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
  },
};
