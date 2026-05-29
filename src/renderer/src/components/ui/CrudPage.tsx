import { type FormEvent, type ReactNode, useCallback, useEffect, useState } from 'react';
import type { ColumnDef } from '@tanstack/react-table';
import { Edit, Plus, Trash2 } from 'lucide-react';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { DataTable } from './DataTable';
import { FormDatePicker } from './FormDatePicker';
import { FormInput } from './FormInput';
import { FormSelect, type SelectOption } from './FormSelect';
import { LoadingState } from './LoadingState';
import { Modal } from './Modal';
import { notify } from './Notification';
import { PageTitle } from './PageTitle';

type FormValue = string | number | boolean | string[] | null | undefined;
type FormRecord = Record<string, FormValue>;

export interface CrudField<TForm extends FormRecord> {
  name: keyof TForm & string;
  label: string;
  type: 'text' | 'textarea' | 'number' | 'date' | 'checkbox' | 'select' | 'multiselect';
  options?: SelectOption[] | ((form: TForm) => SelectOption[]);
  onChange?: (form: TForm, value: string | boolean | string[]) => TForm;
  required?: boolean;
  min?: number;
  step?: number;
  placeholder?: string;
}

interface CrudPageProps<TEntity extends { id: string }, TForm extends FormRecord> {
  title: string;
  description: string;
  addLabel: string;
  load: () => Promise<TEntity[]>;
  create: (form: TForm) => Promise<unknown>;
  update: (id: string, form: TForm) => Promise<unknown>;
  remove: (id: string) => Promise<void>;
  initialForm: TForm;
  rowToForm: (row: TEntity) => TForm;
  fields: CrudField<TForm>[];
  columns: ColumnDef<TEntity, unknown>[];
  toolbar?: ReactNode;
  renderRows?: (args: { rows: TEntity[]; columns: ColumnDef<TEntity, unknown>[] }) => ReactNode;
}

function updateFormValue<TForm extends FormRecord>(
  form: TForm,
  field: CrudField<TForm>,
  value: string | boolean | string[],
): TForm {
  if (field.type === 'number') {
    return {
      ...form,
      [field.name]: value === '' ? 0 : Number(value),
    };
  }

  return {
    ...form,
    [field.name]: value,
  };
}

