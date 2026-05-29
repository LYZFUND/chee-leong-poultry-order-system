import type { AppSetting } from '@renderer/types/entities';
import { ensureData } from './supabaseQuery';
import { supabase } from './supabaseClient';

export interface AppSettingsMap {
  company_name: string;
  currency: string;
  default_cage_weight: number;
  date_format: string;
  backup_export_enabled: boolean;
}

const defaultSettings: AppSettingsMap = {
  company_name: 'CHEE LEONG POULTRY TRADING',
  currency: 'RM',
  default_cage_weight: 8,
  date_format: 'yyyy-MM-dd, EEEE',
  backup_export_enabled: true,
};

function parseSettings(rows: AppSetting[]): AppSettingsMap {
  const settings: AppSettingsMap = { ...defaultSettings };

  for (const row of rows) {
    if (row.setting_key === 'company_name' && typeof row.setting_value === 'string') {
      settings.company_name = row.setting_value;
    }
    if (row.setting_key === 'currency' && typeof row.setting_value === 'string') {
      settings.currency = row.setting_value;
    }
    if (row.setting_key === 'default_cage_weight') {
      settings.default_cage_weight = Number(row.setting_value);
    }
    if (row.setting_key === 'date_format' && typeof row.setting_value === 'string') {
      settings.date_format = row.setting_value;
    }
    if (row.setting_key === 'backup_export_enabled' && typeof row.setting_value === 'boolean') {
      settings.backup_export_enabled = row.setting_value;
    }
  }

  return settings;
}

export const settingsService = {
  async getSettings(): Promise<AppSettingsMap> {
    const { data, error } = await supabase.from('app_settings').select('*').is('deleted_at', null);
    const rows = ensureData<AppSetting[]>(data, error, []);
    return parseSettings(rows);
  },

  async getDefaultCageWeight(): Promise<number> {
    const settings = await settingsService.getSettings();
    return Number(settings.default_cage_weight || 8);
  },

  async updateSetting(settingKey: keyof AppSettingsMap, settingValue: AppSettingsMap[keyof AppSettingsMap]): Promise<void> {
    const { error } = await supabase
      .from('app_settings')
      .upsert(
        {
          setting_key: settingKey,
          setting_value: settingValue,
        },
        {
          onConflict: 'setting_key',
        },
      );

    if (error) {
      throw new Error(error.message);
    }
  },

  async updateSettings(settings: AppSettingsMap): Promise<void> {
    await Promise.all(
      Object.entries(settings).map(([key, value]) =>
        settingsService.updateSetting(key as keyof AppSettingsMap, value as AppSettingsMap[keyof AppSettingsMap]),
      ),
    );
  },
};
