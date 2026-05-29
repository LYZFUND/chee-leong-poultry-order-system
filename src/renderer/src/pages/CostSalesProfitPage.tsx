import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Download, WalletCards } from 'lucide-react';
import { Button } from '@renderer/components/ui/Button';
import { DataTable } from '@renderer/components/ui/DataTable';
import { FormDatePicker } from '@renderer/components/ui/FormDatePicker';
import { FormInput } from '@renderer/components/ui/FormInput';
import { FormSelect } from '@renderer/components/ui/FormSelect';
import { LoadingState } from '@renderer/components/ui/LoadingState';
import { MoneyText } from '@renderer/components/ui/MoneyText';
import { PageTitle } from '@renderer/components/ui/PageTitle';
import { SummaryCard } from '@renderer/components/ui/SummaryCard';
import { areaService } from '@renderer/services/areaService';
import { customerService } from '@renderer/services/customerService';
import { farmService } from '@renderer/services/farmService';
import { productService } from '@renderer/services/productService';
import { reportService, type ProfitFilters } from '@renderer/services/reportService';
import type { Customer, CustomerArea, Farm, FarmProduct, ProfitReportRow } from '@renderer/types/entities';
import { getCurrentMonth, getCurrentYear, toDateInputValue } from '@renderer/utils/date';
import { labelFromValue } from '@renderer/utils/format';

type ViewMode = 'daily' | 'monthly' | 'yearly';

interface FarmProfitGroup {
  farmId: string;
  farmName: string;
  rows: ProfitReportRow[];
  totals: {
    sales: number;
    estimatedCost: number;
    actualCost: number;
    adjustedProfit: number;
  };
}

