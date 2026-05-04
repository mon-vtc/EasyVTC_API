// ══════════════════════════════════════════════════════════════════════════════
// VALIDATORS — Module Véhicules
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

// ── Création véhicule ─────────────────────────────────────────────────────────
export const createVehicleSchema = z.object({
  plate_number: z
    .string()
    .min(2, 'Numéro de plaque requis')
    .max(20, 'Numéro de plaque trop long'),
  brand: z
    .string()
    .min(1, 'Marque requise')
    .max(50, 'Marque trop longue'),
  model: z
    .string()
    .min(1, 'Modèle requis')
    .max(50, 'Modèle trop long'),
  year: z
    .number()
    .int('L\'année doit être un entier')
    .min(1990, 'Année trop ancienne')
    .max(new Date().getFullYear() + 1, 'Année invalide')
    .optional(),
  color: z
    .string()
    .max(30, 'Couleur trop longue')
    .optional(),
  type: z
    .string()
    .min(1, 'Le type de véhicule est requis')
    .max(50, 'Type de véhicule invalide'),
});

// ── Mise à jour véhicule (tous les champs optionnels) ─────────────────────────
export const updateVehicleSchema = z.object({
  plate_number: z
    .string()
    .min(2, 'Numéro de plaque requis')
    .max(20, 'Numéro de plaque trop long')
    .optional(),
  brand: z
    .string()
    .min(1, 'Marque requise')
    .max(50, 'Marque trop longue')
    .optional(),
  model: z
    .string()
    .min(1, 'Modèle requis')
    .max(50, 'Modèle trop long')
    .optional(),
  year: z
    .number()
    .int('L\'année doit être un entier')
    .min(1990, 'Année trop ancienne')
    .max(new Date().getFullYear() + 1, 'Année invalide')
    .optional(),
  color: z
    .string()
    .max(30, 'Couleur trop longue')
    .optional(),
  type: z
    .string()
    .min(1, 'Le type de véhicule est requis')
    .max(50, 'Type de véhicule invalide')
    .optional(),
  is_active: z.boolean().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Au moins un champ doit être fourni pour la mise à jour' }
);

// ── Validation UUID param ─────────────────────────────────────────────────────
export const vehicleIdParamSchema = z.object({
  id: z.string().uuid('ID véhicule invalide'),
});

// ── Filtres liste véhicules (admin) ───────────────────────────────────────────
export const vehicleListFiltersSchema = z.object({
  driver_id: z.string().uuid('ID chauffeur invalide').optional(),
  type: z.string().min(1).max(50).optional(),
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
    .refine((v) => v >= 1 && v <= 100, 'Limit doit être entre 1 et 100'),
});

// ── Types exportés ────────────────────────────────────────────────────────────
export type CreateVehicleInput = z.infer<typeof createVehicleSchema>;
export type UpdateVehicleInput = z.infer<typeof updateVehicleSchema>;
export type VehicleListFiltersInput = z.infer<typeof vehicleListFiltersSchema>;
