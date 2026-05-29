import type { DailyOrder, DailyOrderItem, PricingMethod, UUID } from './entities';

export type { DailyOrder, DailyOrderItem, PricingMethod };

export interface WeightBasedOrderInput {
  cage_count: number;
  cage_weight: number;
  gross_weight_kg: number;
  manual_net_weight_kg?: number | null;
  farm_price: number;
  sales_price: number;
}

export interface ProductBasedOrderInput {
  product_quantity: number;
  farm_price: number;
  sales_price: number;
}

export interface OrderCalculationResult {
  cage_deduction_weight: number;
  net_weight_kg: number;
  estimated_cost: number;
  sales_amount: number;
  estimated_profit: number;
  is_net_weight_manual: boolean;
}

export interface CustomerOrderInput {
  customer_id: UUID;
  farm_id: UUID;
  area_id?: UUID | null;
  product_id: UUID;
  pricing_method: PricingMethod;
  cage_count: number;
  cage_weight: number;
  gross_weight_kg: number;
  net_weight_kg?: number | null;
  product_quantity: number;
  farm_price: number;
  sales_price: number;
  notes?: string | null;
}
