import { Router } from 'express';
import { adminController } from './admin.controller.js';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireAdmin, requireStaff } from '../../middlewares/role.middleware.js';

const router = Router();

// Toutes les routes nécessitent une authentification
router.use(authMiddleware);

// ── Gestionnaires (admin uniquement) ─────────────────────────────────────────
router.post(
  '/managers',
  requireAdmin,
  (req, res) => adminController.createManager(req, res),
);

// ── Utilisateurs (admin uniquement) ──────────────────────────────────────────
router.get(
  '/users',
  requireAdmin,
  (req, res) => adminController.listUsers(req, res),
);

router.get(
  '/users/:id',
  requireAdmin,
  (req, res) => adminController.getUserById(req, res),
);

router.put(
  '/users/:id/status',
  requireAdmin,
  (req, res) => adminController.changeUserStatus(req, res),
);

// ── Réservations (admin + manager) ───────────────────────────────────────────
router.get(
  '/reservations',
  requireStaff,
  (req, res) => adminController.listReservations(req, res),
);

router.get(
  '/reservations/:id',
  requireStaff,
  (req, res) => adminController.getReservationById(req, res),
);

router.put(
  '/reservations/:id/assign',
  requireStaff,
  (req, res) => adminController.assignDriver(req, res),
);

// ── Statistiques (admin uniquement) ──────────────────────────────────────────
router.get(
  '/stats',
  requireAdmin,
  (req, res) => adminController.getStats(req, res),
);

export default router;