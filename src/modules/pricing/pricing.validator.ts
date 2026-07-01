// ══════════════════════════════════════════════════════════════════════════════
// VALIDATORS — Module Tarification
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

const countries  = ['france', 'senegal'] as const;
const currencies = ['EUR', 'XOF'] as const;

// ── Helpers ───────────────────────────────────────────────────────────────────

const countryEnum = z.enum(countries, {
  error: (issue) => {
    if (issue.code === 'invalid_value') {
      return 'Pays invalide. Valeurs acceptées : france, senegal';
    }
    return undefined;
  },
});

const currencyEnum = z.enum(currencies, {
  error: (issue) => {
    if (issue.code === 'invalid_value') {
      return 'Devise invalide. Valeurs acceptées : EUR, XOF';
    }
    return undefined;
  },
});

const positiveNumber = () =>
  z.number()
   .positive('Doit être un nombre strictement positif')
   .finite('Doit être un nombre fini');

const nonNegativeNumber = () =>
  z.number()
   .min(0, 'Doit être un nombre positif ou nul')
   .finite('Doit être un nombre fini');

/** Taux entre 0 et 1 inclus (ex: 0.20 pour 20 %). */
const rateBetween0and1 = () =>
  z.number()
   .min(0, 'Le taux doit être compris entre 0 et 1')
   .max(1, 'Le taux doit être compris entre 0 et 1')
   .finite();

/** Format HH:MM pour les bornes de plage nocturne. */
const timeHHMM = () =>
  z.string()
   .regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/, 'Format heure invalide — attendu HH:MM (ex: 19:00)');

// ── Grille tarifaire ─────────────────────────────────────────────────────────

export const createPricingGridSchema = z.object({
  country:               countryEnum,
  base_price:            positiveNumber(),
  price_per_km:          positiveNumber(),
  price_per_min:         positiveNumber(),
  minimum_price:         positiveNumber(),
  currency:              currencyEnum,
  tva_rate:              rateBetween0and1().optional(),
  airport_supplement:    nonNegativeNumber().optional(),
  night_supplement_rate: rateBetween0and1().optional(),
  night_start:           timeHHMM().optional(),
  night_end:             timeHHMM().optional(),
}).refine(
  (d) => d.minimum_price >= d.base_price,
  { message: 'Le prix minimum doit être supérieur ou égal au prix de base', path: ['minimum_price'] },
);

export const updatePricingGridSchema = z.object({
  base_price:            positiveNumber().optional(),
  price_per_km:          positiveNumber().optional(),
  price_per_min:         positiveNumber().optional(),
  minimum_price:         positiveNumber().optional(),
  is_active:             z.boolean().optional(),
  tva_rate:              rateBetween0and1().optional(),
  airport_supplement:    nonNegativeNumber().optional(),
  night_supplement_rate: rateBetween0and1().optional(),
  night_start:           timeHHMM().optional(),
  night_end:             timeHHMM().optional(),
}).refine(
  (d) => Object.keys(d).some((k) => d[k as keyof typeof d] !== undefined),
  { message: 'Au moins un champ doit être fourni pour la mise à jour' },
);

// ── Forfaits itinéraires ─────────────────────────────────────────────────────

export const createFlatRateSchema = z.object({
  country:           countryEnum,
  label:             z.string().min(3, 'Le libellé doit contenir au moins 3 caractères').max(100),
  origin_label:      z.string().min(2, 'Le lieu de départ est requis').max(150),
  destination_label: z.string().min(2, 'La destination est requise').max(150),
  price:             positiveNumber(),
  currency:          currencyEnum,
});

export const updateFlatRateSchema = z.object({
  label:             z.string().min(3).max(100).optional(),
  origin_label:      z.string().min(2).max(150).optional(),
  destination_label: z.string().min(2).max(150).optional(),
  price:             positiveNumber().optional(),
  is_active:         z.boolean().optional(),
}).refine(
  (d) => Object.keys(d).some((k) => d[k as keyof typeof d] !== undefined),
  { message: 'Au moins un champ doit être fourni pour la mise à jour' },
);

