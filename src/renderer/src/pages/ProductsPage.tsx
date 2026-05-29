import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { CrudPage, type CrudField } from '@renderer/components/ui/CrudPage';
import { DataTable } from '@renderer/components/ui/DataTable';
import { farmService } from '@renderer/services/farmService';
import { productService } from '@renderer/services/productService';
import type { Farm, FarmProduct, PricingMethod } from '@renderer/types/entities';
import { labelFromValue } from '@renderer/utils/format';

type ProductForm = {
  farm_id: string;
  product_name: string;
  product_category: string;
  pricing_method: string;
  default_cage_weight: number;
  notes: string;
  is_active: boolean;
};

const initialForm: ProductForm = {
  farm_id: '',
  product_name: '',
  product_category: 'Chicken',
  pricing_method: 'price_per_kg',
  default_cage_weight: 8,
  notes: '',
  is_active: true,
};

export function ProductsPage(): JSX.Element {
  const [farms, setFarms] = useState<Farm[]>([]);

  useEffect(() => {
    void farmService.listFarms(false).then(setFarms);
  }, []);

  const fields = useMemo<CrudField<ProductForm>[]>(
    () => [
      {
        name: 'farm_id',
        label: 'Farm',
        type: 'select',
        required: true,
        options: [{ label: 'Select farm', value: '' }, ...farms.map((farm) => ({ label: farm.farm_name, value: farm.id }))],
      },
      { name: 'product_name', label: 'Product Name', type: 'text', required: true },
      { name: 'product_category', label: 'Category', type: 'text' },
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
      { name: 'default_cage_weight', label: 'Default Cage Weight (kg)', type: 'number', min: 0, step: 0.001 },
      { name: 'is_active', label: 'Active', type: 'checkbox' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    [farms],
  );

  const columns = useMemo<ColumnDef<FarmProduct, unknown>[]>(
    () => [
      { accessorKey: 'product_name', header: 'Product' },
      { accessorKey: 'farms.farm_name', header: 'Farm', cell: ({ row }) => row.original.farms?.farm_name ?? '-' },
      { accessorKey: 'product_category', header: 'Category', cell: ({ row }) => row.original.product_category || '-' },
      {
        accessorKey: 'pricing_method',
        header: 'Pricing',
        cell: ({ row }) => labelFromValue(row.original.pricing_method),
      },
      { accessorKey: 'default_cage_weight', header: 'Cage Weight (kg)' },
      { accessorKey: 'is_active', header: 'Status', cell: ({ row }) => (row.original.is_active ? 'Active' : 'Inactive') },
    ],
    [],
  );

  function renderProductsByFarm({
    rows,
    columns: tableColumns,
  }: {
    rows: FarmProduct[];
    columns: ColumnDef<FarmProduct, unknown>[];
  }): JSX.Element {
    const grouped = new Map<string, { farmName: string; rows: FarmProduct[] }>();

    for (const farm of farms) {
      grouped.set(farm.id, { farmName: farm.farm_name, rows: [] });
    }

    for (const product of rows) {
      const farmId = product.farm_id || 'unknown';
      const group = grouped.get(farmId) ?? {
        farmName: product.farms?.farm_name ?? 'No Farm',
        rows: [],
      };
      group.rows.push(product);
      grouped.set(farmId, group);
    }

    const groups = Array.from(grouped.entries())
      .map(([farmId, group]) => ({ farmId, ...group }))
      .filter((group) => group.rows.length > 0)
      .sort((a, b) => a.farmName.localeCompare(b.farmName));

    if (groups.length === 0) {
      return (
        <DataTable
          data={[]}
          columns={tableColumns}
          emptyTitle="No products"
          emptyDescription="Create the first product from the button above."
        />
      );
    }

    return (
      <div className="space-y-5">
        {groups.map((group) => (
          <section key={group.farmId} className="rounded-lg border border-stone-200 bg-white shadow-sm">
            <div className="flex flex-col gap-2 border-b border-stone-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-base font-semibold text-ink-900">{group.farmName}</h2>
                <p className="mt-1 text-sm text-ink-500">{group.rows.length} product(s)</p>
              </div>
            </div>
            <DataTable data={group.rows} columns={tableColumns} emptyTitle="No products for this farm" />
          </section>
        ))}
      </div>
    );
  }

  return (
    <CrudPage
      title="Products"
      description="Manage products under each farm, including pricing method and default cage weight."
      addLabel="Add Product"
      load={() => productService.listProducts(true)}
      create={(form) =>
        productService.createProduct({
          farm_id: form.farm_id,
          product_name: form.product_name,
          product_category: form.product_category || null,
          pricing_method: form.pricing_method as PricingMethod,
          default_cage_weight: form.default_cage_weight,
          notes: form.notes || null,
          is_active: form.is_active,
        })
      }
      update={(id, form) =>
        productService.updateProduct(id, {
          farm_id: form.farm_id,
          product_name: form.product_name,
          product_category: form.product_category || null,
          pricing_method: form.pricing_method as PricingMethod,
          default_cage_weight: form.default_cage_weight,
          notes: form.notes || null,
          is_active: form.is_active,
        })
      }
      remove={(id) => productService.softDeleteProduct(id)}
      initialForm={initialForm}
      rowToForm={(row) => ({
        farm_id: row.farm_id,
        product_name: row.product_name,
        product_category: row.product_category ?? '',
        pricing_method: row.pricing_method,
        default_cage_weight: row.default_cage_weight,
        notes: row.notes ?? '',
        is_active: row.is_active,
      })}
      fields={fields}
      columns={columns}
      renderRows={renderProductsByFarm}
    />
  );
}
