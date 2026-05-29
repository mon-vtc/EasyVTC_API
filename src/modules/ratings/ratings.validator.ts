// ══════════════════════════════════════════════════════════════════════════════
// VALIDATORS — Module Évaluations (Ratings)
// Sprint 6 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

// ── Corps de soumission ───────────────────────────────────────────────────────

export const submitRatingSchema = z.object({
  note: z
    .number({ invalid_type_error: 'La note doit être un nombre' })
    .int('La note doit être un entier')
    .min(1, 'La note minimale est 1')
    .max(5, 'La note maximale est 5'),
});

// ── Params UUID ───────────────────────────────────────────────────────────────

export const reservationIdParamSchema = z.object({
  id: z.string().uuid('ID de réservation invalide'),
});

export const driverIdParamSchema = z.object({
  id: z.string().uuid('ID de chauffeur invalide'),
});

export const ratingIdParamSchema = z.object({
  id: z.string().uuid("ID d'évaluation invalide"),
});

// ── Filtres liste ─────────────────────────────────────────────────────────────

export const ratingListFiltersSchema = z.object({
  page:  z.string().default('1').transform(v => parseInt(v, 10)).refine(v => v >= 1, { message: 'page invalide' }),
  limit: z.string().default('20').transform(v => parseInt(v, 10)).refine(v => v >= 1 && v <= 100, { message: 'limit invalide' }),
});

// ── Types inférés ─────────────────────────────────────────────────────────────

export type SubmitRatingInput      = z.infer<typeof submitRatingSchema>;
export type RatingListFiltersInput = z.infer<typeof ratingListFiltersSchema>;
