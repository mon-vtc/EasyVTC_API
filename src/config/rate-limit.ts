// ══════════════════════════════════════════════════════════════════════════════
// RATE LIMITING — Configuration des limiteurs par palier de risque
// ══════════════════════════════════════════════════════════════════════════════

import rateLimit from 'express-rate-limit';

// Réponse JSON uniforme (cohérente avec le format { ok, message } de l'API)
const json = (msg: string) => ({ ok: false, message: msg });

// ── Palier 1 — Limiteur global (toutes routes) ────────────────────────────────
// Protection large-spectre contre les bots et le scraping.
// 200 req / 15 min est généreux pour un usage normal.
export const globalLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,   // 15 minutes
  limit:           200,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  message:         json('Trop de requêtes. Réessayez dans quelques minutes.'),
});

// ── Palier 2 — Authentification sensible (brute-force) ───────────────────────
// Login, forgot-password, reset-password : cibles classiques du brute-force.
// 10 tentatives / 15 min = ~40/heure max par IP.
export const authStrictLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  limit:           10,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  message:         json('Trop de tentatives. Réessayez dans 15 minutes.'),
});

// ── Palier 3 — Inscription (anti-spam) ───────────────────────────────────────
// Limite la création de comptes en masse depuis une même IP.
export const registerLimiter = rateLimit({
  windowMs:        60 * 60 * 1000,   // 1 heure
  limit:           5,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  message:         json('Trop de créations de compte depuis cette IP. Réessayez dans 1 heure.'),
});

// ── Palier 4 — Validation code promo (anti-abus) ────────────────────────────
// Évite la découverte par force brute des codes actifs.
export const promoValidateLimiter = rateLimit({
  windowMs:        15 * 60 * 1000,
  limit:           20,
  standardHeaders: 'draft-7',
  legacyHeaders:   false,
  message:         json('Trop de tentatives de validation de code promo. Réessayez dans 15 minutes.'),
});
