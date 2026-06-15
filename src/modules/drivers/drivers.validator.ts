// ══════════════════════════════════════════════════════════════════════════════
// VALIDATORS — Module Drivers
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

const zoneTypes = ['france', 'senegal'] as const;
const driverStatusTransitions = ['active', 'rejected', 'suspended'] as const;

// ── Mise à jour profil chauffeur (self) ───────────────────────────────────────
export const updateDriverSchema = z.object({
  siret: z
    .string()
    .regex(/^\d{14}$/, 'Le SIRET doit contenir exactement 14 chiffres')
    .optional(),
  zone: z.enum(zoneTypes, {
    error: 'Zone invalide. Valeurs acceptées: france, senegal',
  }).optional(),
  vehicle_type: z.string().min(1).max(50).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Au moins un champ doit être fourni pour la mise à jour' }
);

// ── Toggle is_online ──────────────────────────────────────────────────────────
export const toggleOnlineSchema = z.object({
  is_online: z.boolean({ error: 'Le champ is_online (boolean) est requis' }),
});

// ── Changement de statut (admin) ──────────────────────────────────────────────
export const changeDriverStatusSchema = z.object({
  status: z.enum(driverStatusTransitions, {
    error: 'Statut invalide. Valeurs acceptées: active, rejected, suspended',
  }),
  reason: z
    .string()
    .min(5, 'Le motif doit contenir au moins 5 caractères')
    .max(500, 'Le motif ne peut pas dépasser 500 caractères'),
});

// ── Mise à jour admin (tva_rate, etc.) ────────────────────────────────────────
export const adminUpdateDriverSchema = z.object({
  tva_rate: z
    .number()
    .min(0, 'Le taux de TVA ne peut pas être négatif')
    .max(100, 'Le taux de TVA ne peut pas dépasser 100%')
    .optional(),
  siret: z
    .string()
    .regex(/^\d{14}$/, 'Le SIRET doit contenir exactement 14 chiffres')
    .optional(),
  zone: z.enum(zoneTypes, {
    error: 'Zone invalide. Valeurs acceptées: france, senegal',
  }).optional(),
  vehicle_type: z.string().min(1).max(50).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Au moins un champ doit être fourni pour la mise à jour' }
);

// ── Filtres liste (admin) ─────────────────────────────────────────────────────
export const driverListFiltersSchema = z.object({
  status: z.enum(['pending', 'active', 'on_trip', 'rejected', 'suspended'] as const).optional(),
  zone: z.enum(zoneTypes).optional(),
  vehicle_type: z.string().min(1).max(50).optional(),
  is_online: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  search: z.string().max(100).optional(),
  page: z
    .string()
    .default('1')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v >= 1, 'Page doit être >= 1'),
  limit: z
    .string()
    .default('20')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v >= 1 && v <= 100, 'Limit doit être entre 1 et 100'),
});

// ── Validation UUID param ─────────────────────────────────────────────────────
export const driverIdParamSchema = z.object({
  id: z.string().uuid('ID chauffeur invalide'),
});

// ── Planning query ────────────────────────────────────────────────────────────
export const planningQuerySchema = z.object({
  period: z.enum(['week', 'month'] as const, {
    error: 'Période invalide. Valeurs acceptées: week, month',
  }).default('week'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (YYYY-MM-DD)')
    .optional(),
});

// ── Revenus query ─────────────────────────────────────────────────────────────
export const revenuesQuerySchema = z.object({
  period: z.enum(['week', 'month', 'all'] as const, {
    error: 'Période invalide. Valeurs acceptées: week, month, all',
  }).default('month'),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide (YYYY-MM-DD)')
    .optional(),
});

// ── Availability query ────────────────────────────────────────────────────────
export const availabilityQuerySchema = planningQuerySchema; // même params : period + date

// ── Indisponibilité — création ─────────────────────────────────────────────────
const UNAVAILABILITY_REASONS = [
  'conge',
  'visite_medicale',
  'formation',
  'panne_vehicule',
  'autre',
] as const;

export const createUnavailabilitySchema = z.object({
  reason: z.enum(UNAVAILABILITY_REASONS, {
    error: 'Raison invalide. Valeurs : conge, visite_medicale, formation, panne_vehicule, autre',
  }),
  label: z.string().max(100, 'Le libellé ne peut pas dépasser 100 caractères').optional(),
  starts_at: z
    .string()
    .datetime({ offset: true, message: 'starts_at doit être une date ISO 8601' }),
  ends_at: z
    .string()
    .datetime({ offset: true, message: 'ends_at doit être une date ISO 8601' }),
}).refine(
  (d) => new Date(d.ends_at) > new Date(d.starts_at),
  { message: 'ends_at doit être postérieure à starts_at', path: ['ends_at'] },
).refine(
  (d) => new Date(d.starts_at) > new Date(Date.now() - 5 * 60 * 1000),
  { message: 'Impossible de créer une indisponibilité dans le passé', path: ['starts_at'] },
);

// ── Indisponibilité — param UUID ───────────────────────────────────────────────
export const unavailabilityIdParamSchema = z.object({
  unavailId: z.string().uuid('ID indisponibilité invalide'),
});

// ── Planning hebdomadaire récurrent ───────────────────────────────────────────

const DAYS_OF_WEEK = [
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
] as const;

const timeRegex = /^([01]\d|2[0-3]):[0-5]\d$/;

const weeklyScheduleDaySchema = z.object({
  day:          z.enum(DAYS_OF_WEEK, { error: 'Jour invalide (monday … sunday)' }),
  is_available: z.boolean({ error: 'is_available (boolean) est requis' }),
  start_time:   z.string().regex(timeRegex, 'Format HH:MM attendu').nullable().optional(),
  end_time:     z.string().regex(timeRegex, 'Format HH:MM attendu').nullable().optional(),
}).refine(
  (d) => {
    if (!d.is_available) return true;
    return !!d.start_time && !!d.end_time;
  },
  { message: 'start_time et end_time sont requis quand is_available est true' },
).refine(
  (d) => {
    if (!d.is_available || !d.start_time || !d.end_time) return true;
    return d.end_time > d.start_time;
  },
  { message: 'end_time doit être postérieur à start_time', path: ['end_time'] },
);

export const setWeeklyScheduleSchema = z.object({
  schedule: z
    .array(weeklyScheduleDaySchema)
    .min(1, 'Au moins un jour doit être fourni')
    .max(7, 'Maximum 7 jours')
    .refine(
      (arr) => new Set(arr.map((d) => d.day)).size === arr.length,
      { message: 'Chaque jour ne peut apparaître qu\'une seule fois' },
    ),
});

// ── Types exportés ────────────────────────────────────────────────────────────
export type UpdateDriverInput           = z.infer<typeof updateDriverSchema>;
export type ToggleOnlineInput           = z.infer<typeof toggleOnlineSchema>;
export type ChangeDriverStatusInput     = z.infer<typeof changeDriverStatusSchema>;
export type AdminUpdateDriverInput      = z.infer<typeof adminUpdateDriverSchema>;
export type DriverListFiltersInput      = z.infer<typeof driverListFiltersSchema>;
export type PlanningQueryInput          = z.infer<typeof planningQuerySchema>;
export type RevenuesQueryInput          = z.infer<typeof revenuesQuerySchema>;
export type CreateUnavailabilityInput   = z.infer<typeof createUnavailabilitySchema>;
export type SetWeeklyScheduleInput      = z.infer<typeof setWeeklyScheduleSchema>;
