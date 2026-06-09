// ══════════════════════════════════════════════════════════════════════════════
// VALIDATORS — Module Codes Promo
// Sprint 6 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

const discountTypes   = ['percent', 'fixed'] as const;
const conditionTypes  = ['none', 'pickup_location'] as const;

// ── Schéma de condition géographique (pickup_location) ────────────────────────
const geoConditionRefinement = (d: {
  condition_type?: string;
  pickup_lat?: number | null;
  pickup_lng?: number | null;
  pickup_radius_meters?: number | null;
  condition_label?: string | null;
}) => {
  if (d.condition_type === 'pickup_location') {
    if (d.pickup_lat == null || d.pickup_lng == null || d.pickup_radius_meters == null) return false;
  }
  return true;
};

// ── Création ──────────────────────────────────────────────────────────────────
export const createPromoCodeSchema = z.object({
  code: z
    .string()
    .min(3, 'Le code doit contenir au moins 3 caractères')
    .max(50, 'Le code ne peut pas dépasser 50 caractères')
    .regex(/^[A-Z0-9_-]+$/i, 'Le code ne peut contenir que des lettres, chiffres, tirets et underscores')
    .transform((v) => v.toUpperCase()),

  discount_type: z.enum(discountTypes, {
    error: 'Type de remise invalide. Valeurs acceptées : percent, fixed',
  }),

  discount_value: z
    .number({ error: 'discount_value doit être un nombre' })
    .positive('La valeur de remise doit être positive'),

  valid_from: z
    .string()
    .datetime({ message: 'valid_from doit être une date ISO 8601 valide' })
    .optional(),

  valid_until: z
    .string()
    .datetime({ message: 'valid_until doit être une date ISO 8601 valide' })
    .optional(),

  max_uses: z
    .number({ error: 'max_uses doit être un entier' })
    .int()
    .positive('Le nombre maximum d\'utilisations doit être positif')
    .optional(),

  min_order_amount: z
    .number({ error: 'min_order_amount doit être un nombre' })
    .positive('Le montant minimum doit être positif')
    .optional(),

  // Condition géographique
  condition_type: z.enum(conditionTypes).default('none'),
  condition_label: z.string().max(200).optional(),
  pickup_lat:  z.number().min(-90).max(90).optional(),
  pickup_lng:  z.number().min(-180).max(180).optional(),
  pickup_radius_meters: z.number().int().positive().max(50000).optional(),

}).refine(
  (d) => d.discount_type !== 'percent' || d.discount_value <= 100,
  { message: 'Un pourcentage ne peut pas dépasser 100 %', path: ['discount_value'] },
).refine(
  (d) => !d.valid_from || !d.valid_until || new Date(d.valid_from) < new Date(d.valid_until),
  { message: 'valid_until doit être postérieur à valid_from', path: ['valid_until'] },
).refine(
  geoConditionRefinement,
  { message: 'pickup_lat, pickup_lng et pickup_radius_meters sont requis pour condition_type=pickup_location', path: ['condition_type'] },
);

// ── Mise à jour partielle ─────────────────────────────────────────────────────
export const updatePromoCodeSchema = z.object({
  code: z
    .string()
    .min(3)
    .max(50)
    .regex(/^[A-Z0-9_-]+$/i, 'Le code ne peut contenir que des lettres, chiffres, tirets et underscores')
    .transform((v) => v.toUpperCase())
    .optional(),

  discount_type: z.enum(discountTypes).optional(),

  discount_value: z.number().positive().optional(),

  valid_from:        z.string().datetime().nullable().optional(),
  valid_until:       z.string().datetime().nullable().optional(),
  max_uses:          z.number().int().positive().nullable().optional(),
  min_order_amount:  z.number().positive().nullable().optional(),
  is_active:         z.boolean().optional(),

  // Condition géographique
  condition_type:          z.enum(conditionTypes).optional(),
  condition_label:         z.string().max(200).nullable().optional(),
  pickup_lat:              z.number().min(-90).max(90).nullable().optional(),
  pickup_lng:              z.number().min(-180).max(180).nullable().optional(),
  pickup_radius_meters:    z.number().int().positive().max(50000).nullable().optional(),

}).refine(
  (d) => Object.keys(d).length > 0,
  { message: 'Au moins un champ doit être fourni pour la mise à jour' },
);

// ── Paramètre UUID ────────────────────────────────────────────────────────────
export const promoCodeIdParamSchema = z.object({
  id: z.string().uuid('ID de code promo invalide'),
});

// ── Validation côté client (avant réservation) ────────────────────────────────
export const validatePromoCodeSchema = z.object({
  code: z.string().min(1, 'Le code promo est requis'),
  order_amount: z
    .number({ error: 'order_amount doit être un nombre positif' })
    .positive('Le montant de la commande doit être positif'),
  // Coordonnées du point de départ — requis si le code a une condition géographique
  pickup_lat: z.number().min(-90).max(90).optional(),
  pickup_lng: z.number().min(-180).max(180).optional(),
});

// ── Filtres liste admin ───────────────────────────────────────────────────────
export const promoCodeListFiltersSchema = z.object({
  is_active: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
  page: z
    .string()
    .default('1')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v >= 1, 'Page doit être >= 1'),
  limit: z
    .string()
    .default('20')
    .transform((v) => parseInt(v, 10))
    .refine((v) => v >= 1 && v <= 100, 'Limit entre 1 et 100'),
});

// ── Types inférés ─────────────────────────────────────────────────────────────
export type CreatePromoCodeInput       = z.infer<typeof createPromoCodeSchema>;
export type UpdatePromoCodeInput       = z.infer<typeof updatePromoCodeSchema>;
export type ValidatePromoCodeInput     = z.infer<typeof validatePromoCodeSchema>;
export type PromoCodeListFiltersInput  = z.infer<typeof promoCodeListFiltersSchema>;
export type PromoCodeListFilters       = PromoCodeListFiltersInput;
