// ══════════════════════════════════════════════════════════════════════════════
// VALIDATORS — Module Drivers
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

const vehicleTypes = ['standard', 'berline', 'van'] as const;
const zoneTypes    = ['france', 'senegal'] as const;
const driverStatusTransitions = ['active', 'rejected', 'suspended'] as const;

// ── Mise à jour profil chauffeur (self) ───────────────────────────────────────
export const updateDriverSchema = z.object({
  siret: z
    .string()
    .regex(/^\d{14}$/, 'Le SIRET doit contenir exactement 14 chiffres')
    .optional(),
  zone: z.enum(zoneTypes, {
    errorMap: () => ({ message: 'Zone invalide. Valeurs acceptées: france, senegal' }),
  }).optional(),
  vehicle_type: z.enum(vehicleTypes, {
    errorMap: () => ({ message: 'Type de véhicule invalide. Valeurs acceptées: standard, berline, van' }),
  }).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Au moins un champ doit être fourni pour la mise à jour' }
);

// ── Toggle is_online ──────────────────────────────────────────────────────────
export const toggleOnlineSchema = z.object({
  is_online: z.boolean({ required_error: 'Le champ is_online (boolean) est requis' }),
});

// ── Changement de statut (admin) ──────────────────────────────────────────────
export const changeDriverStatusSchema = z.object({
  status: z.enum(driverStatusTransitions, {
    errorMap: () => ({ message: 'Statut invalide. Valeurs acceptées: active, rejected, suspended' }),
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
    errorMap: () => ({ message: 'Zone invalide. Valeurs acceptées: france, senegal' }),
  }).optional(),
  vehicle_type: z.enum(vehicleTypes, {
    errorMap: () => ({ message: 'Type de véhicule invalide. Valeurs acceptées: standard, berline, van' }),
  }).optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Au moins un champ doit être fourni pour la mise à jour' }
);

// ── Filtres liste (admin) ─────────────────────────────────────────────────────
export const driverListFiltersSchema = z.object({
  status: z.enum(['pending', 'active', 'on_trip', 'rejected', 'suspended'] as const).optional(),
  zone: z.enum(zoneTypes).optional(),
  vehicle_type: z.enum(vehicleTypes).optional(),
  is_online: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  search: z.string().max(100).optional(),
  page: z
    .string()
    .transform((v) => parseInt(v, 10))
    .refine((v) => v >= 1, 'Page doit être >= 1')
    .optional()
    .default('1'),
  limit: z
    .string()
    .transform((v) => parseInt(v, 10))
    .refine((v) => v >= 1 && v <= 100, 'Limit doit être entre 1 et 100')
    .optional()
    .default('20'),
});

// ── Validation UUID param ─────────────────────────────────────────────────────
export const driverIdParamSchema = z.object({
  id: z.string().uuid('ID chauffeur invalide'),
});

// ── Types exportés ────────────────────────────────────────────────────────────
export type UpdateDriverInput        = z.infer<typeof updateDriverSchema>;
export type ToggleOnlineInput        = z.infer<typeof toggleOnlineSchema>;
export type ChangeDriverStatusInput  = z.infer<typeof changeDriverStatusSchema>;
export type AdminUpdateDriverInput   = z.infer<typeof adminUpdateDriverSchema>;
export type DriverListFiltersInput   = z.infer<typeof driverListFiltersSchema>;
