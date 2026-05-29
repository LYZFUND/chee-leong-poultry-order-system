import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '@renderer/components/ui/Button';
import { DataTable } from '@renderer/components/ui/DataTable';
import { FormInput } from '@renderer/components/ui/FormInput';
import { FormSelect } from '@renderer/components/ui/FormSelect';
import { Modal } from '@renderer/components/ui/Modal';
import { MoneyText } from '@renderer/components/ui/MoneyText';
import { notify } from '@renderer/components/ui/Notification';
import { PageTitle } from '@renderer/components/ui/PageTitle';
import { SummaryCard } from '@renderer/components/ui/SummaryCard';
import { farmService } from '@renderer/services/farmService';
import { paymentService, type FarmUnpaidPurchase } from '@renderer/services/paymentService';
import type { Farm, FarmPayment, PaymentMethod, PaymentStatus } from '@renderer/types/entities';
import { labelFromValue } from '@renderer/utils/format';

const today = new Date();
const defaultMonth = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
const todayText = today.toISOString().slice(0, 10);

interface PaymentForm {
  farmId: string;
  yearMonth: string;
  paymentDate: string;
  paymentMethod: PaymentMethod;
  chequeNumber: string;
  status: PaymentStatus;
  advanceAmount: number;
  notes: string;
}

const initialForm: PaymentForm = {
  farmId: '',
  yearMonth: defaultMonth,
  paymentDate: todayText,
  paymentMethod: 'bank_transfer',
  chequeNumber: '',
  status: 'paid',
  advanceAmount: 0,
  notes: '',
};

function paymentTotal(payment: FarmPayment, key: 'gross_purchase_amount' | 'advance_amount' | 'account_payable_amount'): number {
  return Number(payment[key] ?? (key === 'account_payable_amount' ? payment.payment_amount : 0));
}

