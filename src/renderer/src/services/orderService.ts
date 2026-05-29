import type {
  ActualFarmCost,
  CustomerDeduction,
  DailyOrder,
  DailyOrderItem,
  DeductionReason,
  FarmDeduction,
  FarmOrderItem,
  PricingMethod,
  UUID,
} from '@renderer/types/entities';
import { getDateParts } from '@renderer/utils/date';
import {
  calculateActualProfit,
  calculateAdjustedProfit,
  calculateAdjustedSales,
  calculateOrderByPricingMethod,
  roundMoney,
} from './calculationService';
import { nowIso, ensureData } from './supabaseQuery';
import { supabase } from './supabaseClient';

export interface DailyCustomerOrderInput {
  customerId: UUID;
  areaId?: UUID | null;
  farmId: UUID;
  productId: UUID;
  pricingMethod: PricingMethod;
  cageCount: number;
  cageWeight: number;
  weightEntriesKg?: number[];
  grossWeightKg: number;
  netWeightKg?: number | null;
  productQuantity: number;
  farmPrice: number;
  salesPrice: number;
  notes?: string | null;
}

export interface DailyFarmOrderInput {
  farmId: UUID;
  productId: UUID;
  pricingMethod: PricingMethod;
  cageCount: number;
  cageWeight: number;
  grossWeightKg: number;
  netWeightKg?: number | null;
  productQuantity: number;
  farmPrice: number;
  notes?: string | null;
}

async function getOrCreateDailyOrder(orderDate: string, notes?: string | null): Promise<DailyOrder> {
  const existing = await supabase
    .from('daily_orders')
    .select('*')
    .eq('order_date', orderDate)
    .is('deleted_at', null)
    .maybeSingle();

  if (existing.error) {
    throw new Error(existing.error.message);
  }

  const dateParts = getDateParts(orderDate);
  const payload = {
    order_date: orderDate,
    day_name: dateParts.dayName,
    month: dateParts.month,
    year: dateParts.year,
    notes: notes ?? null,
  };

  if (existing.data) {
    const { data, error } = await supabase
      .from('daily_orders')
      .update(payload)
      .eq('id', (existing.data as DailyOrder).id)
      .select('*')
      .single();
    return ensureData<DailyOrder>(data, error, {} as DailyOrder);
  }

  const { data, error } = await supabase.from('daily_orders').insert(payload).select('*').single();
  return ensureData<DailyOrder>(data, error, {} as DailyOrder);
}

function buildCustomerOrderRow(dailyOrderId: UUID, input: DailyCustomerOrderInput): Omit<DailyOrderItem, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> {
  const calculated = calculateOrderByPricingMethod({
    pricingMethod: input.pricingMethod,
    cageCount: input.cageCount,
    cageWeight: input.cageWeight,
    grossWeightKg: input.grossWeightKg,
    netWeightKg: input.netWeightKg,
    productQuantity: input.productQuantity,
    farmPrice: input.farmPrice,
    salesPrice: input.salesPrice,
  });

  return {
    daily_order_id: dailyOrderId,
    customer_id: input.customerId,
    area_id: input.areaId ?? null,
    farm_id: input.farmId,
    product_id: input.productId,
    pricing_method: input.pricingMethod,
    cage_count: input.cageCount,
    cage_weight: input.cageWeight,
    cage_deduction_weight: calculated.cageDeductionWeight,
    gross_weight_kg: input.grossWeightKg,
    weight_entries_kg: input.weightEntriesKg ?? [],
    net_weight_kg: calculated.netWeightKg,
    net_weight_manually_adjusted: calculated.netWeightManuallyAdjusted,
    is_net_weight_manual: calculated.netWeightManuallyAdjusted,
    product_quantity: input.productQuantity,
    farm_price: input.farmPrice,
    sales_price: input.salesPrice,
    estimated_cost: calculated.estimatedCost,
    sales_amount: calculated.salesAmount,
    estimated_profit: calculated.estimatedProfit,
    actual_cost: null,
    actual_profit: null,
    customer_deduction_total: 0,
    farm_deduction_total: 0,
    adjusted_sales: calculated.salesAmount,
    adjusted_profit: calculated.estimatedProfit,
    notes: input.notes ?? null,
  };
}

