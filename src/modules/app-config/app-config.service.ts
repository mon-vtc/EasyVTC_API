// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module App Config
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../../database/supabase/client.js';
import type { AppConfigEntry, SupportConfig, SupportConfigKey } from './app-config.types.js';
import { SUPPORT_CONFIG_KEYS } from './app-config.types.js';

export class AppConfigService {
  async getSupportConfig(): Promise<SupportConfig> {
    const { data } = await supabaseAdmin
      .from('app_config')
      .select('key, value')
      .in('key', SUPPORT_CONFIG_KEYS);

    const map = new Map((data ?? []).map(r => [r.key as string, r.value as string]));
    return {
      support_phone:   map.get('support_phone')   ?? '',
      support_email:   map.get('support_email')   ?? '',
      support_address: map.get('support_address') ?? '',
      support_hours:   map.get('support_hours')   ?? '',
    };
  }

  async upsert(key: SupportConfigKey, value: string, adminId: string): Promise<AppConfigEntry> {
    const { data, error } = await supabaseAdmin
      .from('app_config')
      .upsert(
        { key, value, updated_at: new Date().toISOString(), updated_by: adminId },
        { onConflict: 'key' }
      )
      .select()
      .single();

    if (error || !data) throw { status: 500, message: 'Erreur lors de la mise à jour de la configuration' };
    return data as AppConfigEntry;
  }
}

export const appConfigService = new AppConfigService();