// ── Estimation de prix ───────────────────────────────────────────────────────

export const priceEstimateSchema = z.object({
  country:       countryEnum,
  distance_km:   z.number().positive('La distance doit être positive').optional(),
  duration_min:  z.number().positive('La durée doit être positive').optional(),
  flat_rate_id:  z.string().uuid('ID de forfait invalide').optional(),
  nb_passengers: z.number().int('Doit être un entier').min(1, 'Minimum 1 passager').optional(),
  vehicle_type:  z.string().min(1).max(50).optional(),
  is_airport:    z.boolean().optional(),
  scheduled_at:  z.string().datetime({ message: 'scheduled_at doit être une date ISO 8601 valide' }).optional(),
}).refine(
  (d) => d.flat_rate_id || (d.distance_km !== undefined && d.duration_min !== undefined),
  { message: 'Fournissez soit un flat_rate_id, soit distance_km ET duration_min' },
);

// ── Filtres liste forfaits ───────────────────────────────────────────────────
// Zod v4 : .default() placé AVANT .transform() pour correspondre au type d'entrée (string).

export const flatRateListFiltersSchema = z.object({
  country:   countryEnum.optional(),
  is_active: z.string()
    .transform((v) => v === 'true')
    .optional(),
  page: z.string()
    .default('1')
    .transform((v) => parseInt(v, 10))
    .refine((v) => !isNaN(v) && v >= 1, { message: 'Page doit être >= 1' }),
  limit: z.string()
    .default('20')
    .transform((v) => parseInt(v, 10))
    .refine((v) => !isNaN(v) && v >= 1 && v <= 100, { message: 'Limit doit être entre 1 et 100' }),
});

// ── Config unifiée (GET + PATCH /pricing/config) ─────────────────────────────

export const updatePricingConfigSchema = z.object({
  country:               countryEnum,
  // Champs grille
  base_price:            positiveNumber().optional(),
  price_per_km:          positiveNumber().optional(),
  price_per_min:         positiveNumber().optional(),
  minimum_price:         positiveNumber().optional(),
  tva_rate:              rateBetween0and1().optional(),
  airport_supplement:    nonNegativeNumber().optional(),
  night_supplement_rate: rateBetween0and1().optional(),
  night_start:           timeHHMM().optional(),
  night_end:             timeHHMM().optional(),
  // Champs commission générique (vehicle_type = NULL)
  commission_rate:       nonNegativeNumber().optional(),
  commission_tva_rate:   rateBetween0and1().optional(),
}).refine(
  (d) => {
    const updatableKeys = [
      'base_price', 'price_per_km', 'price_per_min', 'minimum_price',
      'tva_rate', 'airport_supplement', 'night_supplement_rate', 'night_start', 'night_end',
      'commission_rate', 'commission_tva_rate',
    ];
    return updatableKeys.some((k) => d[k as keyof typeof d] !== undefined);
  },
  { message: 'Au moins un champ doit être fourni pour la mise à jour' },
);

// ── Param UUID ───────────────────────────────────────────────────────────────
export const pricingIdParamSchema = z.object({
  id: z.string().uuid('ID invalide'),
});

// ── Types inférés ─────────────────────────────────────────────────────────────
export type CreatePricingGridInput      = z.infer<typeof createPricingGridSchema>;
export type UpdatePricingGridInput      = z.infer<typeof updatePricingGridSchema>;
export type CreateFlatRateInput         = z.infer<typeof createFlatRateSchema>;
export type UpdateFlatRateInput         = z.infer<typeof updateFlatRateSchema>;
export type PriceEstimateInput          = z.infer<typeof priceEstimateSchema>;
export type FlatRateListFiltersInput    = z.infer<typeof flatRateListFiltersSchema>;
export type UpdatePricingConfigInput    = z.infer<typeof updatePricingConfigSchema>;
