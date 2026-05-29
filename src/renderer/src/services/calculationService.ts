import type { DeductionPricingMethod, PricingMethod } from '@renderer/types/entities';

export interface WeightBasedOrderInput {
  cageCount?: number;
  cage_count?: number;
  cageWeight?: number;
  cage_weight?: number;
  grossWeightKg?: number;
  gross_weight_kg?: number;
  netWeightKg?: number | null;
  manualNetWeightKg?: number | null;
  manual_net_weight_kg?: number | null;
  farmPrice?: number;
  farm_price?: number;
  salesPrice?: number;
  sales_price?: number;
}

export interface ProductBasedOrderInput {
  productQuantity?: number;
  product_quantity?: number;
  farmPrice?: number;
  farm_price?: number;
  salesPrice?: number;
  sales_price?: number;
}

export interface CalculatedOrderValues {
  cageDeductionWeight: number;
  cage_deduction_weight: number;
  netWeightKg: number;
  net_weight_kg: number;
  estimatedCost: number;
  estimated_cost: number;
  salesAmount: number;
  sales_amount: number;
  estimatedProfit: number;
  estimated_profit: number;
  netWeightManuallyAdjusted: boolean;
  is_net_weight_manual: boolean;
}

export type OrderCalculationResult = CalculatedOrderValues;

export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function roundWeight(value: number): number {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

export function safeNumber(value: number | string | null | undefined): number {
  return Number.isFinite(Number(value)) ? Number(value) : 0;
}

function firstNumber(...values: Array<number | string | null | undefined>): number {
  const value = values.find((item) => item !== undefined && item !== null && item !== '');
  return safeNumber(value);
}

export function calculateEstimatedProfit(salesAmount: number, estimatedCost: number): number {
  return roundMoney(safeNumber(salesAmount) - safeNumber(estimatedCost));
}

export function calculateActualProfit(salesAmount: number, actualCost: number): number {
  return roundMoney(safeNumber(salesAmount) - safeNumber(actualCost));
}

export function calculateWeightBasedOrder(input: WeightBasedOrderInput): CalculatedOrderValues {
  const cageCount = Math.max(firstNumber(input.cageCount, input.cage_count), 0);
  const cageWeight = Math.max(firstNumber(input.cageWeight, input.cage_weight), 0);
  const grossWeightKg = Math.max(firstNumber(input.grossWeightKg, input.gross_weight_kg), 0);
  const cageDeductionWeight = roundWeight(cageCount * cageWeight);
  const calculatedNetWeight = Math.max(grossWeightKg - cageDeductionWeight, 0);
  const manualNetWeight = input.manualNetWeightKg ?? input.manual_net_weight_kg ?? input.netWeightKg;
  const manuallyAdjusted = manualNetWeight !== undefined && manualNetWeight !== null;
  const netWeightKg = roundWeight(Math.max(manuallyAdjusted ? safeNumber(manualNetWeight) : calculatedNetWeight, 0));
  const estimatedCost = roundMoney(netWeightKg * Math.max(firstNumber(input.farmPrice, input.farm_price), 0));
  const salesAmount = roundMoney(netWeightKg * Math.max(firstNumber(input.salesPrice, input.sales_price), 0));
  const estimatedProfit = calculateEstimatedProfit(salesAmount, estimatedCost);

  return {
    cageDeductionWeight,
    cage_deduction_weight: cageDeductionWeight,
    netWeightKg,
    net_weight_kg: netWeightKg,
    estimatedCost,
    estimated_cost: estimatedCost,
    salesAmount,
    sales_amount: salesAmount,
    estimatedProfit,
    estimated_profit: estimatedProfit,
    netWeightManuallyAdjusted: manuallyAdjusted,
    is_net_weight_manual: manuallyAdjusted,
  };
}

export function calculateProductBasedOrder(input: ProductBasedOrderInput): CalculatedOrderValues {
  const productQuantity = Math.max(firstNumber(input.productQuantity, input.product_quantity), 0);
  const estimatedCost = roundMoney(productQuantity * Math.max(firstNumber(input.farmPrice, input.farm_price), 0));
  const salesAmount = roundMoney(productQuantity * Math.max(firstNumber(input.salesPrice, input.sales_price), 0));
  const estimatedProfit = calculateEstimatedProfit(salesAmount, estimatedCost);

  return {
    cageDeductionWeight: 0,
    cage_deduction_weight: 0,
    netWeightKg: 0,
    net_weight_kg: 0,
    estimatedCost,
    estimated_cost: estimatedCost,
    salesAmount,
    sales_amount: salesAmount,
    estimatedProfit,
    estimated_profit: estimatedProfit,
    netWeightManuallyAdjusted: false,
    is_net_weight_manual: false,
  };
}

export function calculateCustomerDeduction(input: {
  pricingMethod: DeductionPricingMethod;
  quantity?: number;
  weightKg?: number;
  salesPrice: number;
  manualAmount?: number;
}): number {
  if (input.pricingMethod === 'manual_amount') {
    return roundMoney(Math.max(safeNumber(input.manualAmount), 0));
  }

  if (input.pricingMethod === 'per_kg') {
    return roundMoney(Math.max(safeNumber(input.weightKg), 0) * Math.max(safeNumber(input.salesPrice), 0));
  }

  return roundMoney(Math.max(safeNumber(input.quantity), 0) * Math.max(safeNumber(input.salesPrice), 0));
}

export function calculateAdjustedSales(salesAmount: number, customerDeduction: number): number {
  return roundMoney(Math.max(safeNumber(salesAmount) - safeNumber(customerDeduction), 0));
}

export function calculateAdjustedProfit(input: {
  adjustedSales: number;
  estimatedCost: number;
  actualCost?: number | null;
}): number {
  const cost = input.actualCost === null || input.actualCost === undefined ? input.estimatedCost : input.actualCost;
  return roundMoney(safeNumber(input.adjustedSales) - safeNumber(cost));
}

export function calculateOrderByPricingMethod(input: {
  pricingMethod: PricingMethod;
  cageCount: number;
  cageWeight: number;
  grossWeightKg: number;
  netWeightKg?: number | null;
  productQuantity: number;
  farmPrice: number;
  salesPrice: number;
}): CalculatedOrderValues {
  if (input.pricingMethod === 'price_per_kg') {
    return calculateWeightBasedOrder(input);
  }

  return calculateProductBasedOrder(input);
}
