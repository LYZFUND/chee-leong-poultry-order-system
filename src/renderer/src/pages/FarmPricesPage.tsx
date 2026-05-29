import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { CrudPage, type CrudField } from '@renderer/components/ui/CrudPage';
import { DataTable } from '@renderer/components/ui/DataTable';
import { EmptyState } from '@renderer/components/ui/EmptyState';
import { FormInput } from '@renderer/components/ui/FormInput';
import { FormSelect } from '@renderer/components/ui/FormSelect';
import { Modal } from '@renderer/components/ui/Modal';
import { MoneyText } from '@renderer/components/ui/MoneyText';
import { Button } from '@renderer/components/ui/Button';
import { farmService } from '@renderer/services/farmService';
import { priceService } from '@renderer/services/priceService';
import { productService } from '@renderer/services/productService';
import type { Farm, FarmProduct, FarmProductPrice, PricingMethod } from '@renderer/types/entities';
import { labelFromValue } from '@renderer/utils/format';

type FarmPriceForm = {
  farm_id: string;
  product_id: string;
  product_ids: string[];
  pricing_method: string;
  price_amount: number;
  effective_date: string;
  end_date: string;
  notes: string;
  is_active: boolean;
};

interface FarmPriceBatch {
  id: string;
  rows: FarmProductPrice[];
  products: string;
  pricing_method: PricingMethod;
  price_amount: number;
  effective_date: string;
  end_date: string;
  notes: string;
  is_active: boolean;
}

const initialForm: FarmPriceForm = {
  farm_id: '',
  product_id: '',
  product_ids: [],
  pricing_method: 'price_per_kg',
  price_amount: 0,
  effective_date: '',
  end_date: '',
  notes: '',
  is_active: true,
};

