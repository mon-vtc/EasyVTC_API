// ══════════════════════════════════════════════════════════════════════════════
// VALIDATORS — Module Marketing
// Sprint 6 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

const campaignTypes = ['email', 'sms', 'push'] as const;

// ── Création d'une campagne ───────────────────────────────────────────────────
export const createCampaignSchema = z.object({
  name: z.string().min(2, 'Le nom doit contenir au moins 2 caractères').max(200),
  type: z.enum(campaignTypes, {
    error: 'Type invalide. Valeurs acceptées : email, sms, push',
  }),
  subject: z.string().max(500).optional(),
  body: z.string().min(1, 'Le contenu du message est requis').max(5000),
}).refine(
  (d) => d.type !== 'email' || (d.subject && d.subject.length > 0),
  { message: 'L\'objet (subject) est requis pour une campagne email', path: ['subject'] },
);

// ── Mise à jour d'une campagne (brouillon uniquement) ─────────────────────────
export const updateCampaignSchema = z.object({
  name:    z.string().min(2).max(200).optional(),
  subject: z.string().max(500).nullable().optional(),
  body:    z.string().min(1).max(5000).optional(),
}).refine(
  (d) => Object.keys(d).length > 0,
  { message: 'Au moins un champ doit être fourni pour la mise à jour' },
);

// ── Paramètre UUID ────────────────────────────────────────────────────────────
export const campaignIdParamSchema = z.object({
  id: z.string().uuid('ID de campagne invalide'),
});

// ── Filtres liste campagnes ───────────────────────────────────────────────────
export const campaignListFiltersSchema = z.object({
  page:  z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

// ── Filtres base clients ──────────────────────────────────────────────────────
export const clientBaseFiltersSchema = z.object({
  search:  z.string().max(100).optional(),
  consent: z.enum(['email', 'sms', 'push']).optional(),
  page:    z.coerce.number().int().min(1).default(1),
  limit:   z.coerce.number().int().min(1).max(100).default(20),
});

// ── Consentements marketing (mis à jour par l'utilisateur) ───────────────────
export const updateMarketingConsentsSchema = z.object({
  marketing_email_opt_in: z.boolean().optional(),
  marketing_sms_opt_in:   z.boolean().optional(),
  marketing_push_opt_in:  z.boolean().optional(),
}).refine(
  (d) => Object.keys(d).length > 0,
  { message: 'Au moins un consentement doit être fourni' },
);

// ── Types inférés ─────────────────────────────────────────────────────────────
export type CreateCampaignInput          = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput          = z.infer<typeof updateCampaignSchema>;
export type CampaignListFiltersInput     = z.infer<typeof campaignListFiltersSchema>;
export type ClientBaseFiltersInput       = z.infer<typeof clientBaseFiltersSchema>;
export type UpdateMarketingConsentsInput = z.infer<typeof updateMarketingConsentsSchema>;
