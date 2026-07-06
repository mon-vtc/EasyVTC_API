// ══════════════════════════════════════════════════════════════════════════════
// VALIDATORS — Module Vehicle Types
// Sprint 3 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

// ── Création d'un type de véhicule ────────────────────────────────────────────
export const createVehicleTypeSchema = z.object({
  code: z
    .string()
    .min(2, 'Le code doit contenir au moins 2 caractères')
    .max(30, 'Le code ne peut pas dépasser 30 caractères')
    .regex(/^[a-z0-9_-]+$/, 'Le code ne peut contenir que des lettres minuscules, chiffres, tirets et underscores'),
  label: z
    .string()
    .min(1, 'Le libellé est requis')
    .max(100, 'Le libellé ne peut pas dépasser 100 caractères'),
  description: z
    .string()
    .max(300, 'La description ne peut pas dépasser 300 caractères')
    .optional()
    .nullable(),
  capacity: z
    .number()
    .int('La capacité doit être un entier')
    .min(1, 'La capacité minimale est 1')
    .max(50, 'La capacité maximale est 50'),
  icon: z
    .string()
    .max(50, "Le nom de l'icône ne peut pas dépasser 50 caractères")
    .optional()
    .nullable(),
  base_price_france: z
    .number()
    .min(0, 'Le prix de base France ne peut pas être négatif'),
  base_price_senegal: z
    .number()
    .int('Le prix de base Sénégal doit être un entier (XOF)')
    .min(0, 'Le prix de base Sénégal ne peut pas être négatif'),
  is_active: z.boolean().default(true),
  sort_order: z.number().int().default(0),
});

// ── Mise à jour (code non modifiable) ─────────────────────────────────────────
export const updateVehicleTypeSchema = z.object({
  label: z
    .string()
    .min(1, 'Le libellé est requis')
    .max(100, 'Le libellé ne peut pas dépasser 100 caractères')
    .optional(),
  description: z
    .string()
    .max(300, 'La description ne peut pas dépasser 300 caractères')
    .nullable()
    .optional(),
  capacity: z
    .number()
    .int('La capacité doit être un entier')
    .min(1, 'La capacité minimale est 1')
    .max(50, 'La capacité maximale est 50')
    .optional(),
  icon: z
    .string()
    .max(50, "Le nom de l'icône ne peut pas dépasser 50 caractères")
    .nullable()
    .optional(),
  base_price_france: z
    .number()
    .min(0, 'Le prix de base France ne peut pas être négatif')
    .optional(),
  base_price_senegal: z
    .number()
    .int('Le prix de base Sénégal doit être un entier (XOF)')
    .min(0, 'Le prix de base Sénégal ne peut pas être négatif')
    .optional(),
  is_active: z.boolean().optional(),
  sort_order: z.number().int().optional(),
}).refine(
  (data) => Object.keys(data).length > 0,
  { message: 'Au moins un champ doit être fourni pour la mise à jour' }
);

// ── Paramètre UUID ────────────────────────────────────────────────────────────
export const vehicleTypeIdParamSchema = z.object({
  id: z.string().uuid('ID de type de véhicule invalide'),
});

// ── Types exportés ────────────────────────────────────────────────────────────
export type CreateVehicleTypeInput = z.infer<typeof createVehicleTypeSchema>;
export type UpdateVehicleTypeInput = z.infer<typeof updateVehicleTypeSchema>;
