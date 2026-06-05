// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Codes Promo
// Sprint 6 — EazyVTC
//
// Montage dans app.ts :
//   app.use('/admin/promo-codes', adminPromoCodesRouter)
//   app.use('/promo-codes',       promoCodesPublicRouter)
//
// Endpoints résultants :
//   GET    /admin/promo-codes          Admin : liste paginée
//   GET    /admin/promo-codes/:id      Admin : détail d'un code
//   POST   /admin/promo-codes          Admin : créer un code
//   PATCH  /admin/promo-codes/:id      Admin : modifier un code
//   DELETE /admin/promo-codes/:id      Admin : supprimer un code
//   POST   /promo-codes/validate       Client (auth) : vérifier un code avant réservation
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

adminPromoCodesRouter.patch(
  '/:id',
  (req, res) => promoCodesController.update(req, res),
);

adminPromoCodesRouter.delete(
  '/:id',
  (req, res) => promoCodesController.delete(req, res),
);

// ── Route client — validation avant réservation ───────────────────────────────
export const promoCodesPublicRouter = Router();
promoCodesPublicRouter.use(authMiddleware);

promoCodesPublicRouter.post(
  '/validate',
  promoValidateLimiter,
  requireRole('client'),
  (req, res) => promoCodesController.validate(req, res),
);