export function FarmPricesPage(): JSX.Element {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [products, setProducts] = useState<FarmProduct[]>([]);
  const [search, setSearch] = useState('');
  const [farmFilter, setFarmFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [editingBatch, setEditingBatch] = useState<FarmPriceBatch | null>(null);
  const [batchForm, setBatchForm] = useState({
    pricing_method: 'price_per_kg',
    price_amount: 0,
    effective_date: '',
    end_date: '',
    notes: '',
    is_active: true,
  });
  const [savingBatch, setSavingBatch] = useState(false);

  useEffect(() => {
    void Promise.all([farmService.listFarms(false), productService.listProducts(false)]).then(([farmRows, productRows]) => {
      setFarms(farmRows);
      setProducts(productRows);
    });
  }, []);

  const fields = useMemo<CrudField<FarmPriceForm>[]>(
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
          product_id: '',
          product_ids: [],
        }),
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
      { name: 'price_amount', label: 'Farm Price Amount (RM)', type: 'number', min: 0, step: 0.01, required: true },
      { name: 'effective_date', label: 'Effective Date', type: 'date', required: true },
      { name: 'end_date', label: 'End Date', type: 'date' },
      { name: 'is_active', label: 'Active', type: 'checkbox' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    [farms, products],
  );

  const columns = useMemo<ColumnDef<FarmProductPrice, unknown>[]>(
    () => [
      { accessorKey: 'farms.farm_name', header: 'Farm', cell: ({ row }) => row.original.farms?.farm_name ?? '-' },
      { accessorKey: 'farm_products.product_name', header: 'Product', cell: ({ row }) => row.original.farm_products?.product_name ?? '-' },
      { accessorKey: 'pricing_method', header: 'Pricing', cell: ({ row }) => labelFromValue(row.original.pricing_method) },
      { accessorKey: 'price_amount', header: 'Farm Price', cell: ({ row }) => <MoneyText value={row.original.price_amount} /> },
      { accessorKey: 'effective_date', header: 'Effective Date' },
      { accessorKey: 'end_date', header: 'End Date', cell: ({ row }) => row.original.end_date || '-' },
      { accessorKey: 'is_active', header: 'Status', cell: ({ row }) => (row.original.is_active ? 'Active' : 'Inactive') },
    ],
    [],
  );

  const normalizedSearch = search.trim().toLowerCase();

  function groupFarmPriceBatches(prices: FarmProductPrice[]): FarmPriceBatch[] {
    const grouped = new Map<string, FarmPriceBatch>();

    for (const price of prices) {
      const key = [
        price.farm_id,
        price.pricing_method,
        price.price_amount,
        price.effective_date,
        price.end_date ?? '',
        price.is_active ? 'active' : 'inactive',
        price.notes ?? '',
      ].join('|');
      const group = grouped.get(key) ?? {
        id: key,
        rows: [],
        products: '',
        pricing_method: price.pricing_method,
        price_amount: price.price_amount,
        effective_date: price.effective_date,
        end_date: price.end_date ?? '',
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

    return Array.from(grouped.values()).sort((a, b) => a.products.localeCompare(b.products));
  }

  function openBatchEdit(batch: FarmPriceBatch): void {
    setEditingBatch(batch);
    setBatchForm({
      pricing_method: batch.pricing_method,
      price_amount: batch.price_amount,
      effective_date: batch.effective_date,
      end_date: batch.end_date,
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
          priceService.updateFarmPrice(row.id, {
            farm_id: row.farm_id,
            product_id: row.product_id,
            pricing_method: batchForm.pricing_method as PricingMethod,
            price_amount: batchForm.price_amount,
            effective_date: batchForm.effective_date,
            end_date: batchForm.end_date || null,
            notes: batchForm.notes || null,
            is_active: batchForm.is_active,
          }),
        ),
      );
      setEditingBatch(null);
      setRefreshKey((current) => current + 1);
    } finally {
      setSavingBatch(false);
    }
  }

  return (
    <>
      <CrudPage
        key={refreshKey}
        title="Farm Prices"
        description="Manage original farm prices by farm, product, pricing method, and effective date."
        addLabel="Add Farm Price"
        load={() => priceService.listFarmPrices()}
        create={async (form) => {
        const productIds = form.product_ids.length > 0 ? form.product_ids : form.product_id ? [form.product_id] : [];

        if (productIds.length === 0) {
          throw new Error('Please select at least one product.');
        }

        await Promise.all(
          productIds.map((productId) =>
            priceService.createFarmPrice({
              farm_id: form.farm_id,
              product_id: productId,
              pricing_method: form.pricing_method as PricingMethod,
              price_amount: form.price_amount,
              effective_date: form.effective_date,
              end_date: form.end_date || null,
              notes: form.notes || null,
              is_active: form.is_active,
            }),
          ),
        );
        }}
        update={(id, form) =>
          priceService.updateFarmPrice(id, {
            farm_id: form.farm_id,
            product_id: form.product_ids[0] ?? form.product_id,
            pricing_method: form.pricing_method as PricingMethod,
            price_amount: form.price_amount,
            effective_date: form.effective_date,
            end_date: form.end_date || null,
            notes: form.notes || null,
            is_active: form.is_active,
          })
        }
        remove={(id) => priceService.softDeleteFarmPrice(id)}
        initialForm={initialForm}
        rowToForm={(row) => ({
          farm_id: row.farm_id,
          product_id: row.product_id,
          product_ids: [row.product_id],
          pricing_method: row.pricing_method,
          price_amount: row.price_amount,
          effective_date: row.effective_date,
          end_date: row.end_date ?? '',
          notes: row.notes ?? '',
          is_active: row.is_active,
        })}
        fields={fields}
        columns={columns}
        toolbar={
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm md:grid-cols-2">
          <FormInput
            label="Search Farm Price"
            value={search}
            placeholder="Search by farm, product, pricing, or price"
            onChange={(event) => setSearch(event.target.value)}
          />
          <FormSelect
            label="Farm Filter"
            value={farmFilter}
            options={[{ label: 'All farms', value: '' }, ...farms.map((farm) => ({ label: farm.farm_name, value: farm.id }))]}
            onChange={(event) => setFarmFilter(event.target.value)}
          />
        </div>
        }
        renderRows={({ rows, columns: tableColumns }) => {
        const filteredRows = rows.filter((price) => {
          if (farmFilter && price.farm_id !== farmFilter) {
            return false;
          }

          if (!normalizedSearch) {
            return true;
          }

          return [
            price.farms?.farm_name,
            price.farm_products?.product_name,
            price.pricing_method,
            price.price_amount,
            price.effective_date,
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalizedSearch));
        });

        if (filteredRows.length === 0) {
          return <EmptyState title="No farm prices found" description="Try another farm filter or search term." />;
        }

        const groupedRows = farms
          .map((farm) => ({
            farm,
            prices: filteredRows.filter((price) => price.farm_id === farm.id),
          }))
          .filter((group) => group.prices.length > 0);

        return (
          <div className="space-y-5">
              {groupedRows.map(({ farm, prices }) => {
                const batches = groupFarmPriceBatches(prices);

                return (
                  <section key={farm.id} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
                    <div className="mb-4">
                      <h2 className="text-base font-semibold text-ink-900">{farm.farm_name}</h2>
                      <p className="mt-1 text-sm text-ink-500">
                        {batches.length} merged price batch{batches.length === 1 ? '' : 'es'} under this farm
                      </p>
                    </div>
                    <DataTable
                      data={batches}
                      columns={[
                        { accessorKey: 'products', header: 'Products' },
                        { accessorKey: 'pricing_method', header: 'Pricing', cell: ({ row }) => labelFromValue(row.original.pricing_method) },
                        { accessorKey: 'price_amount', header: 'Farm Price', cell: ({ row }) => <MoneyText value={row.original.price_amount} /> },
                        { accessorKey: 'effective_date', header: 'Effective Date' },
                        { accessorKey: 'end_date', header: 'End Date', cell: ({ row }) => row.original.end_date || '-' },
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
                    <details className="mt-4">
                      <summary className="cursor-pointer text-sm font-semibold text-ink-600">Show individual records</summary>
                      <div className="mt-3">
                        <DataTable data={prices} columns={tableColumns} />
                      </div>
                    </details>
                  </section>
                );
              })}
          </div>
        );
        }}
      />

      <Modal
        open={Boolean(editingBatch)}
        title="Edit Farm Price Batch"
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
            <p className="text-xs font-semibold uppercase text-ink-500">Products In Batch</p>
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
            label="Farm Price Amount (RM)"
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
          <FormInput
            label="End Date"
            type="date"
            value={batchForm.end_date}
            onChange={(event) => setBatchForm((current) => ({ ...current, end_date: event.target.value }))}
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
