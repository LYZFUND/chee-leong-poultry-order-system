import { useEffect, useMemo, useState } from 'react';
import { Save, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '@renderer/components/ui/Button';
import { FormDatePicker } from '@renderer/components/ui/FormDatePicker';
import { FormInput } from '@renderer/components/ui/FormInput';
import { FormSelect } from '@renderer/components/ui/FormSelect';
import { LoadingState } from '@renderer/components/ui/LoadingState';
import { Modal } from '@renderer/components/ui/Modal';
import { MoneyText } from '@renderer/components/ui/MoneyText';
import { notify } from '@renderer/components/ui/Notification';
import { PageTitle } from '@renderer/components/ui/PageTitle';
import { SummaryCard } from '@renderer/components/ui/SummaryCard';
import { calculateOrderByPricingMethod, safeNumber } from '@renderer/services/calculationService';
import { customerService } from '@renderer/services/customerService';
import { orderService } from '@renderer/services/orderService';
import { priceService } from '@renderer/services/priceService';
import { productService } from '@renderer/services/productService';
import { settingsService } from '@renderer/services/settingsService';
import type {
  AreaSalesPrice,
  Customer,
  FarmProduct,
  FarmProductPrice,
  PricingMethod,
} from '@renderer/types/entities';
import { getDateParts, toDateInputValue } from '@renderer/utils/date';
import { formatMoney } from '@renderer/utils/format';

interface CustomerAreaOption {
  areaId: string | null;
  areaName: string;
}

interface CustomerFarmOption {
  farmId: string;
  farmName: string;
  areas: CustomerAreaOption[];
}

interface OrderDraftItem {
  id: string;
  customerId: string;
  farmId: string;
  areaId: string | null;
  productId: string;
  pricingMethod: PricingMethod;
  cageCount: number;
  weightEntriesText: string;
  cageWeight: number;
  grossWeightKg: number;
  netWeightKg: number | null;
  netWeightManual: boolean;
  productQuantity: number;
  farmPrice: number;
  salesPrice: number;
  notes: string;
}

interface FarmPurchaseDraft {
  id: string;
  farmId: string;
  farmName: string;
  productId: string;
  productName: string;
  pricingMethod: PricingMethod;
  cageCount: number;
  cageWeight: number;
  grossWeightKg: number;
  netWeightKg: number | null;
  netWeightManual: boolean;
  productQuantity: number;
  farmPrice: number;
}

interface FarmPurchaseGroup {
  farmId: string;
  farmName: string;
  rows: FarmPurchaseDraft[];
  totalCost: number;
}

interface SavedOrdersDraft {
  orderDate: string;
  activeCustomerId: string;
  activeFarmByCustomer: Record<string, string>;
  activeAreaByCustomer: Record<string, string>;
  itemsByCustomer: Record<string, OrderDraftItem[]>;
  farmPurchaseDrafts: Record<string, Partial<FarmPurchaseDraft>>;
  savedAt: string;
}

interface ResolvedOrderPrices {
  pricingMethod: PricingMethod;
  farmPrice: FarmProductPrice | null;
  salesPrice: AreaSalesPrice | null;
}

const ordersDraftStorageKey = 'chee-leong-orders-page-unsaved-draft';

const orderInputClass =
  'h-10 w-full rounded-md border border-stone-200 bg-white px-3 text-sm text-ink-900 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100';
const orderSelectClass = orderInputClass;
const orderTextareaClass =
  'min-h-24 w-full resize-y rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none transition placeholder:text-stone-400 focus:border-brand-600 focus:ring-2 focus:ring-brand-100';

function makeDraftId(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function customerFarmOptions(customer: Customer): CustomerFarmOption[] {
  const assignments = customer.customer_farm_areas ?? [];
  if (assignments.length > 0) {
    const grouped = new Map<string, CustomerFarmOption>();
    for (const assignment of assignments) {
      const group = grouped.get(assignment.farm_id) ?? {
        farmId: assignment.farm_id,
        farmName: assignment.farms?.farm_name ?? 'Farm',
        areas: [],
      };

      if (!group.areas.some((area) => area.areaId === assignment.area_id)) {
        group.areas.push({
          areaId: assignment.area_id,
          areaName: assignment.customer_areas?.area_name ?? 'Area',
        });
      }
      grouped.set(assignment.farm_id, group);
    }

    return Array.from(grouped.values());
  }

  if (customer.farm_id) {
    return [
      {
        farmId: customer.farm_id,
        farmName: customer.farms?.farm_name ?? 'Farm',
        areas: customer.area_id
          ? [
              {
                areaId: customer.area_id,
                areaName: customer.customer_areas?.area_name ?? 'Area',
              },
            ]
          : [],
      },
    ];
  }

  return [];
}

function isEntered(item: OrderDraftItem): boolean {
  if (!item.productId) {
    return false;
  }

  if (item.pricingMethod === 'price_per_kg') {
    return item.cageCount > 0 || item.grossWeightKg > 0 || safeNumber(item.netWeightKg) > 0;
  }

  return item.productQuantity > 0;
}

function isWeightEntryLimitExceeded(text = ''): boolean {
  return (
    text
      .split(/[\s,;]+/)
      .map((value) => value.trim())
      .filter(Boolean).length > 200
  );
}

function farmPurchaseKey(item: OrderDraftItem): string {
  return `${item.farmId}:${item.productId}:${item.pricingMethod}`;
}

function parseWeightEntries(text = ''): number[] {
  return text
    .split(/[\s,;]+/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value) && value > 0)
    .slice(0, 200);
}

function sumWeights(weights: number[]): number {
  return Math.round(weights.reduce((sum, weight) => sum + weight, 0) * 1000) / 1000;
}

function readSavedOrdersDraft(): SavedOrdersDraft | null {
  try {
    const rawDraft = localStorage.getItem(ordersDraftStorageKey);
    if (!rawDraft) {
      return null;
    }

    const parsedDraft = JSON.parse(rawDraft) as SavedOrdersDraft;
    const hasItems = Object.values(parsedDraft.itemsByCustomer ?? {}).some(
      (items) => items.length > 0,
    );
    const normalizedItemsByCustomer = Object.fromEntries(
      Object.entries(parsedDraft.itemsByCustomer ?? {}).map(([customerId, items]) => [
        customerId,
        items.map((item) => ({ ...item, weightEntriesText: item.weightEntriesText ?? '' })),
      ]),
    );
    return hasItems ? { ...parsedDraft, itemsByCustomer: normalizedItemsByCustomer } : null;
  } catch {
    localStorage.removeItem(ordersDraftStorageKey);
    return null;
  }
}

export function OrdersPage(): JSX.Element {
  const [orderDate, setOrderDate] = useState(toDateInputValue());
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [products, setProducts] = useState<FarmProduct[]>([]);
  const [defaultCageWeight, setDefaultCageWeight] = useState(8);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeCustomerId, setActiveCustomerId] = useState('');
  const [activeFarmByCustomer, setActiveFarmByCustomer] = useState<Record<string, string>>({});
  const [activeAreaByCustomer, setActiveAreaByCustomer] = useState<Record<string, string>>({});
  const [itemsByCustomer, setItemsByCustomer] = useState<Record<string, OrderDraftItem[]>>({});
  const [farmPurchaseDrafts, setFarmPurchaseDrafts] = useState<
    Record<string, Partial<FarmPurchaseDraft>>
  >({});
  const [customerSearch, setCustomerSearch] = useState('');
  const [expandedItemIdByCustomer, setExpandedItemIdByCustomer] = useState<Record<string, string>>(
    {},
  );
  const [draftReady, setDraftReady] = useState(false);
  const [savedDraft, setSavedDraft] = useState<SavedOrdersDraft | null>(null);
  const [continueDraftOpen, setContinueDraftOpen] = useState(false);
  const [discardDraftOpen, setDiscardDraftOpen] = useState(false);
  const [dateConfirmOpen, setDateConfirmOpen] = useState(false);
  const [confirmOrderDate, setConfirmOrderDate] = useState(orderDate);

  useEffect(() => {
    async function load(): Promise<void> {
      const [customerRows, productRows, cageWeight] = await Promise.all([
        customerService.listCustomers(false),
        productService.listProducts(false),
        settingsService.getDefaultCageWeight(),
      ]);
      setCustomers(customerRows);
      setProducts(productRows);
      setDefaultCageWeight(cageWeight);

      const firstCustomer = customerRows[0];
      if (firstCustomer) {
        const farms = customerFarmOptions(firstCustomer);
        setActiveCustomerId(firstCustomer.id);
        if (farms[0]) {
          setActiveFarmByCustomer({ [firstCustomer.id]: farms[0].farmId });
          setActiveAreaByCustomer({ [firstCustomer.id]: farms[0].areas[0]?.areaId ?? '' });
        }
      }
      setLoading(false);

      const existingDraft = readSavedOrdersDraft();
      if (existingDraft) {
        setSavedDraft(existingDraft);
        setContinueDraftOpen(true);
        return;
      }

      setDraftReady(true);
    }

    void load();
  }, []);

  useEffect(() => {
    if (!draftReady) {
      return;
    }

    const hasDraftItems = Object.values(itemsByCustomer).some((items) => items.length > 0);
    if (!hasDraftItems) {
      localStorage.removeItem(ordersDraftStorageKey);
      return;
    }

    const draft: SavedOrdersDraft = {
      orderDate,
      activeCustomerId,
      activeFarmByCustomer,
      activeAreaByCustomer,
      itemsByCustomer,
      farmPurchaseDrafts,
      savedAt: new Date().toISOString(),
    };
    localStorage.setItem(ordersDraftStorageKey, JSON.stringify(draft));
  }, [
    activeAreaByCustomer,
    activeCustomerId,
    activeFarmByCustomer,
    draftReady,
    farmPurchaseDrafts,
    itemsByCustomer,
    orderDate,
  ]);

  const dayName = getDateParts(orderDate).dayName;
  const activeCustomer = customers.find((customer) => customer.id === activeCustomerId) ?? null;
  const activeCustomerFarms = activeCustomer ? customerFarmOptions(activeCustomer) : [];
  const activeFarmId = activeCustomer
    ? (activeFarmByCustomer[activeCustomer.id] ?? activeCustomerFarms[0]?.farmId ?? '')
    : '';
  const activeFarm =
    activeCustomerFarms.find((farm) => farm.farmId === activeFarmId) ??
    activeCustomerFarms[0] ??
    null;
  const activeAreaId = activeCustomer
    ? (activeAreaByCustomer[activeCustomer.id] ?? activeFarm?.areas[0]?.areaId ?? '')
    : '';
  const farmProducts = products.filter((product) => product.farm_id === activeFarmId);
  const activeItems = activeCustomer
    ? (itemsByCustomer[activeCustomer.id] ?? []).filter((item) => item.farmId === activeFarmId)
    : [];
  const activeExpandedItemId =
    activeCustomer &&
    activeItems.some((item) => item.id === expandedItemIdByCustomer[activeCustomer.id])
      ? expandedItemIdByCustomer[activeCustomer.id]
      : (activeItems[activeItems.length - 1]?.id ?? '');
  const enteredItems = useMemo(
    () => Object.values(itemsByCustomer).flat().filter(isEntered),
    [itemsByCustomer],
  );

  const filteredCustomers = useMemo(() => {
    const normalizedSearch = customerSearch.trim().toLowerCase();
    if (!normalizedSearch) {
      return customers;
    }

    return customers.filter((customer) =>
      customer.customer_name.toLowerCase().includes(normalizedSearch),
    );
  }, [customerSearch, customers]);

  const totals = useMemo(() => {
    return enteredItems.reduce(
      (summary, item) => {
        const calculated = calculateOrderByPricingMethod({
          pricingMethod: item.pricingMethod,
          cageCount: item.weightEntriesText
            ? parseWeightEntries(item.weightEntriesText).length
            : item.cageCount,
          cageWeight: item.cageWeight,
          grossWeightKg: item.weightEntriesText
            ? sumWeights(parseWeightEntries(item.weightEntriesText))
            : item.grossWeightKg,
          netWeightKg: item.netWeightManual ? item.netWeightKg : null,
          productQuantity: item.productQuantity,
          farmPrice: item.farmPrice,
          salesPrice: item.salesPrice,
        });

        return {
          estimatedCost: summary.estimatedCost + calculated.estimatedCost,
          salesAmount: summary.salesAmount + calculated.salesAmount,
          estimatedProfit: summary.estimatedProfit + calculated.estimatedProfit,
        };
      },
      { estimatedCost: 0, salesAmount: 0, estimatedProfit: 0 },
    );
  }, [enteredItems]);

  const farmPurchaseRows = useMemo<FarmPurchaseDraft[]>(() => {
    const grouped = new Map<string, FarmPurchaseDraft>();

    for (const item of enteredItems) {
      const product = products.find((productRow) => productRow.id === item.productId);
      const key = farmPurchaseKey(item);
      const calculated = calculateOrderByPricingMethod({
        pricingMethod: item.pricingMethod,
        cageCount: item.weightEntriesText
          ? parseWeightEntries(item.weightEntriesText).length
          : item.cageCount,
        cageWeight: item.cageWeight,
        grossWeightKg: item.weightEntriesText
          ? sumWeights(parseWeightEntries(item.weightEntriesText))
          : item.grossWeightKg,
        netWeightKg: item.netWeightManual ? item.netWeightKg : null,
        productQuantity: item.productQuantity,
        farmPrice: item.farmPrice,
        salesPrice: 0,
      });
      const existing = grouped.get(key);
      const customer = customers.find((customerRow) => customerRow.id === item.customerId);
      const farmName = customer
        ? (customerFarmOptions(customer).find((farm) => farm.farmId === item.farmId)?.farmName ??
          'Farm')
        : 'Farm';

      grouped.set(key, {
        id: key,
        farmId: item.farmId,
        farmName,
        productId: item.productId,
        productName: product?.product_name ?? 'Product',
        pricingMethod: item.pricingMethod,
        cageCount:
          (existing?.cageCount ?? 0) +
          (item.weightEntriesText
            ? parseWeightEntries(item.weightEntriesText).length
            : item.cageCount),
        cageWeight: item.cageWeight || existing?.cageWeight || defaultCageWeight,
        grossWeightKg:
          (existing?.grossWeightKg ?? 0) +
          (item.weightEntriesText
            ? sumWeights(parseWeightEntries(item.weightEntriesText))
            : item.grossWeightKg),
        netWeightKg:
          item.pricingMethod === 'price_per_kg'
            ? (existing?.netWeightKg ?? 0) + calculated.netWeightKg
            : (existing?.netWeightKg ?? null),
        netWeightManual: false,
        productQuantity: (existing?.productQuantity ?? 0) + item.productQuantity,
        farmPrice: item.farmPrice,
      });
    }

    return Array.from(grouped.values()).map((row) => ({
      ...row,
      ...(farmPurchaseDrafts[row.id] ?? {}),
    }));
  }, [customers, defaultCageWeight, enteredItems, farmPurchaseDrafts, products]);

  const farmPurchaseGroups = useMemo<FarmPurchaseGroup[]>(() => {
    const grouped = new Map<string, FarmPurchaseGroup>();

    for (const row of farmPurchaseRows) {
      const calculated = calculateOrderByPricingMethod({
        pricingMethod: row.pricingMethod,
        cageCount: row.cageCount,
        cageWeight: row.cageWeight,
        grossWeightKg: row.grossWeightKg,
        netWeightKg: row.netWeightManual ? row.netWeightKg : null,
        productQuantity: row.productQuantity,
        farmPrice: row.farmPrice,
        salesPrice: 0,
      });
      const group = grouped.get(row.farmId) ?? {
        farmId: row.farmId,
        farmName: row.farmName,
        rows: [],
        totalCost: 0,
      };

      group.rows.push(row);
      group.totalCost += calculated.estimatedCost;
      grouped.set(row.farmId, group);
    }

    return Array.from(grouped.values());
  }, [farmPurchaseRows]);

  function selectCustomer(customer: Customer): void {
    const farms = customerFarmOptions(customer);
    setActiveCustomerId(customer.id);
    if (!activeFarmByCustomer[customer.id] && farms[0]) {
      setActiveFarmByCustomer((current) => ({ ...current, [customer.id]: farms[0].farmId }));
      setActiveAreaByCustomer((current) => ({
        ...current,
        [customer.id]: farms[0].areas[0]?.areaId ?? '',
      }));
    }
  }

  function setActiveFarm(customerId: string, farm: CustomerFarmOption): void {
    setActiveFarmByCustomer((current) => ({ ...current, [customerId]: farm.farmId }));
    setActiveAreaByCustomer((current) => ({
      ...current,
      [customerId]: farm.areas[0]?.areaId ?? '',
    }));
  }

  function updateCustomerItems(
    customerId: string,
    updater: (items: OrderDraftItem[]) => OrderDraftItem[],
  ): void {
    setItemsByCustomer((current) => ({
      ...current,
      [customerId]: updater(current[customerId] ?? []),
    }));
  }

  function updateFarmPurchaseDraft(rowId: string, patch: Partial<FarmPurchaseDraft>): void {
    setFarmPurchaseDrafts((current) => ({
      ...current,
      [rowId]: {
        ...(current[rowId] ?? {}),
        ...patch,
      },
    }));
  }

  function continueSavedDraft(): void {
    if (!savedDraft) {
      setContinueDraftOpen(false);
      setDraftReady(true);
      return;
    }

    setOrderDate(savedDraft.orderDate);
    setActiveCustomerId(savedDraft.activeCustomerId);
    setActiveFarmByCustomer(savedDraft.activeFarmByCustomer);
    setActiveAreaByCustomer(savedDraft.activeAreaByCustomer);
    setItemsByCustomer(savedDraft.itemsByCustomer);
    setFarmPurchaseDrafts(savedDraft.farmPurchaseDrafts);
    setSavedDraft(null);
    setContinueDraftOpen(false);
    setDraftReady(true);
  }

  function requestDiscardSavedDraft(): void {
    setContinueDraftOpen(false);
    setDiscardDraftOpen(true);
  }

  function discardSavedDraft(): void {
    localStorage.removeItem(ordersDraftStorageKey);
    setSavedDraft(null);
    setDiscardDraftOpen(false);
    setDraftReady(true);
  }

  function addOrderItem(): void {
    if (!activeCustomer || !activeFarm) {
      notify.error('Select a customer with an assigned farm first.');
      return;
    }

    const itemId = makeDraftId();
    updateCustomerItems(activeCustomer.id, (items) => [
      ...items,
      {
        id: itemId,
        customerId: activeCustomer.id,
        farmId: activeFarm.farmId,
        areaId: activeAreaId || null,
        productId: '',
        pricingMethod: 'price_per_kg',
        cageCount: 0,
        weightEntriesText: '',
        cageWeight: defaultCageWeight,
        grossWeightKg: 0,
        netWeightKg: null,
        netWeightManual: false,
        productQuantity: 0,
        farmPrice: 0,
        salesPrice: 0,
        notes: '',
      },
    ]);
    setExpandedItemIdByCustomer((current) => ({ ...current, [activeCustomer.id]: itemId }));
  }

  function updateItem(customerId: string, itemId: string, patch: Partial<OrderDraftItem>): void {
    updateCustomerItems(customerId, (items) =>
      items.map((item) => (item.id === itemId ? { ...item, ...patch } : item)),
    );
  }

  function removeOrderItem(customerId: string, itemId: string): void {
    const nextItems = (itemsByCustomer[customerId] ?? []).filter((item) => item.id !== itemId);
    updateCustomerItems(customerId, () => nextItems);
    setExpandedItemIdByCustomer((current) =>
      current[customerId] === itemId
        ? { ...current, [customerId]: nextItems[nextItems.length - 1]?.id ?? '' }
        : current,
    );
  }

  async function resolveOrderPrices(input: {
    farmId: string;
    areaId: string | null;
    productId: string;
    pricingMethod: PricingMethod;
  }): Promise<ResolvedOrderPrices> {
    const [farmPrices, salesPrices] = await Promise.all([
      priceService.listActiveFarmPricesForProduct({
        farmId: input.farmId,
        productId: input.productId,
        orderDate,
      }),
      input.areaId
        ? priceService.listActiveSalesPricesForAreaProduct({
            areaId: input.areaId,
            productId: input.productId,
            orderDate,
          })
        : Promise.resolve([]),
    ]);

    const candidateMethods = Array.from(
      new Set<PricingMethod>([
        input.pricingMethod,
        ...farmPrices.map((price) => price.pricing_method),
        ...salesPrices.map((price) => price.pricing_method),
      ]),
    );

    const matchedMethod =
      candidateMethods.find((method) => {
        const hasFarmPrice = farmPrices.some((price) => price.pricing_method === method);
        const hasSalesPrice =
          !input.areaId || salesPrices.some((price) => price.pricing_method === method);
        return hasFarmPrice && hasSalesPrice;
      }) ?? input.pricingMethod;

    return {
      pricingMethod: matchedMethod,
      farmPrice: farmPrices.find((price) => price.pricing_method === matchedMethod) ?? null,
      salesPrice: input.areaId
        ? (salesPrices.find((price) => price.pricing_method === matchedMethod) ?? null)
        : null,
    };
  }

  function notifyMissingPrices(result: ResolvedOrderPrices, hasArea: boolean): void {
    if (!result.farmPrice && hasArea && !result.salesPrice) {
      notify.error(
        'No active farm price and sales price found for this product and area. Enter the missing prices manually.',
      );
      return;
    }

    if (!result.farmPrice) {
      notify.error('No active farm price found for this product. Enter the farm price manually.');
      return;
    }

    if (hasArea && !result.salesPrice) {
      notify.error(
        'No active sales price found for this area and product. Enter the sales price manually.',
      );
    }
  }

  async function applyProduct(
    customerId: string,
    item: OrderDraftItem,
    productId: string,
  ): Promise<void> {
    const product = products.find((productRow) => productRow.id === productId);
    if (!product) {
      updateItem(customerId, item.id, { productId: '', farmPrice: 0, salesPrice: 0 });
      return;
    }

    const pricingMethod = product.pricing_method;
    const resolvedPrices = await resolveOrderPrices({
      farmId: item.farmId,
      areaId: item.areaId,
      productId,
      pricingMethod,
    });

    updateItem(customerId, item.id, {
      productId,
      pricingMethod: resolvedPrices.pricingMethod,
      cageWeight: product.default_cage_weight ?? defaultCageWeight,
      farmPrice: resolvedPrices.farmPrice?.price_amount ?? 0,
      salesPrice: resolvedPrices.salesPrice?.price_amount ?? 0,
    });

    notifyMissingPrices(resolvedPrices, Boolean(item.areaId));
  }

  async function applyArea(
    customerId: string,
    item: OrderDraftItem,
    areaId: string,
  ): Promise<void> {
    const nextAreaId = areaId || null;
    updateItem(customerId, item.id, { areaId: nextAreaId });

    if (!nextAreaId || !item.productId) {
      if (!nextAreaId) {
        updateItem(customerId, item.id, { salesPrice: 0 });
      }
      return;
    }

    const resolvedPrices = await resolveOrderPrices({
      farmId: item.farmId,
      areaId: nextAreaId,
      productId: item.productId,
      pricingMethod: item.pricingMethod,
    });

    updateItem(customerId, item.id, {
      areaId: nextAreaId,
      pricingMethod: resolvedPrices.pricingMethod,
      farmPrice: resolvedPrices.farmPrice?.price_amount ?? item.farmPrice,
      salesPrice: resolvedPrices.salesPrice?.price_amount ?? 0,
    });

    notifyMissingPrices(resolvedPrices, true);
  }

  async function applyPricingMethod(
    customerId: string,
    item: OrderDraftItem,
    pricingMethod: PricingMethod,
  ): Promise<void> {
    if (!item.productId) {
      updateItem(customerId, item.id, { pricingMethod });
      return;
    }

    const resolvedPrices = await resolveOrderPrices({
      farmId: item.farmId,
      areaId: item.areaId,
      productId: item.productId,
      pricingMethod,
    });

    updateItem(customerId, item.id, {
      pricingMethod: resolvedPrices.pricingMethod,
      farmPrice: resolvedPrices.farmPrice?.price_amount ?? 0,
      salesPrice: item.areaId ? (resolvedPrices.salesPrice?.price_amount ?? 0) : item.salesPrice,
    });

    notifyMissingPrices(resolvedPrices, Boolean(item.areaId));
  }

  async function saveOrder(): Promise<void> {
    const currentDate = toDateInputValue();
    if (orderDate !== currentDate) {
      setConfirmOrderDate(orderDate);
      setDateConfirmOpen(true);
      return;
    }

    await saveOrderForDate(orderDate);
  }

  async function saveOrderForDate(targetOrderDate: string): Promise<void> {
    if (enteredItems.length === 0) {
      notify.error('Enter at least one customer order before saving.');
      return;
    }

    const invalidItem = enteredItems.find(
      (item) => !item.productId || item.farmPrice < 0 || item.salesPrice < 0,
    );
    if (invalidItem) {
      notify.error('Every entered order must have a product and non-negative prices.');
      return;
    }

    const tooManyWeights = enteredItems.find((item) =>
      isWeightEntryLimitExceeded(item.weightEntriesText),
    );
    if (tooManyWeights) {
      notify.error('Each order item can store a maximum of 200 cage weights.');
      return;
    }

    const farmPurchaseItems = farmPurchaseRows.filter((row) =>
      row.pricingMethod === 'price_per_kg'
        ? row.cageCount > 0 || row.grossWeightKg > 0 || safeNumber(row.netWeightKg) > 0
        : row.productQuantity > 0,
    );
    const invalidFarmPurchaseItem = farmPurchaseItems.find((item) => item.farmPrice < 0);
    if (invalidFarmPurchaseItem) {
      notify.error('Farm purchase totals must use non-negative farm prices.');
      return;
    }

    setSaving(true);
    try {
      await orderService.saveDailyOrder({
        orderDate: targetOrderDate,
        customerItems: enteredItems.map((item) => ({
          ...(() => {
            const weightEntriesKg = parseWeightEntries(item.weightEntriesText);
            return {
              cageCount: weightEntriesKg.length > 0 ? weightEntriesKg.length : item.cageCount,
              grossWeightKg:
                weightEntriesKg.length > 0 ? sumWeights(weightEntriesKg) : item.grossWeightKg,
              weightEntriesKg,
            };
          })(),
          customerId: item.customerId,
          areaId: item.areaId,
          farmId: item.farmId,
          productId: item.productId,
          pricingMethod: item.pricingMethod,
          cageWeight: item.cageWeight,
          netWeightKg: item.netWeightManual ? item.netWeightKg : null,
          productQuantity: item.productQuantity,
          farmPrice: item.farmPrice,
          salesPrice: item.salesPrice,
          notes: item.notes || null,
        })),
        farmItems: farmPurchaseItems.map((item) => ({
          farmId: item.farmId,
          productId: item.productId,
          pricingMethod: item.pricingMethod,
          cageCount: item.cageCount,
          cageWeight: item.cageWeight,
          grossWeightKg: item.grossWeightKg,
          netWeightKg: item.netWeightManual ? item.netWeightKg : null,
          productQuantity: item.productQuantity,
          farmPrice: item.farmPrice,
        })),
      });
      localStorage.removeItem(ordersDraftStorageKey);
      setItemsByCustomer({});
      setFarmPurchaseDrafts({});
      notify.success('Order saved. You can continue adding more orders for the same date.');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to save order.');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return <LoadingState />;
  }

  return (
    <>
      <PageTitle
        title="Daily Orders"
        description="Enter customer orders by date, farm, area, and product."
        actions={
          <Button onClick={() => void saveOrder()} disabled={saving}>
            <Save size={16} />
            Save Order
          </Button>
        }
      />

      <section className="rounded-lg border border-stone-200 bg-white p-5 shadow-sm">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[260px_1fr]">
          <FormDatePicker
            label="Order Date"
            value={orderDate}
            onChange={(event) => setOrderDate(event.target.value)}
          />
          <div className="rounded-md border border-stone-200 bg-stone-50 px-4 py-3">
            <p className="text-xs font-semibold uppercase text-ink-500">Day</p>
            <p className="mt-1 text-lg font-semibold text-ink-900">{dayName}</p>
          </div>
        </div>
      </section>

      <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <SummaryCard
          title="Total Estimated Purchase"
          value={<MoneyText value={totals.estimatedCost} />}
          tone="blue"
        />
        <SummaryCard
          title="Total Sales"
          value={<MoneyText value={totals.salesAmount} />}
          tone="green"
        />
        <SummaryCard
          title="Total Estimated Profit"
          value={<MoneyText value={totals.estimatedProfit} />}
          tone="amber"
        />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-5 xl:grid-cols-[340px_1fr]">
        <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
          <div className="space-y-3 border-b border-stone-200 px-4 py-3">
            <h2 className="text-sm font-semibold text-ink-900">Customers</h2>
            <FormInput
              label="Search Customer"
              value={customerSearch}
              placeholder="Type customer name"
              onChange={(event) => setCustomerSearch(event.target.value)}
            />
          </div>
          <div className="max-h-[620px] overflow-y-auto p-3">
            {filteredCustomers.length > 0 ? (
              filteredCustomers.map((customer) => {
                const farms = customerFarmOptions(customer);
                const entered = (itemsByCustomer[customer.id] ?? []).some(isEntered);
                const active = customer.id === activeCustomerId;

                return (
                  <button
                    key={customer.id}
                    type="button"
                    className={clsx(
                      'mb-2 w-full rounded-md border p-3 text-left transition',
                      active
                        ? 'border-brand-600 bg-brand-50'
                        : 'border-stone-200 bg-white hover:bg-stone-50',
                    )}
                    onClick={() => selectCustomer(customer)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-ink-900">{customer.customer_name}</p>
                        <p className="mt-1 text-xs text-ink-500">
                          {farms.map((farm) => farm.farmName).join(', ') || 'No farm assigned'}
                        </p>
                      </div>
                      <span
                        className={clsx(
                          'rounded-full px-2 py-1 text-xs font-semibold',
                          entered ? 'bg-emerald-50 text-emerald-700' : 'bg-stone-100 text-ink-500',
                        )}
                      >
                        {entered ? 'Entered' : 'Not entered'}
                      </span>
                    </div>
                  </button>
                );
              })
            ) : (
              <div className="rounded-md border border-dashed border-stone-300 bg-stone-50 px-4 py-6 text-center text-sm text-ink-500">
                No customer found.
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-stone-200 bg-white shadow-sm">
          {activeCustomer && activeFarm ? (
            <>
              <div className="border-b border-stone-200 p-5">
                <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-ink-900">
                      {activeCustomer.customer_name}
                    </h2>
                    <p className="mt-1 text-sm text-ink-500">
                      Select a farm, area, and products for this customer.
                    </p>
                  </div>
                  <Button onClick={addOrderItem}>
                    <Plus size={16} />
                    Add Product / Order Item
                  </Button>
                </div>

                <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
                  <FormSelect
                    label="Assigned Farm"
                    value={activeFarm.farmId}
                    options={activeCustomerFarms.map((farm) => ({
                      label: farm.farmName,
                      value: farm.farmId,
                    }))}
                    onChange={(event) => {
                      const farm = activeCustomerFarms.find(
                        (item) => item.farmId === event.target.value,
                      );
                      if (farm) {
                        setActiveFarm(activeCustomer.id, farm);
                      }
                    }}
                  />
                  <FormSelect
                    label="Default Area For New Items"
                    value={activeAreaId}
                    options={[
                      {
                        label: activeFarm.areas.length > 0 ? 'Select area' : 'No area assigned',
                        value: '',
                      },
                      ...activeFarm.areas.map((area) => ({
                        label: area.areaName,
                        value: area.areaId ?? '',
                      })),
                    ]}
                    onChange={(event) => {
                      setActiveAreaByCustomer((current) => ({
                        ...current,
                        [activeCustomer.id]: event.target.value,
                      }));
                    }}
                  />
                </div>
              </div>

              <div className="space-y-4 p-5">
                {activeItems.length > 0 ? (
                  activeItems.map((item) => {
                    const weightEntriesKg = parseWeightEntries(item.weightEntriesText);
                    const computedCageCount =
                      weightEntriesKg.length > 0 ? weightEntriesKg.length : item.cageCount;
                    const computedGrossWeightKg =
                      weightEntriesKg.length > 0 ? sumWeights(weightEntriesKg) : item.grossWeightKg;
                    const calculated = calculateOrderByPricingMethod({
                      pricingMethod: item.pricingMethod,
                      cageCount: computedCageCount,
                      cageWeight: item.cageWeight,
                      grossWeightKg: computedGrossWeightKg,
                      netWeightKg: item.netWeightManual ? item.netWeightKg : null,
                      productQuantity: item.productQuantity,
                      farmPrice: item.farmPrice,
                      salesPrice: item.salesPrice,
                    });

                    const displayedNetWeight = item.netWeightManual
                      ? (item.netWeightKg ?? 0)
                      : calculated.netWeightKg;
                    const productName =
                      products.find((product) => product.id === item.productId)?.product_name ??
                      'New order item';
                    const isExpanded = item.id === activeExpandedItemId;

                    if (!isExpanded) {
                      return (
                        <article
                          key={item.id}
                          className="rounded-lg border border-stone-200 bg-white shadow-sm"
                        >
                          <button
                            type="button"
                            className="grid w-full grid-cols-1 gap-3 p-4 text-left transition hover:bg-stone-50 md:grid-cols-[1fr_150px_160px_auto] md:items-center"
                            onClick={() =>
                              setExpandedItemIdByCustomer((current) => ({
                                ...current,
                                [activeCustomer.id]: item.id,
                              }))
                            }
                          >
                            <div>
                              <p className="text-sm font-semibold text-ink-900">{productName}</p>
                              <p className="mt-1 text-xs text-ink-500">
                                {item.pricingMethod === 'price_per_kg'
                                  ? 'Price Per Kg'
                                  : 'Price Per Product'}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase text-ink-500">
                                Net Weight
                              </p>
                              <p className="mt-1 text-sm font-semibold text-ink-900">
                                {displayedNetWeight.toFixed(3)} KG
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-semibold uppercase text-ink-500">
                                Sales Amount
                              </p>
                              <p className="mt-1 text-sm font-semibold text-ink-900">
                                {formatMoney(calculated.salesAmount)}
                              </p>
                            </div>
                            <span className="rounded-full bg-stone-100 px-3 py-1 text-center text-xs font-semibold text-ink-500">
                              View Details
                            </span>
                          </button>
                          <div className="flex justify-end border-t border-stone-100 px-4 py-3">
                            <Button
                              variant="danger"
                              className="h-8 px-3"
                              onClick={() => removeOrderItem(activeCustomer.id, item.id)}
                            >
                              <Trash2 size={14} />
                              Remove
                            </Button>
                          </div>
                        </article>
                      );
                    }

                    return (
                      <article
                        key={item.id}
                        className="rounded-lg border border-stone-200 bg-stone-50 p-4"
                      >
                        <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                          <div>
                            <h3 className="text-base font-semibold text-ink-900">{productName}</h3>
                            <p className="mt-1 text-sm text-ink-500">
                              {item.pricingMethod === 'price_per_kg'
                                ? 'Price Per Kg'
                                : 'Price Per Product'}
                            </p>
                          </div>
                          <Button
                            variant="danger"
                            className="h-9 px-3"
                            onClick={() => removeOrderItem(activeCustomer.id, item.id)}
                          >
                            <Trash2 size={14} />
                            Remove
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-ink-600">
                              Product
                            </span>
                            <select
                              className={orderSelectClass}
                              value={item.productId}
                              onChange={(event) =>
                                void applyProduct(activeCustomer.id, item, event.target.value)
                              }
                            >
                              <option value="">Select product</option>
                              {farmProducts.map((product) => (
                                <option key={product.id} value={product.id}>
                                  {product.product_name}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-ink-600">
                              Area
                            </span>
                            <select
                              className={orderSelectClass}
                              value={item.areaId ?? ''}
                              onChange={(event) =>
                                void applyArea(activeCustomer.id, item, event.target.value)
                              }
                            >
                              <option value="">Select area</option>
                              {activeFarm.areas.map((area) => (
                                <option
                                  key={area.areaId ?? area.areaName}
                                  value={area.areaId ?? ''}
                                >
                                  {area.areaName}
                                </option>
                              ))}
                            </select>
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-ink-600">
                              Pricing Method
                            </span>
                            <select
                              className={orderSelectClass}
                              value={item.pricingMethod}
                              onChange={(event) =>
                                void applyPricingMethod(
                                  activeCustomer.id,
                                  item,
                                  event.target.value as PricingMethod,
                                )
                              }
                            >
                              <option value="price_per_kg">Price Per Kg</option>
                              <option value="price_per_product">Price Per Product</option>
                            </select>
                          </label>

                          <label className="block md:col-span-2 xl:col-span-3">
                            <span className="mb-1 block text-xs font-semibold text-ink-600">
                              Cage Weights KG
                            </span>
                            <textarea
                              className={orderTextareaClass}
                              value={item.weightEntriesText}
                              placeholder="26.4, 28.2, 27.7..."
                              onChange={(event) => {
                                const weights = parseWeightEntries(event.target.value);
                                updateItem(activeCustomer.id, item.id, {
                                  weightEntriesText: event.target.value,
                                  cageCount: weights.length > 0 ? weights.length : item.cageCount,
                                  grossWeightKg:
                                    weights.length > 0 ? sumWeights(weights) : item.grossWeightKg,
                                });
                              }}
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-ink-600">
                              Cage Count
                            </span>
                            <input
                              className={`${orderInputClass} disabled:bg-stone-100`}
                              type="number"
                              min="0"
                              step="0.001"
                              value={computedCageCount}
                              disabled={weightEntriesKg.length > 0}
                              onChange={(event) =>
                                updateItem(activeCustomer.id, item.id, {
                                  cageCount: Math.max(safeNumber(event.target.value), 0),
                                })
                              }
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-ink-600">
                              Cage Weight
                            </span>
                            <input
                              className={orderInputClass}
                              type="number"
                              min="0"
                              step="0.001"
                              value={item.cageWeight}
                              onChange={(event) =>
                                updateItem(activeCustomer.id, item.id, {
                                  cageWeight: Math.max(safeNumber(event.target.value), 0),
                                })
                              }
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-ink-600">
                              Gross Weight KG
                            </span>
                            <input
                              className={`${orderInputClass} disabled:bg-stone-100`}
                              type="number"
                              min="0"
                              step="0.001"
                              value={computedGrossWeightKg}
                              disabled={weightEntriesKg.length > 0}
                              onChange={(event) =>
                                updateItem(activeCustomer.id, item.id, {
                                  grossWeightKg: Math.max(safeNumber(event.target.value), 0),
                                })
                              }
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-ink-600">
                              Net Weight KG
                            </span>
                            <input
                              className={orderInputClass}
                              type="number"
                              min="0"
                              step="0.001"
                              value={displayedNetWeight}
                              onChange={(event) =>
                                updateItem(activeCustomer.id, item.id, {
                                  netWeightKg: Math.max(safeNumber(event.target.value), 0),
                                  netWeightManual: true,
                                })
                              }
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-ink-600">
                              Product Quantity
                            </span>
                            <input
                              className={orderInputClass}
                              type="number"
                              min="0"
                              step="0.001"
                              value={item.productQuantity}
                              onChange={(event) =>
                                updateItem(activeCustomer.id, item.id, {
                                  productQuantity: Math.max(safeNumber(event.target.value), 0),
                                })
                              }
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-ink-600">
                              Farm Price
                            </span>
                            <input
                              className={orderInputClass}
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.farmPrice}
                              onChange={(event) =>
                                updateItem(activeCustomer.id, item.id, {
                                  farmPrice: Math.max(safeNumber(event.target.value), 0),
                                })
                              }
                            />
                          </label>

                          <label className="block">
                            <span className="mb-1 block text-xs font-semibold text-ink-600">
                              Sales Price
                            </span>
                            <input
                              className={orderInputClass}
                              type="number"
                              min="0"
                              step="0.01"
                              value={item.salesPrice}
                              onChange={(event) =>
                                updateItem(activeCustomer.id, item.id, {
                                  salesPrice: Math.max(safeNumber(event.target.value), 0),
                                })
                              }
                            />
                          </label>
                        </div>

                        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-4">
                          <div className="rounded-md bg-white px-3 py-2">
                            <p className="text-xs font-semibold uppercase text-ink-500">
                              Estimated Purchase
                            </p>
                            <p className="mt-1 text-sm font-semibold text-ink-900">
                              {formatMoney(calculated.estimatedCost)}
                            </p>
                          </div>
                          <div className="rounded-md bg-white px-3 py-2">
                            <p className="text-xs font-semibold uppercase text-ink-500">
                              Sales Amount
                            </p>
                            <p className="mt-1 text-sm font-semibold text-ink-900">
                              {formatMoney(calculated.salesAmount)}
                            </p>
                          </div>
                          <div className="rounded-md bg-white px-3 py-2">
                            <p className="text-xs font-semibold uppercase text-ink-500">
                              Estimated Profit
                            </p>
                            <p className="mt-1 text-sm font-semibold text-ink-900">
                              {formatMoney(calculated.estimatedProfit)}
                            </p>
                          </div>
                          <div className="flex items-end justify-start md:justify-end">
                            {item.netWeightManual ? (
                              <Button
                                variant="secondary"
                                className="h-9 px-3"
                                onClick={() =>
                                  updateItem(activeCustomer.id, item.id, {
                                    netWeightKg: null,
                                    netWeightManual: false,
                                  })
                                }
                              >
                                <RotateCcw size={14} />
                                Reset Auto
                              </Button>
                            ) : (
                              <span className="rounded-full bg-white px-3 py-2 text-xs font-semibold text-ink-500">
                                Auto Net Weight
                              </span>
                            )}
                          </div>
                        </div>
                      </article>
                    );
                  })
                ) : (
                  <div className="rounded-lg border border-dashed border-stone-300 bg-stone-50 px-4 py-10 text-center text-sm text-ink-500">
                    Add a product/order item for this customer.
                  </div>
                )}
                {activeItems.length > 0 ? (
                  <div className="flex justify-end border-t border-stone-200 pt-4">
                    <Button onClick={() => void saveOrder()} disabled={saving}>
                      <Save size={16} />
                      Save Order
                    </Button>
                  </div>
                ) : null}
              </div>
            </>
          ) : (
            <div className="p-10 text-center text-sm text-ink-500">
              Select a customer with an assigned farm to enter orders.
            </div>
          )}
        </section>
      </div>

      {farmPurchaseGroups.length > 0 ? (
        <section className="mt-6 space-y-5">
          <div>
            <h2 className="text-base font-semibold text-ink-900">Farm Purchase Totals</h2>
            <p className="mt-1 text-sm text-ink-500">
              Review or edit the total cages, weight, quantity, and farm purchase before saving.
            </p>
          </div>

          {farmPurchaseGroups.map((group) => (
            <section
              key={group.farmId}
              className="rounded-lg border border-stone-200 bg-white shadow-sm"
            >
              <div className="flex flex-col gap-2 border-b border-stone-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <h3 className="text-base font-semibold text-ink-900">{group.farmName}</h3>
                  <p className="mt-1 text-sm text-ink-500">
                    {group.rows.length} product purchase item(s)
                  </p>
                </div>
                <div className="rounded-md bg-stone-50 px-3 py-2 text-sm">
                  <span className="font-semibold text-ink-500">Total Farm Purchase: </span>
                  <span className="font-semibold text-ink-900">{formatMoney(group.totalCost)}</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-4 p-5 xl:grid-cols-2">
                {group.rows.map((row) => {
                  const calculated = calculateOrderByPricingMethod({
                    pricingMethod: row.pricingMethod,
                    cageCount: row.cageCount,
                    cageWeight: row.cageWeight,
                    grossWeightKg: row.grossWeightKg,
                    netWeightKg: row.netWeightManual ? row.netWeightKg : null,
                    productQuantity: row.productQuantity,
                    farmPrice: row.farmPrice,
                    salesPrice: 0,
                  });
                  const displayedNetWeight = row.netWeightManual
                    ? (row.netWeightKg ?? 0)
                    : calculated.netWeightKg;

                  return (
                    <article
                      key={row.id}
                      className="rounded-lg border border-stone-200 bg-stone-50 p-4"
                    >
                      <div className="mb-4 flex flex-col gap-1 sm:flex-row sm:items-start sm:justify-between">
                        <div>
                          <h4 className="text-sm font-semibold text-ink-900">{row.productName}</h4>
                          <p className="text-xs text-ink-500">
                            {row.pricingMethod === 'price_per_kg'
                              ? 'Price Per Kg'
                              : 'Price Per Product'}
                          </p>
                        </div>
                        <p className="text-sm font-semibold text-ink-900">
                          {formatMoney(calculated.estimatedCost)}
                        </p>
                      </div>

                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold text-ink-600">
                            Total Cages
                          </span>
                          <input
                            className={orderInputClass}
                            type="number"
                            min="0"
                            step="0.001"
                            value={row.cageCount}
                            onChange={(event) =>
                              updateFarmPurchaseDraft(row.id, {
                                cageCount: Math.max(safeNumber(event.target.value), 0),
                              })
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold text-ink-600">
                            Cage Weight
                          </span>
                          <input
                            className={orderInputClass}
                            type="number"
                            min="0"
                            step="0.001"
                            value={row.cageWeight}
                            onChange={(event) =>
                              updateFarmPurchaseDraft(row.id, {
                                cageWeight: Math.max(safeNumber(event.target.value), 0),
                              })
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold text-ink-600">
                            Gross Weight KG
                          </span>
                          <input
                            className={orderInputClass}
                            type="number"
                            min="0"
                            step="0.001"
                            value={row.grossWeightKg}
                            onChange={(event) =>
                              updateFarmPurchaseDraft(row.id, {
                                grossWeightKg: Math.max(safeNumber(event.target.value), 0),
                              })
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold text-ink-600">
                            Net Weight KG
                          </span>
                          <input
                            className={orderInputClass}
                            type="number"
                            min="0"
                            step="0.001"
                            value={displayedNetWeight}
                            onChange={(event) =>
                              updateFarmPurchaseDraft(row.id, {
                                netWeightKg: Math.max(safeNumber(event.target.value), 0),
                                netWeightManual: true,
                              })
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold text-ink-600">
                            Product Quantity
                          </span>
                          <input
                            className={orderInputClass}
                            type="number"
                            min="0"
                            step="0.001"
                            value={row.productQuantity}
                            onChange={(event) =>
                              updateFarmPurchaseDraft(row.id, {
                                productQuantity: Math.max(safeNumber(event.target.value), 0),
                              })
                            }
                          />
                        </label>
                        <label className="block">
                          <span className="mb-1 block text-xs font-semibold text-ink-600">
                            Farm Price
                          </span>
                          <input
                            className={orderInputClass}
                            type="number"
                            min="0"
                            step="0.01"
                            value={row.farmPrice}
                            onChange={(event) =>
                              updateFarmPurchaseDraft(row.id, {
                                farmPrice: Math.max(safeNumber(event.target.value), 0),
                              })
                            }
                          />
                        </label>
                      </div>

                      <div className="mt-4 flex justify-end">
                        {row.netWeightManual ? (
                          <Button
                            variant="secondary"
                            className="h-8 px-3"
                            onClick={() =>
                              updateFarmPurchaseDraft(row.id, {
                                netWeightKg: null,
                                netWeightManual: false,
                              })
                            }
                          >
                            <RotateCcw size={14} />
                            Reset Auto
                          </Button>
                        ) : (
                          <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-ink-500">
                            Auto Net Weight
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            </section>
          ))}
        </section>
      ) : null}

      <Modal
        open={continueDraftOpen}
        title="Continue Unsaved Order?"
        onClose={requestDiscardSavedDraft}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={requestDiscardSavedDraft}>
              No
            </Button>
            <Button onClick={continueSavedDraft}>Continue</Button>
          </div>
        }
      >
        <p className="text-sm text-ink-700">
          You have an unsaved order draft from this computer. Continue editing it?
        </p>
      </Modal>

      <Modal
        open={discardDraftOpen}
        title="Discard Unsaved Order?"
        onClose={() => {
          setDiscardDraftOpen(false);
          setContinueDraftOpen(true);
        }}
        footer={
          <div className="flex justify-end gap-2">
            <Button
              variant="secondary"
              onClick={() => {
                setDiscardDraftOpen(false);
                setContinueDraftOpen(true);
              }}
            >
              Cancel
            </Button>
            <Button variant="danger" onClick={discardSavedDraft}>
              Confirm Discard
            </Button>
          </div>
        }
      >
        <p className="text-sm text-ink-700">
          This will remove the unsaved order draft. Confirm only if you do not need the previous
          draft.
        </p>
      </Modal>

      <Modal
        open={dateConfirmOpen}
        title="Confirm Order Date"
        onClose={() => setDateConfirmOpen(false)}
        footer={
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="secondary" onClick={() => setDateConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="secondary"
              onClick={() => {
                setOrderDate(confirmOrderDate);
                setDateConfirmOpen(false);
                void saveOrderForDate(confirmOrderDate);
              }}
            >
              Save With Chosen Date
            </Button>
            <Button
              onClick={() => {
                setDateConfirmOpen(false);
                void saveOrderForDate(orderDate);
              }}
            >
              Yes, Save This Date
            </Button>
          </div>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-ink-700">
            The selected order date is <strong>{orderDate}</strong>, not today. Confirm this date before saving?
          </p>
          <FormDatePicker
            label="Choose Another Date"
            value={confirmOrderDate}
            onChange={(event) => setConfirmOrderDate(event.target.value)}
          />
        </div>
      </Modal>
    </>
  );
}
