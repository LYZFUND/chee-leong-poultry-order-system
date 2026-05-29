export type UUID = string;

export type PricingMethod = 'price_per_kg' | 'price_per_product';
export type DeductionPolicy =
  | 'allow_dead_chicken_deduction'
  | 'not_allow_dead_chicken_deduction'
  | 'allow_only_farm_problem_deduction';
export type DeductionReason = 'dead_chicken' | 'farm_problem' | 'other';
export type DeductionPricingMethod = 'per_kg' | 'per_product' | 'manual_amount';
export type PaymentFrequency = 'weekly_once' | 'weekly_twice' | 'monthly' | 'custom';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'cheque' | 'other';
export type PaymentStatus = 'unpaid' | 'paid';
export type CustomerPaymentSchedule = 'weekly_once' | 'weekly_twice' | 'other';

export interface BaseEntity {
  id: UUID;
  created_at: string;
  updated_at?: string;
  deleted_at?: string | null;
}

export interface Farm extends BaseEntity {
  farm_name: string;
  contact_person?: string | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  deduction_policy: DeductionPolicy;
  is_active: boolean;
}

export interface CustomerArea extends BaseEntity {
  farm_id?: UUID | null;
  area_name: string;
  notes?: string | null;
  is_active: boolean;
  farms?: Pick<Farm, 'id' | 'farm_name'> | null;
}

export interface FarmArea extends BaseEntity {
  farm_id: UUID;
  area_id: UUID;
  farms?: Pick<Farm, 'id' | 'farm_name'> | null;
  customer_areas?: Pick<CustomerArea, 'id' | 'area_name' | 'farm_id' | 'is_active' | 'deleted_at'> | null;
}

export interface FarmProduct extends BaseEntity {
  farm_id: UUID;
  product_name: string;
  product_category?: string | null;
  pricing_method: PricingMethod;
  default_cage_weight: number;
  notes?: string | null;
  is_active: boolean;
  farms?: Pick<Farm, 'id' | 'farm_name'> | null;
}

export interface Customer extends BaseEntity {
  customer_name: string;
  farm_id?: UUID | null;
  area_id?: UUID | null;
  phone?: string | null;
  address?: string | null;
  notes?: string | null;
  is_active: boolean;
  farms?: Pick<Farm, 'id' | 'farm_name'> | null;
  customer_areas?: Pick<CustomerArea, 'id' | 'area_name' | 'farm_id'> | null;
  customer_farm_areas?: CustomerFarmArea[];
}

export interface CustomerFarmArea extends BaseEntity {
  customer_id: UUID;
  farm_id: UUID;
  area_id: UUID;
  farms?: Pick<Farm, 'id' | 'farm_name'> | null;
  customer_areas?: Pick<CustomerArea, 'id' | 'area_name' | 'farm_id'> | null;
}

export interface FarmProductPrice extends BaseEntity {
  farm_id: UUID;
  product_id: UUID;
  pricing_method: PricingMethod;
  price_amount: number;
  effective_date: string;
  end_date?: string | null;
  is_active: boolean;
  notes?: string | null;
  farms?: Pick<Farm, 'id' | 'farm_name'> | null;
  farm_products?:
    | (Pick<FarmProduct, 'id' | 'product_name' | 'farm_id'> & {
        farms?: Pick<Farm, 'id' | 'farm_name'> | null;
      })
    | null;
}

export interface AreaSalesPrice extends BaseEntity {
  area_id: UUID;
  product_id: UUID;
  pricing_method: PricingMethod;
  price_amount: number;
  effective_date: string;
  end_date?: string | null;
  is_active: boolean;
  notes?: string | null;
  customer_areas?: Pick<CustomerArea, 'id' | 'area_name' | 'farm_id'> | null;
  farm_products?:
    | (Pick<FarmProduct, 'id' | 'product_name' | 'farm_id'> & {
        farms?: Pick<Farm, 'id' | 'farm_name'> | null;
      })
    | null;
}

export interface DailyOrder extends BaseEntity {
  order_date: string;
  day_name: string;
  month: number;
  year: number;
  notes?: string | null;
}

export interface DailyOrderItem extends BaseEntity {
  daily_order_id: UUID;
  customer_id: UUID;
  area_id?: UUID | null;
  farm_id: UUID;
  product_id: UUID;
  pricing_method: PricingMethod;
  cage_count: number;
  cage_weight: number;
  cage_deduction_weight: number;
  gross_weight_kg: number;
  weight_entries_kg?: number[];
  net_weight_kg: number;
  net_weight_manually_adjusted: boolean;
  is_net_weight_manual?: boolean;
  product_quantity: number;
  farm_price: number;
  sales_price: number;
  estimated_cost: number;
  sales_amount: number;
  estimated_profit: number;
  actual_cost?: number | null;
  actual_profit?: number | null;
  customer_deduction_total: number;
  farm_deduction_total: number;
  adjusted_sales: number;
  adjusted_profit: number;
  notes?: string | null;
  daily_orders?: Pick<DailyOrder, 'id' | 'order_date' | 'day_name'> | null;
  customers?: Pick<Customer, 'id' | 'customer_name'> | null;
  customer_areas?: Pick<CustomerArea, 'id' | 'area_name' | 'farm_id'> | null;
  farms?: Pick<Farm, 'id' | 'farm_name'> | null;
  farm_products?: Pick<FarmProduct, 'id' | 'product_name'> | null;
}