export function CostSalesProfitPage(): JSX.Element {
  const [viewMode, setViewMode] = useState<ViewMode>('daily');
  const [date, setDate] = useState(toDateInputValue());
  const [month, setMonth] = useState(getCurrentMonth());
  const [year, setYear] = useState(getCurrentYear());
  const [customerId, setCustomerId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [farmId, setFarmId] = useState('');
  const [productId, setProductId] = useState('');
  const [rows, setRows] = useState<ProfitReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [areas, setAreas] = useState<CustomerArea[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [products, setProducts] = useState<FarmProduct[]>([]);

  useEffect(() => {
    void Promise.all([
      customerService.listCustomers(false),
      areaService.listAreas(false),
      farmService.listFarms(false),
      productService.listProducts(false),
    ]).then(([customerRows, areaRows, farmRows, productRows]) => {
      setCustomers(customerRows);
      setAreas(areaRows);
      setFarms(farmRows);
      setProducts(productRows);
    });
  }, []);

  useEffect(() => {
    async function load(): Promise<void> {
      setLoading(true);
      const filters: ProfitFilters = {
        customerId: customerId || undefined,
        areaId: areaId || undefined,
        farmId: farmId || undefined,
        productId: productId || undefined,
      };

      if (viewMode === 'daily') {
        filters.date = date;
      }
      if (viewMode === 'monthly') {
        filters.month = month;
        filters.year = year;
      }
      if (viewMode === 'yearly') {
        filters.year = year;
      }

      setRows(await reportService.getProfitRows(filters));
      setLoading(false);
    }

    void load();
  }, [areaId, customerId, date, farmId, month, productId, viewMode, year]);

  const totals = useMemo(() => {
    return rows.reduce(
      (summary, row) => ({
        totalSales: summary.totalSales + row.sales_amount,
        totalEstimatedCost: summary.totalEstimatedCost + row.estimated_cost,
        totalActualCost: summary.totalActualCost + (row.actual_cost ?? 0),
        totalEstimatedProfit: summary.totalEstimatedProfit + row.estimated_profit,
        totalActualProfit: summary.totalActualProfit + (row.actual_profit ?? 0),
        totalCustomerDeduction: summary.totalCustomerDeduction + row.customer_deduction_amount,
        totalFarmDeduction: summary.totalFarmDeduction + row.farm_deduction_amount,
        totalAdjustedProfit: summary.totalAdjustedProfit + row.adjusted_profit,
      }),
      {
        totalSales: 0,
        totalEstimatedCost: 0,
        totalActualCost: 0,
        totalEstimatedProfit: 0,
        totalActualProfit: 0,
        totalCustomerDeduction: 0,
        totalFarmDeduction: 0,
        totalAdjustedProfit: 0,
      },
    );
  }, [rows]);

  const columns = useMemo<ColumnDef<ProfitReportRow, unknown>[]>(
    () => [
      { accessorKey: 'order_date', header: 'Date' },
      { accessorKey: 'day_name', header: 'Day' },
      { accessorKey: 'customer_name', header: 'Customer' },
      { accessorKey: 'product_name', header: 'Product' },
      { accessorKey: 'pricing_method', header: 'Pricing', cell: ({ row }) => labelFromValue(row.original.pricing_method) },
      { accessorKey: 'estimated_cost', header: 'Est. Purchase', cell: ({ row }) => <MoneyText value={row.original.estimated_cost} /> },
      { accessorKey: 'actual_cost', header: 'Actual Purchase', cell: ({ row }) => <MoneyText value={row.original.actual_cost ?? 0} /> },
      { accessorKey: 'sales_amount', header: 'Sales', cell: ({ row }) => <MoneyText value={row.original.sales_amount} /> },
      {
        accessorKey: 'customer_deduction_amount',
        header: 'Customer Deduction',
        cell: ({ row }) => <MoneyText value={row.original.customer_deduction_amount} />,
      },
      {
        accessorKey: 'farm_deduction_amount',
        header: 'Farm Deduction',
        cell: ({ row }) => <MoneyText value={row.original.farm_deduction_amount} />,
      },
      { accessorKey: 'adjusted_profit', header: 'Adjusted Profit', cell: ({ row }) => <MoneyText value={row.original.adjusted_profit} /> },
    ],
    [],
  );

  const farmGroups = useMemo<FarmProfitGroup[]>(() => {
    const grouped = new Map<string, FarmProfitGroup>();

    for (const row of rows) {
      const group = grouped.get(row.farm_id) ?? {
        farmId: row.farm_id,
        farmName: row.farm_name,
        rows: [],
        totals: {
          sales: 0,
          estimatedCost: 0,
          actualCost: 0,
          adjustedProfit: 0,
        },
      };

      group.rows.push(row);
      group.totals.sales += row.sales_amount;
      group.totals.estimatedCost += row.estimated_cost;
      group.totals.actualCost += row.actual_cost ?? 0;
      group.totals.adjustedProfit += row.adjusted_profit;
      grouped.set(row.farm_id, group);
    }

    return Array.from(grouped.values());
  }, [rows]);

  return (
    <>
      <PageTitle
        title="Cost / Sales / Profit"
        description="Review daily, monthly, and yearly purchase, sales, profit, actual purchase, and deductions."
        actions={
          <Button onClick={() => reportService.exportProfitRows(`cost-sales-profit-${viewMode}.csv`, rows)}>
            <Download size={16} />
            Export CSV
          </Button>
        }
      />

      <div className="mb-5 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-8">
          <FormSelect
            label="View"
            value={viewMode}
            options={[
              { label: 'Daily', value: 'daily' },
              { label: 'Monthly', value: 'monthly' },
              { label: 'Yearly', value: 'yearly' },
            ]}
            onChange={(event) => setViewMode(event.target.value as ViewMode)}
          />
          {viewMode === 'daily' ? <FormDatePicker label="Date" value={date} onChange={(event) => setDate(event.target.value)} /> : null}
          {viewMode !== 'daily' ? (
            <FormInput label="Year" type="number" value={year} onChange={(event) => setYear(Number(event.target.value))} />
          ) : null}
          {viewMode === 'monthly' ? (
            <FormSelect
              label="Month"
              value={String(month)}
              options={Array.from({ length: 12 }, (_, index) => ({
                label: String(index + 1).padStart(2, '0'),
                value: String(index + 1),
              }))}
              onChange={(event) => setMonth(Number(event.target.value))}
            />
          ) : null}
          <FormSelect
            label="Customer"
            value={customerId}
            options={[{ label: 'All customers', value: '' }, ...customers.map((customer) => ({ label: customer.customer_name, value: customer.id }))]}
            onChange={(event) => setCustomerId(event.target.value)}
          />
          <FormSelect
            label="Area"
            value={areaId}
            options={[{ label: 'All areas', value: '' }, ...areas.map((area) => ({ label: area.area_name, value: area.id }))]}
            onChange={(event) => setAreaId(event.target.value)}
          />
          <FormSelect
            label="Farm"
            value={farmId}
            options={[{ label: 'All farms', value: '' }, ...farms.map((farm) => ({ label: farm.farm_name, value: farm.id }))]}
            onChange={(event) => setFarmId(event.target.value)}
          />
          <FormSelect
            label="Product"
            value={productId}
            options={[{ label: 'All products', value: '' }, ...products.map((product) => ({ label: product.product_name, value: product.id }))]}
            onChange={(event) => setProductId(event.target.value)}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <SummaryCard title="Total Sales" value={<MoneyText value={totals.totalSales} />} icon={WalletCards} tone="green" />
        <SummaryCard title="Estimated Purchase" value={<MoneyText value={totals.totalEstimatedCost} />} tone="blue" />
        <SummaryCard title="Actual Purchase" value={<MoneyText value={totals.totalActualCost} />} tone="neutral" />
        <SummaryCard title="Adjusted Profit" value={<MoneyText value={totals.totalAdjustedProfit} />} tone="amber" />
        <SummaryCard title="Estimated Profit" value={<MoneyText value={totals.totalEstimatedProfit} />} tone="green" />
        <SummaryCard title="Actual Profit" value={<MoneyText value={totals.totalActualProfit} />} tone="amber" />
        <SummaryCard title="Customer Deduction" value={<MoneyText value={totals.totalCustomerDeduction} />} tone="rose" />
        <SummaryCard title="Farm Deduction" value={<MoneyText value={totals.totalFarmDeduction} />} tone="blue" />
      </div>

      <div className="mt-6">
        {loading ? (
          <LoadingState />
        ) : farmGroups.length > 0 ? (
          <div className="space-y-5">
            {farmGroups.map((group) => (
              <section key={group.farmId} className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 border-b border-stone-200 pb-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <h2 className="text-base font-semibold text-ink-900">{group.farmName}</h2>
                    <p className="mt-1 text-sm text-ink-500">{group.rows.length} profit record(s)</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs font-semibold uppercase text-ink-500">Sales</p>
                      <p className="mt-1 font-semibold text-ink-900"><MoneyText value={group.totals.sales} /></p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-ink-500">Est. Purchase</p>
                      <p className="mt-1 font-semibold text-ink-900"><MoneyText value={group.totals.estimatedCost} /></p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-ink-500">Actual Purchase</p>
                      <p className="mt-1 font-semibold text-ink-900"><MoneyText value={group.totals.actualCost} /></p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-ink-500">Profit</p>
                      <p className="mt-1 font-semibold text-ink-900"><MoneyText value={group.totals.adjustedProfit} /></p>
                    </div>
                  </div>
                </div>
                <DataTable data={group.rows} columns={columns} emptyTitle="No profit records" />
              </section>
            ))}
          </div>
        ) : (
          <DataTable data={[]} columns={columns} emptyTitle="No profit records" />
        )}
      </div>
    </>
  );
}
