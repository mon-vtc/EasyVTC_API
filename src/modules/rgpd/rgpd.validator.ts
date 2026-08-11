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
// password est optionnel ici : les comptes créés via Google n'ont pas de mot de
// passe fiable connu de l'utilisateur (cf. auth_provider) — rgpd.service.ts
// n'exige le mot de passe que pour les comptes 'password'.
export const anonymizeSchema = z.object({
  confirm: z.literal(true, {
    error: 'Vous devez confirmer explicitement : { "confirm": true }',
  }),
  password: z.string().optional(),
});

export type UserIdParamInput = z.infer<typeof userIdParamSchema>;
export type AnonymizeInput   = z.infer<typeof anonymizeSchema>;
