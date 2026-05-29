import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { toPng } from 'html-to-image';
import { jsPDF } from 'jspdf';
import { Download, FileText, Image as ImageIcon, Save, Trash2 } from 'lucide-react';
import { useParams } from 'react-router-dom';
import { Button } from '@renderer/components/ui/Button';
import { DataTable } from '@renderer/components/ui/DataTable';
import { FormDatePicker } from '@renderer/components/ui/FormDatePicker';
import { FormInput } from '@renderer/components/ui/FormInput';
import { FormSelect } from '@renderer/components/ui/FormSelect';
import { LoadingState } from '@renderer/components/ui/LoadingState';
import { MoneyText } from '@renderer/components/ui/MoneyText';
import { notify } from '@renderer/components/ui/Notification';
import { PageTitle } from '@renderer/components/ui/PageTitle';
import { SummaryCard } from '@renderer/components/ui/SummaryCard';
import { safeNumber } from '@renderer/services/calculationService';
import { customerService } from '@renderer/services/customerService';
import { orderService } from '@renderer/services/orderService';
import type {
  Customer,
  CustomerDeduction,
  CustomerOrderSummary,
  CustomerPayment,
  DailyOrderItem,
  ProfitReportRow,
} from '@renderer/types/entities';
import { formatBusinessDate, toDateInputValue } from '@renderer/utils/date';
import { formatMoney, formatNumber, labelFromValue } from '@renderer/utils/format';

interface InvoiceLine {
  product: string;
  weights: string;
  weightValues?: string[];
  quantity: string;
  price: string;
  amount: string;
}

interface CarryForwardOption {
  orderDate: string;
  grossSales: number;
  sales: number;
  deduction: number;
  paid: number;
  grossBalance: number;
  balance: number;
  dailyOrderIds: string[];
}

interface DeductionCandidate {
  id: string;
  orderItem: DailyOrderItem;
  productName: string;
  farmName: string;
  orderDate: string;
}

type DeductionMode = 'dead_product' | 'price_adjustment';

const paymentMethodOptions = [
  { label: 'Bank In', value: 'bank_in' },
  { label: 'Cash', value: 'cash' },
  { label: 'Cheque', value: 'cheque' },
  { label: 'Other', value: 'other' },
];

function customerAssignmentDescription(customer: Customer): string {
  const assignments = customer.customer_farm_areas ?? [];
  if (assignments.length === 0) {
    return customer.customer_areas?.area_name
      ? `Area: ${customer.customer_areas.area_name}`
      : 'No farm area assigned';
  }

  const grouped = new Map<string, { farmName: string; areaNames: string[] }>();
  for (const assignment of assignments) {
    const group = grouped.get(assignment.farm_id) ?? {
      farmName: assignment.farms?.farm_name ?? 'Farm',
      areaNames: [],
    };
    group.areaNames.push(assignment.customer_areas?.area_name ?? 'Area');
    grouped.set(assignment.farm_id, group);
  }

  return Array.from(grouped.values())
    .map((group) => `${group.farmName}: ${group.areaNames.join(', ')}`)
    .join(' | ');
}

function paymentMethodLabel(value: string): string {
  return paymentMethodOptions.find((option) => option.value === value)?.label ?? value;
}

function normalizeWeights(value: unknown): number[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((item) => Number(item)).filter((item) => Number.isFinite(item) && item > 0);
}

function chunkWeights(weights: number[], size = 6): number[][] {
  const chunks: number[][] = [];
  for (let index = 0; index < weights.length; index += size) {
    chunks.push(weights.slice(index, index + size));
  }
  return chunks;
}

function sumWeights(weights: number[]): number {
  return Math.round(weights.reduce((total, weight) => total + weight, 0) * 1000) / 1000;
}

function formatWeightRow(weights: number[]): string {
  return weights.map((weight) => formatNumber(weight)).join(',');
}

