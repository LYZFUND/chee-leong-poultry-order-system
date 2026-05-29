import type { FarmPayment, FarmPaymentAllocation, FarmPaymentTerm, PaymentMethod, PaymentStatus, UUID } from '@renderer/types/entities';
import { nowIso, ensureData } from './supabaseQuery';
import { supabase } from './supabaseClient';

type PaymentInput = Pick<
  FarmPayment,
  'farm_id' | 'payment_amount' | 'payment_date' | 'payment_method' | 'cheque_number' | 'status' | 'notes'
>;

type PaymentTermInput = Pick<
  FarmPaymentTerm,
  'farm_id' | 'payment_frequency' | 'payment_method' | 'cheque_required' | 'notes'
>;

export interface FarmUnpaidPurchase {
  daily_order_id: UUID;
  order_date: string;
  day_name: string;
  actual_purchase_amount: number;
  paid_amount: number;
  unpaid_amount: number;
}

export interface FarmPaymentWithAllocationsInput {
  farm_id: UUID;
  payment_date: string;
  payment_method: PaymentMethod;
  cheque_number?: string | null;
  status: PaymentStatus;
  notes?: string | null;
  gross_purchase_amount: number;
  advance_amount: number;
  selectedPurchases: FarmUnpaidPurchase[];
}

interface FarmOrderPaymentRow {
  daily_order_id: UUID;
  estimated_cost: number | string;
  actual_cost?: number | string | null;
  daily_orders?: {
    id: UUID;
    order_date: string;
    day_name: string;
  } | null;
}

function monthRange(yearMonth: string): { start: string; end: string } {
  const [year, month] = yearMonth.split('-').map(Number);
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const endDate = new Date(year, month, 1);
  const end = `${endDate.getFullYear()}-${String(endDate.getMonth() + 1).padStart(2, '0')}-01`;
  return { start, end };
}

function roundMoney(value: number): number {
  return Math.round((Number(value) + Number.EPSILON) * 100) / 100;
}

