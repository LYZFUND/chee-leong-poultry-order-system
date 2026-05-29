import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { useParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { Button } from '@renderer/components/ui/Button';
import { DataTable } from '@renderer/components/ui/DataTable';
import { FormInput } from '@renderer/components/ui/FormInput';
import { FormSelect } from '@renderer/components/ui/FormSelect';
import { LoadingState } from '@renderer/components/ui/LoadingState';
import { Modal } from '@renderer/components/ui/Modal';
import { MoneyText } from '@renderer/components/ui/MoneyText';
import { notify } from '@renderer/components/ui/Notification';
import { PageTitle } from '@renderer/components/ui/PageTitle';
import { SummaryCard } from '@renderer/components/ui/SummaryCard';
import { farmService } from '@renderer/services/farmService';
import { orderService } from '@renderer/services/orderService';
import { paymentService } from '@renderer/services/paymentService';
import { priceService } from '@renderer/services/priceService';
import { productService } from '@renderer/services/productService';
import type {
  DeductionPricingMethod,
  DeductionReason,
  Farm,
  FarmBalance,
  FarmPayment,
  FarmPaymentTerm,
  FarmProduct,
  FarmProductPrice,
  PaymentFrequency,
  PaymentMethod,
  ProfitReportRow,
} from '@renderer/types/entities';
import { labelFromValue } from '@renderer/utils/format';

interface ProductReportGroup {
  productId: string;
  productName: string;
  rows: ProfitReportRow[];
  totals: {
    estimatedCost: number;
    actualCost: number;
    sales: number;
    profit: number;
  };
}

export function FarmDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const [farm, setFarm] = useState<Farm | null>(null);
  const [products, setProducts] = useState<FarmProduct[]>([]);
  const [prices, setPrices] = useState<FarmProductPrice[]>([]);
  const [reportRows, setReportRows] = useState<ProfitReportRow[]>([]);
  const [payments, setPayments] = useState<FarmPayment[]>([]);
  const [paymentMonth, setPaymentMonth] = useState('');
  const [selectedPayment, setSelectedPayment] = useState<FarmPayment | null>(null);
  const [balance, setBalance] = useState<FarmBalance | null>(null);
  const [term, setTerm] = useState<FarmPaymentTerm | null>(null);
  const [loading, setLoading] = useState(true);
  const [deductionOpen, setDeductionOpen] = useState(false);
  const [termFrequency, setTermFrequency] = useState<PaymentFrequency>('weekly_once');
  const [termMethod, setTermMethod] = useState<PaymentMethod>('bank_transfer');
  const [termCheque, setTermCheque] = useState(false);
  const [deductionProductId, setDeductionProductId] = useState('');
  const [deductionReason, setDeductionReason] = useState<DeductionReason>('dead_chicken');
  const [deductionPricingMethod, setDeductionPricingMethod] = useState<DeductionPricingMethod>('manual_amount');
  const [deductionAmount, setDeductionAmount] = useState(0);
  const [deductionQuantity, setDeductionQuantity] = useState(0);
  const [deductionApproved, setDeductionApproved] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    if (!id) {
      return;
    }
    const [farmRow, productRows, allPrices, rows, paymentRows, balanceRow, termRow] = await Promise.all([
      farmService.getFarm(id),
      productService.listProductsByFarm(id),
      priceService.listFarmPrices(),
      farmService.getFarmReportRows(id),
      paymentService.listPaymentsByFarm(id),
      farmService.getFarmBalance(id),
      paymentService.getPaymentTerm(id),
    ]);
    setFarm(farmRow);
    setProducts(productRows);
    setPrices(allPrices.filter((price) => price.farm_id === id));
    setReportRows(rows);
    setPayments(paymentRows);
    setBalance(balanceRow);
    setTerm(termRow);
    setTermFrequency(termRow?.payment_frequency ?? 'weekly_once');
    setTermMethod(termRow?.payment_method ?? 'bank_transfer');
    setTermCheque(termRow?.cheque_required ?? false);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function savePaymentTerm(): Promise<void> {
    if (!id) {
      return;
    }
    await paymentService.upsertPaymentTerm({
      farm_id: id,
      payment_frequency: termFrequency,
      payment_method: termMethod,
      cheque_required: termCheque,
      notes: term?.notes ?? null,
    });
    notify.success('Payment terms saved.');
    await refresh();
  }

  async function submitFarmDeduction(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!id) {
      return;
    }
    await orderService.addFarmDeduction({
      farmId: id,
      productId: deductionProductId || null,
      reason: deductionReason,
      quantity: deductionQuantity,
      pricingMethod: deductionPricingMethod,
      deductionAmount,
      approvedByFarm: deductionApproved,
    });
    notify.success('Farm deduction saved.');
    setDeductionOpen(false);
    await refresh();
  }

  const reportColumns = useMemo<ColumnDef<ProfitReportRow, unknown>[]>(
    () => [
      { accessorKey: 'order_date', header: 'Date' },
      { accessorKey: 'customer_name', header: 'Customer' },
      { accessorKey: 'estimated_cost', header: 'Est. Purchase', cell: ({ row }) => <MoneyText value={row.original.estimated_cost} /> },
      { accessorKey: 'actual_cost', header: 'Actual Purchase', cell: ({ row }) => <MoneyText value={row.original.actual_cost ?? 0} /> },
      { accessorKey: 'sales_amount', header: 'Sales', cell: ({ row }) => <MoneyText value={row.original.sales_amount} /> },
      { accessorKey: 'adjusted_profit', header: 'Profit', cell: ({ row }) => <MoneyText value={row.original.adjusted_profit} /> },
    ],
    [],
  );

  const productReportGroups = useMemo<ProductReportGroup[]>(() => {
    const grouped = new Map<string, ProductReportGroup>();

    for (const row of reportRows) {
      const group = grouped.get(row.product_id) ?? {
        productId: row.product_id,
        productName: row.product_name,
        rows: [],
        totals: {
          estimatedCost: 0,
          actualCost: 0,
          sales: 0,
          profit: 0,
        },
      };

      group.rows.push(row);
      group.totals.estimatedCost += row.estimated_cost;
      group.totals.actualCost += row.actual_cost ?? 0;
      group.totals.sales += row.sales_amount;
      group.totals.profit += row.adjusted_profit;
      grouped.set(row.product_id, group);
    }

    return Array.from(grouped.values());
  }, [reportRows]);

  const visiblePayments = useMemo(
    () => (paymentMonth ? payments.filter((payment) => payment.payment_date.startsWith(paymentMonth)) : []),
    [paymentMonth, payments],
  );

  if (loading) {
    return <LoadingState />;
  }

  if (!farm) {
    return <PageTitle title="Farm Not Found" description="The selected farm does not exist or was deleted." />;
  }

  return (
    <>
      <PageTitle
        title={farm.farm_name}
        description={`Deduction policy: ${labelFromValue(farm.deduction_policy)}${farm.phone ? ` | Phone: ${farm.phone}` : ''}`}
        actions={
          <Button onClick={() => setDeductionOpen(true)}>
            <Plus size={16} />
            Add Farm Deduction
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <SummaryCard title="Total Cost" value={<MoneyText value={balance?.total_cost ?? 0} />} tone="blue" />
        <SummaryCard title="Farm Deduction" value={<MoneyText value={balance?.total_farm_deduction ?? 0} />} tone="rose" />
        <SummaryCard title="Payable" value={<MoneyText value={balance?.total_payable ?? 0} />} tone="amber" />
        <SummaryCard title="Paid" value={<MoneyText value={balance?.total_paid ?? 0} />} tone="green" />
        <SummaryCard title="Balance" value={<MoneyText value={balance?.balance ?? 0} />} />
      </div>

      <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <h2 className="text-base font-semibold text-ink-900">Payment Terms</h2>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-4">
          <FormSelect
            label="Frequency"
            value={termFrequency}
            options={[
              { label: 'Weekly Once', value: 'weekly_once' },
              { label: 'Weekly Twice', value: 'weekly_twice' },
              { label: 'Monthly', value: 'monthly' },
              { label: 'Custom', value: 'custom' },
            ]}
            onChange={(event) => setTermFrequency(event.target.value as PaymentFrequency)}
          />
          <FormSelect
            label="Method"
            value={termMethod}
            options={[
              { label: 'Cash', value: 'cash' },
              { label: 'Bank Transfer', value: 'bank_transfer' },
              { label: 'Cheque', value: 'cheque' },
              { label: 'Other', value: 'other' },
            ]}
            onChange={(event) => setTermMethod(event.target.value as PaymentMethod)}
          />
          <label className="flex items-end gap-3 rounded-md border border-stone-200 px-3 py-2">
            <input type="checkbox" checked={termCheque} onChange={(event) => setTermCheque(event.target.checked)} />
            <span className="text-sm font-medium text-ink-700">Cheque required</span>
          </label>
          <div className="flex items-end">
            <Button className="w-full" onClick={() => void savePaymentTerm()}>
              Save Terms
            </Button>
          </div>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-6 xl:grid-cols-2">
        <section>
          <h2 className="mb-3 text-base font-semibold text-ink-900">Products From This Farm</h2>
          <DataTable
            data={products}
            columns={[
              { accessorKey: 'product_name', header: 'Product' },
              { accessorKey: 'pricing_method', header: 'Pricing', cell: ({ row }) => labelFromValue(row.original.pricing_method) },
              { accessorKey: 'default_cage_weight', header: 'Cage Kg' },
              { accessorKey: 'is_active', header: 'Status', cell: ({ row }) => (row.original.is_active ? 'Active' : 'Inactive') },
            ]}
            emptyTitle="No products"
          />
        </section>
        <section>
          <h2 className="mb-3 text-base font-semibold text-ink-900">Farm Product Prices</h2>
          <DataTable
            data={prices}
            columns={[
              { accessorKey: 'farm_products.product_name', header: 'Product', cell: ({ row }) => row.original.farm_products?.product_name ?? '-' },
              { accessorKey: 'pricing_method', header: 'Pricing', cell: ({ row }) => labelFromValue(row.original.pricing_method) },
              { accessorKey: 'price_amount', header: 'Price', cell: ({ row }) => <MoneyText value={row.original.price_amount} /> },
              { accessorKey: 'effective_date', header: 'Effective' },
            ]}
            emptyTitle="No farm prices"
          />
        </section>
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-ink-900">Farm Orders, Sales, Cost, and Profit</h2>
        {productReportGroups.length > 0 ? (
          <div className="space-y-5">
            {productReportGroups.map((group) => (
              <section key={group.productId} className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
                <div className="mb-4 flex flex-col gap-3 border-b border-stone-200 pb-4 xl:flex-row xl:items-center xl:justify-between">
                  <div>
                    <h3 className="text-base font-semibold text-ink-900">{group.productName}</h3>
                    <p className="mt-1 text-sm text-ink-500">{group.rows.length} order item(s)</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div>
                      <p className="text-xs font-semibold uppercase text-ink-500">Est. Purchase</p>
                      <p className="mt-1 font-semibold text-ink-900"><MoneyText value={group.totals.estimatedCost} /></p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-ink-500">Actual Purchase</p>
                      <p className="mt-1 font-semibold text-ink-900"><MoneyText value={group.totals.actualCost} /></p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-ink-500">Sales</p>
                      <p className="mt-1 font-semibold text-ink-900"><MoneyText value={group.totals.sales} /></p>
                    </div>
                    <div>
                      <p className="text-xs font-semibold uppercase text-ink-500">Profit</p>
                      <p className="mt-1 font-semibold text-ink-900"><MoneyText value={group.totals.profit} /></p>
                    </div>
                  </div>
                </div>
                <DataTable data={group.rows} columns={reportColumns} emptyTitle="No farm order records" />
              </section>
            ))}
          </div>
        ) : (
          <DataTable data={[]} columns={reportColumns} emptyTitle="No farm order records" />
        )}
      </section>

      <section className="mt-6">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <h2 className="text-base font-semibold text-ink-900">Payment History</h2>
          <div className="w-full md:w-60">
            <FormInput label="Show Month" type="month" value={paymentMonth} onChange={(event) => setPaymentMonth(event.target.value)} />
          </div>
        </div>
        {paymentMonth ? (
          <DataTable
            data={visiblePayments}
            columns={[
              { accessorKey: 'payment_date', header: 'Date' },
              { accessorKey: 'payment_amount', header: 'Account Payable', cell: ({ row }) => <MoneyText value={row.original.account_payable_amount ?? row.original.payment_amount} /> },
              { accessorKey: 'payment_method', header: 'Method', cell: ({ row }) => labelFromValue(row.original.payment_method) },
              { accessorKey: 'status', header: 'Status', cell: ({ row }) => labelFromValue(row.original.status) },
              {
                id: 'actions',
                header: 'Actions',
                cell: ({ row }) => (
                  <Button variant="secondary" className="h-8 px-3" onClick={() => setSelectedPayment(row.original)}>
                    View
                  </Button>
                ),
              },
            ]}
            emptyTitle="No payments"
          />
        ) : (
          <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-ink-500">
            Select a month to show this farm's payment history.
          </div>
        )}
      </section>

      <Modal
        open={deductionOpen}
        title="Add Farm Deduction"
        onClose={() => setDeductionOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setDeductionOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="farm-deduction-form">
              Save
            </Button>
          </div>
        }
      >
        <form id="farm-deduction-form" className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={submitFarmDeduction}>
          <FormSelect
            label="Product"
            value={deductionProductId}
            options={[{ label: 'No product selected', value: '' }, ...products.map((product) => ({ label: product.product_name, value: product.id }))]}
            onChange={(event) => setDeductionProductId(event.target.value)}
          />
          <FormSelect
            label="Reason"
            value={deductionReason}
            options={[
              { label: 'Dead Chicken', value: 'dead_chicken' },
              { label: 'Farm Problem', value: 'farm_problem' },
              { label: 'Other', value: 'other' },
            ]}
            onChange={(event) => setDeductionReason(event.target.value as DeductionReason)}
          />
          <FormSelect
            label="Pricing Method"
            value={deductionPricingMethod}
            options={[
              { label: 'Per Kg', value: 'per_kg' },
              { label: 'Per Product', value: 'per_product' },
              { label: 'Manual Amount', value: 'manual_amount' },
            ]}
            onChange={(event) => setDeductionPricingMethod(event.target.value as DeductionPricingMethod)}
          />
          <FormInput label="Quantity" type="number" min={0} step={0.001} value={deductionQuantity} onChange={(event) => setDeductionQuantity(Number(event.target.value))} />
          <FormInput label="Deduction Amount (RM)" type="number" min={0} step={0.01} value={deductionAmount} onChange={(event) => setDeductionAmount(Number(event.target.value))} />
          <label className="flex items-end gap-3 rounded-md border border-stone-200 px-3 py-2">
            <input type="checkbox" checked={deductionApproved} onChange={(event) => setDeductionApproved(event.target.checked)} />
            <span className="text-sm font-medium text-ink-700">Approved by farm</span>
          </label>
        </form>
      </Modal>

      <Modal open={Boolean(selectedPayment)} title="Farm Payment Detail" onClose={() => setSelectedPayment(null)}>
        {selectedPayment ? (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SummaryCard title="Total Purchase" value={<MoneyText value={selectedPayment.gross_purchase_amount ?? selectedPayment.payment_amount} />} />
            <SummaryCard title="Advance" value={<MoneyText value={selectedPayment.advance_amount ?? 0} />} tone="amber" />
            <SummaryCard title="Account Payable" value={<MoneyText value={selectedPayment.account_payable_amount ?? selectedPayment.payment_amount} />} tone="green" />
          </div>
        ) : null}
      </Modal>
    </>
  );
}
