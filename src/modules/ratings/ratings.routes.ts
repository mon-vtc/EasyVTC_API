// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Évaluations (Ratings)
// Sprint 6 — EasyVTC
//
// Montage dans app.ts :
//   app.use('/reservations',   reservationRatingsRouter)
//   app.use('/drivers',        driverSelfRatingsRouter)
//   app.use('/admin/drivers',  adminDriverRatingsRouter)
//   app.use('/admin/ratings',  adminRatingsRouter)
//
// Endpoints résultants :
//   POST   /reservations/:id/rating        Client : soumettre une note (course terminée)
//   GET    /drivers/me/ratings             Chauffeur : ses propres évaluations
//   GET    /admin/drivers/:id/ratings      Admin/Manager : évaluations d'un chauffeur
//   GET    /admin/ratings                  Admin/Manager : liste globale
//   DELETE /admin/ratings/:id             Admin/Manager : supprimer une évaluation
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireRole, requireAdmin, requireStaff, requireDriver, requirePermission } from '../../middlewares/role.middleware.js';
import { ratingsController } from './ratings.controller.js';

// ── POST /reservations/:id/rating ─────────────────────────────────────────────

export const reservationRatingsRouter = Router();
reservationRatingsRouter.use(authMiddleware);

reservationRatingsRouter.post(
  '/:id/rating',
  requireRole('client'),
  (req, res) => ratingsController.submit(req, res),
);

// ── GET /drivers/me/ratings ───────────────────────────────────────────────────

export const driverSelfRatingsRouter = Router();
driverSelfRatingsRouter.use(authMiddleware);

driverSelfRatingsRouter.get(
  '/me/ratings',
  requireDriver,
  (req, res) => ratingsController.getMyRatings(req, res),
);

// ── GET /admin/drivers/:id/ratings ────────────────────────────────────────────

export const adminDriverRatingsRouter = Router();
adminDriverRatingsRouter.use(authMiddleware);

adminDriverRatingsRouter.get(
  '/:id/ratings',
  requireStaff, requirePermission('view_ratings'),
  (req, res) => ratingsController.getDriverRatings(req, res),
);

// ── GET /admin/ratings + DELETE /admin/ratings/:id ────────────────────────────

export const adminRatingsRouter = Router();
adminRatingsRouter.use(authMiddleware);

adminRatingsRouter.get(
  '/',
  requireStaff, requirePermission('view_ratings'),
  (req, res) => ratingsController.listAll(req, res),
);

// Suppression d'une évaluation : admin uniquement
adminRatingsRouter.delete(
  '/:id',
  requireAdmin,
  (req, res) => ratingsController.deleteRating(req, res),
);