export function FarmPaymentsPage(): JSX.Element {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [filterFarmId, setFilterFarmId] = useState('');
  const [filterMonth, setFilterMonth] = useState(defaultMonth);
  const [payments, setPayments] = useState<FarmPayment[]>([]);
  const [unpaidPurchases, setUnpaidPurchases] = useState<FarmUnpaidPurchase[]>([]);
  const [selectedPurchaseIds, setSelectedPurchaseIds] = useState<string[]>([]);
  const [form, setForm] = useState<PaymentForm>(initialForm);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<FarmPayment | null>(null);

  useEffect(() => {
    void farmService.listFarms(false).then(setFarms);
  }, []);

  useEffect(() => {
    if (!filterFarmId || !filterMonth) {
      setPayments([]);
      return;
    }

    void paymentService.listPaymentsByFarmAndMonth(filterFarmId, filterMonth).then(setPayments);
  }, [filterFarmId, filterMonth]);

  useEffect(() => {
    if (!form.farmId || !form.yearMonth) {
      setUnpaidPurchases([]);
      setSelectedPurchaseIds([]);
      return;
    }

    void paymentService.listUnpaidFarmPurchases(form.farmId, form.yearMonth).then((rows) => {
      setUnpaidPurchases(rows);
      setSelectedPurchaseIds([]);
    });
  }, [form.farmId, form.yearMonth]);

  const farmOptions = useMemo(
    () => [{ label: 'Select farm', value: '' }, ...farms.map((farm) => ({ label: farm.farm_name, value: farm.id }))],
    [farms],
  );

  const selectedPurchases = useMemo(
    () => unpaidPurchases.filter((purchase) => selectedPurchaseIds.includes(purchase.daily_order_id)),
    [selectedPurchaseIds, unpaidPurchases],
  );

  const selectedPurchaseTotal = useMemo(
    () => selectedPurchases.reduce((sum, purchase) => sum + Number(purchase.unpaid_amount ?? 0), 0),
    [selectedPurchases],
  );

  const advanceAmount = Math.min(Math.max(Number(form.advanceAmount) || 0, 0), selectedPurchaseTotal);
  const accountPayable = Math.max(selectedPurchaseTotal - advanceAmount, 0);
  const paymentSummary = useMemo(
    () =>
      payments.reduce(
        (summary, payment) => ({
          gross: summary.gross + paymentTotal(payment, 'gross_purchase_amount'),
          advance: summary.advance + paymentTotal(payment, 'advance_amount'),
          payable: summary.payable + paymentTotal(payment, 'account_payable_amount'),
        }),
        { gross: 0, advance: 0, payable: 0 },
      ),
    [payments],
  );

  function openAddPayment(): void {
    const nextForm = {
      ...initialForm,
      farmId: filterFarmId,
      yearMonth: filterMonth,
    };
    setForm(nextForm);
    setSelectedPurchaseIds([]);
    setSelectedPayment(null);
    setModalOpen(true);
  }

  function togglePurchase(purchaseId: string): void {
    setSelectedPurchaseIds((current) =>
      current.includes(purchaseId) ? current.filter((id) => id !== purchaseId) : [...current, purchaseId],
    );
  }

  async function refreshCurrentMonth(): Promise<void> {
    if (!filterFarmId || !filterMonth) {
      return;
    }
    const [paymentRows, unpaidRows] = await Promise.all([
      paymentService.listPaymentsByFarmAndMonth(filterFarmId, filterMonth),
      form.farmId === filterFarmId && form.yearMonth === filterMonth
        ? paymentService.listUnpaidFarmPurchases(filterFarmId, filterMonth)
        : Promise.resolve(unpaidPurchases),
    ]);
    setPayments(paymentRows);
    if (form.farmId === filterFarmId && form.yearMonth === filterMonth) {
      setUnpaidPurchases(unpaidRows);
      setSelectedPurchaseIds([]);
    }
  }

  async function savePayment(): Promise<void> {
    if (!form.farmId || !form.yearMonth) {
      notify.error('Please select a farm and month.');
      return;
    }
    if (selectedPurchases.length === 0) {
      notify.error('Please select at least one unpaid purchase.');
      return;
    }
    if (form.paymentMethod === 'cheque' && !form.chequeNumber.trim()) {
      notify.error('Cheque number is required when payment method is cheque.');
      return;
    }

    await paymentService.createPaymentWithAllocations({
      farm_id: form.farmId,
      payment_date: form.paymentDate,
      payment_method: form.paymentMethod,
      cheque_number: form.chequeNumber.trim() || null,
      status: form.status,
      notes: form.notes.trim() || null,
      gross_purchase_amount: selectedPurchaseTotal,
      advance_amount: advanceAmount,
      selectedPurchases,
    });

    notify.success('Farm payment saved.');
    setModalOpen(false);
    setFilterFarmId(form.farmId);
    setFilterMonth(form.yearMonth);
    await refreshCurrentMonth();
  }

  async function deletePayment(payment: FarmPayment): Promise<void> {
    const confirmed = window.confirm('Delete this farm payment? The selected purchase dates will become unpaid again.');
    if (!confirmed) {
      return;
    }
    await paymentService.softDeletePayment(payment.id);
    notify.success('Farm payment deleted.');
    setSelectedPayment(null);
    await refreshCurrentMonth();
  }

  const columns: ColumnDef<FarmPayment, unknown>[] = [
    { accessorKey: 'payment_date', header: 'Payment Date' },
    { accessorKey: 'gross_purchase_amount', header: 'Total Purchase', cell: ({ row }) => <MoneyText value={paymentTotal(row.original, 'gross_purchase_amount')} /> },
    { accessorKey: 'advance_amount', header: 'Advance', cell: ({ row }) => <MoneyText value={paymentTotal(row.original, 'advance_amount')} /> },
    { accessorKey: 'account_payable_amount', header: 'Account Payable', cell: ({ row }) => <MoneyText value={paymentTotal(row.original, 'account_payable_amount')} /> },
    { accessorKey: 'payment_method', header: 'Method', cell: ({ row }) => labelFromValue(row.original.payment_method) },
    { accessorKey: 'cheque_number', header: 'Cheque No.', cell: ({ row }) => row.original.cheque_number || '-' },
    { accessorKey: 'status', header: 'Status', cell: ({ row }) => labelFromValue(row.original.status) },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" className="h-8 px-3" onClick={() => setSelectedPayment(row.original)}>
            View
          </Button>
          <Button variant="danger" className="h-8 px-3" onClick={() => void deletePayment(row.original)}>
            <Trash2 size={14} />
            Delete
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <PageTitle
        title="Farm Payments"
        description="Select a farm and month to view payment history, unpaid actual purchases, and account payable."
        actions={
          <Button onClick={openAddPayment}>
            <Plus size={16} />
            Add Payment
          </Button>
        }
      />

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <FormSelect
            label="Farm"
            value={filterFarmId}
            options={farmOptions}
            onChange={(event) => setFilterFarmId(event.target.value)}
          />
          <FormInput label="Month" type="month" value={filterMonth} onChange={(event) => setFilterMonth(event.target.value)} />
          <div className="flex items-end">
            <Button variant="secondary" className="w-full" onClick={openAddPayment}>
              Add Payment For This Month
            </Button>
          </div>
        </div>
      </section>

      <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SummaryCard title="Selected Month Purchase" value={<MoneyText value={paymentSummary.gross} />} tone="blue" />
        <SummaryCard title="Advance Deducted" value={<MoneyText value={paymentSummary.advance} />} tone="amber" />
        <SummaryCard title="Account Payable Paid" value={<MoneyText value={paymentSummary.payable} />} tone="green" />
      </div>

      <section className="mt-6">
        <h2 className="mb-3 text-base font-semibold text-ink-900">Payment History</h2>
        {filterFarmId && filterMonth ? (
          <DataTable data={payments} columns={columns} emptyTitle="No payments for selected month" />
        ) : (
          <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 p-8 text-center text-sm text-ink-500">
            Select a farm and month to show payment history.
          </div>
        )}
      </section>

      <Modal
        open={modalOpen}
        title="Add Farm Payment"
        onClose={() => setModalOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => void savePayment()}>Save Payment</Button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormSelect
              label="Farm"
              value={form.farmId}
              options={farmOptions}
              onChange={(event) => setForm((current) => ({ ...current, farmId: event.target.value }))}
            />
            <FormInput
              label="Purchase Month"
              type="month"
              value={form.yearMonth}
              onChange={(event) => setForm((current) => ({ ...current, yearMonth: event.target.value }))}
            />
            <FormInput
              label="Payment Date"
              type="date"
              value={form.paymentDate}
              onChange={(event) => setForm((current) => ({ ...current, paymentDate: event.target.value }))}
            />
            <FormSelect
              label="Payment Method"
              value={form.paymentMethod}
              options={[
                { label: 'Cash', value: 'cash' },
                { label: 'Bank In', value: 'bank_transfer' },
                { label: 'Cheque', value: 'cheque' },
                { label: 'Other', value: 'other' },
              ]}
              onChange={(event) => setForm((current) => ({ ...current, paymentMethod: event.target.value as PaymentMethod }))}
            />
            {form.paymentMethod === 'cheque' ? (
              <FormInput
                label="Cheque No."
                value={form.chequeNumber}
                onChange={(event) => setForm((current) => ({ ...current, chequeNumber: event.target.value }))}
              />
            ) : null}
            <FormInput
              label="Advance Deduction (RM)"
              type="number"
              min={0}
              step={0.01}
              value={form.advanceAmount}
              onChange={(event) => setForm((current) => ({ ...current, advanceAmount: Number(event.target.value) }))}
            />
          </div>

          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-ink-900">Unpaid Actual Purchases</h3>
              <Button
                variant="secondary"
                className="h-8 px-3"
                onClick={() =>
                  setSelectedPurchaseIds((current) =>
                    current.length === unpaidPurchases.length ? [] : unpaidPurchases.map((purchase) => purchase.daily_order_id),
                  )
                }
              >
                {selectedPurchaseIds.length === unpaidPurchases.length && unpaidPurchases.length > 0 ? 'Clear All' : 'Select All'}
              </Button>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border border-stone-200">
              {unpaidPurchases.length > 0 ? (
                unpaidPurchases.map((purchase) => (
                  <label key={purchase.daily_order_id} className="flex items-center justify-between gap-4 border-b border-stone-100 px-4 py-3 last:border-b-0">
                    <span className="flex items-center gap-3">
                      <input
                        type="checkbox"
                        checked={selectedPurchaseIds.includes(purchase.daily_order_id)}
                        onChange={() => togglePurchase(purchase.daily_order_id)}
                      />
                      <span>
                        <span className="block text-sm font-semibold text-ink-900">
                          {purchase.order_date}, {purchase.day_name}
                        </span>
                        <span className="text-xs text-ink-500">Already paid: <MoneyText value={purchase.paid_amount} /></span>
                      </span>
                    </span>
                    <span className="text-sm font-semibold text-ink-900">
                      <MoneyText value={purchase.unpaid_amount} />
                    </span>
                  </label>
                ))
              ) : (
                <div className="p-6 text-center text-sm text-ink-500">No unpaid purchases for this farm and month.</div>
              )}
            </div>
          </section>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <SummaryCard title="Total Purchase" value={<MoneyText value={selectedPurchaseTotal} />} />
            <SummaryCard title="Advance" value={<MoneyText value={advanceAmount} />} tone="amber" />
            <SummaryCard title="Account Payable" value={<MoneyText value={accountPayable} />} tone="green" />
          </div>
        </div>
      </Modal>

      <Modal open={Boolean(selectedPayment)} title="Farm Payment Detail" onClose={() => setSelectedPayment(null)}>
        {selectedPayment ? (
          <div className="space-y-5">
            <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
              <SummaryCard title="Total Purchase" value={<MoneyText value={paymentTotal(selectedPayment, 'gross_purchase_amount')} />} />
              <SummaryCard title="Advance" value={<MoneyText value={paymentTotal(selectedPayment, 'advance_amount')} />} tone="amber" />
              <SummaryCard title="Account Payable" value={<MoneyText value={paymentTotal(selectedPayment, 'account_payable_amount')} />} tone="green" />
            </div>
            <div className="rounded-lg border border-stone-200">
              {(selectedPayment.farm_payment_allocations ?? []).map((allocation) => (
                <div key={allocation.id} className="flex items-center justify-between border-b border-stone-100 px-4 py-3 text-sm last:border-b-0">
                  <span className="font-medium text-ink-900">{allocation.order_date}</span>
                  <span><MoneyText value={allocation.actual_purchase_amount} /></span>
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
