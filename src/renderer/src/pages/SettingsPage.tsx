import { type FormEvent, useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@renderer/components/ui/Button';
import { FormInput } from '@renderer/components/ui/FormInput';
import { FormSelect } from '@renderer/components/ui/FormSelect';
import { LoadingState } from '@renderer/components/ui/LoadingState';
import { notify } from '@renderer/components/ui/Notification';
import { PageTitle } from '@renderer/components/ui/PageTitle';
import { settingsService, type AppSettingsMap } from '@renderer/services/settingsService';

export function SettingsPage(): JSX.Element {
  const [settings, setSettings] = useState<AppSettingsMap | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    void settingsService.getSettings().then((rows) => {
      setSettings(rows);
      setLoading(false);
    });
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!settings) {
      return;
    }

    setSaving(true);
    try {
      await settingsService.updateSettings(settings);
      notify.success('Settings saved.');
    } catch (error) {
      notify.error(error instanceof Error ? error.message : 'Unable to save settings.');
    } finally {
      setSaving(false);
    }
  }

  if (loading || !settings) {
    return <LoadingState />;
  }

  return (
    <>
      <PageTitle
        title="Settings"
        description="Manage company defaults used across order entry, calculations, dates, currency, and exports."
      />

      <form className="max-w-3xl rounded-lg border border-stone-200 bg-white p-5 shadow-sm" onSubmit={handleSubmit}>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FormInput
            label="Company Name"
            value={settings.company_name}
            onChange={(event) => setSettings({ ...settings, company_name: event.target.value })}
          />
          <FormInput
            label="Default Cage Weight (kg)"
            type="number"
            min={0}
            step={0.001}
            value={settings.default_cage_weight}
            onChange={(event) => setSettings({ ...settings, default_cage_weight: Number(event.target.value) })}
          />
          <FormInput
            label="Currency"
            value={settings.currency}
            onChange={(event) => setSettings({ ...settings, currency: event.target.value })}
          />
          <FormSelect
            label="Date Format"
            value={settings.date_format}
            options={[{ label: '2026-05-26, Tuesday', value: 'yyyy-MM-dd, EEEE' }]}
            onChange={(event) => setSettings({ ...settings, date_format: event.target.value })}
          />
          <label className="flex items-center gap-3 rounded-md border border-stone-200 px-3 py-2 md:col-span-2">
            <input
              type="checkbox"
              checked={settings.backup_export_enabled}
              onChange={(event) => setSettings({ ...settings, backup_export_enabled: event.target.checked })}
            />
            <span className="text-sm font-medium text-ink-700">Enable CSV backup/export features</span>
          </label>
        </div>
        <div className="mt-5 flex justify-end">
          <Button type="submit" disabled={saving}>
            <Save size={16} />
            Save Settings
          </Button>
        </div>
      </form>
    </>
  );
}
