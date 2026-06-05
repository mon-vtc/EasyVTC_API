// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Destinations Favorites
// Sprint 6 — EazyVTC
//
// Montage dans app.ts :
//   app.use('/users', favoritesRouter)
//
// Endpoints résultants :
//   GET    /users/:id/favorites          Client (soi-même) / Admin : lister les favoris
//   POST   /users/:id/favorites          Client (soi-même) : ajouter un favori (max 20)
//   DELETE /users/:id/favorites/:favId   Client (soi-même) / Admin : supprimer un favori
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireRole } from '../../middlewares/role.middleware.js';
import { favoritesController } from './favorites.controller.js';

export const favoritesRouter = Router();

favoritesRouter.use(authMiddleware);

// Seuls les clients et les admins accèdent aux favoris
favoritesRouter.get(
  '/:id/favorites',
  requireRole('client', 'admin'),
  (req, res) => favoritesController.list(req, res),
);

favoritesRouter.post(
  '/:id/favorites',
  requireRole('client', 'admin'),
  (req, res) => favoritesController.create(req, res),
);

favoritesRouter.delete(
  '/:id/favorites/:favId',
  requireRole('client', 'admin'),
  (req, res) => favoritesController.delete(req, res),
);
