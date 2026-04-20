// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Admin (Gestion des gestionnaires)
// Sprint 3 — EazyVTC
//
// Base : /admin/managers
//
// POST   /admin/managers           → Créer un gestionnaire         (admin)
// GET    /admin/managers           → Lister les gestionnaires      (admin + manager)
// GET    /admin/managers/:id       → Détail d'un gestionnaire      (admin + manager)
// PATCH  /admin/managers/:id/status → Changer le statut             (admin)
// ══════════════════════════════════════════════════════════════════════════════

import { Router }          from 'express';
import { adminController } from './admin.controller.js';
import { authMiddleware }  from '../../middlewares/auth.middleware.js';
import { requireAdmin, requireStaff } from '../../middlewares/role.middleware.js';

const router = Router();

// Toutes les routes exigent un JWT valide
router.use(authMiddleware);

// ── Création (admin uniquement) ───────────────────────────────────────────────
router.post(
  '/',
  requireAdmin,
  (req, res) => adminController.createManager(req, res),
);

// ── Lecture (admin + manager) ─────────────────────────────────────────────────
router.get(
  '/',
  requireStaff,
  (req, res) => adminController.listManagers(req, res),
);

router.get(
  '/:id',
  requireStaff,
  (req, res) => adminController.getManagerById(req, res),
);

// ── Changement de statut (admin uniquement) ───────────────────────────────────
router.patch(
  '/:id/status',
  requireAdmin,
  (req, res) => adminController.changeManagerStatus(req, res),
);

export default router;
