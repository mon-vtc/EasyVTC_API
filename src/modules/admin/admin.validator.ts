// ══════════════════════════════════════════════════════════════════════════════
// VALIDATORS — Module Admin (Gestion des gestionnaires)
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

// ── Création gestionnaire ─────────────────────────────────────────────────────
export const createManagerSchema = z.object({
  email: z.string().email('Email invalide'),

  password: z
    .string()
    .min(8, 'Mot de passe : 8 caractères minimum')
    .regex(/[a-z]/, 'Mot de passe : au moins une lettre minuscule')
    .regex(/[0-9]/, 'Mot de passe : au moins un chiffre'),

  first_name: z.string().min(2, 'Prénom requis (2 caractères min)').max(100),
  last_name:  z.string().min(2, 'Nom requis (2 caractères min)').max(100),

  phone: z
    .string()
    .regex(/^\+?[1-9]\d{7,14}$/, 'Numéro invalide — format international attendu (ex : +33612345678)')
    .optional(),
});

// ── Changement de statut ──────────────────────────────────────────────────────
export const changeManagerStatusSchema = z.object({
  status: z.enum(['active', 'inactive', 'locked'], {
    error: () => 'Statut invalide. Valeurs acceptées : active, inactive, locked',
  }),
  reason: z
    .string()
    .min(10, 'Motif requis (10 caractères minimum)')
    .max(500),
});

// ── Filtres liste ─────────────────────────────────────────────────────────────
export const managerListFiltersSchema = z.object({
  status: z.enum(['active', 'inactive', 'locked']).optional(),
  search: z.string().max(100).optional(),
  page:   z.coerce.number().int().min(1).default(1),
  limit:  z.coerce.number().int().min(1).max(100).default(20),
});

// ── Param UUID ────────────────────────────────────────────────────────────────
export const managerIdParamSchema = z.object({
  id: z.string().uuid('ID gestionnaire invalide'),
});

// ── Types inférés ─────────────────────────────────────────────────────────────
export type CreateManagerInput       = z.infer<typeof createManagerSchema>;
export type ChangeManagerStatusInput = z.infer<typeof changeManagerStatusSchema>;
export type ManagerListFiltersInput  = z.infer<typeof managerListFiltersSchema>;
