import type {
  Customer,
  CustomerFarmArea,
  CustomerOrderSummary,
  CustomerPayment,
  CustomerPaymentDueDate,
  CustomerPaymentSchedule,
  DailyOrderItem,
  ProfitReportRow,
  UUID,
} from '@renderer/types/entities';
import { nowIso, ensureData } from './supabaseQuery';
import { supabase } from './supabaseClient';

type CustomerInput = Pick<
  Customer,
  'customer_name' | 'farm_id' | 'area_id' | 'phone' | 'address' | 'notes' | 'is_active'
>;

export interface CustomerFarmAreaInput {
  farm_id: UUID;
  area_id: UUID;
}

export interface CustomerPaymentInput {
  customer_id: UUID;
  daily_order_id?: UUID | null;
  payment_date: string;
  payment_method: string;
  payment_amount: number;
  reference_no?: string | null;
  notes?: string | null;
}

export interface CustomerPaymentDueDateInput {
  customer_id: UUID;
  daily_order_id?: UUID | null;
  order_date: string;
  due_date: string;
  payment_schedule: CustomerPaymentSchedule;
  custom_schedule_label?: string | null;
  notes?: string | null;
}

export const customerService = {
  async listCustomers(includeInactive = true): Promise<Customer[]> {
    let query = supabase
      .from('customers')
      .select(
        '*, farms(id, farm_name), customer_areas(id, area_name, farm_id), customer_farm_areas(id, customer_id, farm_id, area_id, farms(id, farm_name), customer_areas(id, area_name, farm_id))',
      )
      .is('deleted_at', null)
      .order('customer_name');

    if (!includeInactive) {
      query = query.eq('is_active', true);
    }

    const { data, error } = await query;
    return ensureData<Customer[]>(data, error, []);
  },

  async getCustomer(id: UUID): Promise<Customer | null> {
    const { data, error } = await supabase
      .from('customers')
      .select(
        '*, farms(id, farm_name), customer_areas(id, area_name, farm_id), customer_farm_areas(id, customer_id, farm_id, area_id, farms(id, farm_name), customer_areas(id, area_name, farm_id))',
      )
      .eq('id', id)
      .is('deleted_at', null)
      .maybeSingle();
    return ensureData<Customer | null>(data, error, null);
  },

  async createCustomer(input: CustomerInput): Promise<Customer> {
    const { data, error } = await supabase.from('customers').insert(input).select('*').single();
    return ensureData<Customer>(data, error, {} as Customer);
  },

  async createCustomerWithAssignments(input: CustomerInput, assignments: CustomerFarmAreaInput[]): Promise<Customer> {
    const customer = await customerService.createCustomer(input);
    await customerService.replaceCustomerFarmAreas(customer.id, assignments);
    return customer;
  },

  async updateCustomer(id: UUID, input: Partial<CustomerInput>): Promise<Customer> {
    const { data, error } = await supabase.from('customers').update(input).eq('id', id).select('*').single();
    return ensureData<Customer>(data, error, {} as Customer);
  },

  async updateCustomerWithAssignments(
    id: UUID,
    input: Partial<CustomerInput>,
    assignments: CustomerFarmAreaInput[],
  ): Promise<Customer> {
    const customer = await customerService.updateCustomer(id, input);
    await customerService.replaceCustomerFarmAreas(id, assignments);
    return customer;
  },

  async listCustomerFarmAreas(customerId: UUID): Promise<CustomerFarmArea[]> {
    const { data, error } = await supabase
      .from('customer_farm_areas')
      .select('*, farms(id, farm_name), customer_areas(id, area_name, farm_id)')
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .order('created_at');
    return ensureData<CustomerFarmArea[]>(data, error, []);
  },

  async replaceCustomerFarmAreas(customerId: UUID, assignments: CustomerFarmAreaInput[]): Promise<void> {
    const uniqueAssignments = Array.from(
      new Map(assignments.map((assignment) => [`${assignment.farm_id}:${assignment.area_id}`, assignment])).values(),
    );

    const { error: deleteError } = await supabase
      .from('customer_farm_areas')
      .update({ deleted_at: nowIso() })
      .eq('customer_id', customerId)
      .is('deleted_at', null);

    if (deleteError) {
      throw new Error(deleteError.message);
    }

    if (uniqueAssignments.length === 0) {
      return;
    }

    const { error } = await supabase.from('customer_farm_areas').upsert(
      uniqueAssignments.map((assignment) => ({
        customer_id: customerId,
        farm_id: assignment.farm_id,
        area_id: assignment.area_id,
        deleted_at: null,
      })),
      {
        onConflict: 'customer_id,farm_id,area_id',
      },
    );

    if (error) {
      throw new Error(error.message);
    }
  },

  async softDeleteCustomer(id: UUID): Promise<void> {
    const { error } = await supabase
      .from('customers')
      .update({ deleted_at: nowIso(), is_active: false })
      .eq('id', id);
    if (error) {
      throw new Error(error.message);
    }
  },

  async getCustomerSummary(id: UUID): Promise<CustomerOrderSummary | null> {
    const { data, error } = await supabase
      .from('daily_order_profit_view')
      .select('*')
      .eq('customer_id', id);
    const rows = ensureData<ProfitReportRow[]>(data, error, []);

    if (rows.length === 0) {
      return null;
    }

    const orderDays = new Set(rows.map((row) => row.daily_order_id));
    const lastOrderDate = rows.reduce<string | null>(
      (latest, row) => (!latest || row.order_date > latest ? row.order_date : latest),
      null,
    );

    return {
      customer_id: id,
      customer_name: rows[0]?.customer_name ?? '',
      area_id: null,
      area_name: null,
      order_days: orderDays.size,
      total_sales: rows.reduce((total, row) => total + Number(row.sales_amount ?? 0), 0),
      total_customer_deduction: rows.reduce(
        (total, row) => total + Number(row.customer_deduction_amount ?? 0),
        0,
      ),
      total_adjusted_sales: rows.reduce(
        (total, row) => total + Number(row.adjusted_sales ?? 0),
        0,
      ),
      total_adjusted_profit: rows.reduce(
        (total, row) => total + Number(row.adjusted_profit ?? 0),
        0,
      ),
      last_order_date: lastOrderDate,
    };
  },

  async getCustomerReportRows(id: UUID): Promise<ProfitReportRow[]> {
    const { data, error } = await supabase
      .from('daily_order_profit_view')
      .select('*')
      .eq('customer_id', id)
      .order('order_date', { ascending: false });
    return ensureData<ProfitReportRow[]>(data, error, []);
  },

  async getCustomerOrderItemsByDate(customerId: UUID, orderDate: string): Promise<DailyOrderItem[]> {
    const { data, error } = await supabase
      .from('daily_order_items')
      .select(
        '*, daily_orders!inner(id, order_date, day_name), farms(id, farm_name), farm_products(id, product_name), customer_areas(id, area_name, farm_id)',
      )
      .eq('customer_id', customerId)
      .eq('daily_orders.order_date', orderDate)
      .is('deleted_at', null)
      .order('created_at');
    return ensureData<DailyOrderItem[]>(data, error, []);
  },

  async listCustomerPayments(customerId: UUID): Promise<CustomerPayment[]> {
    const { data, error } = await supabase
      .from('customer_payments')
      .select('*, daily_orders(id, order_date)')
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .order('payment_date', { ascending: false });
    return ensureData<CustomerPayment[]>(data, error, []);
  },

  async createCustomerPayment(input: CustomerPaymentInput): Promise<CustomerPayment> {
    const { data, error } = await supabase
      .from('customer_payments')
      .insert(input)
      .select('*, daily_orders(id, order_date)')
      .single();
    return ensureData<CustomerPayment>(data, error, {} as CustomerPayment);
  },

  async softDeleteCustomerPayment(id: UUID): Promise<void> {
    const { error } = await supabase
      .from('customer_payments')
      .update({ deleted_at: nowIso() })
      .eq('id', id);

    if (error) {
      throw new Error(error.message);
    }
  },

  async getCustomerPaymentDueDate(customerId: UUID, orderDate: string): Promise<CustomerPaymentDueDate | null> {
    const { data, error } = await supabase
      .from('customer_payment_due_dates')
      .select('*, daily_orders(id, order_date)')
      .eq('customer_id', customerId)
      .eq('order_date', orderDate)
      .is('deleted_at', null)
      .maybeSingle();
    return ensureData<CustomerPaymentDueDate | null>(data, error, null);
  },

  async listCustomerPaymentDueDates(customerId: UUID): Promise<CustomerPaymentDueDate[]> {
    const { data, error } = await supabase
      .from('customer_payment_due_dates')
      .select('*, daily_orders(id, order_date)')
      .eq('customer_id', customerId)
      .is('deleted_at', null)
      .order('order_date', { ascending: false });
    return ensureData<CustomerPaymentDueDate[]>(data, error, []);
  },

  async upsertCustomerPaymentDueDate(input: CustomerPaymentDueDateInput): Promise<CustomerPaymentDueDate> {
    const { data, error } = await supabase
      .from('customer_payment_due_dates')
      .upsert(
        {
          ...input,
          deleted_at: null,
        },
        { onConflict: 'customer_id,order_date' },
      )
      .select('*, daily_orders(id, order_date)')
      .single();
    return ensureData<CustomerPaymentDueDate>(data, error, {} as CustomerPaymentDueDate);
  },
};