function formatInvoiceAmount(value?: number | string | null): string {
  const amount = Number(value ?? 0);
  return new Intl.NumberFormat('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0);
}

function customerDeductionLabel(deduction: Pick<CustomerDeduction, 'notes'>): string {
  return deduction.notes?.toLowerCase().includes('price adjustment') ? 'PRICE DEDUCT' : '扣死雞';
}

function priceAdjustmentBasis(item: DailyOrderItem): number {
  return item.pricing_method === 'price_per_kg'
    ? safeNumber(item.net_weight_kg)
    : safeNumber(item.product_quantity);
}

function buildNetWeightFormula(item: DailyOrderItem, weights: number[]): string {
  const [grossWeight, minusSign, cageDeduction, equalsSign, netWeight] = buildNetWeightFormulaParts(item, weights);
  return `${grossWeight} ${minusSign} ${cageDeduction} ${equalsSign} ${netWeight}`;
}

function buildNetWeightFormulaParts(item: DailyOrderItem, weights: number[]): string[] {
  const grossWeight = weights.length > 0 ? sumWeights(weights) : safeNumber(item.gross_weight_kg);
  const cageDeduction = safeNumber(
    item.cage_deduction_weight || item.cage_count * item.cage_weight,
  );
  return [
    formatNumber(grossWeight),
    '-',
    formatNumber(cageDeduction),
    '=',
    formatNumber(item.net_weight_kg),
  ];
}

function reportRowToOrderItem(row: ProfitReportRow): DailyOrderItem {
  return {
    id: row.order_item_id,
    daily_order_id: row.daily_order_id,
    customer_id: row.customer_id,
    area_id: row.area_id ?? null,
    farm_id: row.farm_id,
    product_id: row.product_id,
    pricing_method: row.pricing_method,
    cage_count: row.cage_count,
    cage_weight: row.cage_weight,
    cage_deduction_weight: row.cage_count * row.cage_weight,
    gross_weight_kg: row.gross_weight_kg,
    weight_entries_kg: [],
    net_weight_kg: row.net_weight_kg,
    net_weight_manually_adjusted: false,
    product_quantity: row.product_quantity,
    farm_price: row.farm_price,
    sales_price: row.sales_price,
    estimated_cost: row.estimated_cost,
    sales_amount: row.sales_amount,
    estimated_profit: row.estimated_profit,
    actual_cost: row.actual_cost ?? null,
    actual_profit: row.actual_profit ?? null,
    customer_deduction_total: row.customer_deduction_amount,
    farm_deduction_total: row.farm_deduction_amount,
    adjusted_sales: row.adjusted_sales,
    adjusted_profit: row.adjusted_profit,
    created_at: '',
    updated_at: '',
    deleted_at: null,
    farms: { id: row.farm_id, farm_name: row.farm_name },
    farm_products: { id: row.product_id, product_name: row.product_name },
  };
}

function buildInvoiceLines(
  items: DailyOrderItem[],
  carryForwardLines: CarryForwardOption[],
  deductions: CustomerDeduction[],
  deductionContext: Map<string, { productName: string; orderDate: string }>,
): InvoiceLine[] {
  const lines: InvoiceLine[] = [];

  for (const item of items) {
    const productName = item.farm_products?.product_name ?? 'Product';
    const quantity =
      item.pricing_method === 'price_per_kg' ? item.cage_count : item.product_quantity;

    if (item.pricing_method === 'price_per_kg') {
      const weights = normalizeWeights(item.weight_entries_kg);
      const chunks = chunkWeights(weights);

      if (chunks.length > 0) {
        chunks.forEach((chunk, index) => {
          lines.push({
            product: index === 0 ? productName : '',
            weights: formatWeightRow(chunk),
            weightValues: chunk.map((weight) => formatNumber(weight)),
            quantity: index === 0 ? formatNumber(quantity) : '',
            price: index === 0 ? formatInvoiceAmount(item.sales_price) : '',
            amount: index === 0 ? formatInvoiceAmount(item.sales_amount) : '',
          });
        });

        lines.push({
          product: '',
          weights: buildNetWeightFormula(item, weights),
          quantity: '',
          price: '',
          amount: '',
        });
        continue;
      }
    }

    lines.push({
      product: productName,
      weights:
        item.pricing_method === 'price_per_kg'
          ? buildNetWeightFormula(item, [])
          : formatNumber(item.product_quantity),
      quantity:
        item.pricing_method === 'price_per_kg' ? formatNumber(quantity) : formatNumber(item.cage_count),
      price: formatInvoiceAmount(item.sales_price),
      amount: formatInvoiceAmount(item.sales_amount),
    });
  }

  for (const carryForwardLine of carryForwardLines) {
    lines.push({
      product: 'Baki lama / Previous balance',
      weights: formatBusinessDate(carryForwardLine.orderDate),
      quantity: '',
      price: '',
      amount: formatInvoiceAmount(carryForwardLine.grossBalance),
    });
  }

  for (const deduction of deductions) {
    const context = deductionContext.get(deduction.order_item_id);
    lines.push({
      product: customerDeductionLabel(deduction),
      weights: [context?.productName, context?.orderDate ? formatBusinessDate(context.orderDate) : '']
        .filter(Boolean)
        .join(' · '),
      quantity: '',
      price: '',
      amount: formatInvoiceAmount(-deduction.deduction_amount),
    });
  }

  const minimumBodyRows = Math.max(18, lines.length);
  while (lines.length < minimumBodyRows) {
    lines.push({ product: '', weights: '', quantity: '', price: '', amount: '' });
  }

  return lines;
}

export function CustomerDetailPage(): JSX.Element {
  const { id } = useParams<{ id: string }>();
  const invoiceRef = useRef<HTMLDivElement | null>(null);
  const [customer, setCustomer] = useState<Customer | null>(null);
  const [summary, setSummary] = useState<CustomerOrderSummary | null>(null);
  const [rows, setRows] = useState<ProfitReportRow[]>([]);
  const [orderItems, setOrderItems] = useState<DailyOrderItem[]>([]);
  const [customerDeductions, setCustomerDeductions] = useState<CustomerDeduction[]>([]);
  const [payments, setPayments] = useState<CustomerPayment[]>([]);
  const [selectedDate, setSelectedDate] = useState(toDateInputValue());
  const [loading, setLoading] = useState(true);
  const [orderItemsLoading, setOrderItemsLoading] = useState(false);
  const [savingPayment, setSavingPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('bank_in');
  const [customPaymentMethod, setCustomPaymentMethod] = useState('');
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [selectedCarryForwardDates, setSelectedCarryForwardDates] = useState<string[]>([]);
  const [carryForwardSearch, setCarryForwardSearch] = useState('');
  const [showDeductionForm, setShowDeductionForm] = useState(false);
  const [savingDeduction, setSavingDeduction] = useState(false);
  const [deletingDeductionId, setDeletingDeductionId] = useState<string | null>(null);
  const [deductionMode, setDeductionMode] = useState<DeductionMode>('dead_product');
  const [selectedDeductionItemIds, setSelectedDeductionItemIds] = useState<string[]>([]);
  const [deductionSearch, setDeductionSearch] = useState('');
  const [deductionEntryValues, setDeductionEntryValues] = useState<Record<string, number>>({});
  const [deductionAmount, setDeductionAmount] = useState(0);
  const [deductionNotes, setDeductionNotes] = useState('');
  const [customerSummaryMode, setCustomerSummaryMode] = useState<'monthly' | 'yearly'>('monthly');

  const loadBaseData = useCallback(async (): Promise<void> => {
    if (!id) {
      return;
    }

    setLoading(true);
    try {
      const customerRow = await customerService.getCustomer(id);
      setCustomer(customerRow);

      const [summaryResult, reportResult, paymentResult] = await Promise.allSettled([
        customerService.getCustomerSummary(id),
        customerService.getCustomerReportRows(id),
        customerService.listCustomerPayments(id),
      ]);

      if (summaryResult.status === 'fulfilled') {
        setSummary(summaryResult.value);
      } else {
        notify.error(
          summaryResult.reason instanceof Error
            ? summaryResult.reason.message
            : 'Unable to load customer summary.',
        );
      }

      if (reportResult.status === 'fulfilled') {
        setRows(reportResult.value);
      } else {
        notify.error(
          reportResult.reason instanceof Error
            ? reportResult.reason.message
            : 'Unable to load customer orders.',
        );
      }

      if (paymentResult.status === 'fulfilled') {
        setPayments(paymentResult.value);
      } else {
        notify.error(
          paymentResult.reason instanceof Error
            ? paymentResult.reason.message
            : 'Unable to load customer payments.',
        );
      }
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to load customer detail.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadOrderItems = useCallback(async (): Promise<void> => {
    if (!id) {
      return;
    }

    setOrderItemsLoading(true);
    try {
      const itemRows = await customerService.getCustomerOrderItemsByDate(id, selectedDate);
      setOrderItems(itemRows);
    } catch (error) {
      setOrderItems([]);
      notify.error(
        error instanceof Error
          ? error.message
          : 'Unable to load customer orders for selected date.',
      );
    } finally {
      setOrderItemsLoading(false);
    }
  }, [id, selectedDate]);

  useEffect(() => {
    void loadBaseData();
  }, [loadBaseData]);

  useEffect(() => {
    void loadOrderItems();
  }, [loadOrderItems]);

  const carryForwardOptions = useMemo<CarryForwardOption[]>(() => {
    const grouped = new Map<string, CarryForwardOption>();

    for (const row of rows) {
      if (row.order_date >= selectedDate) {
        continue;
      }

      const group = grouped.get(row.order_date) ?? {
        orderDate: row.order_date,
        grossSales: 0,
        sales: 0,
        deduction: 0,
        paid: 0,
        grossBalance: 0,
        balance: 0,
        dailyOrderIds: [],
      };

      group.grossSales += safeNumber(row.sales_amount);
      group.sales += safeNumber(row.adjusted_sales ?? row.sales_amount);
      group.deduction += safeNumber(row.customer_deduction_amount);
      if (!group.dailyOrderIds.includes(row.daily_order_id)) {
        group.dailyOrderIds.push(row.daily_order_id);
      }
      grouped.set(row.order_date, group);
    }

    return Array.from(grouped.values())
      .map((option) => {
        const orderIds = new Set(option.dailyOrderIds);
        const paid = payments
          .filter((payment) => {
            if (payment.daily_order_id && orderIds.has(payment.daily_order_id)) {
              return true;
            }

            return !payment.daily_order_id && payment.payment_date === option.orderDate;
          })
          .reduce((total, payment) => total + safeNumber(payment.payment_amount), 0);

        return {
          ...option,
          paid,
          grossBalance: Math.max(option.grossSales - paid, 0),
          balance: Math.max(option.sales - paid, 0),
        };
      })
      .filter((option) => option.balance > 0)
      .sort((a, b) => b.orderDate.localeCompare(a.orderDate));
  }, [payments, rows, selectedDate]);
  const filteredCarryForwardOptions = useMemo(() => {
    const search = carryForwardSearch.trim().toLowerCase();
    if (!search) {
      return carryForwardOptions;
    }

    return carryForwardOptions.filter((option) => {
      const formattedDate = formatBusinessDate(option.orderDate).toLowerCase();
      return option.orderDate.includes(search) || formattedDate.includes(search);
    });
  }, [carryForwardOptions, carryForwardSearch]);

  useEffect(() => {
    const availableDates = new Set(carryForwardOptions.map((option) => option.orderDate));
    setSelectedCarryForwardDates((current) => current.filter((date) => availableDates.has(date)));
  }, [carryForwardOptions]);

  const selectedCarryForwardLines = useMemo(() => {
    const selectedDates = new Set(selectedCarryForwardDates);
    return carryForwardOptions
      .filter((option) => selectedDates.has(option.orderDate))
      .sort((a, b) => a.orderDate.localeCompare(b.orderDate));
  }, [carryForwardOptions, selectedCarryForwardDates]);
  const selectedCarryForwardRows = useMemo(() => {
    const selectedDates = new Set(selectedCarryForwardDates);
    return rows.filter((row) => selectedDates.has(row.order_date));
  }, [rows, selectedCarryForwardDates]);
  const invoiceOrderItemIds = useMemo(
    () =>
      Array.from(
        new Set([
          ...orderItems.map((item) => item.id),
          ...selectedCarryForwardRows.map((row) => row.order_item_id),
        ]),
      ),
    [orderItems, selectedCarryForwardRows],
  );
  const invoiceOrderItemKey = invoiceOrderItemIds.join('|');
  const deductionContextByOrderItemId = useMemo(() => {
    const context = new Map<string, { productName: string; orderDate: string }>();

    for (const item of orderItems) {
      context.set(item.id, {
        productName: item.farm_products?.product_name ?? 'Product',
        orderDate: selectedDate,
      });
    }

    for (const row of selectedCarryForwardRows) {
      context.set(row.order_item_id, {
        productName: row.product_name,
        orderDate: row.order_date,
      });
    }

    return context;
  }, [orderItems, selectedCarryForwardRows, selectedDate]);
  const deductionCandidates = useMemo<DeductionCandidate[]>(() => {
    const currentCandidates = orderItems.map((item) => ({
      id: item.id,
      orderItem: item,
      productName: item.farm_products?.product_name ?? 'Product',
      farmName: item.farms?.farm_name ?? 'Farm',
      orderDate: selectedDate,
    }));
    const currentIds = new Set(currentCandidates.map((candidate) => candidate.id));
    const carryForwardCandidates = selectedCarryForwardRows
      .filter((row) => !currentIds.has(row.order_item_id))
      .map((row) => {
        const orderItem = reportRowToOrderItem(row);
        return {
          id: row.order_item_id,
          orderItem,
          productName: row.product_name,
          farmName: row.farm_name,
          orderDate: row.order_date,
        };
      });

    return [...currentCandidates, ...carryForwardCandidates];
  }, [orderItems, selectedCarryForwardRows, selectedDate]);
  const filteredDeductionCandidates = useMemo(() => {
    const search = deductionSearch.trim().toLowerCase();
    if (!search) {
      return deductionCandidates;
    }

    return deductionCandidates.filter((candidate) => {
      const formattedDate = formatBusinessDate(candidate.orderDate).toLowerCase();
      return (
        candidate.orderDate.includes(search) ||
        formattedDate.includes(search) ||
        candidate.productName.toLowerCase().includes(search) ||
        candidate.farmName.toLowerCase().includes(search)
      );
    });
  }, [deductionCandidates, deductionSearch]);

  const currentOrderGrossTotal = useMemo(
    () =>
      orderItems.reduce(
        (total, item) => total + safeNumber(item.sales_amount),
        0,
      ),
    [orderItems],
  );
  const currentOrderDeductionTotal = useMemo(
    () =>
      orderItems.reduce(
        (total, item) => total + safeNumber(item.customer_deduction_total),
        0,
      ),
    [orderItems],
  );

  const currentPaid = useMemo(
    () =>
      payments
        .filter((payment) => payment.payment_date === selectedDate)
        .reduce((total, payment) => total + safeNumber(payment.payment_amount), 0),
    [payments, selectedDate],
  );

  const selectedCarryForwardBalance = selectedCarryForwardLines.reduce(
    (total, line) => total + line.balance,
    0,
  );
  const invoiceCarryForwardGross = selectedCarryForwardLines.reduce(
    (total, line) => total + line.grossBalance,
    0,
  );
  const selectedCarryForwardDeductionTotal = selectedCarryForwardLines.reduce(
    (total, line) => total + line.deduction,
    0,
  );
  const invoiceDeductionTotal = selectedCarryForwardDeductionTotal + currentOrderDeductionTotal;
  const totalDueBeforePayment = Math.max(
    invoiceCarryForwardGross + currentOrderGrossTotal - invoiceDeductionTotal,
    0,
  );
  const pendingBalance = Math.max(totalDueBeforePayment - currentPaid, 0);
  const invoiceLines = useMemo(
    () =>
      buildInvoiceLines(
        orderItems,
        selectedCarryForwardLines,
        customerDeductions,
        deductionContextByOrderItemId,
      ),
    [customerDeductions, deductionContextByOrderItemId, orderItems, selectedCarryForwardLines],
  );
  const customerPurchaseSummaries = useMemo(() => {
    const grouped = new Map<
      string,
      { label: string; purchase: number; actualPurchase: number; sales: number; profit: number }
    >();

    for (const row of rows) {
      const key =
        customerSummaryMode === 'monthly'
          ? `${row.year}-${String(row.month).padStart(2, '0')}`
          : String(row.year);
      const group = grouped.get(key) ?? {
        label: customerSummaryMode === 'monthly' ? key : String(row.year),
        purchase: 0,
        actualPurchase: 0,
        sales: 0,
        profit: 0,
      };

      group.purchase += Number(row.estimated_cost ?? 0);
      group.actualPurchase += Number(row.actual_cost ?? row.estimated_cost ?? 0);
      group.sales += Number(row.sales_amount ?? 0);
      group.profit += Number(row.adjusted_profit ?? 0);
      grouped.set(key, group);
    }

    return Array.from(grouped.entries())
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([, summary]) => ({
        ...summary,
        purchase: Math.round(summary.purchase * 100) / 100,
        actualPurchase: Math.round(summary.actualPurchase * 100) / 100,
        sales: Math.round(summary.sales * 100) / 100,
        profit: Math.round(summary.profit * 100) / 100,
      }));
  }, [customerSummaryMode, rows]);
  const customerPurchaseTotals = useMemo(
    () =>
      customerPurchaseSummaries.reduce(
        (total, summary) => ({
          purchase: total.purchase + summary.purchase,
          actualPurchase: total.actualPurchase + summary.actualPurchase,
          sales: total.sales + summary.sales,
          profit: total.profit + summary.profit,
        }),
        { purchase: 0, actualPurchase: 0, sales: 0, profit: 0 },
      ),
    [customerPurchaseSummaries],
  );
  const loadCustomerDeductions = useCallback(async (): Promise<void> => {
    const orderItemIds = invoiceOrderItemKey ? invoiceOrderItemKey.split('|') : [];
    if (orderItemIds.length === 0) {
      setCustomerDeductions([]);
      return;
    }

    try {
      const deductionRows = await orderService.listCustomerDeductionsForOrderItems(orderItemIds);
      setCustomerDeductions(deductionRows);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to load customer deductions.');
    }
  }, [invoiceOrderItemKey]);

  useEffect(() => {
    void loadCustomerDeductions();
  }, [loadCustomerDeductions]);

  const orderColumns = useMemo<ColumnDef<DailyOrderItem, unknown>[]>(
    () => [
      {
        accessorKey: 'farm_products.product_name',
        header: 'Product',
        cell: ({ row }) => row.original.farm_products?.product_name ?? '-',
      },
      {
        accessorKey: 'farms.farm_name',
        header: 'Farm',
        cell: ({ row }) => row.original.farms?.farm_name ?? '-',
      },
      {
        accessorKey: 'pricing_method',
        header: 'Pricing',
        cell: ({ row }) => labelFromValue(row.original.pricing_method),
      },
      { accessorKey: 'cage_count', header: 'Cages' },
      {
        accessorKey: 'gross_weight_kg',
        header: 'Gross KG',
        cell: ({ row }) => formatNumber(row.original.gross_weight_kg),
      },
      {
        accessorKey: 'net_weight_kg',
        header: 'Net KG',
        cell: ({ row }) => formatNumber(row.original.net_weight_kg),
      },
      {
        accessorKey: 'product_quantity',
        header: 'Product Qty',
        cell: ({ row }) => formatNumber(row.original.product_quantity),
      },
      {
        accessorKey: 'sales_price',
        header: 'Sales Price',
        cell: ({ row }) => <MoneyText value={row.original.sales_price} />,
      },
      {
        accessorKey: 'sales_amount',
        header: 'Sales Amount',
        cell: ({ row }) => <MoneyText value={row.original.sales_amount} />,
      },
    ],
    [],
  );

  const deletePayment = useCallback(
    async (paymentId: string): Promise<void> => {
      if (!id) {
        return;
      }

      const confirmed = window.confirm('Delete this customer payment?');
      if (!confirmed) {
        return;
      }

      try {
        await customerService.softDeleteCustomerPayment(paymentId);
        const paymentRows = await customerService.listCustomerPayments(id);
        setPayments(paymentRows);
        notify.success('Customer payment deleted.');
      } catch (error) {
        notify.error(error instanceof Error ? error.message : 'Unable to delete customer payment.');
      }
    },
    [id],
  );

  const paymentColumns = useMemo<ColumnDef<CustomerPayment, unknown>[]>(
    () => [
      {
        accessorKey: 'payment_date',
        header: 'Payment Date',
        cell: ({ row }) => formatBusinessDate(row.original.payment_date),
      },
      {
        accessorKey: 'payment_method',
        header: 'Method',
        cell: ({ row }) => paymentMethodLabel(row.original.payment_method),
      },
      {
        accessorKey: 'payment_amount',
        header: 'Amount',
        cell: ({ row }) => <MoneyText value={row.original.payment_amount} />,
      },
      {
        accessorKey: 'reference_no',
        header: 'Reference',
        cell: ({ row }) => row.original.reference_no || '-',
      },
      { accessorKey: 'notes', header: 'Notes', cell: ({ row }) => row.original.notes || '-' },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <Button
            variant="danger"
            className="h-8 px-3"
            onClick={() => void deletePayment(row.original.id)}
          >
            <Trash2 size={14} />
            Delete
          </Button>
        ),
      },
    ],
    [deletePayment],
  );

  async function submitPayment(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!id) {
      return;
    }

    const method = paymentMethod === 'other' ? customPaymentMethod.trim() : paymentMethod;
    if (!method) {
      notify.error('Enter the custom payment method.');
      return;
    }

    if (paymentAmount <= 0) {
      notify.error('Payment amount must be more than 0.');
      return;
    }

    setSavingPayment(true);
    try {
      const allocations: Array<{
        dailyOrderId: string | null;
        amount: number;
        appliedOrderDate?: string;
      }> = [];
      let remainingPayment = paymentAmount;

      for (const carryForwardLine of selectedCarryForwardLines) {
        if (remainingPayment <= 0) {
          break;
        }

        const appliedAmount = Math.min(remainingPayment, carryForwardLine.balance);
        if (appliedAmount > 0) {
          allocations.push({
            dailyOrderId: carryForwardLine.dailyOrderIds[0] ?? null,
            amount: appliedAmount,
            appliedOrderDate: carryForwardLine.orderDate,
          });
          remainingPayment -= appliedAmount;
        }
      }

      if (remainingPayment > 0) {
        allocations.push({
          dailyOrderId: orderItems[0]?.daily_order_id ?? null,
          amount: remainingPayment,
          appliedOrderDate: selectedDate,
        });
      }

      await Promise.all(
        allocations.map((allocation) =>
          customerService.createCustomerPayment({
            customer_id: id,
            daily_order_id: allocation.dailyOrderId,
            payment_date: selectedDate,
            payment_method: method,
            payment_amount: allocation.amount,
            reference_no: paymentReference || null,
            notes: [
              paymentNotes.trim(),
              allocation.appliedOrderDate && allocation.appliedOrderDate !== selectedDate
                ? `Applied to ${allocation.appliedOrderDate}`
                : '',
            ]
              .filter(Boolean)
              .join(' | ') || null,
          }),
        ),
      );

      notify.success('Customer payment saved.');
      setPaymentAmount(0);
      setPaymentReference('');
      setPaymentNotes('');
      const paymentRows = await customerService.listCustomerPayments(id);
      setPayments(paymentRows);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to save customer payment.');
    } finally {
      setSavingPayment(false);
    }
  }

  async function submitDeadProductDeduction(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const selectedCandidates = deductionCandidates.filter((candidate) =>
      selectedDeductionItemIds.includes(candidate.id),
    );

    if (selectedCandidates.length === 0) {
      notify.error('Select at least one product before saving a deduction.');
      return;
    }

    if (deductionMode === 'price_adjustment' && deductionAmount <= 0) {
      notify.error('Price adjustment amount must be more than 0.');
      return;
    }

    setSavingDeduction(true);
    try {
      if (deductionMode === 'dead_product') {
        const deductions = selectedCandidates
          .map((candidate) => {
            const entryValue = Math.max(Number(deductionEntryValues[candidate.id]) || 0, 0);
            const amount = Math.round(entryValue * candidate.orderItem.sales_price * 100) / 100;

            return {
              candidate,
              entryValue,
              amount,
            };
          })
          .filter((item) => item.amount > 0);

        if (deductions.length === 0) {
          notify.error('Enter at least one deduction weight or quantity.');
          return;
        }

        await Promise.all(
          deductions.map((item) =>
            orderService.addCustomerDeduction({
              orderItem: item.candidate.orderItem,
              reason: 'dead_chicken',
              quantity:
                item.candidate.orderItem.pricing_method === 'price_per_product'
                  ? item.entryValue
                  : 0,
              weightKg:
                item.candidate.orderItem.pricing_method === 'price_per_kg'
                  ? item.entryValue
                  : null,
              deductionAmount: item.amount,
              notes: 'Dead product deduction',
            }),
          ),
        );
      } else {
        const deductions = selectedCandidates
          .map((candidate) => {
            const adjustedSalesAmount = Math.round(
              deductionAmount * priceAdjustmentBasis(candidate.orderItem) * 100,
            ) / 100;
            const amount = Math.max(
              Math.round(
                (safeNumber(candidate.orderItem.sales_amount) - adjustedSalesAmount) * 100,
              ) / 100,
              0,
            );

            return {
              candidate,
              amount,
            };
          })
          .filter((item) => item.amount > 0);

        if (deductions.length === 0) {
          notify.error('The adjusted price must be lower than the current sales price.');
          return;
        }

        await Promise.all(
          deductions.map(({ candidate, amount }) =>
            orderService.addCustomerDeduction({
              orderItem: candidate.orderItem,
              reason: 'other',
              quantity: 0,
              weightKg: null,
              deductionAmount: amount,
              notes: deductionNotes || 'Price adjustment deduction',
            }),
          ),
        );
      }

      notify.success('Deduction saved.');
      setDeductionAmount(0);
      setDeductionSearch('');
      setDeductionEntryValues({});
      setDeductionNotes('');
      setSelectedDeductionItemIds([]);
      setShowDeductionForm(false);
      await Promise.all([loadOrderItems(), loadBaseData(), loadCustomerDeductions()]);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to save deduction.');
    } finally {
      setSavingDeduction(false);
    }
  }

  async function deleteCustomerDeduction(deduction: CustomerDeduction): Promise<void> {
    const confirmed = window.confirm('Remove this deduction?');
    if (!confirmed) {
      return;
    }

    setDeletingDeductionId(deduction.id);
    try {
      await orderService.softDeleteCustomerDeduction(deduction);
      notify.success('Deduction removed.');
      await Promise.all([loadOrderItems(), loadBaseData(), loadCustomerDeductions()]);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to remove deduction.');
    } finally {
      setDeletingDeductionId(null);
    }
  }

  async function captureInvoice(): Promise<string | null> {
    if (!invoiceRef.current) {
      notify.error('Invoice preview is not ready.');
      return null;
    }

    const width = invoiceRef.current.scrollWidth;
    const height = invoiceRef.current.scrollHeight;

    return toPng(invoiceRef.current, {
      cacheBust: true,
      pixelRatio: 2,
      backgroundColor: '#ffffff',
      width,
      height,
      style: {
        margin: '0',
        transform: 'none',
        width: `${width}px`,
        height: `${height}px`,
      },
    });
  }

  async function exportInvoicePng(): Promise<void> {
    try {
      const dataUrl = await captureInvoice();
      if (!dataUrl) {
        return;
      }

      const link = document.createElement('a');
      link.download = `${customer?.customer_name ?? 'customer'}-${selectedDate}.png`;
      link.href = dataUrl;
      link.click();
      notify.success('Invoice PNG exported.');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to export PNG.');
    }
  }

  async function exportInvoicePdf(): Promise<void> {
    try {
      const dataUrl = await captureInvoice();
      if (!dataUrl) {
        return;
      }

      const pdf = new jsPDF('p', 'mm', 'a4');
      const imageProperties = pdf.getImageProperties(dataUrl);
      const pageWidth = pdf.internal.pageSize.getWidth();
      const pageHeight = pdf.internal.pageSize.getHeight();
      const maxWidth = pageWidth - 16;
      const maxHeight = pageHeight - 16;
      let imageWidth = maxWidth;
      let imageHeight = (imageProperties.height * imageWidth) / imageProperties.width;

      if (imageHeight > maxHeight) {
        imageHeight = maxHeight;
        imageWidth = (imageProperties.width * imageHeight) / imageProperties.height;
      }

      pdf.addImage(dataUrl, 'PNG', (pageWidth - imageWidth) / 2, 8, imageWidth, imageHeight);
      pdf.save(`${customer?.customer_name ?? 'customer'}-${selectedDate}.pdf`);
      notify.success('Invoice PDF exported.');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to export PDF.');
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  if (!customer) {
    return (
      <PageTitle
        title="Customer Not Found"
        description="The selected customer does not exist or was deleted."
      />
    );
  }

  return (
    <>
      <PageTitle
        title={customer.customer_name}
        description={`${customerAssignmentDescription(customer)}${customer.phone ? ` | Phone: ${customer.phone}` : ''}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void exportInvoicePng()}>
              <ImageIcon size={16} />
              Export PNG
            </Button>
            <Button variant="secondary" onClick={() => void exportInvoicePdf()}>
              <FileText size={16} />
              Export PDF
            </Button>
          </div>
        }
      />

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-4">
        <SummaryCard title="Order Days" value={summary?.order_days ?? 0} />
        <SummaryCard
          title="Total Sales"
          value={<MoneyText value={summary?.total_sales ?? 0} />}
          tone="green"
        />
        <SummaryCard
          title="Customer Deduction"
          value={<MoneyText value={summary?.total_customer_deduction ?? 0} />}
          tone="rose"
        />
        <SummaryCard
          title="Adjusted Profit"
          value={<MoneyText value={summary?.total_adjusted_profit ?? 0} />}
          tone="amber"
        />
      </div>

      <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[240px_minmax(0,1fr)]">
          <div className="max-w-sm xl:max-w-none">
            <FormDatePicker
              label="Order Date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <SummaryCard
              title="Selected Bring Forward"
              value={<MoneyText value={selectedCarryForwardBalance} />}
              tone="rose"
            />
            <SummaryCard
              title="Current Order"
              value={<MoneyText value={currentOrderGrossTotal} />}
              tone="green"
            />
            {invoiceDeductionTotal > 0 ? (
              <SummaryCard
                title="Dead Product Deduction"
                value={<MoneyText value={invoiceDeductionTotal} />}
                tone="rose"
              />
            ) : null}
            <SummaryCard
              title="Paid On Date"
              value={<MoneyText value={currentPaid} />}
              tone="blue"
            />
            <SummaryCard
              title="Pending Balance"
              value={<MoneyText value={pendingBalance} />}
              tone="amber"
            />
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink-900">
              Bring Forward Previous Payment Dates
            </h2>
            <p className="mt-1 text-sm text-ink-500">
              Select one or more unpaid previous order dates to show below the current order in the
              invoice preview.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              onClick={() =>
                setSelectedCarryForwardDates(
                  filteredCarryForwardOptions.map((option) => option.orderDate),
                )
              }
              disabled={filteredCarryForwardOptions.length === 0}
            >
              Select All
            </Button>
            <Button
              variant="secondary"
              onClick={() => setSelectedCarryForwardDates([])}
              disabled={selectedCarryForwardDates.length === 0}
            >
              Clear
            </Button>
          </div>
        </div>

        <div className="mt-4 max-w-xs">
          <FormInput
            label="Search Date"
            placeholder="2026-05-26"
            value={carryForwardSearch}
            onChange={(event) => setCarryForwardSearch(event.target.value)}
          />
        </div>

        <div className="mt-4 max-h-64 space-y-2 overflow-y-auto pr-1">
          {filteredCarryForwardOptions.length > 0 ? (
            filteredCarryForwardOptions.map((option) => {
              const selected = selectedCarryForwardDates.includes(option.orderDate);

              return (
                <label
                  key={option.orderDate}
                  className={`flex cursor-pointer flex-col gap-3 rounded-md border p-3 transition sm:flex-row sm:items-center sm:justify-between ${
                    selected
                      ? 'border-brand-600 bg-brand-50'
                      : 'border-stone-200 bg-white hover:bg-stone-50'
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1 h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-600"
                      checked={selected}
                      onChange={(event) => {
                        setSelectedCarryForwardDates((current) =>
                          event.target.checked
                            ? Array.from(new Set([...current, option.orderDate]))
                            : current.filter((date) => date !== option.orderDate),
                        );
                      }}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-ink-900">
                        {formatBusinessDate(option.orderDate)}
                      </span>
                      <span className="mt-1 block text-xs text-ink-500">
                        Sales {formatMoney(option.grossSales)} - Deduction{' '}
                        {formatMoney(option.deduction)} - Paid {formatMoney(option.paid)}
                      </span>
                    </span>
                  </span>
                  <span className="text-sm font-semibold text-ink-900">
                    {formatMoney(option.balance)}
                  </span>
                </label>
              );
            })
          ) : (
            <div className="rounded-md border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm text-ink-500">
              No unpaid previous order dates to bring forward.
            </div>
          )}
        </div>
      </section>

      <section className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[380px_1fr]">
        <div className="space-y-5">
          <form
            className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm"
            onSubmit={submitPayment}
          >
            <h2 className="text-base font-semibold text-ink-900">Customer Payment</h2>
            <p className="mt-1 text-sm text-ink-500">
              Payments are applied to selected bring-forward dates first, then to this date&apos;s
              order.
            </p>
            <div className="mt-4 space-y-4">
              <FormSelect
                label="Payment Method"
                value={paymentMethod}
                options={paymentMethodOptions}
                onChange={(event) => setPaymentMethod(event.target.value)}
              />
              {paymentMethod === 'other' ? (
                <FormInput
                  label="Custom Payment Method"
                  value={customPaymentMethod}
                  onChange={(event) => setCustomPaymentMethod(event.target.value)}
                />
              ) : null}
              <FormInput
                label="Payment Amount (RM)"
                type="number"
                min={0}
                step={0.01}
                value={paymentAmount}
                onChange={(event) => setPaymentAmount(safeNumber(event.target.value))}
              />
              <FormInput
                label="Reference / Cheque No."
                value={paymentReference}
                onChange={(event) => setPaymentReference(event.target.value)}
              />
              <FormInput
                label="Notes"
                value={paymentNotes}
                onChange={(event) => setPaymentNotes(event.target.value)}
              />
              <Button type="submit" className="w-full" disabled={savingPayment}>
                <Save size={16} />
                Save Payment
              </Button>
            </div>
          </form>

          <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setShowDeductionForm((current) => !current)}
            >
              {showDeductionForm ? 'Hide Dead Product Deduction' : 'Add Dead Product Deduction'}
            </Button>

            {showDeductionForm ? (
              <form className="mt-4 space-y-4" onSubmit={submitDeadProductDeduction}>
                <FormSelect
                  label="Deduction Type"
                  value={deductionMode}
                  options={[
                    { label: 'Dead product deduction', value: 'dead_product' },
                    { label: 'Price adjustment deduction', value: 'price_adjustment' },
                  ]}
                  onChange={(event) => setDeductionMode(event.target.value as DeductionMode)}
                />

                <FormInput
                  label="Search by Date, Product, or Farm"
                  placeholder="Example: 2026-05-28, KPG, Farm A"
                  value={deductionSearch}
                  onChange={(event) => setDeductionSearch(event.target.value)}
                />

                <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border border-stone-200 p-2">
                  {filteredDeductionCandidates.length > 0 ? (
                    filteredDeductionCandidates.map((candidate) => {
                      const selected = selectedDeductionItemIds.includes(candidate.id);
                      const unitLabel =
                        candidate.orderItem.pricing_method === 'price_per_kg'
                          ? 'Deduct Weight KG'
                          : 'Deduct Product Qty';

                      return (
                        <label
                          key={candidate.id}
                          className={`block rounded-md border p-3 ${
                            selected ? 'border-brand-600 bg-brand-50' : 'border-stone-200'
                          }`}
                        >
                          <span className="flex items-start gap-3">
                            <input
                              type="checkbox"
                              className="mt-1 h-4 w-4 rounded border-stone-300 text-brand-600 focus:ring-brand-600"
                              checked={selected}
                              onChange={(event) => {
                                setSelectedDeductionItemIds((current) =>
                                  event.target.checked
                                    ? Array.from(new Set([...current, candidate.id]))
                                    : current.filter((idValue) => idValue !== candidate.id),
                                );
                              }}
                            />
                            <span>
                              <span className="block text-sm font-semibold text-ink-900">
                                {candidate.productName}
                              </span>
                              <span className="mt-0.5 block text-xs font-medium text-ink-700">
                                Farm: {candidate.farmName}
                              </span>
                              <span className="mt-1 block text-xs text-ink-500">
                                {formatBusinessDate(candidate.orderDate)} · Sales price{' '}
                                {formatMoney(candidate.orderItem.sales_price)}
                              </span>
                            </span>
                          </span>
                          {selected && deductionMode === 'dead_product' ? (
                            <div className="mt-3">
                              <FormInput
                                label={unitLabel}
                                type="number"
                                min={0}
                                step={0.01}
                                value={deductionEntryValues[candidate.id] ?? 0}
                                onChange={(event) =>
                                  setDeductionEntryValues((current) => ({
                                    ...current,
                                    [candidate.id]: safeNumber(event.target.value),
                                  }))
                                }
                              />
                            </div>
                          ) : null}
                        </label>
                      );
                    })
                  ) : (
                    <p className="px-2 py-3 text-sm text-ink-500">
                      No matching order product found. Select a bring-forward date or a date with
                      customer order items before saving a deduction.
                    </p>
                  )}
                </div>

                {deductionMode === 'price_adjustment' ? (
                  <>
                    <FormInput
                      label="Price Adjustment Amount (RM)"
                      type="number"
                      min={0}
                      step={0.01}
                      value={deductionAmount}
                      onChange={(event) => setDeductionAmount(safeNumber(event.target.value))}
                    />
                    <FormInput
                      label="Reason"
                      value={deductionNotes}
                      onChange={(event) => setDeductionNotes(event.target.value)}
                    />
                    <p className="text-xs leading-5 text-ink-500">
                      This amount is treated as the adjusted unit sales price. The deduction is
                      calculated from the old total minus adjusted price multiplied by net weight or
                      product quantity.
                    </p>
                  </>
                ) : null}

                <Button
                  type="submit"
                  className="w-full"
                  disabled={savingDeduction || selectedDeductionItemIds.length === 0}
                >
                  <Save size={16} />
                  Save Deduction
                </Button>
              </form>
            ) : null}

            {showDeductionForm && customerDeductions.length > 0 ? (
              <div className="mt-5 space-y-2">
                <h3 className="text-sm font-semibold text-ink-900">Saved Deductions</h3>
                {customerDeductions.map((deduction) => {
                  const context = deductionContextByOrderItemId.get(deduction.order_item_id);

                  return (
                    <div
                      key={deduction.id}
                      className="flex items-center justify-between gap-3 rounded-md border border-stone-200 bg-stone-50 p-3"
                    >
                      <div>
                        <p className="text-sm font-semibold text-ink-900">
                          {customerDeductionLabel(deduction)} ·{' '}
                          <MoneyText value={deduction.deduction_amount} />
                        </p>
                        <p className="mt-1 text-xs text-ink-500">
                          {context?.productName ?? 'Order item'} ·{' '}
                          {context?.orderDate ? formatBusinessDate(context.orderDate) : '-'}
                        </p>
                      </div>
                      <Button
                        variant="danger"
                        className="h-8 px-3"
                        onClick={() => void deleteCustomerDeduction(deduction)}
                        disabled={deletingDeductionId === deduction.id}
                      >
                        <Trash2 size={14} />
                        Remove
                      </Button>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </section>
        </div>

        <div className="space-y-5">
          <section>
            <h2 className="mb-3 text-base font-semibold text-ink-900">Orders For Selected Date</h2>
            {orderItemsLoading ? (
              <LoadingState />
            ) : (
              <DataTable
                data={orderItems}
                columns={orderColumns}
                emptyTitle="No orders for selected date"
              />
            )}
          </section>

          <section>
            <h2 className="mb-3 text-base font-semibold text-ink-900">Payment History</h2>
            <DataTable data={payments} columns={paymentColumns} emptyTitle="No customer payments" />
          </section>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <h2 className="text-base font-semibold text-ink-900">Customer Purchase View</h2>
            <p className="mt-1 text-sm text-ink-500">
              Monthly or yearly customer purchase, sales, and profit totals.
            </p>
          </div>
          <div className="w-full max-w-xs">
            <FormSelect
              label="View"
              value={customerSummaryMode}
              options={[
                { label: 'Monthly', value: 'monthly' },
                { label: 'Yearly', value: 'yearly' },
              ]}
              onChange={(event) => setCustomerSummaryMode(event.target.value as 'monthly' | 'yearly')}
            />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SummaryCard
            title="Total Purchase"
            value={<MoneyText value={customerPurchaseTotals.purchase} />}
            tone="blue"
          />
          <SummaryCard
            title="Total Sales"
            value={<MoneyText value={customerPurchaseTotals.sales} />}
            tone="green"
          />
          <SummaryCard
            title="Total Profit"
            value={<MoneyText value={customerPurchaseTotals.profit} />}
            tone="amber"
          />
        </div>

        <div className="mt-4 overflow-x-auto rounded-md border border-stone-200">
          <table className="min-w-full divide-y divide-stone-200 text-sm">
            <thead className="bg-stone-50 text-left text-xs uppercase tracking-wide text-ink-500">
              <tr>
                <th className="px-3 py-2">Period</th>
                <th className="px-3 py-2 text-right">Purchase</th>
                <th className="px-3 py-2 text-right">Actual Purchase</th>
                <th className="px-3 py-2 text-right">Sales</th>
                <th className="px-3 py-2 text-right">Profit</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {customerPurchaseSummaries.length > 0 ? (
                customerPurchaseSummaries.map((summary) => (
                  <tr key={summary.label}>
                    <td className="px-3 py-2 font-medium text-ink-900">{summary.label}</td>
                    <td className="px-3 py-2 text-right"><MoneyText value={summary.purchase} /></td>
                    <td className="px-3 py-2 text-right"><MoneyText value={summary.actualPurchase} /></td>
                    <td className="px-3 py-2 text-right"><MoneyText value={summary.sales} /></td>
                    <td className="px-3 py-2 text-right"><MoneyText value={summary.profit} /></td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={5} className="px-3 py-6 text-center text-ink-500">
                    No customer purchase records.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="mt-6">
        <div className="mb-3 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <h2 className="text-base font-semibold text-ink-900">Customer Invoice Preview</h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => void exportInvoicePng()}>
              <Download size={16} />
              PNG
            </Button>
            <Button variant="secondary" onClick={() => void exportInvoicePdf()}>
              <FileText size={16} />
              PDF
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto rounded-lg border border-stone-200 bg-stone-100 p-4">
          <div
            ref={invoiceRef}
            className="mx-auto min-h-[920px] w-[794px] bg-white p-10 text-ink-950 shadow-sm"
            style={{
              fontFamily: '"PingFang SC", "Noto Sans CJK SC", "Microsoft YaHei", Arial, sans-serif',
            }}
          >
            <div className="text-center">
              <h3 className="text-2xl font-bold tracking-normal">志良雞鴨批發商</h3>
              <p className="mt-1 text-xl font-bold tracking-normal">
                CHEE LEONG POULTRY TRADING{' '}
                <sub className="text-xs font-semibold">(IP0235952-X)</sub>
              </p>
              <p className="mt-2 text-sm">
                Lot 4532, Jalan Banir, Air Kuning, 31920 Kampar, Perak.
              </p>
              <p className="text-sm">
                Tel: 05-4788679&nbsp;&nbsp;&nbsp;&nbsp; H/P: 012-5807799, 016-5217799
              </p>
            </div>

            <div className="mt-8 flex items-end justify-between gap-6 text-sm">
              <p>
                To: M/s{' '}
                <span className="inline-flex min-w-72 justify-center border-b border-ink-900 px-2 pb-0.5 text-center leading-none">
                  {customer.customer_name}
                </span>
              </p>
              <p>
                TARIKH:{' '}
                <span className="inline-flex min-w-32 justify-center border-b border-ink-900 px-2 pb-0.5 text-center leading-none">
                  {selectedDate}
                </span>
              </p>
            </div>

            <table className="mt-6 w-full border-collapse text-sm">
              <thead>
                <tr>
                  {[
                    ['雞種', 'JENIS AYAM'],
                    ['重量', 'BERAT (KG)'],
                    ['數量', 'KUANTITI'],
                    ['價目', 'HARGA RM'],
                    ['銀額', 'JUMLAH RM'],
                  ].map(([primary, secondary]) => (
                    <th
                      key={secondary}
                      className="border border-ink-900 px-2 py-2 text-center font-bold leading-tight"
                    >
                      <span className="block">{primary}</span>
                      <span className="block">{secondary}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {invoiceLines.map((line, index) => (
                  <tr key={`${line.product}-${line.weights}-${index}`} className="h-9">
                    <td className="w-[20%] border border-ink-900 px-2 align-top">{line.product}</td>
                    <td className="w-[42%] whitespace-nowrap border border-ink-900 px-1 align-top leading-8">
                      {line.weightValues ? (
                        <span className="grid w-full grid-cols-6 items-center">
                          {Array.from({ length: 6 }, (_, weightIndex) => (
                            <span key={weightIndex} className="min-w-0 text-center tabular-nums">
                              {line.weightValues?.[weightIndex]
                                ? `${line.weightValues[weightIndex]}${line.weightValues[weightIndex + 1] ? ',' : ''}`
                                : ''}
                            </span>
                          ))}
                        </span>
                      ) : (
                        <span className="grid w-full grid-cols-6 items-center tabular-nums">
                          <span className="col-span-6 pl-[calc(100%/12)] text-left">{line.weights}</span>
                        </span>
                      )}
                    </td>
                    <td className="w-[12%] border border-ink-900 px-2 text-center align-top">
                      {line.quantity}
                    </td>
                    <td className="w-[13%] border border-ink-900 px-2 text-right align-top">
                      {line.price}
                    </td>
                    <td className="w-[13%] border border-ink-900 px-2 text-right align-top">
                      {line.amount}
                    </td>
                  </tr>
                ))}
                <tr className="h-10 font-bold">
                  <td colSpan={4} className="border border-ink-900 px-2 text-right">
                    總計 JUMLAH RM
                  </td>
                  <td className="border border-ink-900 px-2 text-right">
                    {formatInvoiceAmount(totalDueBeforePayment)}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>

    </>
  );
}