export const paymentService = {
  async listPayments(): Promise<FarmPayment[]> {
    const { data, error } = await supabase
      .from('farm_payments')
      .select('*, farms(id, farm_name)')
      .is('deleted_at', null)
      .order('payment_date', { ascending: false });
    return ensureData<FarmPayment[]>(data, error, []);
  },

  async listPaymentsByFarm(farmId: UUID): Promise<FarmPayment[]> {
    const { data, error } = await supabase
      .from('farm_payments')
      .select('*, farms(id, farm_name)')
      .eq('farm_id', farmId)
      .is('deleted_at', null)
      .order('payment_date', { ascending: false });
    return ensureData<FarmPayment[]>(data, error, []);
  },

  async listPaymentsByFarmAndMonth(farmId: UUID, yearMonth: string): Promise<FarmPayment[]> {
    const { start, end } = monthRange(yearMonth);
    const { data, error } = await supabase
      .from('farm_payments')
      .select('*, farms(id, farm_name), farm_payment_allocations(*)')
      .eq('farm_id', farmId)
      .gte('payment_date', start)
      .lt('payment_date', end)
      .is('deleted_at', null)
      .order('payment_date', { ascending: false });
    return ensureData<FarmPayment[]>(data, error, []);
  },

  async listUnpaidFarmPurchases(farmId: UUID, yearMonth: string): Promise<FarmUnpaidPurchase[]> {
    const { start, end } = monthRange(yearMonth);
    const { data, error } = await supabase
      .from('farm_order_items')
      .select('daily_order_id, estimated_cost, actual_cost, daily_orders!inner(id, order_date, day_name)')
      .eq('farm_id', farmId)
      .gte('daily_orders.order_date', start)
      .lt('daily_orders.order_date', end)
      .is('deleted_at', null);

    const orderRows = ensureData<FarmOrderPaymentRow[]>(data, error, []);

    const { data: allocationData, error: allocationError } = await supabase
      .from('farm_payment_allocations')
      .select('daily_order_id, paid_amount')
      .eq('farm_id', farmId)
      .gte('order_date', start)
      .lt('order_date', end)
      .is('deleted_at', null);

    const allocations = ensureData<Pick<FarmPaymentAllocation, 'daily_order_id' | 'paid_amount'>[]>(allocationData, allocationError, []);
    const paidByOrder = new Map<UUID, number>();
    for (const allocation of allocations) {
      paidByOrder.set(allocation.daily_order_id, roundMoney((paidByOrder.get(allocation.daily_order_id) ?? 0) + Number(allocation.paid_amount ?? 0)));
    }

    const grouped = new Map<UUID, FarmUnpaidPurchase>();
    for (const row of orderRows) {
      if (!row.daily_orders) {
        continue;
      }
      const current = grouped.get(row.daily_order_id) ?? {
        daily_order_id: row.daily_order_id,
        order_date: row.daily_orders.order_date,
        day_name: row.daily_orders.day_name,
        actual_purchase_amount: 0,
        paid_amount: 0,
        unpaid_amount: 0,
      };
      current.actual_purchase_amount = roundMoney(
        current.actual_purchase_amount + Number(row.actual_cost ?? row.estimated_cost ?? 0),
      );
      grouped.set(row.daily_order_id, current);
    }

    return Array.from(grouped.values())
      .map((purchase) => {
        const paidAmount = paidByOrder.get(purchase.daily_order_id) ?? 0;
        const unpaidAmount = roundMoney(Math.max(purchase.actual_purchase_amount - paidAmount, 0));
        return {
          ...purchase,
          paid_amount: paidAmount,
          unpaid_amount: unpaidAmount,
        };
      })
      .filter((purchase) => purchase.unpaid_amount > 0)
      .sort((a, b) => a.order_date.localeCompare(b.order_date));
  },

  async createPayment(input: PaymentInput): Promise<FarmPayment> {
    const { data, error } = await supabase.from('farm_payments').insert(input).select('*').single();
    return ensureData<FarmPayment>(data, error, {} as FarmPayment);
  },

  async createPaymentWithAllocations(input: FarmPaymentWithAllocationsInput): Promise<FarmPayment> {
    const selectedPurchases = input.selectedPurchases.filter((purchase) => purchase.unpaid_amount > 0);
    const grossPurchaseAmount = roundMoney(selectedPurchases.reduce((sum, purchase) => sum + purchase.unpaid_amount, 0));
    const advanceAmount = roundMoney(Math.min(Math.max(input.advance_amount, 0), grossPurchaseAmount));
    const accountPayableAmount = roundMoney(Math.max(grossPurchaseAmount - advanceAmount, 0));

    const { data, error } = await supabase
      .from('farm_payments')
      .insert({
        farm_id: input.farm_id,
        payment_amount: accountPayableAmount,
        gross_purchase_amount: grossPurchaseAmount,
        advance_amount: advanceAmount,
        account_payable_amount: accountPayableAmount,
        payment_date: input.payment_date,
        payment_method: input.payment_method,
        cheque_number: input.payment_method === 'cheque' ? input.cheque_number : null,
        status: input.status,
        notes: input.notes ?? null,
      })
      .select('*')
      .single();

    const payment = ensureData<FarmPayment>(data, error, {} as FarmPayment);
    const allocationRows = selectedPurchases.map((purchase) => ({
      farm_payment_id: payment.id,
      farm_id: input.farm_id,
      daily_order_id: purchase.daily_order_id,
      order_date: purchase.order_date,
      actual_purchase_amount: purchase.unpaid_amount,
      paid_amount: purchase.unpaid_amount,
    }));

    if (allocationRows.length > 0) {
      const { error: allocationError } = await supabase.from('farm_payment_allocations').insert(allocationRows);
      if (allocationError) {
        await supabase.from('farm_payments').update({ deleted_at: nowIso() }).eq('id', payment.id);
        throw new Error(allocationError.message);
      }
    }

    return payment;
  },

  async updatePayment(id: UUID, input: Partial<PaymentInput>): Promise<FarmPayment> {
    const { data, error } = await supabase.from('farm_payments').update(input).eq('id', id).select('*').single();
    return ensureData<FarmPayment>(data, error, {} as FarmPayment);
  },

  async softDeletePayment(id: UUID): Promise<void> {
    const deletedAt = nowIso();
    const { error } = await supabase.from('farm_payments').update({ deleted_at: deletedAt }).eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
    await supabase.from('farm_payment_allocations').update({ deleted_at: deletedAt }).eq('farm_payment_id', id);
  },

  async getPaymentTerm(farmId: UUID): Promise<FarmPaymentTerm | null> {
    const { data, error } = await supabase
      .from('farm_payment_terms')
      .select('*')
      .eq('farm_id', farmId)
      .is('deleted_at', null)
      .maybeSingle();
    return ensureData<FarmPaymentTerm | null>(data, error, null);
  },

  async upsertPaymentTerm(input: PaymentTermInput): Promise<FarmPaymentTerm> {
    const existing = await paymentService.getPaymentTerm(input.farm_id);

    if (existing) {
      const { data, error } = await supabase
        .from('farm_payment_terms')
        .update(input)
        .eq('id', existing.id)
        .select('*')
        .single();
      return ensureData<FarmPaymentTerm>(data, error, {} as FarmPaymentTerm);
    }

    const { data, error } = await supabase.from('farm_payment_terms').insert(input).select('*').single();
    return ensureData<FarmPaymentTerm>(data, error, {} as FarmPaymentTerm);
  },
};
