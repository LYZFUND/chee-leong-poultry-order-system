import { useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { BadgeCheck, BadgeX } from 'lucide-react';
import { CrudPage, type CrudField } from '@renderer/components/ui/CrudPage';
import { DataTable } from '@renderer/components/ui/DataTable';
import { EmptyState } from '@renderer/components/ui/EmptyState';
import { FormInput } from '@renderer/components/ui/FormInput';
import { FormSelect } from '@renderer/components/ui/FormSelect';
import type { CustomerArea, Farm } from '@renderer/types/entities';
import { areaService } from '@renderer/services/areaService';
import { farmService } from '@renderer/services/farmService';

type AreaForm = {
  farm_id: string;
  area_name: string;
  notes: string;
  is_active: boolean;
};

const initialForm: AreaForm = {
  farm_id: '',
  area_name: '',
  notes: '',
  is_active: true,
};

export function AreasPage(): JSX.Element {
  const [farms, setFarms] = useState<Farm[]>([]);
  const [search, setSearch] = useState('');
  const [farmFilter, setFarmFilter] = useState('');

  useEffect(() => {
    void farmService.listFarms(false).then(setFarms);
  }, []);

  const fields = useMemo<CrudField<AreaForm>[]>(
    () => [
      {
        name: 'farm_id',
        label: 'Farm',
        type: 'select',
        required: true,
        options: [{ label: 'Select farm', value: '' }, ...farms.map((farm) => ({ label: farm.farm_name, value: farm.id }))],
      },
      { name: 'area_name', label: 'Area Name', type: 'text', required: true },
      { name: 'is_active', label: 'Active', type: 'checkbox' },
      { name: 'notes', label: 'Notes', type: 'textarea' },
    ],
    [farms],
  );

  const columns = useMemo<ColumnDef<CustomerArea, unknown>[]>(
    () => [
      { accessorKey: 'farms.farm_name', header: 'Farm', cell: ({ row }) => row.original.farms?.farm_name ?? '-' },
      { accessorKey: 'area_name', header: 'Area' },
      {
        accessorKey: 'is_active',
        header: 'Status',
        cell: ({ row }) =>
          row.original.is_active ? (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <BadgeCheck size={14} /> Active
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 text-stone-500">
              <BadgeX size={14} /> Inactive
            </span>
          ),
      },
      { accessorKey: 'notes', header: 'Notes', cell: ({ row }) => row.original.notes || '-' },
    ],
    [],
  );

  const normalizedSearch = search.trim().toLowerCase();

  return (
    <CrudPage
      title="Areas"
      description="Group customer areas under each farm so sales prices and customer assignments stay farm-specific."
      addLabel="Add Area"
      load={() => areaService.listAreas(true)}
      create={(form) =>
        areaService.createArea({
          farm_id: form.farm_id || null,
          area_name: form.area_name,
          notes: form.notes || null,
          is_active: form.is_active,
        })
      }
      update={(id, form) =>
        areaService.updateArea(id, {
          farm_id: form.farm_id || null,
          area_name: form.area_name,
          notes: form.notes || null,
          is_active: form.is_active,
        })
      }
      remove={(id) => areaService.softDeleteArea(id)}
      initialForm={initialForm}
      rowToForm={(row) => ({
        farm_id: row.farm_id ?? '',
        area_name: row.area_name,
        notes: row.notes ?? '',
        is_active: row.is_active,
      })}
      fields={fields}
      columns={columns}
      toolbar={
        <div className="grid grid-cols-1 gap-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm md:grid-cols-2">
          <FormInput
            label="Search Area"
            value={search}
            placeholder="Search by farm or area"
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
        const filteredRows = rows.filter((area) => {
          if (farmFilter && area.farm_id !== farmFilter) {
            return false;
          }

          if (!normalizedSearch) {
            return true;
          }

          return [area.farms?.farm_name, area.area_name, area.notes]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(normalizedSearch));
        });

        if (filteredRows.length === 0) {
          return <EmptyState title="No areas found" description="Try another farm filter or search term." />;
        }

        const groupedRows = farms
          .map((farm) => ({
            farm,
            areas: filteredRows.filter((area) => area.farm_id === farm.id),
          }))
          .filter((group) => group.areas.length > 0);

        const unassignedAreas = filteredRows.filter((area) => !area.farm_id);

        return (
          <div className="space-y-5">
            {groupedRows.map(({ farm, areas }) => (
              <section key={farm.id} className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-ink-900">{farm.farm_name}</h2>
                  <p className="mt-1 text-sm text-ink-500">
                    {areas.length} area{areas.length === 1 ? '' : 's'} under this farm
                  </p>
                </div>
                <DataTable data={areas} columns={tableColumns} />
              </section>
            ))}

            {unassignedAreas.length > 0 ? (
              <section className="rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
                <div className="mb-4">
                  <h2 className="text-base font-semibold text-ink-900">No Farm Assigned</h2>
                  <p className="mt-1 text-sm text-ink-500">Assign these areas to farms before using farm-specific pricing.</p>
                </div>
                <DataTable data={unassignedAreas} columns={tableColumns} />
              </section>
            ) : null}
          </div>
        );
      }}
    />
  );
}
