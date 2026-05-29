import type {
  MonthlyProfitSummary,
  ProfitReportRow,
  UUID,
  YearlyProfitSummary,
} from '@renderer/types/entities';
import { downloadCsv, downloadCsvMatrix } from '@renderer/utils/csv';
import { ensureData } from './supabaseQuery';
import { supabase } from './supabaseClient';

export type StructuredReportPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface ProfitFilters {
  date?: string;
  dateFrom?: string;
  dateTo?: string;
  month?: number;
  year?: number;
  customerId?: UUID;
  areaId?: UUID;
  farmId?: UUID;
  productId?: UUID;
}

function buildProfitQuery(filters: ProfitFilters) {
  let query = supabase.from('daily_order_profit_view').select('*');
  if (filters.date) {
    query = query.eq('order_date', filters.date);
  }
  if (filters.dateFrom) {
    query = query.gte('order_date', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte('order_date', filters.dateTo);
  }
  if (filters.month) {
    query = query.eq('month', filters.month);
  }
  if (filters.year) {
    query = query.eq('year', filters.year);
  }
  if (filters.customerId) {
    query = query.eq('customer_id', filters.customerId);
  }
  if (filters.areaId) {
    query = query.eq('area_id', filters.areaId);
  }
  if (filters.farmId) {
    query = query.eq('farm_id', filters.farmId);
  }
  if (filters.productId) {
    query = query.eq('product_id', filters.productId);
  }

  return query.order('order_date', { ascending: false });
}

function buildFarmPurchaseQuery(filters: ProfitFilters) {
  let query = supabase
    .from('farm_order_items')
    .select('daily_order_id, farm_id, estimated_cost, actual_cost, daily_orders!inner(order_date, day_name, month, year), farms(id, farm_name)')
    .is('deleted_at', null);

  if (filters.date) {
    query = query.eq('daily_orders.order_date', filters.date);
  }
  if (filters.dateFrom) {
    query = query.gte('daily_orders.order_date', filters.dateFrom);
  }
  if (filters.dateTo) {
    query = query.lte('daily_orders.order_date', filters.dateTo);
  }
  if (filters.month) {
    query = query.eq('daily_orders.month', filters.month);
  }
  if (filters.year) {
    query = query.eq('daily_orders.year', filters.year);
  }
  if (filters.farmId) {
    query = query.eq('farm_id', filters.farmId);
  }

  return query.order('order_date', { ascending: true, referencedTable: 'daily_orders' });
}

interface ReportEntityColumn {
  id: UUID;
  name: string;
}

interface ReportTotals {
  estimatedPurchase: number;
  actualPurchase: number;
  sales: number;
  adjustedSales: number;
  salesDiscount: number;
  estimatedProfit: number;
  actualProfit: number;
}

interface ReportCustomerPayment {
  customer_id: UUID;
  payment_amount: number;
  payment_date: string;
}

interface ReportFarmPayment {
  farm_id: UUID;
  payment_amount: number;
  account_payable_amount?: number | null;
  payment_date: string;
  status: string;
}

interface FarmPurchaseReportRow {
  daily_order_id: UUID;
  order_date: string;
  day_name: string;
  month: number;
  year: number;
  farm_id: UUID;
  farm_name: string;
  estimated_cost: number;
  actual_cost?: number | null;
}

interface FarmPurchaseQueryRow {
  daily_order_id: UUID;
  farm_id: UUID;
  estimated_cost: number | string;
  actual_cost?: number | string | null;
  daily_orders?: {
    order_date: string;
    day_name: string;
    month: number;
    year: number;
  } | null;
  farms?: {
    id: UUID;
    farm_name: string;
  } | null;
}

function safeNumber(value: unknown): number {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) ? numericValue : 0;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function formatShortDate(dateValue: string, fallbackDayName?: string): string {
  const date = new Date(`${dateValue}T00:00:00+08:00`);
  const dayName =
    fallbackDayName?.slice(0, 3).toUpperCase() ??
    new Intl.DateTimeFormat('en-MY', {
      weekday: 'short',
      timeZone: 'Asia/Kuala_Lumpur',
    })
      .format(date)
      .toUpperCase();

  return `${date.getDate()}/${date.getMonth() + 1}/${String(date.getFullYear()).slice(-2)}, ${dayName}`;
}

function collectEntities(
  rows: ProfitReportRow[],
  getId: (row: ProfitReportRow) => UUID,
  getName: (row: ProfitReportRow) => string,
): ReportEntityColumn[] {
  const entities = new Map<UUID, string>();

  for (const row of rows) {
    entities.set(getId(row), getName(row));
  }

  return Array.from(entities, ([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
}

function groupRowsByDate(rows: ProfitReportRow[]): Array<{ key: string; label: string; rows: ProfitReportRow[] }> {
  const grouped = new Map<string, ProfitReportRow[]>();

  for (const row of rows) {
    const groupRows = grouped.get(row.order_date) ?? [];
    groupRows.push(row);
    grouped.set(row.order_date, groupRows);
  }

  return Array.from(grouped, ([key, groupRows]) => ({
    key,
    label: formatShortDate(key, groupRows[0]?.day_name),
    rows: groupRows,
  })).sort((a, b) => a.key.localeCompare(b.key));
}

function groupRowsByMonth<T extends { year: number; month: number }>(rows: T[]): Array<{ key: string; label: string; rows: T[] }> {
  const grouped = new Map<string, T[]>();

  for (const row of rows) {
    const key = `${row.year}-${String(row.month).padStart(2, '0')}`;
    const groupRows = grouped.get(key) ?? [];
    groupRows.push(row);
    grouped.set(key, groupRows);
  }

  return Array.from(grouped, ([key, groupRows]) => ({
    key,
    label: key,
    rows: groupRows,
  })).sort((a, b) => a.key.localeCompare(b.key));
}

function groupFarmRowsByDate(rows: FarmPurchaseReportRow[]): Array<{ key: string; label: string; rows: FarmPurchaseReportRow[] }> {
  const grouped = new Map<string, FarmPurchaseReportRow[]>();

  for (const row of rows) {
    const groupRows = grouped.get(row.order_date) ?? [];
    groupRows.push(row);
    grouped.set(row.order_date, groupRows);
  }

  return Array.from(grouped, ([key, groupRows]) => ({
    key,
    label: formatShortDate(key, groupRows[0]?.day_name),
    rows: groupRows,
  })).sort((a, b) => a.key.localeCompare(b.key));
}

function calculateTotals(rows: ProfitReportRow[]): ReportTotals {
  const totals = rows.reduce(
    (summary, row) => {
      const estimatedPurchase = safeNumber(row.estimated_cost);
      const actualPurchase = safeNumber(row.actual_cost);
      const sales = safeNumber(row.sales_amount);
      const adjustedSales = safeNumber(row.adjusted_sales);
      const salesDiscount = safeNumber(row.customer_deduction_amount);

      return {
        estimatedPurchase: summary.estimatedPurchase + estimatedPurchase,
        actualPurchase: summary.actualPurchase + actualPurchase,
        sales: summary.sales + sales,
        adjustedSales: summary.adjustedSales + adjustedSales,
        salesDiscount: summary.salesDiscount + salesDiscount,
        estimatedProfit: summary.estimatedProfit + (sales - estimatedPurchase),
        actualProfit: summary.actualProfit + (sales - actualPurchase),
      };
    },
    {
      estimatedPurchase: 0,
      actualPurchase: 0,
      sales: 0,
      adjustedSales: 0,
      salesDiscount: 0,
      estimatedProfit: 0,
      actualProfit: 0,
    },
  );

  return {
    estimatedPurchase: roundMoney(totals.estimatedPurchase),
    actualPurchase: roundMoney(totals.actualPurchase),
    sales: roundMoney(totals.sales),
    adjustedSales: roundMoney(totals.adjustedSales),
    salesDiscount: roundMoney(totals.salesDiscount),
    estimatedProfit: roundMoney(totals.estimatedProfit),
    actualProfit: roundMoney(totals.actualProfit),
  };
}

function calculateFarmPurchaseTotal(rows: FarmPurchaseReportRow[]): number {
  return roundMoney(rows.reduce((total, row) => total + safeNumber(row.actual_cost ?? row.estimated_cost), 0));
}

function periodTotalLabel(period: StructuredReportPeriod): string {
  if (period === 'daily') {
    return 'Daily';
  }
  if (period === 'weekly') {
    return 'Weekly';
  }
  if (period === 'monthly') {
    return 'Monthly';
  }
  return 'Yearly';
}

function buildPaymentTotalsByCustomer(payments: ReportCustomerPayment[]): Map<UUID, number> {
  const totals = new Map<UUID, number>();

  for (const payment of payments) {
    totals.set(
      payment.customer_id,
      roundMoney((totals.get(payment.customer_id) ?? 0) + safeNumber(payment.payment_amount)),
    );
  }

  return totals;
}

function buildPaymentTotalsByFarm(payments: ReportFarmPayment[]): Map<UUID, number> {
  const totals = new Map<UUID, number>();

  for (const payment of payments) {
    if (payment.status !== 'paid') {
      continue;
    }

    totals.set(
      payment.farm_id,
      roundMoney(
        (totals.get(payment.farm_id) ?? 0) +
          safeNumber(payment.account_payable_amount ?? payment.payment_amount),
      ),
    );
  }

  return totals;
}

function dateRangeFromRows(rows: Array<{ order_date: string }>): { startDate: string; endDate: string } | null {
  if (rows.length === 0) {
    return null;
  }

  const dates = rows.map((row) => row.order_date).sort((a, b) => a.localeCompare(b));
  const startDate = dates[0];
  const endDate = dates[dates.length - 1];

  if (!startDate || !endDate) {
    return null;
  }

  return { startDate, endDate };
}

async function getCustomerPaymentsForRows(rows: ProfitReportRow[]): Promise<ReportCustomerPayment[]> {
  const range = dateRangeFromRows(rows);
  const customerIds = Array.from(new Set(rows.map((row) => row.customer_id)));

  if (!range || customerIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('customer_payments')
    .select('customer_id, payment_amount, payment_date')
    .in('customer_id', customerIds)
    .gte('payment_date', range.startDate)
    .lte('payment_date', range.endDate)
    .is('deleted_at', null);
  return ensureData<ReportCustomerPayment[]>(data, error, []);
}

async function getFarmPaymentsForRows(rows: FarmPurchaseReportRow[]): Promise<ReportFarmPayment[]> {
  const range = dateRangeFromRows(rows);
  const farmIds = Array.from(new Set(rows.map((row) => row.farm_id)));

  if (!range || farmIds.length === 0) {
    return [];
  }

  const { data, error } = await supabase
    .from('farm_payments')
    .select('farm_id, payment_amount, account_payable_amount, payment_date, status')
    .in('farm_id', farmIds)
    .gte('payment_date', range.startDate)
    .lte('payment_date', range.endDate)
    .is('deleted_at', null);
  return ensureData<ReportFarmPayment[]>(data, error, []);
}

function buildStructuredProfitReportRows(
  rows: ProfitReportRow[],
  period: StructuredReportPeriod,
  customerPayments: ReportCustomerPayment[],
): unknown[][] {
  if (period === 'yearly') {
    return buildYearlyCustomerProfitReportRows(rows, customerPayments);
  }

  const farms = collectEntities(
    rows,
    (row) => row.farm_id,
    (row) => row.farm_name,
  );
  const customers = collectEntities(
    rows,
    (row) => row.customer_id,
    (row) => row.customer_name,
  );
  const header = [
    'Date and Day',
    ...farms.map((farm) => farm.name),
    '',
    'Date and Day',
    'PURCHASE/SALES/PROFIT',
    ...customers.map((customer) => customer.name),
    'TOTAL PURCHASE/SALES/PROFIT',
    'ACTUAL PURCHASE/SALES/PROFIT',
  ];
  const blankFarmCells = Array.from({ length: farms.length }, () => '');
  const matrix: unknown[][] = [header];
  const dateGroups = groupRowsByDate(rows);

  if (dateGroups.length === 0) {
    matrix.push(['No data', ...blankFarmCells, '', '', '', ...customers.map(() => ''), '', '']);
    return matrix;
  }

  for (const group of dateGroups) {
    const groupTotals = calculateTotals(group.rows);
    const farmActualPurchases = farms.map((farm) =>
      calculateTotals(group.rows.filter((row) => row.farm_id === farm.id)).actualPurchase,
    );
    const customerTotals = customers.map((customer) => calculateTotals(group.rows.filter((row) => row.customer_id === customer.id)));

    matrix.push([
      group.label,
      ...farmActualPurchases,
      '',
      group.label,
      'Purchase',
      ...customerTotals.map((total) => total.estimatedPurchase),
      groupTotals.estimatedPurchase,
      groupTotals.actualPurchase,
    ]);
    matrix.push([
      '',
      ...blankFarmCells,
      '',
      '',
      'Sales',
      ...customerTotals.map((total) => total.sales),
      groupTotals.sales,
      groupTotals.sales,
    ]);
    matrix.push([
      '',
      ...blankFarmCells,
      '',
      '',
      'Profit',
      ...customerTotals.map((total) => total.estimatedProfit),
      groupTotals.estimatedProfit,
      groupTotals.actualProfit,
    ]);
    matrix.push(Array.from({ length: header.length }, () => ''));
  }

  const grandTotals = calculateTotals(rows);
  const farmActualGrandTotals = farms.map((farm) => calculateTotals(rows.filter((row) => row.farm_id === farm.id)).actualPurchase);
  const customerGrandTotals = customers.map((customer) => calculateTotals(rows.filter((row) => row.customer_id === customer.id)));
  const paymentTotalsByCustomer = buildPaymentTotalsByCustomer(customerPayments);
  const customerCollectedTotals = customers.map((customer) => paymentTotalsByCustomer.get(customer.id) ?? 0);
  const customerReceivableTotals = customerGrandTotals.map((total, index) =>
    roundMoney(Math.max(total.adjustedSales - (customerCollectedTotals[index] ?? 0), 0)),
  );
  const label = periodTotalLabel(period);

  matrix.push(Array.from({ length: header.length }, () => ''));
  matrix.push([
    `${label} Total`,
    ...farmActualGrandTotals,
    '',
    '',
    `${label} Total Purchase`,
    ...customerGrandTotals.map((total) => total.estimatedPurchase),
    grandTotals.estimatedPurchase,
    grandTotals.actualPurchase,
  ]);
  matrix.push([
    '',
    ...blankFarmCells,
    '',
    '',
    `${label} Total Sales`,
    ...customerGrandTotals.map((total) => total.sales),
    grandTotals.sales,
    grandTotals.sales,
  ]);
  matrix.push([
    '',
    ...blankFarmCells,
    '',
    '',
    `${label} Total Profit`,
    ...customerGrandTotals.map((total) => total.estimatedProfit),
    grandTotals.estimatedProfit,
    grandTotals.actualProfit,
  ]);
  matrix.push([
    '',
    ...blankFarmCells,
    '',
    '',
    'Account Receivable',
    ...customerReceivableTotals,
    roundMoney(customerReceivableTotals.reduce((total, value) => total + value, 0)),
    '',
  ]);
  matrix.push([
    '',
    ...blankFarmCells,
    '',
    '',
    'Sales Collected',
    ...customerCollectedTotals,
    roundMoney(customerCollectedTotals.reduce((total, value) => total + value, 0)),
    '',
  ]);
  matrix.push([
    '',
    ...blankFarmCells,
    '',
    '',
    'Net Sales',
    ...customerGrandTotals.map((total) => total.adjustedSales),
    grandTotals.adjustedSales,
    '',
  ]);
  matrix.push([
    '',
    ...blankFarmCells,
    '',
    '',
    'Total Sales Discount',
    ...customerGrandTotals.map((total) => total.salesDiscount),
    grandTotals.salesDiscount,
    '',
  ]);

  return matrix;
}

function buildYearlyCustomerProfitReportRows(
  rows: ProfitReportRow[],
  customerPayments: ReportCustomerPayment[],
): unknown[][] {
  const customers = collectEntities(
    rows,
    (row) => row.customer_id,
    (row) => row.customer_name,
  );
  const header = ['Month', ...customers.map((customer) => customer.name), 'TOTAL'];
  const matrix: unknown[][] = [header];
  const monthGroups = groupRowsByMonth(rows);

  if (monthGroups.length === 0) {
    matrix.push(['No data', ...customers.map(() => ''), '']);
    return matrix;
  }

  for (const group of monthGroups) {
    const customerTotals = customers.map((customer) =>
      calculateTotals(group.rows.filter((row) => row.customer_id === customer.id)),
    );
    const groupTotals = calculateTotals(group.rows);

    matrix.push([
      `${group.label} Total Sales`,
      ...customerTotals.map((total) => total.sales),
      groupTotals.sales,
    ]);
  }

  const grandTotals = calculateTotals(rows);
  const customerGrandTotals = customers.map((customer) => calculateTotals(rows.filter((row) => row.customer_id === customer.id)));
  const paymentTotalsByCustomer = buildPaymentTotalsByCustomer(customerPayments);
  const customerCollectedTotals = customers.map((customer) => paymentTotalsByCustomer.get(customer.id) ?? 0);
  const customerReceivableTotals = customerGrandTotals.map((total, index) =>
    roundMoney(Math.max(total.adjustedSales - (customerCollectedTotals[index] ?? 0), 0)),
  );

  matrix.push(Array.from({ length: header.length }, () => ''));
  matrix.push([
    'Monthly Total Purchase',
    ...customerGrandTotals.map((total) => total.estimatedPurchase),
    grandTotals.estimatedPurchase,
  ]);
  matrix.push([
    'Monthly Total Sales',
    ...customerGrandTotals.map((total) => total.sales),
    grandTotals.sales,
  ]);
  matrix.push([
    'Monthly Total Profit',
    ...customerGrandTotals.map((total) => total.estimatedProfit),
    grandTotals.estimatedProfit,
  ]);
  matrix.push([
    'Account Receivable',
    ...customerReceivableTotals,
    roundMoney(customerReceivableTotals.reduce((total, value) => total + value, 0)),
  ]);
  matrix.push([
    'Sales Collected',
    ...customerCollectedTotals,
    roundMoney(customerCollectedTotals.reduce((total, value) => total + value, 0)),
  ]);
  matrix.push([
    'Net Sales',
    ...customerGrandTotals.map((total) => total.adjustedSales),
    grandTotals.adjustedSales,
  ]);
  matrix.push([
    'Total Sales Discount',
    ...customerGrandTotals.map((total) => total.salesDiscount),
    grandTotals.salesDiscount,
  ]);

  return matrix;
}

function buildStructuredFarmPurchaseReportRows(
  rows: FarmPurchaseReportRow[],
  period: StructuredReportPeriod,
  farmPayments: ReportFarmPayment[],
): unknown[][] {
  if (period === 'yearly') {
    return buildYearlyFarmPurchaseReportRows(rows, farmPayments);
  }

  const farms = collectEntities(
    rows,
    (row) => row.farm_id,
    (row) => row.farm_name,
  );
  const header = ['Date and Day', ...farms.map((farm) => farm.name), 'TOTAL PURCHASE'];
  const matrix: unknown[][] = [header];
  const dateGroups = groupFarmRowsByDate(rows);

  if (dateGroups.length === 0) {
    matrix.push(['No data', ...farms.map(() => ''), '']);
    return matrix;
  }

  for (const group of dateGroups) {
    const farmTotals = farms.map((farm) =>
      calculateFarmPurchaseTotal(group.rows.filter((row) => row.farm_id === farm.id)),
    );
    matrix.push([
      group.label,
      ...farmTotals,
      roundMoney(farmTotals.reduce((total, value) => total + value, 0)),
    ]);
  }

  appendFarmPaymentSummaryRows(matrix, header.length, rows, farms, farmPayments);
  return matrix;
}

function buildYearlyFarmPurchaseReportRows(
  rows: FarmPurchaseReportRow[],
  farmPayments: ReportFarmPayment[],
): unknown[][] {
  const farms = collectEntities(
    rows,
    (row) => row.farm_id,
    (row) => row.farm_name,
  );
  const header = ['Month', ...farms.map((farm) => farm.name), 'TOTAL PURCHASE'];
  const matrix: unknown[][] = [header];
  const monthGroups = groupRowsByMonth(rows);

  if (monthGroups.length === 0) {
    matrix.push(['No data', ...farms.map(() => ''), '']);
    return matrix;
  }

  for (const group of monthGroups) {
    const farmTotals = farms.map((farm) =>
      calculateFarmPurchaseTotal(group.rows.filter((row) => row.farm_id === farm.id)),
    );
    matrix.push([
      group.label,
      ...farmTotals,
      roundMoney(farmTotals.reduce((total, value) => total + value, 0)),
    ]);
  }

  appendFarmPaymentSummaryRows(matrix, header.length, rows, farms, farmPayments);
  return matrix;
}

function appendFarmPaymentSummaryRows(
  matrix: unknown[][],
  headerLength: number,
  rows: FarmPurchaseReportRow[],
  farms: ReportEntityColumn[],
  farmPayments: ReportFarmPayment[],
): void {
  const purchaseTotals = farms.map((farm) =>
    calculateFarmPurchaseTotal(rows.filter((row) => row.farm_id === farm.id)),
  );
  const paidTotalsByFarm = buildPaymentTotalsByFarm(farmPayments);
  const paidTotals = farms.map((farm) => paidTotalsByFarm.get(farm.id) ?? 0);
  const payableTotals = purchaseTotals.map((purchase, index) =>
    roundMoney(Math.max(purchase - (paidTotals[index] ?? 0), 0)),
  );

  matrix.push(Array.from({ length: headerLength }, () => ''));
  matrix.push([
    'Total Purchase',
    ...purchaseTotals,
    roundMoney(purchaseTotals.reduce((total, value) => total + value, 0)),
  ]);
  matrix.push([
    'Total Amount Paid',
    ...paidTotals,
    roundMoney(paidTotals.reduce((total, value) => total + value, 0)),
  ]);
  matrix.push([
    'Account Payable',
    ...payableTotals,
    roundMoney(payableTotals.reduce((total, value) => total + value, 0)),
  ]);
}

export const reportService = {
  async getProfitRows(filters: ProfitFilters = {}): Promise<ProfitReportRow[]> {
    const { data, error } = await buildProfitQuery(filters);
    return ensureData<ProfitReportRow[]>(data, error, []);
  },

  async getFarmPurchaseRows(filters: ProfitFilters = {}): Promise<FarmPurchaseReportRow[]> {
    const { data, error } = await buildFarmPurchaseQuery(filters);
    const rows = ensureData<FarmPurchaseQueryRow[]>(data, error, []);

    return rows
      .map((row) => ({
        daily_order_id: row.daily_order_id,
        order_date: row.daily_orders?.order_date ?? '',
        day_name: row.daily_orders?.day_name ?? '',
        month: Number(row.daily_orders?.month ?? 0),
        year: Number(row.daily_orders?.year ?? 0),
        farm_id: row.farm_id,
        farm_name: row.farms?.farm_name ?? 'Farm',
        estimated_cost: safeNumber(row.estimated_cost),
        actual_cost: row.actual_cost === null || row.actual_cost === undefined ? null : safeNumber(row.actual_cost),
      }))
      .filter((row) => row.order_date)
      .sort((a, b) => a.order_date.localeCompare(b.order_date));
  },

  async getMonthlySummary(year: number, month: number): Promise<MonthlyProfitSummary | null> {
    const { data, error } = await supabase
      .from('monthly_profit_summary_view')
      .select('*')
      .eq('year', year)
      .eq('month', month)
      .maybeSingle();
    return ensureData<MonthlyProfitSummary | null>(data, error, null);
  },

  async getYearlySummary(year: number): Promise<YearlyProfitSummary | null> {
    const { data, error } = await supabase
      .from('yearly_profit_summary_view')
      .select('*')
      .eq('year', year)
      .maybeSingle();
    return ensureData<YearlyProfitSummary | null>(data, error, null);
  },

  async getMonthlyRows(year: number, month: number): Promise<ProfitReportRow[]> {
    return reportService.getProfitRows({ year, month });
  },

  async getYearlyRows(year: number): Promise<ProfitReportRow[]> {
    return reportService.getProfitRows({ year });
  },

  async getMonthlyFarmPurchaseRows(year: number, month: number): Promise<FarmPurchaseReportRow[]> {
    return reportService.getFarmPurchaseRows({ year, month });
  },

  async getYearlyFarmPurchaseRows(year: number): Promise<FarmPurchaseReportRow[]> {
    return reportService.getFarmPurchaseRows({ year });
  },

  exportProfitRows(filename: string, rows: ProfitReportRow[]): void {
    downloadCsv(
      filename,
      rows.map((row) => ({
        date: row.order_date,
        day: row.day_name,
        customer: row.customer_name,
        area: row.area_name,
        farm: row.farm_name,
        product: row.product_name,
        pricing_method: row.pricing_method,
        cost_estimated: row.estimated_cost,
        cost_actual: row.actual_cost ?? '',
        sales: row.sales_amount,
        customer_deduction: row.customer_deduction_amount,
        farm_deduction: row.farm_deduction_amount,
        estimated_profit: row.estimated_profit,
        actual_profit: row.actual_profit ?? '',
        adjusted_sales: row.adjusted_sales,
        adjusted_profit: row.adjusted_profit,
      })),
    );
  },

  async exportStructuredProfitReport(filename: string, rows: ProfitReportRow[], period: StructuredReportPeriod): Promise<void> {
    const customerPayments = await getCustomerPaymentsForRows(rows);
    downloadCsvMatrix(filename, buildStructuredProfitReportRows(rows, period, customerPayments));
  },

  async exportStructuredFarmPurchaseReport(
    filename: string,
    rows: FarmPurchaseReportRow[],
    period: StructuredReportPeriod,
  ): Promise<void> {
    const farmPayments = await getFarmPaymentsForRows(rows);
    downloadCsvMatrix(filename, buildStructuredFarmPurchaseReportRows(rows, period, farmPayments));
  },
};