function buildFarmOrderRow(dailyOrderId: UUID, input: DailyFarmOrderInput): Omit<FarmOrderItem, 'id' | 'created_at' | 'updated_at' | 'deleted_at'> {
  const calculated = calculateOrderByPricingMethod({
    pricingMethod: input.pricingMethod,
    cageCount: input.cageCount,
    cageWeight: input.cageWeight,
    grossWeightKg: input.grossWeightKg,
    netWeightKg: input.netWeightKg,
    productQuantity: input.productQuantity,
    farmPrice: input.farmPrice,
    salesPrice: 0,
  });

  return {
    daily_order_id: dailyOrderId,
    farm_id: input.farmId,
    product_id: input.productId,
    pricing_method: input.pricingMethod,
    cage_count: input.cageCount,
    cage_weight: input.cageWeight,
    cage_deduction_weight: calculated.cageDeductionWeight,
    gross_weight_kg: input.grossWeightKg,
    net_weight_kg: calculated.netWeightKg,
    net_weight_manually_adjusted: calculated.netWeightManuallyAdjusted,
    product_quantity: input.productQuantity,
    farm_price: input.farmPrice,
    estimated_cost: calculated.estimatedCost,
    actual_cost: null,
    notes: input.notes ?? null,
  };
}

function allocateActualCost<T extends { id: UUID; estimated_cost: number }>(
  rows: T[],
  actualCostAmount: number,
): Array<{ row: T; actualCost: number }> {
  const totalActualCost = roundMoney(Math.max(Number(actualCostAmount) || 0, 0));
  const totalEstimatedCost = rows.reduce((sum, row) => sum + Math.max(Number(row.estimated_cost) || 0, 0), 0);
  let allocatedTotal = 0;

  return rows.map((row, index) => {
    const isLastRow = index === rows.length - 1;
    const allocation = isLastRow
      ? roundMoney(Math.max(totalActualCost - allocatedTotal, 0))
      : roundMoney(
          totalEstimatedCost > 0
            ? (totalActualCost * Math.max(Number(row.estimated_cost) || 0, 0)) / totalEstimatedCost
            : totalActualCost / rows.length,
        );

    allocatedTotal = roundMoney(allocatedTotal + allocation);
    return { row, actualCost: allocation };
  });
}