export interface FarmOrderItem extends BaseEntity {
  daily_order_id: UUID;
  farm_id: UUID;
  product_id: UUID;
  pricing_method: PricingMethod;
  cage_count: number;
  cage_weight: number;
  cage_deduction_weight: number;
  gross_weight_kg: number;
  net_weight_kg: number;
  net_weight_manually_adjusted: boolean;
  product_quantity: number;
  farm_price: number;
  estimated_cost: number;
  actual_cost?: number | null;
  notes?: string | null;
  farms?: Pick<Farm, 'id' | 'farm_name'> | null;
  farm_products?: Pick<FarmProduct, 'id' | 'product_name'> | null;
}

export interface ActualFarmCost extends BaseEntity {
  order_item_id: UUID;
  farm_id: UUID;
  actual_cost_amount: number;
  actual_cost_date: string;
  notes?: string | null;
}

export interface CustomerDeduction extends BaseEntity {
  customer_id: UUID;
  order_item_id: UUID;
  product_id: UUID;
  reason: DeductionReason;
  quantity: number;
  weight_kg?: number | null;
  sales_price_used: number;
  deduction_amount: number;
  notes?: string | null;
}

export interface FarmDeduction extends BaseEntity {
  farm_id: UUID;
  order_item_id?: UUID | null;
  product_id?: UUID | null;
  reason: DeductionReason;
  quantity: number;
  weight_kg?: number | null;
  deduction_pricing_method: DeductionPricingMethod;
  deduction_amount: number;
  approved_by_farm: boolean;
  notes?: string | null;
}

export interface FarmPaymentTerm extends BaseEntity {
  farm_id: UUID;
  payment_frequency: PaymentFrequency;
  payment_method: PaymentMethod;
  cheque_required: boolean;
  notes?: string | null;
}

export interface FarmPayment extends BaseEntity {
  farm_id: UUID;
  payment_amount: number;
  gross_purchase_amount?: number;
  advance_amount?: number;
  account_payable_amount?: number;
  payment_date: string;
  payment_method: PaymentMethod;
  cheque_number?: string | null;
  status: PaymentStatus;
  notes?: string | null;
  farms?: Pick<Farm, 'id' | 'farm_name'> | null;
  farm_payment_allocations?: FarmPaymentAllocation[];
}

export interface FarmPaymentAllocation extends BaseEntity {
  farm_payment_id: UUID;
  farm_id: UUID;
  daily_order_id: UUID;
  order_date: string;
  actual_purchase_amount: number;
  paid_amount: number;
  farm_payments?: Pick<FarmPayment, 'id' | 'payment_date' | 'payment_amount' | 'status' | 'payment_method' | 'cheque_number'> | null;
}

export interface CustomerPayment extends BaseEntity {
  customer_id: UUID;
  daily_order_id?: UUID | null;
  payment_date: string;
  payment_method: string;
  payment_amount: number;
  reference_no?: string | null;
  notes?: string | null;
  customers?: Pick<Customer, 'id' | 'customer_name'> | null;
  daily_orders?: Pick<DailyOrder, 'id' | 'order_date'> | null;
}

export interface CustomerPaymentDueDate extends BaseEntity {
  customer_id: UUID;
  daily_order_id?: UUID | null;
  order_date: string;
  due_date: string;
  payment_schedule: CustomerPaymentSchedule;
  custom_schedule_label?: string | null;
  notes?: string | null;
  customers?: Pick<Customer, 'id' | 'customer_name'> | null;
  daily_orders?: Pick<DailyOrder, 'id' | 'order_date'> | null;
}

export interface AppSetting extends BaseEntity {
  setting_key: string;
  setting_value: unknown;
  description?: string | null;
}

export interface ProfitReportRow {
  order_item_id: UUID;
  daily_order_id: UUID;
  order_date: string;
  day_name: string;
  month: number;
  year: number;
  customer_id: UUID;
  customer_name: string;
  area_id?: UUID | null;
  area_name?: string | null;
  farm_id: UUID;
  farm_name: string;
  product_id: UUID;
  product_name: string;
  pricing_method: PricingMethod;
  cage_count: number;
  cage_weight: number;
  gross_weight_kg: number;
  net_weight_kg: number;
  product_quantity: number;
  farm_price: number;
  sales_price: number;
  estimated_cost: number;
  sales_amount: number;
  estimated_profit: number;
  actual_cost?: number | null;
  actual_profit?: number | null;
  customer_deduction_amount: number;
  farm_deduction_amount: number;
  adjusted_sales: number;
  adjusted_cost: number;
  adjusted_profit: number;
}

export interface MonthlyProfitSummary {
  year: number;
  month: number;
  first_order_date: string;
  last_order_date: string;
  order_days: number;
  total_sales: number;
  total_estimated_cost: number;
  total_actual_cost: number;
  total_estimated_profit: number;
  total_actual_profit: number;
  total_customer_deduction: number;
  total_farm_deduction: number;
  total_adjusted_sales: number;
  total_adjusted_cost: number;
  total_adjusted_profit: number;
}

export type YearlyProfitSummary = Omit<MonthlyProfitSummary, 'month' | 'first_order_date' | 'last_order_date'>;

export interface FarmBalance {
  farm_id: UUID;
  farm_name: string;
  total_cost: number;
  total_farm_deduction: number;
  total_payable: number;
  total_paid: number;
  balance: number;
}

export interface CustomerOrderSummary {
  customer_id: UUID;
  customer_name: string;
  area_id?: UUID | null;
  area_name?: string | null;
  order_days: number;
  total_sales: number;
  total_customer_deduction: number;
  total_adjusted_sales: number;
  total_adjusted_profit: number;
  last_order_date?: string | null;
}
