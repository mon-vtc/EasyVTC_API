// ══════════════════════════════════════════════════════════════════════════════
// VALIDATORS — Module Commission Settings
// Sprint 6 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

const zoneTypes    = ['france', 'senegal'] as const;
const rateTypes    = ['percentage', 'flat'] as const;
const periodTypes  = ['week', 'month', 'all'] as const;

// ── Création d'un taux de commission ─────────────────────────────────────────
export const createCommissionSettingSchema = z.object({
  label: z.string().min(3, 'Le libellé doit contenir au moins 3 caractères').max(100),
  zone: z.enum(zoneTypes, { error: 'Zone invalide. Valeurs acceptées: france, senegal' }),
  vehicle_type: z
    .string()
    .min(1)
    .max(50)
    .nullable()
    .optional(),
  rate_type: z.enum(rateTypes, { error: 'Type invalide. Valeurs acceptées: percentage, flat' }),
  rate_value: z
    .number({ error: 'rate_value doit être un nombre' })
    .min(0, 'Le taux ne peut pas être négatif')
    .max(100, 'Un pourcentage ne peut pas dépasser 100 %')
    .refine((v) => v >= 0, 'Le montant fixe ne peut pas être négatif'),
});

// ── Mise à jour partielle ─────────────────────────────────────────────────────
export const updateCommissionSettingSchema = z.object({
  label: z.string().min(3).max(100).optional(),
  zone: z.enum(zoneTypes).optional(),
  vehicle_type: z.string().min(1).max(50).nullable().optional(),
  rate_type: z.enum(rateTypes).optional(),
  rate_value: z.number().min(0).max(100).optional(),
  is_active: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Au moins un champ doit être fourni' },
);

// ── Paramètre UUID ────────────────────────────────────────────────────────────
export const settingIdParamSchema = z.object({
  id: z.string().uuid('ID de paramétrage invalide'),
});

// ── Filtres liste admin ───────────────────────────────────────────────────────
export const listSettingsSchema = z.object({
  zone: z.enum(zoneTypes).optional(),
  is_active: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

// ── Filtres liste commissions ─────────────────────────────────────────────────
export const listCommissionsSchema = z.object({
  period: z.enum(periodTypes).default('month'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD requis')
    .optional(),
  zone: z.enum(zoneTypes).optional(),
  driver_id: z.string().uuid().optional(),
  page: z
    .string()
    .default('1')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v >= 1, 'Page doit être >= 1'),
  limit: z
    .string()
    .default('50')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v >= 1 && v <= 200, 'Limit entre 1 et 200'),
});

// ── Filtres résumé ────────────────────────────────────────────────────────────
export const summaryQuerySchema = z.object({
  period: z.enum(periodTypes).default('month'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format YYYY-MM-DD requis')
    .optional(),
});

// ── Types exportés ────────────────────────────────────────────────────────────
export type CreateCommissionSettingInput = z.infer<typeof createCommissionSettingSchema>;
export type UpdateCommissionSettingInput = z.infer<typeof updateCommissionSettingSchema>;
export type ListSettingsInput            = z.infer<typeof listSettingsSchema>;
export type ListCommissionsInput         = z.infer<typeof listCommissionsSchema>;
export type SummaryQueryInput            = z.infer<typeof summaryQuerySchema>;
