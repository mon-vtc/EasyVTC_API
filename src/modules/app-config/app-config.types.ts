// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module App Config
// Stocke les paramètres globaux de l'application (coordonnées support, etc.)
// ══════════════════════════════════════════════════════════════════════════════

export type SupportConfigKey =
  | 'support_phone'
  | 'support_email'
  | 'support_address'
  | 'support_hours';

export const SUPPORT_CONFIG_KEYS: SupportConfigKey[] = [
  'support_phone',
  'support_email',
  'support_address',
  'support_hours',
];

export interface AppConfigEntry {
  key:        string;
  value:      string;
  updated_at: string;
  updated_by: string | null;
}

export interface SupportConfig {
  support_phone:   string;
  support_email:   string;
  support_address: string;
  support_hours:   string;
}

export interface UpsertAppConfigDto {
  value: string;
}
