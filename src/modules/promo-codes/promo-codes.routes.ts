// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Codes Promo
// Sprint 6 — EasyVTC
//
// Montage dans app.ts :
//   app.use('/admin/promo-codes', adminPromoCodesRouter)
//   app.use('/promo-codes',       promoCodesPublicRouter)
//
// Endpoints résultants :
//   GET    /admin/promo-codes                  Admin : liste paginée
//   GET    /admin/promo-codes/:id              Admin : détail d'un code
//   POST   /admin/promo-codes                  Admin : créer un code (public ou assigné)
//   POST   /admin/promo-codes/:id/bulk-assign  Admin : générer N codes depuis un radical
//   PATCH  /admin/promo-codes/:id              Admin : modifier un code
//   DELETE /admin/promo-codes/:id              Admin : supprimer un code
//   GET    /promo-codes/mine                   Client : codes actifs + expirés + économies totales
//   POST   /promo-codes/validate               Client : vérifier un code avant réservation
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireAdmin, requireRole } from '../../middlewares/role.middleware.js';
import { promoValidateLimiter } from '../../config/rate-limit.js';
import { promoCodesController } from './promo-codes.controller.js';

// ── Routes admin ──────────────────────────────────────────────────────────────
export const adminPromoCodesRouter = Router();
adminPromoCodesRouter.use(authMiddleware);
adminPromoCodesRouter.use(requireAdmin);

adminPromoCodesRouter.get(
  '/',
  (req, res) => promoCodesController.list(req, res),
);

adminPromoCodesRouter.get(
  '/:id',
  (req, res) => promoCodesController.getById(req, res),
);

adminPromoCodesRouter.post(
  '/',
  (req, res) => promoCodesController.create(req, res),
);

adminPromoCodesRouter.post(
  '/:id/bulk-assign',
  (req, res) => promoCodesController.bulkAssign(req, res),
);

adminPromoCodesRouter.patch(
  '/:id',
  (req, res) => promoCodesController.update(req, res),
);

adminPromoCodesRouter.delete(
  '/:id',
  (req, res) => promoCodesController.delete(req, res),
);

// ── Routes client ─────────────────────────────────────────────────────────────
export const promoCodesPublicRouter = Router();
promoCodesPublicRouter.use(authMiddleware);
promoCodesPublicRouter.use(requireRole('client'));

// GET /promo-codes/mine  — Liste des codes actifs + expirés + économies totales
promoCodesPublicRouter.get(
  '/mine',
  (req, res) => promoCodesController.mine(req, res),
);

// POST /promo-codes/validate  — Vérifier un code avant réservation
promoCodesPublicRouter.post(
  '/validate',
  promoValidateLimiter,
  (req, res) => promoCodesController.validate(req, res),
);
