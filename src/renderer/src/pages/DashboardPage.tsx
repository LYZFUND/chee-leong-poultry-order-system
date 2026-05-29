import { useEffect, useMemo, useState } from 'react';
import { BarChart3, CreditCard, DollarSign, Eye, TrendingUp } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { FormSelect } from '@renderer/components/ui/FormSelect';
import { LoadingState } from '@renderer/components/ui/LoadingState';
import { MoneyText } from '@renderer/components/ui/MoneyText';
import { PageTitle } from '@renderer/components/ui/PageTitle';
import { SummaryCard } from '@renderer/components/ui/SummaryCard';
import { farmService } from '@renderer/services/farmService';
import { orderService } from '@renderer/services/orderService';
import { reportService } from '@renderer/services/reportService';
import type { DailyOrder, FarmBalance, ProfitReportRow } from '@renderer/types/entities';
import { formatBusinessDate, toDateInputValue } from '@renderer/utils/date';
import { formatMoney, formatNumber } from '@renderer/utils/format';

type ChartPeriod = 'weekly' | 'monthly' | 'yearly';

interface DashboardState {
  profitRows: ProfitReportRow[];
  balances: FarmBalance[];
  orders: DailyOrder[];
}

interface ChartRange {
  dateFrom: string;
  dateTo: string;
  label: string;
}

interface ChartRow {
  key: string;
  label: string;
  sales: number;
  profit: number;
}

const chartPeriodOptions = [
  { label: 'Weekly (7 days)', value: 'weekly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Yearly', value: 'yearly' },
];

function parseDate(dateValue: string): Date {
  return new Date(`${dateValue}T00:00:00+08:00`);
}

function addDays(dateValue: string, days: number): string {
  const date = parseDate(dateValue);
  date.setDate(date.getDate() + days);
  return toDateInputValue(date);
}

function monthStart(dateValue: string): string {
  return `${dateValue.slice(0, 7)}-01`;
}

function yearStart(dateValue: string): string {
  return `${dateValue.slice(0, 4)}-01-01`;
}

function getChartRange(period: ChartPeriod): ChartRange {
  const today = toDateInputValue();

  if (period === 'weekly') {
    return {
      dateFrom: addDays(today, -6),
      dateTo: today,
      label: 'Weekly',
    };
  }

  if (period === 'monthly') {
    return {
      dateFrom: monthStart(today),
      dateTo: today,
      label: 'Monthly',
    };
  }

  return {
    dateFrom: yearStart(today),
    dateTo: today,
    label: 'Yearly',
  };
}

function enumerateDays(dateFrom: string, dateTo: string): string[] {
  const dates: string[] = [];
  let current = dateFrom;

  while (current <= dateTo && dates.length <= 370) {
    dates.push(current);
    current = addDays(current, 1);
  }

  return dates;
}

function enumerateMonths(dateFrom: string, dateTo: string): string[] {
  const months: string[] = [];
  const endMonth = dateTo.slice(0, 7);
  let year = Number(dateFrom.slice(0, 4));
  let month = Number(dateFrom.slice(5, 7));

  while (months.length <= 12) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    months.push(key);

    if (key === endMonth) {
      break;
    }

    month += 1;
    if (month > 12) {
      month = 1;
      year += 1;
    }
  }

  return months;
}

function formatMonthLabel(monthKey: string): string {
  return new Intl.DateTimeFormat('en-MY', { month: 'short' }).format(parseDate(`${monthKey}-01`));
}

function formatAxisMoney(value: number | string): string {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    return 'RM0';
  }

  if (Math.abs(amount) >= 1_000_000) {
    return `RM${formatNumber(amount / 1_000_000, 1)}M`;
  }

  if (Math.abs(amount) >= 1_000) {
    return `RM${formatNumber(amount / 1_000, 0)}K`;
  }

  return `RM${formatNumber(amount, 0)}`;
}

function buildChartRows(rows: ProfitReportRow[], period: ChartPeriod, range: ChartRange): ChartRow[] {
  const bucketKeys = period === 'weekly' || period === 'monthly'
    ? enumerateDays(range.dateFrom, range.dateTo)
    : enumerateMonths(range.dateFrom, range.dateTo);

  const buckets = new Map<string, ChartRow>();
  for (const key of bucketKeys) {
    buckets.set(key, {
      key,
      label: key.length === 10 ? key.slice(5) : formatMonthLabel(key),
      sales: 0,
      profit: 0,
    });
  }

  for (const row of rows) {
    const key = period === 'weekly' || period === 'monthly' ? row.order_date : row.order_date.slice(0, 7);
    const bucket = buckets.get(key);
    if (!bucket) {
      continue;
    }

    bucket.sales += row.sales_amount;
    bucket.profit += row.adjusted_profit;
  }

  return Array.from(buckets.values());
}

