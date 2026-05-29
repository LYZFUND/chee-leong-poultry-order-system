import { type FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Link } from 'react-router-dom';
import { Edit, Plus, Trash2 } from 'lucide-react';
import { clsx } from 'clsx';
import { Button } from '@renderer/components/ui/Button';
import { ConfirmDialog } from '@renderer/components/ui/ConfirmDialog';
import { DataTable } from '@renderer/components/ui/DataTable';
import { FormInput } from '@renderer/components/ui/FormInput';
import { LoadingState } from '@renderer/components/ui/LoadingState';
import { Modal } from '@renderer/components/ui/Modal';
import { notify } from '@renderer/components/ui/Notification';
import { PageTitle } from '@renderer/components/ui/PageTitle';
import { areaService } from '@renderer/services/areaService';
import { customerService, type CustomerFarmAreaInput } from '@renderer/services/customerService';
import { farmService } from '@renderer/services/farmService';
import type { Customer, CustomerArea, Farm } from '@renderer/types/entities';
import { formatBusinessDate } from '@renderer/utils/date';

type AreaAssignments = Record<string, string[]>;

interface CustomerForm {
  customer_name: string;
  phone: string;
  address: string;
  notes: string;
  is_active: boolean;
  assignments: AreaAssignments;
}

const initialForm: CustomerForm = {
  customer_name: '',
  phone: '',
  address: '',
  notes: '',
  is_active: true,
  assignments: {},
};

function farmSummary(customer: Customer): string {
  const assignments = customer.customer_farm_areas ?? [];
  if (assignments.length === 0) {
    return customer.farms?.farm_name ?? '-';
  }

  const farmNames = new Map<string, string>();
  for (const assignment of assignments) {
    farmNames.set(assignment.farm_id, assignment.farms?.farm_name ?? 'Farm');
  }

  return Array.from(farmNames.values()).join(', ');
}

