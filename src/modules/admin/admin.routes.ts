// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Admin
// Sprint 3 (users/managers) → Sprint 5-7 (réservations, stats)
//
// GET  /admin/users                     → Liste des utilisateurs (hors admins)
// PUT  /admin/users/:id/status          → Activer / suspendre un compte
// POST /admin/managers                  → Créer un compte gestionnaire
// GET  /admin/reservations              → Vue globale des réservations (S5)
// PUT  /admin/reservations/:id/assign   → Attribution manuelle (S5)
// GET  /admin/stats                     → Statistiques globales (S7)
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireAdmin, requireStaff } from '../../middlewares/role.middleware.js';
import { usersController } from '../users/users.controller.js';
import { adminController } from './admin.controller.js';

const router = Router();
router.use(authMiddleware);

// ── Gestion des utilisateurs ─────────────────────────────────────────────────
router.get( '/users',            requireAdmin, (req, res) => usersController.listUsers(req, res));
router.put( '/users/:id/status', requireAdmin, (req, res) => usersController.changeUserStatus(req, res));

// ── Gestion des gestionnaires ─────────────────────────────────────────────────
router.get(   '/managers',                    requireAdmin, (req, res) => adminController.listManagers(req, res));
router.post(  '/managers',                    requireAdmin, (req, res) => adminController.createManager(req, res));
router.get(   '/managers/:id',                requireAdmin, (req, res) => adminController.getManagerById(req, res));
router.patch( '/managers/:id',                requireAdmin, (req, res) => adminController.updateManager(req, res));
router.patch( '/managers/:id/status',         requireAdmin, (req, res) => adminController.changeManagerStatus(req, res));
router.delete('/managers/:id',                requireAdmin, (req, res) => adminController.deleteManager(req, res));
router.get(   '/managers/:id/permissions',    requireAdmin, (req, res) => adminController.getManagerPermissions(req, res));
router.put(   '/managers/:id/permissions',    requireAdmin, (req, res) => adminController.setManagerPermissions(req, res));

// ── Gestion des clients ───────────────────────────────────────────────────────
router.get('/clients',            requireAdmin, (req, res) => adminController.listClients(req, res));
router.get('/clients/:id',        requireAdmin, (req, res) => adminController.getClientById(req, res));
router.get('/clients/:id/trips',  requireAdmin, (req, res) => adminController.getClientTrips(req, res));

// ── Réservations & statistiques — Sprint 5-7 ─────────────────────────────────
router.get('/reservations',            requireStaff, (_req, res) => res.status(501).json({ ok: false, message: 'Not implemented' }));
router.put('/reservations/:id/assign', requireStaff, (_req, res) => res.status(501).json({ ok: false, message: 'Not implemented' }));
router.get('/stats',                   requireAdmin, (_req, res) => res.status(501).json({ ok: false, message: 'Not implemented' }));

export default router;
