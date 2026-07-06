// ══════════════════════════════════════════════════════════════════════════════
// VALIDATORS — Module Bons de commande (Orders)
// Sprint 4 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

// ── Params UUID ───────────────────────────────────────────────────────────────

export const orderIdParamSchema = z.object({
  id: z.string().uuid('ID de bon de commande invalide'),
});

// ── Filtres liste (admin) ─────────────────────────────────────────────────────

export const orderListFiltersSchema = z.object({
  reservation_id: z.string().uuid().optional(),
  page:  z.string().default('1').transform((v) => parseInt(v, 10)).refine((v) => v >= 1),
  limit: z.string().default('20').transform((v) => parseInt(v, 10)).refine((v) => v >= 1 && v <= 100),
});

// ── Types inférés ─────────────────────────────────────────────────────────────

export type OrderIdParam          = z.infer<typeof orderIdParamSchema>;
export type OrderListFiltersInput = z.infer<typeof orderListFiltersSchema>;
