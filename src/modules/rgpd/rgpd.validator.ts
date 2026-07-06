// ══════════════════════════════════════════════════════════════════════════════
// VALIDATORS — Module RGPD
// Sprint 7 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { z } from 'zod';

// ── Paramètre :id (userId) ────────────────────────────────────────────────────
export const userIdParamSchema = z.object({
  id: z.string().uuid("ID d'utilisateur invalide"),
});

// ── Corps de la demande d'anonymisation ───────────────────────────────────────
// Double confirmation obligatoire pour éviter les suppressions accidentelles
export const anonymizeSchema = z.object({
  confirm: z.literal(true, {
    error: 'Vous devez confirmer explicitement : { "confirm": true }',
  }),
  password: z.string().min(1, {
    error: 'Le mot de passe est requis pour confirmer la suppression.',
  }),
});

export type UserIdParamInput = z.infer<typeof userIdParamSchema>;
export type AnonymizeInput   = z.infer<typeof anonymizeSchema>;
