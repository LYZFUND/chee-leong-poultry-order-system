import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, CircleDollarSign, Trash2 } from 'lucide-react';
import { Button } from '@renderer/components/ui/Button';
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog';
import { DataTable } from '@renderer/components/ui/DataTable';
import { DateText } from '@renderer/components/ui/DateText';
import { FormDatePicker } from '@renderer/components/ui/FormDatePicker';
import { FormInput } from '@renderer/components/ui/FormInput';
import { FormSelect } from '@renderer/components/ui/FormSelect';
import { LoadingState } from '@renderer/components/ui/LoadingState';
import { Modal } from '@renderer/components/ui/Modal';
import { MoneyText } from '@renderer/components/ui/MoneyText';
import { notify } from '@renderer/components/ui/Notification';
import { PageTitle } from '@renderer/components/ui/PageTitle';
import { SummaryCard } from '@renderer/components/ui/SummaryCard';
import { orderService } from '@renderer/services/orderService';
import type { DailyOrder, DailyOrderItem, FarmOrderItem } from '@renderer/types/entities';
import { toDateInputValue } from '@renderer/utils/date';
import { labelFromValue } from '@renderer/utils/format';

interface FarmOrderGroup {
  farmId: string;
  farmName: string;
  items: DailyOrderItem[];
  totals: {
    estimatedCost: number;
    sales: number;
    estimatedProfit: number;
    actualCost: number;
    actualSales: number;
    actualProfit: number;
    customerDeduction: number;
    hasActualCost: boolean;
  };
}

interface FarmPurchaseGroup {
  farmId: string;
  farmName: string;
  items: FarmOrderItem[];
}

interface CustomerProductGroup {
  productId: string;
  productName: string;
  items: DailyOrderItem[];
  totals: FarmOrderGroup['totals'];
}

interface FarmPurchaseProductGroup {
  productId: string;
  productName: string;
  items: FarmOrderItem[];
  totals: {
    estimatedPurchase: number;
    actualPurchase: number;
  };
}

function emptyFarmTotals(): FarmOrderGroup['totals'] {
  return {
    estimatedCost: 0,
    sales: 0,
    estimatedProfit: 0,
    actualCost: 0,
    actualSales: 0,
    actualProfit: 0,
    customerDeduction: 0,
    hasActualCost: false,
  };
}

function groupCustomerItemsByProduct(items: DailyOrderItem[]): CustomerProductGroup[] {
  const grouped = new Map<string, CustomerProductGroup>();

  for (const item of items) {
    const group = grouped.get(item.product_id) ?? {
      productId: item.product_id,
      productName: item.farm_products?.product_name ?? 'Unknown Product',
      items: [],
      totals: emptyFarmTotals(),
    };

    group.items.push(item);
    group.totals.estimatedCost += item.estimated_cost;
    group.totals.sales += item.sales_amount;
    group.totals.estimatedProfit += item.estimated_profit;
    group.totals.actualCost += item.actual_cost ?? 0;
    group.totals.actualSales += item.adjusted_sales;
    group.totals.customerDeduction += item.customer_deduction_total;
    group.totals.hasActualCost = group.totals.hasActualCost || (item.actual_cost !== null && item.actual_cost !== undefined);
    grouped.set(item.product_id, group);
  }

  return Array.from(grouped.values())
    .map((group) => ({
      ...group,
      totals: {
        ...group.totals,
        actualProfit: group.totals.hasActualCost ? group.totals.actualSales - group.totals.actualCost : 0,
      },
    }))
    .sort((a, b) => a.productName.localeCompare(b.productName));
}

function groupFarmPurchaseItemsByProduct(items: FarmOrderItem[]): FarmPurchaseProductGroup[] {
  const grouped = new Map<string, FarmPurchaseProductGroup>();

  for (const item of items) {
    const group = grouped.get(item.product_id) ?? {
      productId: item.product_id,
      productName: item.farm_products?.product_name ?? 'Unknown Product',
      items: [],
      totals: {
        estimatedPurchase: 0,
        actualPurchase: 0,
      },
    };

    group.items.push(item);
    group.totals.estimatedPurchase += item.estimated_cost;
    group.totals.actualPurchase += item.actual_cost ?? 0;
    grouped.set(item.product_id, group);
  }

  return Array.from(grouped.values()).sort((a, b) => a.productName.localeCompare(b.productName));
}

