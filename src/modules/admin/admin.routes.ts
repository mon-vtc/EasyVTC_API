// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Admin
// Sprint 5-7 — EazyVTC
//
// GET  /admin/users                     → Liste des utilisateurs
// PUT  /admin/users/:id/status          → Activer / suspendre un compte
// POST /admin/managers                  → Créer un compte gestionnaire
// GET  /admin/reservations              → Vue globale des réservations
// PUT  /admin/reservations/:id/assign   → Attribution manuelle d'un chauffeur
// GET  /admin/stats                     → Statistiques globales
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireAdmin, requireStaff } from '../../middlewares/role.middleware.js';

const router = Router();

router.use(authMiddleware);

// Placeholder routes — implémentation Sprint 5-7
router.get('/users',                      requireAdmin,  (_req, res) => res.status(501).json({ ok: false, message: 'Not implemented' }));
router.put('/users/:id/status',           requireAdmin,  (_req, res) => res.status(501).json({ ok: false, message: 'Not implemented' }));
router.post('/managers',                  requireAdmin,  (_req, res) => res.status(501).json({ ok: false, message: 'Not implemented' }));
router.get('/reservations',               requireStaff,  (_req, res) => res.status(501).json({ ok: false, message: 'Not implemented' }));
router.put('/reservations/:id/assign',    requireStaff,  (_req, res) => res.status(501).json({ ok: false, message: 'Not implemented' }));
router.get('/stats',                      requireAdmin,  (_req, res) => res.status(501).json({ ok: false, message: 'Not implemented' }));

export default router;
