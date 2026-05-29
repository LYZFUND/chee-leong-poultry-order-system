import type {
  AreaSalesPrice,
  FarmProductPrice,
  PricingMethod,
  UUID,
} from '@renderer/types/entities';
import { nowIso, ensureData } from './supabaseQuery';
import { supabase } from './supabaseClient';

type FarmPriceInput = Pick<
  FarmProductPrice,
  'farm_id' | 'product_id' | 'pricing_method' | 'price_amount' | 'effective_date' | 'end_date' | 'is_active' | 'notes'
>;

type SalesPriceInput = Pick<
  AreaSalesPrice,
  'area_id' | 'product_id' | 'pricing_method' | 'price_amount' | 'effective_date' | 'end_date' | 'is_active' | 'notes'
>;

interface UnifiedSalesPriceInput extends Omit<SalesPriceInput, 'area_id'> {
  areaIds: UUID[];
}

export const priceService = {
  async listFarmPrices(): Promise<FarmProductPrice[]> {
    const { data, error } = await supabase
      .from('farm_product_prices')
      .select('*, farms(id, farm_name), farm_products(id, product_name, farm_id, farms(id, farm_name))')
      .is('deleted_at', null)
      .order('farm_name', { referencedTable: 'farms' })
      .order('effective_date', { ascending: false });
    return ensureData<FarmProductPrice[]>(data, error, []);
  },

  async createFarmPrice(input: FarmPriceInput): Promise<FarmProductPrice> {
    const { data, error } = await supabase.from('farm_product_prices').insert(input).select('*').single();
    return ensureData<FarmProductPrice>(data, error, {} as FarmProductPrice);
  },

  async updateFarmPrice(id: UUID, input: Partial<FarmPriceInput>): Promise<FarmProductPrice> {
    const { data, error } = await supabase
      .from('farm_product_prices')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    return ensureData<FarmProductPrice>(data, error, {} as FarmProductPrice);
  },

  async softDeleteFarmPrice(id: UUID): Promise<void> {
    const { error } = await supabase
      .from('farm_product_prices')
      .update({ deleted_at: nowIso(), is_active: false })
      .eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
  },

  async listSalesPrices(): Promise<AreaSalesPrice[]> {
    const { data, error } = await supabase
      .from('area_sales_prices')
      .select('*, customer_areas(id, area_name, farm_id), farm_products(id, product_name, farm_id, farms(id, farm_name))')
      .is('deleted_at', null)
      .order('effective_date', { ascending: false });
    return ensureData<AreaSalesPrice[]>(data, error, []);
  },

  async createSalesPrice(input: SalesPriceInput): Promise<AreaSalesPrice> {
    const { data, error } = await supabase.from('area_sales_prices').insert(input).select('*').single();
    return ensureData<AreaSalesPrice>(data, error, {} as AreaSalesPrice);
  },

  async upsertSalesPricesForAreas(input: UnifiedSalesPriceInput): Promise<void> {
    if (input.areaIds.length === 0) {
      throw new Error('Please select at least one area.');
    }

    if (input.price_amount <= 0) {
      throw new Error('Sales price amount must be more than 0.');
    }

    const { data, error } = await supabase
      .from('area_sales_prices')
      .select('id, area_id')
      .in('area_id', input.areaIds)
      .eq('product_id', input.product_id)
      .eq('pricing_method', input.pricing_method)
      .eq('effective_date', input.effective_date)
      .is('deleted_at', null);

    const existingRows = ensureData<Pick<AreaSalesPrice, 'id' | 'area_id'>[]>(data, error, []);
    const existingIdByArea = new Map(existingRows.map((row) => [row.area_id, row.id]));

    await Promise.all(
      input.areaIds.map(async (areaId) => {
        const payload: SalesPriceInput = {
          area_id: areaId,
          product_id: input.product_id,
          pricing_method: input.pricing_method,
          price_amount: input.price_amount,
          effective_date: input.effective_date,
          end_date: input.end_date,
          notes: input.notes,
          is_active: input.is_active,
        };
        const existingId = existingIdByArea.get(areaId);

        if (existingId) {
          await priceService.updateSalesPrice(existingId, payload);
          return;
        }

        await priceService.createSalesPrice(payload);
      }),
    );
  },

  async updateSalesPrice(id: UUID, input: Partial<SalesPriceInput>): Promise<AreaSalesPrice> {
    const { data, error } = await supabase
      .from('area_sales_prices')
      .update(input)
      .eq('id', id)
      .select('*')
      .single();
    return ensureData<AreaSalesPrice>(data, error, {} as AreaSalesPrice);
  },

  async softDeleteSalesPrice(id: UUID): Promise<void> {
    const { error } = await supabase
      .from('area_sales_prices')
      .update({ deleted_at: nowIso(), is_active: false })
      .eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
  },

  async getActiveFarmPrice(input: {
    farmId: UUID;
    productId: UUID;
    orderDate: string;
    pricingMethod?: PricingMethod;
  }): Promise<FarmProductPrice | null> {
    let query = supabase
      .from('farm_product_prices')
      .select('*')
      .eq('farm_id', input.farmId)
      .eq('product_id', input.productId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .lte('effective_date', input.orderDate)
      .or(`end_date.is.null,end_date.gte.${input.orderDate}`);

    if (input.pricingMethod) {
      query = query.eq('pricing_method', input.pricingMethod);
    }

    const { data, error } = await query.order('effective_date', { ascending: false }).limit(1).maybeSingle();
    return ensureData<FarmProductPrice | null>(data, error, null);
  },

  async listActiveFarmPricesForProduct(input: {
    farmId: UUID;
    productId: UUID;
    orderDate: string;
  }): Promise<FarmProductPrice[]> {
    const { data, error } = await supabase
      .from('farm_product_prices')
      .select('*')
      .eq('farm_id', input.farmId)
      .eq('product_id', input.productId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .lte('effective_date', input.orderDate)
      .or(`end_date.is.null,end_date.gte.${input.orderDate}`)
      .order('effective_date', { ascending: false });

    return ensureData<FarmProductPrice[]>(data, error, []);
  },

  async getActiveSalesPrice(input: {
    areaId: UUID;
    productId: UUID;
    orderDate: string;
    pricingMethod?: PricingMethod;
  }): Promise<AreaSalesPrice | null> {
    let query = supabase
      .from('area_sales_prices')
      .select('*')
      .eq('area_id', input.areaId)
      .eq('product_id', input.productId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .lte('effective_date', input.orderDate)
      .or(`end_date.is.null,end_date.gte.${input.orderDate}`);

    if (input.pricingMethod) {
      query = query.eq('pricing_method', input.pricingMethod);
    }

    const { data, error } = await query.order('effective_date', { ascending: false }).limit(1).maybeSingle();
    return ensureData<AreaSalesPrice | null>(data, error, null);
  },

  async listActiveSalesPricesForAreaProduct(input: {
    areaId: UUID;
    productId: UUID;
    orderDate: string;
  }): Promise<AreaSalesPrice[]> {
    const { data, error } = await supabase
      .from('area_sales_prices')
      .select('*')
      .eq('area_id', input.areaId)
      .eq('product_id', input.productId)
      .eq('is_active', true)
      .is('deleted_at', null)
      .lte('effective_date', input.orderDate)
      .or(`end_date.is.null,end_date.gte.${input.orderDate}`)
      .order('effective_date', { ascending: false });

    return ensureData<AreaSalesPrice[]>(data, error, []);
  },
};