export function DailyOrderDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [order, setOrder] = useState<DailyOrder | null>(null);
  const [items, setItems] = useState<DailyOrderItem[]>([]);
  const [farmItems, setFarmItems] = useState<FarmOrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [actualCostItem, setActualCostItem] = useState<DailyOrderItem | null>(null);
  const [actualCostFarm, setActualCostFarm] = useState<FarmOrderGroup | null>(null);
  const [deductionItem, setDeductionItem] = useState<DailyOrderItem | null>(null);
  const [actualCostAmount, setActualCostAmount] = useState(0);
  const [actualCostDate, setActualCostDate] = useState(toDateInputValue());
  const [deductionReason, setDeductionReason] = useState('dead_chicken');
  const [deductionQuantity, setDeductionQuantity] = useState(0);
  const [deductionWeightKg, setDeductionWeightKg] = useState(0);
  const [deductionAmount, setDeductionAmount] = useState(0);
  const [customerFilter, setCustomerFilter] = useState('');
  const [farmFilter, setFarmFilter] = useState('');

  const refresh = useCallback(async (): Promise<void> => {
    if (!id) {
      return;
    }
    const [orderRow, itemRows, farmRows] = await Promise.all([
      orderService.getDailyOrder(id),
      orderService.getDailyOrderItems(id),
      orderService.getFarmOrderItems(id),
    ]);
    setOrder(orderRow);
    setItems(itemRows);
    setFarmItems(farmRows);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const totals = useMemo(() => {
    return items.reduce(
      (summary, item) => ({
        sales: summary.sales + item.sales_amount,
        cost: summary.cost + item.estimated_cost,
        actualCost: summary.actualCost + (item.actual_cost ?? 0),
        profit: summary.profit + item.adjusted_profit,
        customerDeduction: summary.customerDeduction + item.customer_deduction_total,
      }),
      { sales: 0, cost: 0, actualCost: 0, profit: 0, customerDeduction: 0 },
    );
  }, [items]);

  const filteredItems = useMemo(() => {
    const normalizedFilter = customerFilter.trim().toLowerCase();
    return items.filter((item) => {
      if (farmFilter && item.farm_id !== farmFilter) {
        return false;
      }

      if (!normalizedFilter) {
        return true;
      }

      return (item.customers?.customer_name ?? '').toLowerCase().includes(normalizedFilter);
    });
  }, [customerFilter, farmFilter, items]);

  const farmFilterOptions = useMemo(() => {
    const farms = new Map<string, string>();
    for (const item of items) {
      farms.set(item.farm_id, item.farms?.farm_name ?? 'Unknown Farm');
    }
    for (const item of farmItems) {
      farms.set(item.farm_id, item.farms?.farm_name ?? 'Unknown Farm');
    }

    return [
      { label: 'All farms', value: '' },
      ...Array.from(farms.entries())
        .sort((a, b) => a[1].localeCompare(b[1]))
        .map(([farmId, farmName]) => ({ label: farmName, value: farmId })),
    ];
  }, [farmItems, items]);

  const farmGroups = useMemo<FarmOrderGroup[]>(() => {
    const grouped = new Map<string, FarmOrderGroup>();

    for (const item of filteredItems) {
      const group = grouped.get(item.farm_id) ?? {
        farmId: item.farm_id,
        farmName: item.farms?.farm_name ?? 'Unknown Farm',
        items: [],
        totals: {
          estimatedCost: 0,
          sales: 0,
          estimatedProfit: 0,
          actualCost: 0,
          actualSales: 0,
          actualProfit: 0,
          customerDeduction: 0,
          hasActualCost: false,
        },
      };

      group.items.push(item);
      group.totals.estimatedCost += item.estimated_cost;
      group.totals.sales += item.sales_amount;
      group.totals.estimatedProfit += item.estimated_profit;
      group.totals.actualCost += item.actual_cost ?? 0;
      group.totals.actualSales += item.adjusted_sales;
      group.totals.customerDeduction += item.customer_deduction_total;
      group.totals.hasActualCost = group.totals.hasActualCost || (item.actual_cost !== null && item.actual_cost !== undefined);
      grouped.set(item.farm_id, group);
    }

    return Array.from(grouped.values()).map((group) => ({
      ...group,
      totals: {
        ...group.totals,
        actualProfit: group.totals.hasActualCost ? group.totals.actualSales - group.totals.actualCost : 0,
      },
    }));
  }, [filteredItems]);

  const farmPurchaseGroups = useMemo<FarmPurchaseGroup[]>(() => {
    const grouped = new Map<string, FarmPurchaseGroup>();

    for (const item of farmItems) {
      if (farmFilter && item.farm_id !== farmFilter) {
        continue;
      }

      const group = grouped.get(item.farm_id) ?? {
        farmId: item.farm_id,
        farmName: item.farms?.farm_name ?? 'Unknown Farm',
        items: [],
      };
      group.items.push(item);
      grouped.set(item.farm_id, group);
    }

    return Array.from(grouped.values());
  }, [farmFilter, farmItems]);

  async function submitActualCost(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!actualCostItem) {
      return;
    }

    try {
      await orderService.addActualFarmCost({
        orderItem: actualCostItem,
        actualCostAmount,
        actualCostDate,
      });
      notify.success('Actual farm purchase saved.');
      setActualCostItem(null);
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to save actual purchase.');
    }
  }

  async function submitFarmActualCost(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!actualCostFarm || !order) {
      return;
    }

    try {
      await orderService.applyFarmActualCost({
        dailyOrderId: order.id,
        farmId: actualCostFarm.farmId,
        actualCostAmount,
      });
      notify.success('Farm total actual purchase saved.');
      setActualCostFarm(null);
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to save farm actual purchase.');
    }
  }

  async function submitCustomerDeduction(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!deductionItem) {
      return;
    }

    try {
      await orderService.addCustomerDeduction({
        orderItem: deductionItem,
        reason: deductionReason as 'dead_chicken' | 'farm_problem' | 'other',
        quantity: deductionQuantity,
        weightKg: deductionWeightKg,
        deductionAmount,
      });
      notify.success('Customer deduction saved.');
      setDeductionItem(null);
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to save deduction.');
    }
  }

  async function deleteOrder(): Promise<void> {
    if (!id) {
      return;
    }
    await orderService.softDeleteDailyOrder(id);
    notify.success('Daily order deleted.');
    navigate('/daily-orders');
  }

  const columns = useMemo<ColumnDef<DailyOrderItem, unknown>[]>(
    () => [
      { accessorKey: 'customers.customer_name', header: 'Customer', cell: ({ row }) => row.original.customers?.customer_name ?? '-' },
      { accessorKey: 'farm_products.product_name', header: 'Product', cell: ({ row }) => row.original.farm_products?.product_name ?? '-' },
      { accessorKey: 'pricing_method', header: 'Pricing', cell: ({ row }) => labelFromValue(row.original.pricing_method) },
      { accessorKey: 'net_weight_kg', header: 'Net Kg' },
      { accessorKey: 'product_quantity', header: 'Qty' },
      { accessorKey: 'estimated_cost', header: 'Est. Purchase', cell: ({ row }) => <MoneyText value={row.original.estimated_cost} /> },
      { accessorKey: 'actual_cost', header: 'Actual Purchase', cell: ({ row }) => <MoneyText value={row.original.actual_cost ?? 0} /> },
      { accessorKey: 'sales_amount', header: 'Sales', cell: ({ row }) => <MoneyText value={row.original.sales_amount} /> },
      { accessorKey: 'customer_deduction_total', header: 'Deduction', cell: ({ row }) => <MoneyText value={row.original.customer_deduction_total} /> },
      { accessorKey: 'adjusted_profit', header: 'Profit', cell: ({ row }) => <MoneyText value={row.original.adjusted_profit} /> },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex gap-2">
            <Button
              variant="secondary"
              className="h-8 px-3"
              onClick={() => {
                setActualCostAmount(row.original.actual_cost ?? row.original.estimated_cost);
                setActualCostItem(row.original);
              }}
            >
              <CircleDollarSign size={14} />
              Actual
            </Button>
            <Button
              variant="secondary"
              className="h-8 px-3"
              onClick={() => {
                setDeductionAmount(0);
                setDeductionItem(row.original);
              }}
            >
              <AlertTriangle size={14} />
              Deduct
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  if (loading) {
    return <LoadingState />;
  }

  if (!order) {
    return <PageTitle title="Daily Order Not Found" description="The selected daily order does not exist or was deleted." />;
  }

  return (
    <>
      <PageTitle
        title="Daily Order Detail"
        description={`Order date: ${order.order_date}, ${order.day_name}`}
        actions={
          <Button variant="danger" onClick={() => setDeleteOpen(true)}>
            <Trash2 size={16} />
            Delete Order
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <SummaryCard title="Date" value={<DateText value={order.order_date} />} />
        <SummaryCard title="Sales" value={<MoneyText value={totals.sales} />} tone="green" />
        <SummaryCard title="Estimated Purchase" value={<MoneyText value={totals.cost} />} tone="blue" />
        <SummaryCard title="Actual Purchase" value={<MoneyText value={totals.actualCost} />} />
        <SummaryCard title="Adjusted Profit" value={<MoneyText value={totals.profit} />} tone="amber" />
      </div>

      <section className="mt-6">
        <div className="mb-3 grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px_260px] lg:items-end">
          <h2 className="text-base font-semibold text-ink-900">Customer Order Items</h2>
          <FormInput
            label="Search Customer Name"
            value={customerFilter}
            placeholder="Type customer name..."
            onChange={(event) => setCustomerFilter(event.target.value)}
          />
          <FormSelect
            label="Farm Filter"
            value={farmFilter}
            options={farmFilterOptions}
            onChange={(event) => setFarmFilter(event.target.value)}
          />
        </div>
        {farmGroups.length > 0 ? (
          <div className="space-y-5">
            {farmGroups.map((group) => (
              <section key={group.farmId} className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-3 border-b border-stone-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-ink-900">{group.farmName}</h3>
                    <p className="mt-1 text-sm text-ink-500">{group.items.length} customer order item(s)</p>
                  </div>
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setActualCostAmount(group.totals.actualCost || group.totals.estimatedCost);
                      setActualCostFarm(group);
                    }}
                  >
                    <CircleDollarSign size={16} />
                    Add / Update Total Actual Purchase
                  </Button>
                </div>

                <div className="my-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
                  <div className="rounded-md border border-stone-200 bg-stone-50 p-4">
                    <h4 className="text-sm font-semibold text-ink-900">Estimated Column</h4>
                    <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <dt className="text-xs font-semibold uppercase text-ink-500">Total Est. Purchase</dt>
                        <dd className="mt-1 text-sm font-semibold text-ink-900"><MoneyText value={group.totals.estimatedCost} /></dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase text-ink-500">Total Sales</dt>
                        <dd className="mt-1 text-sm font-semibold text-ink-900"><MoneyText value={group.totals.sales} /></dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase text-ink-500">Total Profit</dt>
                        <dd className="mt-1 text-sm font-semibold text-ink-900"><MoneyText value={group.totals.estimatedProfit} /></dd>
                      </div>
                    </dl>
                  </div>

                  <div className="rounded-md border border-stone-200 bg-white p-4">
                    <h4 className="text-sm font-semibold text-ink-900">Actual Column</h4>
                    <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <div>
                        <dt className="text-xs font-semibold uppercase text-ink-500">Total Actual Purchase</dt>
                        <dd className="mt-1 text-sm font-semibold text-ink-900"><MoneyText value={group.totals.actualCost} /></dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase text-ink-500">Total Actual Sales</dt>
                        <dd className="mt-1 text-sm font-semibold text-ink-900"><MoneyText value={group.totals.actualSales} /></dd>
                      </div>
                      <div>
                        <dt className="text-xs font-semibold uppercase text-ink-500">Total Actual Profit</dt>
                        <dd className="mt-1 text-sm font-semibold text-ink-900"><MoneyText value={group.totals.actualProfit} /></dd>
                      </div>
                    </dl>
                  </div>
                </div>

                <div className="space-y-4">
                  {groupCustomerItemsByProduct(group.items).map((productGroup) => (
                    <section key={productGroup.productId} className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <h4 className="text-sm font-semibold text-ink-900">{productGroup.productName}</h4>
                        <span className="text-xs font-semibold text-ink-500">
                          {productGroup.items.length} customer item{productGroup.items.length === 1 ? '' : 's'}
                        </span>
                      </div>

                      {farmFilter ? (
                        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                          <div className="rounded-md border border-stone-200 bg-white p-4">
                            <h5 className="text-sm font-semibold text-ink-900">Estimated Column</h5>
                            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                              <div>
                                <dt className="text-xs font-semibold uppercase text-ink-500">Est. Purchase</dt>
                                <dd className="mt-1 text-sm font-semibold text-ink-900"><MoneyText value={productGroup.totals.estimatedCost} /></dd>
                              </div>
                              <div>
                                <dt className="text-xs font-semibold uppercase text-ink-500">Sales</dt>
                                <dd className="mt-1 text-sm font-semibold text-ink-900"><MoneyText value={productGroup.totals.sales} /></dd>
                              </div>
                              <div>
                                <dt className="text-xs font-semibold uppercase text-ink-500">Profit</dt>
                                <dd className="mt-1 text-sm font-semibold text-ink-900"><MoneyText value={productGroup.totals.estimatedProfit} /></dd>
                              </div>
                            </dl>
                          </div>

                          <div className="rounded-md border border-stone-200 bg-white p-4">
                            <h5 className="text-sm font-semibold text-ink-900">Actual Column</h5>
                            <dl className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                              <div>
                                <dt className="text-xs font-semibold uppercase text-ink-500">Actual Purchase</dt>
                                <dd className="mt-1 text-sm font-semibold text-ink-900"><MoneyText value={productGroup.totals.actualCost} /></dd>
                              </div>
                              <div>
                                <dt className="text-xs font-semibold uppercase text-ink-500">Actual Sales</dt>
                                <dd className="mt-1 text-sm font-semibold text-ink-900"><MoneyText value={productGroup.totals.actualSales} /></dd>
                              </div>
                              <div>
                                <dt className="text-xs font-semibold uppercase text-ink-500">Actual Profit</dt>
                                <dd className="mt-1 text-sm font-semibold text-ink-900"><MoneyText value={productGroup.totals.actualProfit} /></dd>
                              </div>
                            </dl>
                          </div>
                        </div>
                      ) : (
                        <DataTable data={productGroup.items} columns={columns} emptyTitle="No customer order items" />
                      )}
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <DataTable data={[]} columns={columns} emptyTitle="No customer order items" />
        )}
      </section>

      <section className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-ink-900">Farm Purchase Items</h2>
        {farmPurchaseGroups.length > 0 ? (
          <div className="space-y-5">
            {farmPurchaseGroups.map((group) => (
              <section key={group.farmId} className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                <h3 className="mb-3 text-base font-semibold text-ink-900">{group.farmName}</h3>
                <div className="space-y-4">
                  {groupFarmPurchaseItemsByProduct(group.items).map((productGroup) => (
                    <section key={productGroup.productId} className="rounded-lg border border-stone-200 bg-stone-50 p-4">
                      <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                        <h4 className="text-sm font-semibold text-ink-900">{productGroup.productName}</h4>
                        <div className="flex flex-wrap gap-2 text-xs font-semibold text-ink-500">
                          <span>{productGroup.items.length} purchase item{productGroup.items.length === 1 ? '' : 's'}</span>
                          <span>Est: <MoneyText value={productGroup.totals.estimatedPurchase} /></span>
                          <span>Actual: <MoneyText value={productGroup.totals.actualPurchase} /></span>
                        </div>
                      </div>
                      <DataTable
                        data={productGroup.items}
                        columns={[
                          { accessorKey: 'pricing_method', header: 'Pricing', cell: ({ row }) => labelFromValue(row.original.pricing_method) },
                          { accessorKey: 'cage_count', header: 'Cages' },
                          { accessorKey: 'gross_weight_kg', header: 'Gross Kg' },
                          { accessorKey: 'net_weight_kg', header: 'Net Kg' },
                          { accessorKey: 'product_quantity', header: 'Product Qty' },
                          { accessorKey: 'estimated_cost', header: 'Estimated Purchase', cell: ({ row }) => <MoneyText value={row.original.estimated_cost} /> },
                          { accessorKey: 'actual_cost', header: 'Actual Purchase', cell: ({ row }) => <MoneyText value={row.original.actual_cost ?? 0} /> },
                        ]}
                        emptyTitle="No farm purchase items"
                      />
                    </section>
                  ))}
                </div>
              </section>
            ))}
          </div>
        ) : (
          <DataTable data={[]} columns={[]} emptyTitle="No farm purchase items" />
        )}
      </section>

      <Modal
        open={Boolean(actualCostItem)}
        title="Add Actual Farm Purchase"
        onClose={() => setActualCostItem(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setActualCostItem(null)}>
              Cancel
            </Button>
            <Button type="submit" form="actual-cost-form">
              Save
            </Button>
          </div>
        }
      >
        <form id="actual-cost-form" className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={submitActualCost}>
          <FormInput
            label="Actual Purchase Amount (RM)"
            type="number"
            min={0}
            step={0.01}
            value={actualCostAmount}
            onChange={(event) => setActualCostAmount(Number(event.target.value))}
          />
          <FormDatePicker label="Actual Purchase Date" value={actualCostDate} onChange={(event) => setActualCostDate(event.target.value)} />
        </form>
      </Modal>

      <Modal
        open={Boolean(actualCostFarm)}
        title={`Total Actual Purchase${actualCostFarm ? ` - ${actualCostFarm.farmName}` : ''}`}
        onClose={() => setActualCostFarm(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setActualCostFarm(null)}>
              Cancel
            </Button>
            <Button type="submit" form="farm-actual-cost-form">
              Save
            </Button>
          </div>
        }
      >
        <form id="farm-actual-cost-form" className="grid grid-cols-1 gap-4" onSubmit={submitFarmActualCost}>
          <FormInput
            label="Total Actual Purchase From Farm (RM)"
            type="number"
            min={0}
            step={0.01}
            value={actualCostAmount}
            onChange={(event) => setActualCostAmount(Number(event.target.value))}
          />
          <p className="text-sm text-ink-500">
            This amount is allocated across this farm's customer order items so reports can calculate actual profit correctly.
          </p>
        </form>
      </Modal>

      <Modal
        open={Boolean(deductionItem)}
        title="Deduct Died Chicken From Customer"
        onClose={() => setDeductionItem(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeductionItem(null)}>
              Cancel
            </Button>
            <Button type="submit" form="customer-deduction-form">
              Save
            </Button>
          </div>
        }
      >
        <form id="customer-deduction-form" className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={submitCustomerDeduction}>
          <FormSelect
            label="Reason"
            value={deductionReason}
            options={[
              { label: 'Dead Chicken', value: 'dead_chicken' },
              { label: 'Farm Problem', value: 'farm_problem' },
              { label: 'Other', value: 'other' },
            ]}
            onChange={(event) => setDeductionReason(event.target.value)}
          />
          <FormInput label="Quantity" type="number" min={0} step={0.001} value={deductionQuantity} onChange={(event) => setDeductionQuantity(Number(event.target.value))} />
          <FormInput label="Weight Kg" type="number" min={0} step={0.001} value={deductionWeightKg} onChange={(event) => setDeductionWeightKg(Number(event.target.value))} />
          <FormInput label="Deduction Amount (RM)" type="number" min={0} step={0.01} value={deductionAmount} onChange={(event) => setDeductionAmount(Number(event.target.value))} />
        </form>
      </Modal>

      <ConfirmDialog
        open={deleteOpen}
        title="Delete daily order?"
        description="The daily order and its items will be soft-deleted. Reports will hide it."
        onCancel={() => setDeleteOpen(false)}
        onConfirm={() => void deleteOrder()}
      />
    </>
  );
}
