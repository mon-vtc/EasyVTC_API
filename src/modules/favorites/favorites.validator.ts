// ══════════════════════════════════════════════════════════════════════════════
// VALIDATORS — Module Destinations Favorites
// Sprint 6 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

// ── Création d'une destination favorite ──────────────────────────────────────
export const createFavoriteSchema = z.object({
  label: z
    .string()
    .min(1, 'Le libellé est requis')
    .max(100, 'Le libellé ne peut pas dépasser 100 caractères'),

  address: z
    .string()
    .min(5, "L'adresse est requise (minimum 5 caractères)")
    .max(300, "L'adresse ne peut pas dépasser 300 caractères"),

  lat: z.number().min(-90).max(90).optional(),
  lng: z.number().min(-180).max(180).optional(),
});

// ── Paramètre :id (userId) ────────────────────────────────────────────────────
export const userIdParamSchema = z.object({
  id: z.string().uuid("ID d'utilisateur invalide"),
});

// ── Paramètres :id + :favId ───────────────────────────────────────────────────
export const favoriteParamsSchema = z.object({
  id:    z.string().uuid("ID d'utilisateur invalide"),
  favId: z.string().uuid('ID de favori invalide'),
});

// ── Types inférés ─────────────────────────────────────────────────────────────
export type CreateFavoriteInput  = z.infer<typeof createFavoriteSchema>;
export type UserIdParamInput     = z.infer<typeof userIdParamSchema>;
export type FavoriteParamsInput  = z.infer<typeof favoriteParamsSchema>;