export const orderService = {
  async listDailyOrders(): Promise<DailyOrder[]> {
    const { data, error } = await supabase
      .from('daily_orders')
      .select('*')
      .is('deleted_at', null)
      .order('order_date', { ascending: false });
    return ensureData<DailyOrder[]>(data, error, []);
  },

  async getDailyOrder(id: UUID): Promise<DailyOrder | null> {
    const { data, error } = await supabase
      .from('daily_orders')
      .select('*')
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    return ensureData<DailyOrder | null>(data, error, null);
  },

  async getDailyOrderItems(dailyOrderId: UUID): Promise<DailyOrderItem[]> {
    const { data, error } = await supabase
      .from('daily_order_items')
      .select('*, customers(id, customer_name), customer_areas(id, area_name, farm_id), farms(id, farm_name), farm_products(id, product_name)')
      .eq('daily_order_id', dailyOrderId)
      .is('deleted_at', null)
      .order('created_at');
    return ensureData<DailyOrderItem[]>(data, error, []);
  },

  async getFarmOrderItems(dailyOrderId: UUID): Promise<FarmOrderItem[]> {
    const { data, error } = await supabase
      .from('farm_order_items')
      .select('*, farms(id, farm_name), farm_products(id, product_name)')
      .eq('daily_order_id', dailyOrderId)
      .is('deleted_at', null)
      .order('created_at');
    return ensureData<FarmOrderItem[]>(data, error, []);
  },

  async listCustomerDeductionsForOrderItems(orderItemIds: UUID[]): Promise<CustomerDeduction[]> {
    const uniqueOrderItemIds = Array.from(new Set(orderItemIds));
    if (uniqueOrderItemIds.length === 0) {
      return [];
    }

    const { data, error } = await supabase
      .from('customer_deductions')
      .select('*')
      .in('order_item_id', uniqueOrderItemIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    return ensureData<CustomerDeduction[]>(data, error, []);
  },

  async saveDailyOrder(input: {
    orderDate: string;
    notes?: string | null;
    customerItems: DailyCustomerOrderInput[];
    farmItems: DailyFarmOrderInput[];
    replaceExisting?: boolean;
  }): Promise<DailyOrder> {
    const dailyOrder = await getOrCreateDailyOrder(input.orderDate, input.notes);

    if (input.replaceExisting) {
      const deletedAt = nowIso();

      const deleteCustomerItems = await supabase
        .from('daily_order_items')
        .update({ deleted_at: deletedAt })
        .eq('daily_order_id', dailyOrder.id)
        .is('deleted_at', null);

      if (deleteCustomerItems.error) {
        throw new Error(deleteCustomerItems.error.message);
      }

      const deleteFarmItems = await supabase
        .from('farm_order_items')
        .update({ deleted_at: deletedAt })
        .eq('daily_order_id', dailyOrder.id)
        .is('deleted_at', null);

      if (deleteFarmItems.error) {
        throw new Error(deleteFarmItems.error.message);
      }
    }

    const customerRows = input.customerItems.map((item) => buildCustomerOrderRow(dailyOrder.id, item));
    if (customerRows.length > 0) {
      const { error } = await supabase.from('daily_order_items').insert(customerRows);
      if (error) {
        throw new Error(error.message);
      }
    }

    const farmRows = input.farmItems.map((item) => buildFarmOrderRow(dailyOrder.id, item));
    if (farmRows.length > 0) {
      const { error } = await supabase.from('farm_order_items').insert(farmRows);
      if (error) {
        throw new Error(error.message);
      }
    }

    return dailyOrder;
  },

  async softDeleteDailyOrder(id: UUID): Promise<void> {
    const deletedAt = nowIso();
    const { error } = await supabase.from('daily_orders').update({ deleted_at: deletedAt }).eq('id', id);
    if (error) {
      throw new Error(error.message);
    }

    await supabase.from('daily_order_items').update({ deleted_at: deletedAt }).eq('daily_order_id', id);
    await supabase.from('farm_order_items').update({ deleted_at: deletedAt }).eq('daily_order_id', id);
  },

  async addActualFarmCost(input: {
    orderItem: DailyOrderItem;
    actualCostAmount: number;
    actualCostDate: string;
    notes?: string | null;
  }): Promise<ActualFarmCost> {
    const { data, error } = await supabase
      .from('actual_farm_costs')
      .insert({
        order_item_id: input.orderItem.id,
        farm_id: input.orderItem.farm_id,
        actual_cost_amount: input.actualCostAmount,
        actual_cost_date: input.actualCostDate,
        notes: input.notes ?? null,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const actualProfit = calculateActualProfit(input.orderItem.adjusted_sales, input.actualCostAmount);
    const adjustedProfit = calculateAdjustedProfit({
      adjustedSales: input.orderItem.adjusted_sales,
      estimatedCost: input.orderItem.estimated_cost,
      actualCost: input.actualCostAmount,
    });

    const update = await supabase
      .from('daily_order_items')
      .update({
        actual_cost: input.actualCostAmount,
        actual_profit: actualProfit,
        adjusted_profit: adjustedProfit,
      })
      .eq('id', input.orderItem.id);

    if (update.error) {
      throw new Error(update.error.message);
    }

    return data as ActualFarmCost;
  },

  async applyFarmActualCost(input: {
    dailyOrderId: UUID;
    farmId: UUID;
    actualCostAmount: number;
  }): Promise<void> {
    const actualCostAmount = roundMoney(Math.max(Number(input.actualCostAmount) || 0, 0));
    const { data: customerItemsData, error: customerItemsError } = await supabase
      .from('daily_order_items')
      .select('*')
      .eq('daily_order_id', input.dailyOrderId)
      .eq('farm_id', input.farmId)
      .is('deleted_at', null)
      .order('created_at');

    const customerItems = ensureData<DailyOrderItem[]>(customerItemsData, customerItemsError, []);
    if (customerItems.length === 0) {
      throw new Error('No customer order items found for this farm.');
    }

    for (const allocation of allocateActualCost(customerItems, actualCostAmount)) {
      const actualProfit = calculateActualProfit(allocation.row.adjusted_sales, allocation.actualCost);
      const adjustedProfit = calculateAdjustedProfit({
        adjustedSales: allocation.row.adjusted_sales,
        estimatedCost: allocation.row.estimated_cost,
        actualCost: allocation.actualCost,
      });

      const update = await supabase
        .from('daily_order_items')
        .update({
          actual_cost: allocation.actualCost,
          actual_profit: actualProfit,
          adjusted_profit: adjustedProfit,
        })
        .eq('id', allocation.row.id);

      if (update.error) {
        throw new Error(update.error.message);
      }
    }

    const { data: farmItemsData, error: farmItemsError } = await supabase
      .from('farm_order_items')
      .select('*')
      .eq('daily_order_id', input.dailyOrderId)
      .eq('farm_id', input.farmId)
      .is('deleted_at', null)
      .order('created_at');

    const farmItems = ensureData<FarmOrderItem[]>(farmItemsData, farmItemsError, []);
    for (const allocation of allocateActualCost(farmItems, actualCostAmount)) {
      const update = await supabase
        .from('farm_order_items')
        .update({ actual_cost: allocation.actualCost })
        .eq('id', allocation.row.id);

      if (update.error) {
        throw new Error(update.error.message);
      }
    }
  },

  async addCustomerDeduction(input: {
    orderItem: DailyOrderItem;
    reason: DeductionReason;
    quantity: number;
    weightKg?: number | null;
    deductionAmount: number;
    notes?: string | null;
  }): Promise<CustomerDeduction> {
    const { data, error } = await supabase
      .from('customer_deductions')
      .insert({
        customer_id: input.orderItem.customer_id,
        order_item_id: input.orderItem.id,
        product_id: input.orderItem.product_id,
        reason: input.reason,
        quantity: input.quantity,
        weight_kg: input.weightKg ?? null,
        sales_price_used: input.orderItem.sales_price,
        deduction_amount: input.deductionAmount,
        notes: input.notes ?? null,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    const nextDeductionTotal = input.orderItem.customer_deduction_total + input.deductionAmount;
    const adjustedSales = calculateAdjustedSales(input.orderItem.sales_amount, nextDeductionTotal);
    const adjustedProfit = calculateAdjustedProfit({
      adjustedSales,
      estimatedCost: input.orderItem.estimated_cost,
      actualCost: input.orderItem.actual_cost,
    });

    const update = await supabase
      .from('daily_order_items')
      .update({
        customer_deduction_total: nextDeductionTotal,
        adjusted_sales: adjustedSales,
        adjusted_profit: adjustedProfit,
        actual_profit:
          input.orderItem.actual_cost === null || input.orderItem.actual_cost === undefined
            ? input.orderItem.actual_profit
            : calculateActualProfit(adjustedSales, input.orderItem.actual_cost),
      })
      .eq('id', input.orderItem.id);

    if (update.error) {
      throw new Error(update.error.message);
    }

    return data as CustomerDeduction;
  },

  async softDeleteCustomerDeduction(deduction: CustomerDeduction): Promise<void> {
    const deletedAt = nowIso();
    const { error } = await supabase
      .from('customer_deductions')
      .update({ deleted_at: deletedAt })
      .eq('id', deduction.id);

    if (error) {
      throw new Error(error.message);
    }

    const { data: orderItemData, error: orderItemError } = await supabase
      .from('daily_order_items')
      .select('*')
      .eq('id', deduction.order_item_id)
      .single();
    const orderItem = ensureData<DailyOrderItem>(
      orderItemData,
      orderItemError,
      {} as DailyOrderItem,
    );

    const { data: remainingDeductionsData, error: remainingDeductionsError } = await supabase
      .from('customer_deductions')
      .select('deduction_amount')
      .eq('order_item_id', deduction.order_item_id)
      .is('deleted_at', null);
    const remainingDeductions = ensureData<Array<{ deduction_amount: number }>>(
      remainingDeductionsData,
      remainingDeductionsError,
      [],
    );

    const nextDeductionTotal = roundMoney(
      remainingDeductions.reduce(
        (total, item) => total + Math.max(Number(item.deduction_amount) || 0, 0),
        0,
      ),
    );
    const adjustedSales = calculateAdjustedSales(orderItem.sales_amount, nextDeductionTotal);
    const adjustedProfit = calculateAdjustedProfit({
      adjustedSales,
      estimatedCost: orderItem.estimated_cost,
      actualCost: orderItem.actual_cost,
    });

    const update = await supabase
      .from('daily_order_items')
      .update({
        customer_deduction_total: nextDeductionTotal,
        adjusted_sales: adjustedSales,
        adjusted_profit: adjustedProfit,
        actual_profit:
          orderItem.actual_cost === null || orderItem.actual_cost === undefined
            ? orderItem.actual_profit
            : calculateActualProfit(adjustedSales, orderItem.actual_cost),
      })
      .eq('id', orderItem.id);

    if (update.error) {
      throw new Error(update.error.message);
    }
  },

  async addFarmDeduction(input: {
    orderItem?: DailyOrderItem | null;
    farmId: UUID;
    productId?: UUID | null;
    reason: DeductionReason;
    quantity: number;
    weightKg?: number | null;
    pricingMethod: 'per_kg' | 'per_product' | 'manual_amount';
    deductionAmount: number;
    approvedByFarm: boolean;
    notes?: string | null;
  }): Promise<FarmDeduction> {
    const { data, error } = await supabase
      .from('farm_deductions')
      .insert({
        farm_id: input.farmId,
        order_item_id: input.orderItem?.id ?? null,
        product_id: input.productId ?? input.orderItem?.product_id ?? null,
        reason: input.reason,
        quantity: input.quantity,
        weight_kg: input.weightKg ?? null,
        deduction_pricing_method: input.pricingMethod,
        deduction_amount: input.deductionAmount,
        approved_by_farm: input.approvedByFarm,
        notes: input.notes ?? null,
      })
      .select('*')
      .single();

    if (error) {
      throw new Error(error.message);
    }

    if (input.orderItem) {
      const update = await supabase
        .from('daily_order_items')
        .update({
          farm_deduction_total: input.orderItem.farm_deduction_total + input.deductionAmount,
        })
        .eq('id', input.orderItem.id);

      if (update.error) {
        throw new Error(update.error.message);
      }
    }

    return data as FarmDeduction;
  },
};
