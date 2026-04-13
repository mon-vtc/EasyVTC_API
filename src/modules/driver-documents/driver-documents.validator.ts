// ══════════════════════════════════════════════════════════════════════════════
// VALIDATORS — Module Documents Chauffeur
// Sprint 2 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

// ── Types de documents autorisés ─────────────────────────────────────────────
const documentTypes = [
  'license', 'vtc_card', 'medical_visit', 'rc_pro', 'kbis',
  'vtc_register', 'rir', 'id_card', 'vehicle_insurance', 'grey_card',
] as const;
const documentStatuses = ['pending', 'validated', 'rejected', 'expired'] as const;

// ── Upload document ──────────────────────────────────────────────────────────
export const uploadDocumentSchema = z.object({
  doc_type: z.enum(documentTypes, {
    error: 'Type de document invalide. Valeurs acceptées: license, vtc_card, medical_visit, rc_pro, kbis, vtc_register, rir, id_card, vehicle_insurance, grey_card',
  }),
  expiry_date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Format de date invalide. Utilisez YYYY-MM-DD')
    .refine((date) => {
      const d = new Date(date);
      return d > new Date();
    }, 'La date d\'expiration doit être dans le futur')
    .optional(),
});

// ── Rejet document (admin) ───────────────────────────────────────────────────
export const rejectDocumentSchema = z.object({
  reason: z
    .string()
    .min(10, 'Le motif de rejet doit contenir au moins 10 caractères')
    .max(500, 'Le motif de rejet ne peut pas dépasser 500 caractères'),
});

// ── Filtres liste documents (admin) ──────────────────────────────────────────
export const documentListFiltersSchema = z.object({
  status: z.enum(documentStatuses).optional(),
  doc_type: z.enum(documentTypes).optional(),
  driver_id: z.string().uuid('ID chauffeur invalide').optional(),
  expiring_soon: z
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

// ── Validation UUID param ────────────────────────────────────────────────────
export const documentIdParamSchema = z.object({
  id: z.string().uuid('ID document invalide'),
});

// ── Types exportés ───────────────────────────────────────────────────────────
export type UploadDocumentInput = z.infer<typeof uploadDocumentSchema>;
export type RejectDocumentInput = z.infer<typeof rejectDocumentSchema>;
export type DocumentListFiltersInput = z.infer<typeof documentListFiltersSchema>;
