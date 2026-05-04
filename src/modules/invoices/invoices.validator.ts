// ══════════════════════════════════════════════════════════════════════════════
// VALIDATORS — Module Factures (Invoices)
// Sprint 4 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

// ── Ajustement de prix (admin) ────────────────────────────────────────────────
export const adjustPriceSchema = z.object({
  new_amount_ttc: z
    .number({ error: 'Le nouveau montant TTC est requis' })
    .positive('Le montant TTC doit être positif')
    .max(99999.99, 'Le montant TTC ne peut pas dépasser 99 999,99'),
  reason: z
    .string()
    .min(10, 'Le motif doit contenir au moins 10 caractères')
    .max(500, 'Le motif ne peut pas dépasser 500 caractères'),
});

// ── Filtres liste ─────────────────────────────────────────────────────────────
export const invoiceListFiltersSchema = z.object({
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

// ── Param UUID ────────────────────────────────────────────────────────────────
export const invoiceIdParamSchema = z.object({
  id: z.string().uuid('ID facture invalide'),
});

// ── Types exportés ────────────────────────────────────────────────────────────
export type AdjustPriceInput        = z.infer<typeof adjustPriceSchema>;
export type InvoiceListFiltersInput = z.infer<typeof invoiceListFiltersSchema>;
