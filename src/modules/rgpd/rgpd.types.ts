// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module RGPD
// Sprint 7 — EasyVTC
// Conformité : France (RGPD) + Sénégal (loi 2008-12 CDP)
// ══════════════════════════════════════════════════════════════════════════════

// ── Export complet des données personnelles ───────────────────────────────────
export interface RgpdExport {
  exported_at: string;
  user_id: string;
  legal_basis: string;

  // Données de profil
  profile: Record<string, unknown> | null;
  driver_profile: Record<string, unknown> | null;

  // Historique des activités
  reservations: unknown[];
  orders: unknown[];
  favorites: unknown[];
  ratings_given: unknown[];
  notifications: unknown[];
  chat_messages: unknown[];
}

// ── Résultat de l'anonymisation ───────────────────────────────────────────────
export interface AnonymizeResult {
  user_id: string;
  anonymized_at: string;
  message: string;
}