export function CrudPage<TEntity extends { id: string }, TForm extends FormRecord>({
  title,
  description,
  addLabel,
  load,
  create,
  update,
  remove,
  initialForm,
  rowToForm,
  fields,
  columns,
  toolbar,
  renderRows,
}: CrudPageProps<TEntity, TForm>): JSX.Element {
  const [rows, setRows] = useState<TEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingRow, setEditingRow] = useState<TEntity | null>(null);
  const [deleteRow, setDeleteRow] = useState<TEntity | null>(null);
  const [form, setForm] = useState<TForm>(initialForm);
  const [saving, setSaving] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await load());
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to load records.');
    } finally {
      setLoading(false);
    }
  }, [load]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function openCreate(): void {
    setEditingRow(null);
    setForm(initialForm);
    setModalOpen(true);
  }

  function openEdit(row: TEntity): void {
    setEditingRow(row);
    setForm(rowToForm(row));
    setModalOpen(true);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    try {
      if (editingRow) {
        await update(editingRow.id, form);
        notify.success('Record updated.');
      } else {
        await create(form);
        notify.success('Record added.');
      }
      setModalOpen(false);
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to save record.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(): Promise<void> {
    if (!deleteRow) {
      return;
    }

    try {
      await remove(deleteRow.id);
      notify.success('Record deleted.');
      setDeleteRow(null);
      await refresh();
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to delete record.');
    }
  }

  const tableColumns: ColumnDef<TEntity, unknown>[] = [
    ...columns,
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex justify-end gap-2">
          <Button variant="secondary" className="h-8 px-3" onClick={() => openEdit(row.original)}>
            <Edit size={14} />
            Edit
          </Button>
          <Button variant="danger" className="h-8 px-3" onClick={() => setDeleteRow(row.original)}>
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
        title={title}
        description={description}
        actions={
          <Button onClick={openCreate}>
            <Plus size={16} />
            {addLabel}
          </Button>
        }
      />

      {toolbar ? <div className="mb-5">{toolbar}</div> : null}

      {loading ? (
        <LoadingState />
      ) : renderRows ? (
        renderRows({ rows, columns: tableColumns })
      ) : (
        <DataTable data={rows} columns={tableColumns} emptyDescription="Create the first record from the button above." />
      )}

      <Modal
        open={modalOpen}
        title={editingRow ? `Edit ${title}` : addLabel}
        onClose={() => setModalOpen(false)}
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form={`${title}-form`} disabled={saving}>
              Save
            </Button>
          </div>
        }
      >
        <form id={`${title}-form`} className="grid grid-cols-1 gap-4 md:grid-cols-2" onSubmit={handleSubmit}>
          {fields.map((field) => {
            const value = form[field.name];
            const updateValue = (nextValue: string | boolean | string[]): void => {
              setForm(field.onChange ? field.onChange(form, nextValue) : updateFormValue(form, field, nextValue));
            };

            if (field.type === 'select') {
              const options = typeof field.options === 'function' ? field.options(form) : (field.options ?? []);

              return (
                <FormSelect
                  key={field.name}
                  label={field.label}
                  value={String(value ?? '')}
                  required={field.required}
                  options={options}
                  onChange={(event) => updateValue(event.target.value)}
                />
              );
            }

            if (field.type === 'multiselect') {
              const options = typeof field.options === 'function' ? field.options(form) : (field.options ?? []);
              const selectedValues = Array.isArray(value) ? value : [];

              return (
                <fieldset key={field.name} className="block md:col-span-2">
                  <legend className="mb-1 block text-sm font-medium text-ink-700">{field.label}</legend>
                  <div className="max-h-56 overflow-y-auto rounded-md border border-stone-200 bg-white p-2">
                    {options.length > 0 ? (
                      options.map((option) => {
                        const selected = selectedValues.includes(option.value);

                        return (
                          <label
                            key={option.value}
                            className={`mb-2 flex cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm last:mb-0 ${
                              selected ? 'border-brand-600 bg-brand-50 text-ink-900' : 'border-stone-200 text-ink-700'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(event) => {
                                const nextValues = event.target.checked
                                  ? Array.from(new Set([...selectedValues, option.value]))
                                  : selectedValues.filter((selectedValue) => selectedValue !== option.value);
                                updateValue(nextValues);
                              }}
                            />
                            <span>{option.label}</span>
                          </label>
                        );
                      })
                    ) : (
                      <p className="px-2 py-3 text-sm text-ink-500">No options available.</p>
                    )}
                  </div>
                  {field.required && selectedValues.length === 0 ? (
                    <p className="mt-1 text-xs text-ink-500">Select at least one option.</p>
                  ) : null}
                </fieldset>
              );
            }

            if (field.type === 'checkbox') {
              return (
                <label key={field.name} className="flex items-center gap-3 self-end rounded-md border border-stone-200 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={Boolean(value)}
                    onChange={(event) => updateValue(event.target.checked)}
                  />
                  <span className="text-sm font-medium text-ink-700">{field.label}</span>
                </label>
              );
            }

            if (field.type === 'textarea') {
              return (
                <label key={field.name} className="block md:col-span-2">
                  <span className="mb-1 block text-sm font-medium text-ink-700">{field.label}</span>
                  <textarea
                    className="min-h-24 w-full rounded-md border border-stone-200 bg-white px-3 py-2 text-sm text-ink-900 outline-none transition focus:border-brand-600 focus:ring-2 focus:ring-brand-100"
                    value={String(value ?? '')}
                    placeholder={field.placeholder}
                    required={field.required}
                    onChange={(event) => updateValue(event.target.value)}
                  />
                </label>
              );
            }

            if (field.type === 'date') {
              return (
                <FormDatePicker
                  key={field.name}
                  label={field.label}
                  value={String(value ?? '')}
                  required={field.required}
                  onChange={(event) => updateValue(event.target.value)}
                />
              );
            }

            return (
              <FormInput
                key={field.name}
                label={field.label}
                type={field.type}
                value={field.type === 'number' ? Number(value ?? 0) : String(value ?? '')}
                min={field.min}
                step={field.step}
                placeholder={field.placeholder}
                required={field.required}
                onChange={(event) => updateValue(event.target.value)}
              />
            );
          })}
        </form>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleteRow)}
        title="Delete record?"
        description="This will soft-delete the record so it is hidden from normal use. Historical order data is preserved."
        onCancel={() => setDeleteRow(null)}
        onConfirm={() => void handleDelete()}
      />
    </>
  );
}
