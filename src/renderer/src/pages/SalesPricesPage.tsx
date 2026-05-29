import { type FormEvent, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { RefreshCw } from 'lucide-react';
import { Button } from '@renderer/components/ui/Button';
import { CrudPage, type CrudField } from '@renderer/components/ui/CrudPage';
import { DataTable } from '@renderer/components/ui/DataTable';
import { EmptyState } from '@renderer/components/ui/EmptyState';
import { FormInput } from '@renderer/components/ui/FormInput';
import { FormSelect } from '@renderer/components/ui/FormSelect';
import { Modal } from '@renderer/components/ui/Modal';
import { MoneyText } from '@renderer/components/ui/MoneyText';
import { notify } from '@renderer/components/ui/Notification';
import { areaService } from '@renderer/services/areaService';
import { farmService } from '@renderer/services/farmService';
import { priceService } from '@renderer/services/priceService';
import { productService } from '@renderer/services/productService';
import type { AreaSalesPrice, CustomerArea, Farm, FarmProduct, PricingMethod } from '@renderer/types/entities';
import { labelFromValue } from '@renderer/utils/format';

const ALL_AREAS_VALUE = '__all_areas__';

type SalesPriceForm = {
  farm_id: string;
  area_id: string;
  product_id: string;
  product_ids: string[];
  pricing_method: string;
  price_amount: number;
  effective_date: string;
  notes: string;
  is_active: boolean;
};

interface SalesPriceBatch {
  id: string;
  rows: AreaSalesPrice[];
  areaName: string;
  products: string;
  pricing_method: PricingMethod;
  price_amount: number;
  effective_date: string;
  notes: string;
  is_active: boolean;
}

const initialForm: SalesPriceForm = {
  farm_id: '',
  area_id: '',
  product_id: '',
  product_ids: [],
  pricing_method: 'price_per_kg',
  price_amount: 0,
  effective_date: '',
  notes: '',
  is_active: true,
};

export function SalesPricesPage(): JSX.Element {
  const [areas, setAreas] = useState<CustomerArea[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [products, setProducts] = useState<FarmProduct[]>([]);
  const [search, setSearch] = useState('');
  const [farmFilter, setFarmFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [unifiedModalOpen, setUnifiedModalOpen] = useState(false);
  const [unifiedForm, setUnifiedForm] = useState<SalesPriceForm>(initialForm);
  const [savingUnified, setSavingUnified] = useState(false);
  const [editingBatch, setEditingBatch] = useState<SalesPriceBatch | null>(null);
  const [batchForm, setBatchForm] = useState({
    pricing_method: 'price_per_kg',
    price_amount: 0,
    effective_date: '',
    notes: '',
    is_active: true,
  });
  const [savingBatch, setSavingBatch] = useState(false);

  useEffect(() => {
    void Promise.all([areaService.listAreas(false), farmService.listFarms(false), productService.listProducts(false)]).then(([areaRows, farmRows, productRows]) => {
      setAreas(areaRows);
      setFarms(farmRows);
      setProducts(productRows);
    });
  }, []);

  const fields = useMemo<CrudField<SalesPriceForm>[]>(
    () => [
      {
        name: 'farm_id',
        label: 'Farm',
        type: 'select',
        required: true,
        options: [{ label: 'Select farm', value: '' }, ...farms.map((farm) => ({ label: farm.farm_name, value: farm.id }))],
        onChange: (form, value) => ({
          ...form,
          farm_id: String(value),
          area_id: '',
          product_id: '',
          product_ids: [],
        }),
      },
      {
        name: 'area_id',
        label: 'Area',
        type: 'select',
        required: true,
        options: (form) => {
          const farmAreas = areas.filter((area) => area.farm_id === form.farm_id);

          return [
            { label: form.farm_id ? 'Select area' : 'Select farm first', value: '' },
            ...(form.farm_id ? [{ label: 'All Areas', value: ALL_AREAS_VALUE }] : []),
            ...farmAreas.map((area) => ({ label: area.area_name, value: area.id })),
          ];
        },
      },
      {
        name: 'product_ids',
        label: 'Products',
        type: 'multiselect',
        required: true,
        options: (form) =>
          products
            .filter((product) => form.farm_id && product.farm_id === form.farm_id)
            .map((product) => ({ label: product.product_name, value: product.id })),
        onChange: (form, value) => {
          const productIds = Array.isArray(value) ? value : [];
          const product = products.find((productItem) => productItem.id === productIds[0]);
          return {
            ...form,
            product_id: productIds[0] ?? '',
            product_ids: productIds,
            pricing_method: product?.pricing_method ?? form.pricing_method,
          };
        },
      },
      {
        name: 'pricing_method',
        label: 'Pricing Method',
        type: 'select',
        required: true,
        options: [
          { label: 'Price Per Kg', value: 'price_per_kg' },
          { label: 'Price Per Product', value: 'price_per_product' },
        ],
      },
      { name: 'price_amount', label: 'Sales Price Amount (RM)', type: 'number', min: 0, step: 0.01, required: true },
      { name: 'effective_date', label: 'Effective Date', type: 'date', required: true },
      { name: 'is_active', label: 'Active', type: 'checkbox' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    [areas, farms, products],
  );

  const columns = useMemo<ColumnDef<AreaSalesPrice, unknown>[]>(
    () => [
      {
        id: 'farm_name',
        header: 'Farm',
        cell: ({ row }) => row.original.farm_products?.farms?.farm_name ?? '-',
      },
      { accessorKey: 'customer_areas.area_name', header: 'Area', cell: ({ row }) => row.original.customer_areas?.area_name ?? '-' },
      { accessorKey: 'farm_products.product_name', header: 'Product', cell: ({ row }) => row.original.farm_products?.product_name ?? '-' },
      { accessorKey: 'pricing_method', header: 'Pricing', cell: ({ row }) => labelFromValue(row.original.pricing_method) },
      { accessorKey: 'price_amount', header: 'Sales Price', cell: ({ row }) => <MoneyText value={row.original.price_amount} /> },
      { accessorKey: 'effective_date', header: 'Effective Date' },
      { accessorKey: 'is_active', header: 'Status', cell: ({ row }) => (row.original.is_active ? 'Active' : 'Inactive') },
    ],
    [],
  );

  const normalizedSearch = search.trim().toLowerCase();
  const unifiedFarmAreas = areas.filter((area) => area.farm_id === unifiedForm.farm_id);
  const unifiedFarmProducts = products.filter((product) => product.farm_id === unifiedForm.farm_id);

  function validateFarmProduct(farmId: string, productId: string): void {
    const product = products.find((productItem) => productItem.id === productId);
    if (!product || product.farm_id !== farmId) {
      throw new Error('Please select a product that belongs to the selected farm.');
    }
  }

  function validateFarmProducts(farmId: string, productIds: string[]): void {
    if (productIds.length === 0) {
      throw new Error('Please select at least one product.');
    }

    for (const productId of productIds) {
      validateFarmProduct(farmId, productId);
    }
  }

  function groupSalesPriceBatches(prices: AreaSalesPrice[]): SalesPriceBatch[] {
    const grouped = new Map<string, SalesPriceBatch>();

    for (const price of prices) {
      const key = [
        price.area_id,
        price.pricing_method,
        price.price_amount,
        price.effective_date,
        price.is_active ? 'active' : 'inactive',
        price.notes ?? '',
      ].join('|');
      const group = grouped.get(key) ?? {
        id: key,
        rows: [],
        areaName: price.customer_areas?.area_name ?? 'Area',
        products: '',
        pricing_method: price.pricing_method,
        price_amount: price.price_amount,
        effective_date: price.effective_date,
        notes: price.notes ?? '',
        is_active: price.is_active,
      };

      group.rows.push(price);
      group.products = group.rows
        .map((row) => row.farm_products?.product_name ?? 'Product')
        .sort((a, b) => a.localeCompare(b))
        .join(', ');
      grouped.set(key, group);
    }

    return Array.from(grouped.values()).sort((a, b) =>
      `${a.areaName} ${a.products}`.localeCompare(`${b.areaName} ${b.products}`),
    );
  }

  function openBatchEdit(batch: SalesPriceBatch): void {
    setEditingBatch(batch);
    setBatchForm({
      pricing_method: batch.pricing_method,
      price_amount: batch.price_amount,
      effective_date: batch.effective_date,
      notes: batch.notes,
      is_active: batch.is_active,
    });
  }

  async function saveBatchEdit(): Promise<void> {
    if (!editingBatch) {
      return;
    }

    setSavingBatch(true);
    try {
      await Promise.all(
        editingBatch.rows.map((row) =>
          priceService.updateSalesPrice(row.id, {
            area_id: row.area_id,
            product_id: row.product_id,
            pricing_method: batchForm.pricing_method as PricingMethod,
            price_amount: batchForm.price_amount,
            effective_date: batchForm.effective_date,
            end_date: null,
            notes: batchForm.notes || null,
            is_active: batchForm.is_active,
          }),
        ),
      );
      setEditingBatch(null);
      setRefreshKey((current) => current + 1);
      notify.success('Sales price batch updated.');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to update sales price batch.');
    } finally {
      setSavingBatch(false);
    }
  }

  async function handleUnifiedSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    if (!unifiedForm.farm_id || !unifiedForm.product_id || !unifiedForm.effective_date) {
      notify.error('Farm, product, and effective date are required.');
      return;
    }

    if (unifiedForm.price_amount <= 0) {
      notify.error('Sales price amount must be more than 0.');
      return;
    }

    if (unifiedFarmAreas.length === 0) {
      notify.error('This farm does not have any areas yet.');
      return;
    }

    setSavingUnified(true);
    try {
      validateFarmProduct(unifiedForm.farm_id, unifiedForm.product_id);
      await priceService.upsertSalesPricesForAreas({
        areaIds: unifiedFarmAreas.map((area) => area.id),
        product_id: unifiedForm.product_id,
        pricing_method: unifiedForm.pricing_method as PricingMethod,
        price_amount: unifiedForm.price_amount,
        effective_date: unifiedForm.effective_date,
        end_date: null,
        notes: unifiedForm.notes || null,
        is_active: unifiedForm.is_active,
      });
      notify.success('All related area sales prices updated.');
      setUnifiedModalOpen(false);
      setRefreshKey((current) => current + 1);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to update unified sales prices.');
    } finally {
      setSavingUnified(false);
    }
  }

  return (
    <>
      <CrudPage
        key={refreshKey}
        title="Sales Prices"
        description="Manage company selling prices by farm, customer area, product, pricing method, and effective date."
        addLabel="Add Sales Price"
        load={() => priceService.listSalesPrices()}
        create={async (form) => {
          if (!form.farm_id) {
            throw new Error('Please select a farm.');
          }

          const productIds = form.product_ids.length > 0 ? form.product_ids : form.product_id ? [form.product_id] : [];
          validateFarmProducts(form.farm_id, productIds);

          const farmAreas = areas.filter((area) => area.farm_id === form.farm_id);
          const targetAreas = form.area_id === ALL_AREAS_VALUE ? farmAreas : farmAreas.filter((area) => area.id === form.area_id);

          if (targetAreas.length === 0) {
            throw new Error('Please select at least one area under the selected farm.');
          }

          if (form.area_id === ALL_AREAS_VALUE) {
            await Promise.all(
              productIds.map((productId) =>
                priceService.upsertSalesPricesForAreas({
                  areaIds: targetAreas.map((area) => area.id),
                  product_id: productId,
                  pricing_method: form.pricing_method as PricingMethod,
                  price_amount: form.price_amount,
                  effective_date: form.effective_date,
                  end_date: null,
                  notes: form.notes || null,
                  is_active: form.is_active,
                }),
              ),
            );
            return;
          }

          await Promise.all(
            targetAreas.flatMap((area) =>
              productIds.map((productId) =>
                priceService.createSalesPrice({
                  area_id: area.id,
                  product_id: productId,
                  pricing_method: form.pricing_method as PricingMethod,
                  price_amount: form.price_amount,
                  effective_date: form.effective_date,
                  end_date: null,
                  notes: form.notes || null,
                  is_active: form.is_active,
                }),
              ),
            ),
          );
        }}
        update={(id, form) => {
          if (form.area_id === ALL_AREAS_VALUE) {
            throw new Error('Use the Update All Areas Price button for unified price changes.');
          }

          const productId = form.product_ids[0] ?? form.product_id;
          validateFarmProduct(form.farm_id, productId);

          return priceService.updateSalesPrice(id, {
            area_id: form.area_id,
            product_id: productId,
            pricing_method: form.pricing_method as PricingMethod,
            price_amount: form.price_amount,
            effective_date: form.effective_date,
            end_date: null,
            notes: form.notes || null,
            is_active: form.is_active,
          });
        }}
        remove={(id) => priceService.softDeleteSalesPrice(id)}
        initialForm={initialForm}
        rowToForm={(row) => ({
          farm_id: row.farm_products?.farm_id ?? '',
          area_id: row.area_id,
          product_id: row.product_id,
          product_ids: [row.product_id],
          pricing_method: row.pricing_method,
          price_amount: row.price_amount,
          effective_date: row.effective_date,
          notes: row.notes ?? '',
          is_active: row.is_active,
        })}
        fields={fields}
        columns={columns}
        toolbar={
          <div className="grid grid-cols-1 gap-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm lg:grid-cols-[1fr_260px_auto]">
            <FormInput
              label="Search Sales Price"
              value={search}
              placeholder="Search by farm, area, product, pricing, or price"
              onChange={(event) => setSearch(event.target.value)}
            />
            <FormSelect
              label="Farm Filter"
              value={farmFilter}
              options={[{ label: 'All farms', value: '' }, ...farms.map((farm) => ({ label: farm.farm_name, value: farm.id }))]}
              onChange={(event) => setFarmFilter(event.target.value)}
            />
            <div className="flex items-end">
              <Button
                variant="secondary"
                className="w-full"
                onClick={() => {
                  setUnifiedForm(initialForm);
                  setUnifiedModalOpen(true);
                }}
              >
                <RefreshCw size={16} />
                Update All Areas Price
              </Button>
            </div>
          </div>
        }
        renderRows={({ rows, columns: tableColumns }) => {
          const filteredRows = rows.filter((price) => {
            const farmId = price.farm_products?.farm_id ?? '';
            if (farmFilter && farmId !== farmFilter) {
              return false;
            }

            if (!normalizedSearch) {
              return true;
            }

            return [
              price.farm_products?.farms?.farm_name,
              price.customer_areas?.area_name,
              price.farm_products?.product_name,
              price.pricing_method,
              price.price_amount,
              price.effective_date,
            ]
              .filter(Boolean)
              .some((value) => String(value).toLowerCase().includes(normalizedSearch));
          });

          if (filteredRows.length === 0) {
            return <EmptyState title="No sales prices found" description="Try another farm filter or search term." />;
          }

          const groupedRows = farms
            .map((farm) => ({
              farm,
              prices: filteredRows.filter((price) => price.farm_products?.farm_id === farm.id),
            }))
            .filter((group) => group.prices.length > 0);

          return (
            <div className="space-y-5">
              {groupedRows.map(({ farm, prices }) => {
                const batches = groupSalesPriceBatches(prices);

                return (
                  <section key={farm.id} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
                    <div className="mb-4">
                      <h2 className="text-base font-semibold text-ink-900">{farm.farm_name}</h2>
                      <p className="mt-1 text-sm text-ink-500">
                        {batches.length} merged sales price batch{batches.length === 1 ? '' : 'es'} under this farm
                      </p>
                    </div>

                    <div className="space-y-4">
                      <DataTable
                        data={batches}
                        columns={[
                          { accessorKey: 'areaName', header: 'Area' },
                          { accessorKey: 'products', header: 'Products' },
                          { accessorKey: 'pricing_method', header: 'Pricing', cell: ({ row }) => labelFromValue(row.original.pricing_method) },
                          { accessorKey: 'price_amount', header: 'Sales Price', cell: ({ row }) => <MoneyText value={row.original.price_amount} /> },
                          { accessorKey: 'effective_date', header: 'Effective Date' },
                          { accessorKey: 'is_active', header: 'Status', cell: ({ row }) => (row.original.is_active ? 'Active' : 'Inactive') },
                          {
                            id: 'actions',
                            header: 'Actions',
                            cell: ({ row }) => (
                              <Button variant="secondary" className="h-8 px-3" onClick={() => openBatchEdit(row.original)}>
                                Edit Batch
                              </Button>
                            ),
                          },
                        ]}
                      />
                      <details>
                        <summary className="cursor-pointer text-sm font-semibold text-ink-600">Show individual records</summary>
                        <div className="mt-3">
                          <DataTable data={prices} columns={tableColumns} />
                        </div>
                      </details>
                    </div>
                  </section>
                );
              })}
            </div>
          );
        }}
      />

      <Modal
        open={unifiedModalOpen}
        title="Update All Areas Price"
        onClose={() => setUnifiedModalOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setUnifiedModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="unified-sales-price-form" disabled={savingUnified}>
              Save Unified Price
            </Button>
          </div>
        }
      >
        <form id="unified-sales-price-form" className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleUnifiedSubmit}>
          <FormSelect
            label="Farm"
            value={unifiedForm.farm_id}
            required
            options={[{ label: 'Select farm', value: '' }, ...farms.map((farm) => ({ label: farm.farm_name, value: farm.id }))]}
            onChange={(event) =>
              setUnifiedForm({
                ...unifiedForm,
                farm_id: event.target.value,
                area_id: ALL_AREAS_VALUE,
                product_id: '',
              })
            }
          />
          <FormSelect
            label="Area"
            value={ALL_AREAS_VALUE}
            disabled
            options={[{ label: `All Areas${unifiedFarmAreas.length > 0 ? ` (${unifiedFarmAreas.length})` : ''}`, value: ALL_AREAS_VALUE }]}
          />
          <FormSelect
            label="Product"
            value={unifiedForm.product_id}
            required
            options={[
              { label: unifiedForm.farm_id ? 'Select product' : 'Select farm first', value: '' },
              ...unifiedFarmProducts.map((product) => ({ label: product.product_name, value: product.id })),
            ]}
            onChange={(event) => {
              const product = products.find((productItem) => productItem.id === event.target.value);
              setUnifiedForm({
                ...unifiedForm,
                product_id: event.target.value,
                pricing_method: product?.pricing_method ?? unifiedForm.pricing_method,
              });
            }}
          />
          <FormSelect
            label="Pricing Method"
            value={unifiedForm.pricing_method}
            required
            options={[
              { label: 'Price Per Kg', value: 'price_per_kg' },
              { label: 'Price Per Product', value: 'price_per_product' },
            ]}
            onChange={(event) => setUnifiedForm({ ...unifiedForm, pricing_method: event.target.value })}
          />
          <FormInput
            label="Sales Price Amount (RM)"
            type="number"
            min={0}
            step={0.01}
            required
            value={unifiedForm.price_amount}
            onChange={(event) => setUnifiedForm({ ...unifiedForm, price_amount: Number(event.target.value) })}
          />
          <FormInput
            label="Effective Date"
            type="date"
            required
            value={unifiedForm.effective_date}
            onChange={(event) => setUnifiedForm({ ...unifiedForm, effective_date: event.target.value })}
          />
          <label className="flex items-center gap-3 self-end rounded-md border border-stone-200 px-3 py-2">
            <input
              type="checkbox"
              checked={unifiedForm.is_active}
              onChange={(event) => setUnifiedForm({ ...unifiedForm, is_active: event.target.checked })}
            />
            <span className="text-sm font-medium text-ink-700">Active</span>
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium text-ink-700">Notes</span>
            <textarea
              className="min-h-24 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              value={unifiedForm.notes}
              onChange={(event) => setUnifiedForm({ ...unifiedForm, notes: event.target.value })}
            />
          </label>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingBatch)}
        title="Edit Sales Price Batch"
        onClose={() => setEditingBatch(null)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setEditingBatch(null)}>
              Cancel
            </Button>
            <Button onClick={() => void saveBatchEdit()} disabled={savingBatch}>
              Save Batch
            </Button>
          </div>
        }
      >
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-md border border-stone-200 bg-stone-50 p-3 md:col-span-2">
            <p className="text-xs font-semibold uppercase text-ink-500">Area</p>
            <p className="mt-1 text-sm font-semibold text-ink-900">{editingBatch?.areaName}</p>
            <p className="mt-3 text-xs font-semibold uppercase text-ink-500">Products In Batch</p>
            <p className="mt-1 text-sm font-semibold text-ink-900">{editingBatch?.products}</p>
          </div>
          <FormSelect
            label="Pricing Method"
            value={batchForm.pricing_method}
            options={[
              { label: 'Price Per Kg', value: 'price_per_kg' },
              { label: 'Price Per Product', value: 'price_per_product' },
            ]}
            onChange={(event) => setBatchForm((current) => ({ ...current, pricing_method: event.target.value }))}
          />
          <FormInput
            label="Sales Price Amount (RM)"
            type="number"
            min={0}
            step={0.01}
            value={batchForm.price_amount}
            onChange={(event) => setBatchForm((current) => ({ ...current, price_amount: Number(event.target.value) }))}
          />
          <FormInput
            label="Effective Date"
            type="date"
            value={batchForm.effective_date}
            onChange={(event) => setBatchForm((current) => ({ ...current, effective_date: event.target.value }))}
          />
          <label className="flex items-center gap-3 self-end rounded-md border border-stone-200 px-3 py-2">
            <input
              type="checkbox"
              checked={batchForm.is_active}
              onChange={(event) => setBatchForm((current) => ({ ...current, is_active: event.target.checked }))}
            />
            <span className="text-sm font-medium text-ink-700">Active</span>
          </label>
          <label className="block md:col-span-2">
            <span className="mb-1 block text-sm font-medium text-ink-700">Notes</span>
            <textarea
              className="min-h-24 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              value={batchForm.notes}
              onChange={(event) => setBatchForm((current) => ({ ...current, notes: event.target.value }))}
            />
          </label>
        </div>
      </Modal>
    </>
  );
}