export function DashboardPage(): JSX.Element {
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('weekly');
  const [state, setState] = useState<DashboardState>({ profitRows: [], balances: [], orders: [] });
  const [loading, setLoading] = useState(true);

  const chartRange = useMemo(() => getChartRange(chartPeriod), [chartPeriod]);

  useEffect(() => {
    async function load(): Promise<void> {
      setLoading(true);
      const [profitRows, farms, orders] = await Promise.all([
        reportService.getProfitRows({ dateFrom: chartRange.dateFrom, dateTo: chartRange.dateTo }),
        farmService.listFarms(false),
        orderService.listDailyOrders(),
      ]);

      const balances = await Promise.all(farms.map((farm) => farmService.getFarmBalance(farm.id)));
      setState({
        profitRows,
        balances: balances.filter((balance): balance is FarmBalance => Boolean(balance)),
        orders,
      });
      setLoading(false);
    }

    void load();
  }, [chartRange.dateFrom, chartRange.dateTo]);

  const totals = useMemo(() => {
    return state.profitRows.reduce(
      (summary, row) => ({
        sales: summary.sales + row.sales_amount,
        estimatedCost: summary.estimatedCost + row.estimated_cost,
        adjustedProfit: summary.adjustedProfit + row.adjusted_profit,
        customerDeduction: summary.customerDeduction + row.customer_deduction_amount,
      }),
      { sales: 0, estimatedCost: 0, adjustedProfit: 0, customerDeduction: 0 },
    );
  }, [state.profitRows]);

  const chartRows = useMemo(
    () => buildChartRows(state.profitRows, chartPeriod, chartRange),
    [chartPeriod, chartRange, state.profitRows],
  );

  if (loading) {
    return <LoadingState />;
  }

  return (
    <>
      <PageTitle
        title="Dashboard"
        description="A quick view of sales, estimated purchase, profit, deductions, saved orders, and farm balances."
        actions={
          <div className="w-72 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
            <FormSelect
              label="Quick View Period"
              value={chartPeriod}
              options={chartPeriodOptions}
              onChange={(event) => setChartPeriod(event.target.value as ChartPeriod)}
            />
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <SummaryCard title={`${chartRange.label} Sales`} value={<MoneyText value={totals.sales} />} icon={DollarSign} tone="green" />
        <SummaryCard title={`${chartRange.label} Estimated Purchase`} value={<MoneyText value={totals.estimatedCost} />} icon={BarChart3} tone="blue" />
        <SummaryCard title={`${chartRange.label} Adjusted Profit`} value={<MoneyText value={totals.adjustedProfit} />} icon={TrendingUp} tone="amber" />
        <SummaryCard title={`${chartRange.label} Deductions`} value={<MoneyText value={totals.customerDeduction} />} icon={CreditCard} tone="rose" />
      </div>

      <section className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-[1.35fr_0.65fr]">
        <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <h2 className="text-base font-semibold text-ink-900">Sales and Profit</h2>
              <p className="mt-1 text-sm text-ink-500">
                {chartRange.dateFrom} to {chartRange.dateTo}
              </p>
            </div>
          </div>
          <div className="h-96">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartRows} margin={{ left: 18, right: 24, top: 16, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={10} />
                <YAxis
                  width={92}
                  tickFormatter={formatAxisMoney}
                  tickLine={false}
                  axisLine={false}
                  tickMargin={10}
                  allowDecimals={false}
                />
                <Tooltip formatter={(value) => formatMoney(Number(value))} />
                <Legend verticalAlign="top" height={32} />
                <Line type="monotone" dataKey="sales" name="Sales" stroke="#14b286" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                <Line type="monotone" dataKey="profit" name="Profit" stroke="#f59e0b" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-6">
          <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-ink-900">Daily Order Details</h2>
            <div className="mt-4 space-y-3">
              {state.orders.length === 0 ? (
                <p className="text-sm text-ink-500">No saved daily orders yet.</p>
              ) : (
                state.orders.slice(0, 5).map((order) => (
                  <div key={order.id} className="flex items-center justify-between gap-3 rounded-md bg-stone-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-ink-800">{formatBusinessDate(order.order_date)}</p>
                      <p className="text-xs text-ink-500">{order.day_name}</p>
                    </div>
                    <Link className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline" to={`/daily-orders/${order.id}`}>
                      <Eye size={15} />
                      View
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <h2 className="text-base font-semibold text-ink-900">Farm Balances</h2>
            <div className="mt-4 space-y-3">
              {state.balances.length === 0 ? (
                <p className="text-sm text-ink-500">No farm balances yet.</p>
              ) : (
                state.balances.slice(0, 6).map((balance) => (
                  <div key={balance.farm_id} className="flex items-center justify-between gap-3 rounded-md bg-stone-50 px-3 py-2">
                    <div>
                      <p className="text-sm font-medium text-ink-700">{balance.farm_name}</p>
                      <MoneyText value={balance.balance} className="font-semibold text-ink-900" />
                    </div>
                    <Link className="inline-flex items-center gap-2 text-sm font-semibold text-brand-700 hover:underline" to={`/farms/${balance.farm_id}`}>
                      View Farm
                    </Link>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </section>
    </>
  );
}