export function CustomersPage(): JSX.Element {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [farms, setFarms] = useState<Farm[]>([]);
  const [areas, setAreas] = useState<CustomerArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteCustomer, setDeleteCustomer] = useState<Customer | null>(null);
  const [form, setForm] = useState<CustomerForm>(initialForm);
  const [activeFarmId, setActiveFarmId] = useState('');
  const [saving, setSaving] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const [customerRows, farmRows, areaRows] = await Promise.all([
        customerService.listCustomers(true),
        farmService.listFarms(false),
        areaService.listAreas(false),
      ]);
      setCustomers(customerRows);
      setFarms(farmRows);
      setAreas(areaRows);
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to load customers.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const areasByFarm = useMemo(() => {
    const grouped = new Map<string, CustomerArea[]>();
    for (const area of areas) {
      if (!area.farm_id) {
        continue;
      }
      grouped.set(area.farm_id, [...(grouped.get(area.farm_id) ?? []), area]);
    }
    return grouped;
  }, [areas]);

  const selectedFarmIds = Object.keys(form.assignments);
  const activeFarm = farms.find((farm) => farm.id === activeFarmId);
  const activeFarmAreas = activeFarmId ? (areasByFarm.get(activeFarmId) ?? []) : [];
  const activeFarmSelectedAreaIds = activeFarmId ? (form.assignments[activeFarmId] ?? []) : [];
  const filteredCustomers = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();
    if (!normalizedSearch) {
      return customers;
    }

    return customers.filter((customer) => customer.customer_name.toLowerCase().includes(normalizedSearch));
  }, [customers, searchTerm]);

  function openCreate(): void {
    setEditingCustomer(null);
    setForm(initialForm);
    setActiveFarmId('');
    setModalOpen(true);
  }

  function openEdit(customer: Customer): void {
    const assignments = (customer.customer_farm_areas ?? []).reduce<AreaAssignments>((grouped, assignment) => {
      grouped[assignment.farm_id] = [...(grouped[assignment.farm_id] ?? []), assignment.area_id];
      return grouped;
    }, {});
    const firstFarmId = Object.keys(assignments)[0] ?? '';

    setEditingCustomer(customer);
    setForm({
      customer_name: customer.customer_name,
      phone: customer.phone ?? '',
      address: customer.address ?? '',
      notes: customer.notes ?? '',
      is_active: customer.is_active,
      assignments,
    });
    setActiveFarmId(firstFarmId);
    setModalOpen(true);
  }

  function setFarmSelected(farmId: string, selected: boolean): void {
    setForm((current) => {
      const nextAssignments = { ...current.assignments };
      if (!selected) {
        delete nextAssignments[farmId];
        setActiveFarmId((currentFarmId) => (currentFarmId === farmId ? (Object.keys(nextAssignments)[0] ?? '') : currentFarmId));
      } else {
        nextAssignments[farmId] = nextAssignments[farmId] ?? [];
        setActiveFarmId(farmId);
      }
      return { ...current, assignments: nextAssignments };
    });
  }

  function setFarmArea(farmId: string, areaId: string, selected: boolean): void {
    setForm((current) => ({
      ...current,
      assignments: {
        ...current.assignments,
        [farmId]: selected
          ? Array.from(new Set([...(current.assignments[farmId] ?? []), areaId]))
          : (current.assignments[farmId] ?? []).filter((selectedAreaId) => selectedAreaId !== areaId),
      },
    }));
  }

  function buildAssignments(): CustomerFarmAreaInput[] {
    return Object.entries(form.assignments).flatMap(([farmId, areaIds]) =>
      areaIds.map((areaId) => ({
        farm_id: farmId,
        area_id: areaId,
      })),
    );
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const assignments = buildAssignments();
    const hasSelectedFarmWithoutArea = selectedFarmIds.some((farmId) => (form.assignments[farmId] ?? []).length === 0);

    if (hasSelectedFarmWithoutArea) {
      notify.error('Each selected farm must have at least one area.');
      return;
    }

    setSaving(true);
    try {
      const fallbackFarmId = assignments[0]?.farm_id ?? null;
      const fallbackAreaId = assignments[0]?.area_id ?? null;
      const payload = {
        customer_name: form.customer_name,
        farm_id: fallbackFarmId,
        area_id: fallbackAreaId,
        phone: form.phone || null,
        address: form.address || null,
        notes: form.notes || null,
        is_active: form.is_active,
      };

      if (editingCustomer) {
        await customerService.updateCustomerWithAssignments(editingCustomer.id, payload, assignments);
        notify.success('Customer updated.');
      } else {
        await customerService.createCustomerWithAssignments(payload, assignments);
        notify.success('Customer added.');
      }

      setModalOpen(false);
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to save customer.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteCustomer) {
      return;
    }

    try {
      await customerService.softDeleteCustomer(deleteCustomer.id);
      notify.success('Customer deleted.');
      setDeleteCustomer(null);
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to delete customer.');
    }
  }

  const columns = useMemo<ColumnDef<Customer, unknown>[]>(
    () => [
      {
        accessorKey: 'customer_name',
        header: 'Customer Name',
        cell: ({ row }) => (
          <Link className="font-semibold text-brand-700 hover:underline" to={`/customers/${row.original.id}`}>
            {row.original.customer_name}
          </Link>
        ),
      },
      { accessorKey: 'phone', header: 'Phone', cell: ({ row }) => row.original.phone || '-' },
      { id: 'farms', header: 'Farm', cell: ({ row }) => farmSummary(row.original) },
      { accessorKey: 'is_active', header: 'Status', cell: ({ row }) => (row.original.is_active ? 'Active' : 'Inactive') },
      { accessorKey: 'created_at', header: 'Created Date', cell: ({ row }) => formatBusinessDate(row.original.created_at.slice(0, 10)) },
      {
        id: 'actions',
        header: 'Actions',
        cell: ({ row }) => (
          <div className="flex justify-end gap-2">
            <Button variant="secondary" className="h-8 px-3" onClick={() => openEdit(row.original)}>
              <Edit size={14} />
              Edit
            </Button>
            <Button variant="danger" className="h-8 px-3" onClick={() => setDeleteCustomer(row.original)}>
              <Trash2 size={14} />
              Delete
            </Button>
          </div>
        ),
      },
    ],
    [],
  );

  return (
    <>
      <PageTitle
        title="Customers"
        description="Assign customers to farms and related areas. The list keeps area details hidden for easier scanning."
        actions={
          <Button onClick={openCreate}>
            <Plus size={16} />
            Add Customer
          </Button>
        }
      />

      <section className="mb-4 rounded-lg border border-stone-200 bg-white p-4 shadow-sm">
        <FormInput
          label="Search Customer Name"
          value={searchTerm}
          placeholder="Type customer name..."
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </section>

      {loading ? <LoadingState /> : <DataTable data={filteredCustomers} columns={columns} emptyTitle="No customers found" />}

      <Modal
        open={modalOpen}
        title={editingCustomer ? 'Edit Customer' : 'Add Customer'}
        onClose={() => setModalOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="customer-form" disabled={saving}>
              Save
            </Button>
          </div>
        }
      >
        <form id="customer-form" className="space-y-5" onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <FormInput
              label="Customer Name"
              value={form.customer_name}
              required
              onChange={(event) => setForm({ ...form, customer_name: event.target.value })}
            />
            <FormInput label="Phone" value={form.phone} onChange={(event) => setForm({ ...form, phone: event.target.value })} />
            <FormInput label="Address" value={form.address} onChange={(event) => setForm({ ...form, address: event.target.value })} />
            <label className="flex items-center gap-3 self-end rounded-md border border-stone-200 px-3 py-2">
              <input
                type="checkbox"
                checked={form.is_active}
                onChange={(event) => setForm({ ...form, is_active: event.target.checked })}
              />
              <span className="text-sm font-medium text-ink-700">Active</span>
            </label>
          </div>

          <section className="rounded-lg border border-stone-200 bg-stone-50 p-4">
            <h3 className="text-sm font-semibold text-ink-900">Farm Area Assignments</h3>
            <p className="mt-1 text-sm text-ink-500">Select one or more farms, then choose related areas for the active farm.</p>

            <div className="mt-4 overflow-x-auto pb-2">
              <div className="flex min-w-max gap-2">
                {farms.map((farm) => {
                  const selected = Object.prototype.hasOwnProperty.call(form.assignments, farm.id);
                  const active = activeFarmId === farm.id;

                  return (
                    <button
                      key={farm.id}
                      type="button"
                      className={clsx(
                        'min-w-32 rounded-md border px-4 py-2 text-sm font-semibold transition',
                        selected
                          ? 'border-brand-600 bg-brand-600 text-white shadow-sm'
                          : 'border-stone-200 bg-white text-ink-700 hover:bg-stone-50',
                        active && 'ring-2 ring-brand-200',
                      )}
                      onClick={() => setFarmSelected(farm.id, !selected)}
                    >
                      {farm.farm_name}
                    </button>
                  );
                })}
              </div>
            </div>

            {selectedFarmIds.length > 0 && activeFarm ? (
              <div className="mt-4 rounded-md border border-stone-200 bg-white p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-ink-900">{activeFarm.farm_name} Areas</h4>
                    <p className="mt-1 text-xs text-ink-500">Only areas related to this selected farm are shown.</p>
                  </div>
                  {selectedFarmIds.length > 1 ? (
                    <div className="flex flex-wrap justify-end gap-2">
                      {selectedFarmIds.map((farmId) => {
                        const farm = farms.find((farmRow) => farmRow.id === farmId);
                        return farm ? (
                          <button
                            key={farmId}
                            type="button"
                            className={clsx(
                              'rounded-md border px-3 py-1.5 text-xs font-semibold',
                              activeFarmId === farmId
                                ? 'border-brand-600 bg-brand-50 text-brand-700'
                                : 'border-stone-200 bg-white text-ink-600 hover:bg-stone-50',
                            )}
                            onClick={() => setActiveFarmId(farmId)}
                          >
                            {farm.farm_name}
                          </button>
                        ) : null;
                      })}
                    </div>
                  ) : null}
                </div>

                <div className="mt-4 max-h-56 overflow-y-auto pr-1">
                  {activeFarmAreas.length > 0 ? (
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {activeFarmAreas.map((area) => {
                        const selected = activeFarmSelectedAreaIds.includes(area.id);
                        return (
                          <button
                            key={area.id}
                            type="button"
                            className={clsx(
                              'rounded-md border px-3 py-2 text-left text-sm font-medium transition',
                              selected
                                ? 'border-brand-600 bg-brand-50 text-brand-800'
                                : 'border-stone-200 bg-white text-ink-700 hover:bg-stone-50',
                            )}
                            onClick={() => setFarmArea(activeFarmId, area.id, !selected)}
                          >
                            {area.area_name}
                          </button>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="rounded-md border border-dashed border-stone-300 bg-stone-50 px-3 py-6 text-center text-sm text-ink-500">
                      No areas under this farm.
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </section>

          <label className="block">
            <span className="mb-1 block text-sm font-medium text-ink-700">Notes</span>
            <textarea
              className="min-h-24 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
              value={form.notes}
              onChange={(event) => setForm({ ...form, notes: event.target.value })}
            />
          </label>
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteCustomer)}
        title="Delete customer?"
        description="This will soft-delete the customer. Historical order records are preserved."
        onCancel={() => setDeleteCustomer(null)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
