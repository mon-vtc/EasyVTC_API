// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Bons de commande (Orders)
// Sprint 4 — EasyVTC
//
// ADMIN / MANAGER
//   GET  /orders                              Liste de tous les bons
//
// CLIENT
//   GET  /orders/mine                         Ses propres bons de commande
//
// CHAUFFEUR
//   GET  /orders/driver/mine                  Ses propres bons de commande
//
// TOUS (accès contrôlé par rôle dans le service)
//   GET  /orders/by-reservation/:reservationId   Bon d'une réservation précise
//   GET  /orders/:id                          Détail d'un bon
//   GET  /orders/:id/pdf                      Redirection vers le PDF (URL signée 1h)
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireRole, requireStaff, requireDriver, requirePermission } from '../../middlewares/role.middleware.js';
import { ordersController } from './orders.controller.js';

const router = Router();

router.use(authMiddleware);

// ── Routes admin / manager ────────────────────────────────────────────────────
router.get('/', requireStaff, requirePermission('view_orders'), (req, res) => ordersController.listAll(req, res));

// ── Routes client ─────────────────────────────────────────────────────────────
router.get('/mine', requireRole('client'), (req, res) => ordersController.listMine(req, res));

// ── Routes chauffeur ──────────────────────────────────────────────────────────
router.get('/driver/mine', requireDriver, (req, res) => ordersController.listDriverMine(req, res));

// ── Routes communes ───────────────────────────────────────────────────────────

// Bon d'une réservation (avant /:id pour éviter le conflit de paramètre)
router.get(
  '/by-reservation/:reservationId',
  requireRole('client', 'driver', 'admin', 'manager'),
  (req, res) => ordersController.getByReservation(req, res),
);

// URL signée du PDF (avant /:id)
router.get(
  '/:id/pdf',
  requireRole('client', 'driver', 'admin', 'manager'),
  (req, res) => ordersController.getPdf(req, res),
);

// Détail d'un bon
router.get(
  '/:id',
  requireRole('client', 'driver', 'admin', 'manager'),
  (req, res) => ordersController.getById(req, res),
);

export default router;
