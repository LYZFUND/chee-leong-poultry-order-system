import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { ExternalLink } from 'lucide-react';
import { CrudPage, type CrudField } from '@renderer/components/ui/CrudPage';
import { DataTable } from '@renderer/components/ui/DataTable';
import { EmptyState } from '@renderer/components/ui/EmptyState';
import { FormInput } from '@renderer/components/ui/FormInput';
import { farmService } from '@renderer/services/farmService';
import { productService } from '@renderer/services/productService';
import type { Farm, FarmProduct } from '@renderer/types/entities';
import { labelFromValue } from '@renderer/utils/format';

type FarmForm = {
  farm_name: string;
  contact_person: string;
  phone: string;
  address: string;
  notes: string;
  deduction_policy: string;
  is_active: boolean;
};

const initialForm: FarmForm = {
  farm_name: '',
  contact_person: '',
  phone: '',
  address: '',
  notes: '',
  deduction_policy: 'allow_dead_chicken_deduction',
  is_active: true,
};

export function FarmsPage(): JSX.Element {
  const [products, setProducts] = useState<FarmProduct[]>([]);
  const [search, setSearch] = useState('');

  useEffect(() => {
    void productService.listProducts(true).then(setProducts);
  }, []);

  const productsByFarm = useMemo(() => {
    const grouped = new Map<string, FarmProduct[]>();
    for (const product of products) {
      grouped.set(product.farm_id, [...(grouped.get(product.farm_id) ?? []), product]);
    }
    return grouped;
  }, [products]);

  const fields = useMemo<CrudField<FarmForm>[]>(
    () => [
      { name: 'farm_name', label: 'Farm Name', type: 'text', required: true },
      { name: 'contact_person', label: 'Contact Person', type: 'text' },
      { name: 'phone', label: 'Phone', type: 'text' },
      {
        name: 'deduction_policy',
        label: 'Deduction Policy',
        type: 'select',
        required: true,
        options: [
          { label: 'Allow Dead Chicken Deduction', value: 'allow_dead_chicken_deduction' },
          { label: 'Not Allow Dead Chicken Deduction', value: 'not_allow_dead_chicken_deduction' },
          { label: 'Allow Only Farm Problem Deduction', value: 'allow_only_farm_problem_deduction' },
        ],
      },
      { name: 'is_active', label: 'Active', type: 'checkbox' },
      { name: 'address', label: 'Address', type: 'textarea' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    [],
  );

  const columns = useMemo<ColumnDef<Farm, unknown>[]>(
    () => [
      {
        accessorKey: 'farm_name',
        header: 'Farm',
        cell: ({ row }) => (
          <Link className="font-semibold text-brand-700 hover:underline" to={`/farms/${row.original.id}`}>
            {row.original.farm_name}
          </Link>
        ),
      },
      { accessorKey: 'contact_person', header: 'Contact', cell: ({ row }) => row.original.contact_person || '-' },
      { accessorKey: 'phone', header: 'Phone', cell: ({ row }) => row.original.phone || '-' },
      {
        accessorKey: 'deduction_policy',
        header: 'Deduction Policy',
        cell: ({ row }) => labelFromValue(row.original.deduction_policy),
      },
      {
        id: 'details',
        header: 'Farm Page',
        cell: ({ row }) => (
          <Link
            to={`/farms/${row.original.id}`}
            className="inline-flex h-8 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-ink-900 hover:bg-stone-50"
          >
            <ExternalLink size={14} />
            Open
          </Link>
        ),
      },
    ],
    [],
  );

  const normalizedSearch = search.trim().toLowerCase();

  return (
    <CrudPage
      title="Farms"
      description="Manage farms, contact details, status, and deduction policy."
      addLabel="Add Farm"
      load={() => farmService.listFarms(true)}
      create={(form) =>
        farmService.createFarm({
          farm_name: form.farm_name,
          contact_person: form.contact_person || null,
          phone: form.phone || null,
          address: form.address || null,
          notes: form.notes || null,
          deduction_policy: form.deduction_policy as Farm['deduction_policy'],
          is_active: form.is_active,
        })
      }
      update={(id, form) =>
        farmService.updateFarm(id, {
          farm_name: form.farm_name,
          contact_person: form.contact_person || null,
          phone: form.phone || null,
          address: form.address || null,
          notes: form.notes || null,
          deduction_policy: form.deduction_policy as Farm['deduction_policy'],
          is_active: form.is_active,
        })
      }
      remove={(id) => farmService.softDeleteFarm(id)}
      initialForm={initialForm}
      rowToForm={(row) => ({
        farm_name: row.farm_name,
        contact_person: row.contact_person ?? '',
        phone: row.phone ?? '',
        address: row.address ?? '',
        notes: row.notes ?? '',
        deduction_policy: row.deduction_policy,
        is_active: row.is_active,
      })}
      fields={fields}
      columns={columns}
      toolbar={
        <div className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
          <FormInput
            label="Search Farm or Product"
            value={search}
            placeholder="Search by farm name, contact, phone, or product"
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
      }
      renderRows={({ rows, columns: tableColumns }) => {
        const filteredRows = rows.filter((farm) => {
          if (!normalizedSearch) {
            return true;
          }

          const farmProducts = productsByFarm.get(farm.id) ?? [];
          return [
            farm.farm_name,
            farm.contact_person,
            farm.phone,
            farm.deduction_policy,
            ...farmProducts.map((product) => product.product_name),
          ]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalizedSearch));
        });

        if (filteredRows.length === 0) {
          return <EmptyState title="No farms found" description="Try another farm or product search." />;
        }

        return (
          <div className="space-y-5">
            {filteredRows.map((farm) => {
              const farmProducts = productsByFarm.get(farm.id) ?? [];

              return (
                <section key={farm.id} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <h2 className="text-base font-semibold text-ink-900">{farm.farm_name}</h2>
                      <p className="mt-1 text-sm text-ink-500">
                        {farmProducts.length} product{farmProducts.length === 1 ? '' : 's'} under this farm
                      </p>
                    </div>
                    <Link
                      to={`/farms/${farm.id}`}
                      className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-stone-200 bg-white px-3 text-sm font-semibold text-ink-900 hover:bg-stone-50"
                    >
                      <ExternalLink size={14} />
                      Open Farm Page
                    </Link>
                  </div>

                  <div className="mb-4 flex flex-wrap gap-2">
                    {farmProducts.length === 0 ? (
                      <span className="rounded-md bg-stone-100 px-3 py-1 text-xs font-medium text-ink-500">No products yet</span>
                    ) : (
                      farmProducts.map((product) => (
                        <span key={product.id} className="rounded-md bg-brand-50 px-3 py-1 text-xs font-medium text-brand-700">
                          {product.product_name}
                        </span>
                      ))
                    )}
                  </div>

                  <DataTable data={[farm]} columns={tableColumns} />
                </section>
              );
            })}
          </div>
        );
      }}
    />
  );
}
