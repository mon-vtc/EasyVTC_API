// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Admin
// Sprint 3 — EazyVTC
//
// Base : /admin
//
// ── Gestionnaires (admin uniquement sauf lecture) ─────────────────────────────
// POST   /admin/managers                         → Créer un gestionnaire    (admin)
// GET    /admin/managers                         → Lister les gestionnaires (admin + manager)
// GET    /admin/managers/:id                     → Détail gestionnaire      (admin + manager)
// PATCH  /admin/managers/:id/status              → Changer statut           (admin)
//
// ── Utilisateurs (admin uniquement) ──────────────────────────────────────────
// GET    /admin/users                            → Lister tous les users    (admin)
// PATCH  /admin/users/:id/status                 → Changer statut user      (admin)
//
// ── Réservations (admin + manager) ───────────────────────────────────────────
// GET    /admin/reservations                     → Vue globale réservations (admin + manager)
// GET    /admin/reservations/drivers/available   → Chauffeurs disponibles   (admin + manager)
// POST   /admin/reservations/:id/assign          → Affecter un chauffeur    (admin + manager)
//
// ── Statistiques (admin uniquement) ──────────────────────────────────────────
// GET    /admin/stats                            → Dashboard statistiques   (admin)
// ══════════════════════════════════════════════════════════════════════════════

import { Router }          from 'express';
import { adminController } from './admin.controller.js';
import { authMiddleware }  from '../../middlewares/auth.middleware.js';
import { requireAdmin, requireStaff } from '../../middlewares/role.middleware.js';

const router = Router();

// Toutes les routes exigent un JWT valide
router.use(authMiddleware);

// ── Gestionnaires ─────────────────────────────────────────────────────────────

router.post(
  '/managers',
  requireAdmin,
  (req, res) => adminController.createManager(req, res),
);

router.get(
  '/managers',
  requireStaff,
  (req, res) => adminController.listManagers(req, res),
);

router.get(
  '/managers/:id',
  requireStaff,
  (req, res) => adminController.getManagerById(req, res),
);

router.patch(
  '/managers/:id/status',
  requireAdmin,
  (req, res) => adminController.changeManagerStatus(req, res),
);

// ── Utilisateurs ──────────────────────────────────────────────────────────────

router.get(
  '/users',
  requireAdmin,
  (req, res) => adminController.listUsers(req, res),
);

router.patch(
  '/users/:id/status',
  requireAdmin,
  (req, res) => adminController.changeUserStatus(req, res),
);

// ── Réservations ──────────────────────────────────────────────────────────────

router.get(
  '/reservations',
  requireStaff,
  (req, res) => adminController.listReservations(req, res),
);

// Doit être avant /:id pour éviter le shadow de la route
router.get(
  '/reservations/drivers/available',
  requireStaff,
  (req, res) => adminController.getAvailableDrivers(req, res),
);

router.post(
  '/reservations/:id/assign',
  requireStaff,
  (req, res) => adminController.assignDriver(req, res),
);

// ── Statistiques ──────────────────────────────────────────────────────────────

router.get(
  '/stats',
  requireAdmin,
  (req, res) => adminController.getStats(req, res),
);

export default router;
