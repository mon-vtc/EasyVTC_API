// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Réservations
// Sprint 3 — EazyVTC
//
// Circuit complet VTC (application mobile) :
//
// PUBLIC (authentifié)
//   POST   /reservations                     Client : créer une réservation
//   GET    /reservations/mine                Client : ses réservations
//   GET    /reservations/driver/active       Chauffeur : sa course active
//   GET    /reservations/:id                 Tous : détail (contrôle d'accès par rôle)
//   PATCH  /reservations/:id/cancel          Client ou Admin : annuler
//
// CHAUFFEUR UNIQUEMENT
//   PATCH  /reservations/:id/arrive          Signaler l'arrivée au pickup
//   PATCH  /reservations/:id/start           Démarrer la course
//   PATCH  /reservations/:id/complete        Terminer la course
//
// ADMIN / MANAGER UNIQUEMENT
//   GET    /reservations                     Toutes les réservations + filtres
//   POST   /reservations/:id/assign          Affecter un chauffeur
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireRole, requireStaff, requireDriver } from '../../middlewares/role.middleware.js';
import { reservationsController } from './reservations.controller.js';

const router = Router();

// Toutes les routes réservations nécessitent une authentification
router.use(authMiddleware);

// ── Routes client ─────────────────────────────────────────────────────────────

// Créer une réservation (client uniquement)
router.post('/', requireRole('client'), (req, res) => reservationsController.create(req, res));

// Mes réservations (client)
router.get('/mine', requireRole('client'), (req, res) => reservationsController.listMine(req, res));

// ── Routes chauffeur ──────────────────────────────────────────────────────────

// Course active du chauffeur connecté
router.get('/driver/active', requireDriver, (req, res) => reservationsController.getDriverActive(req, res));

// Signaler l'arrivée au point de pickup
router.patch('/:id/arrive', requireDriver, (req, res) => reservationsController.arrive(req, res));

// Démarrer la course (client à bord)
router.patch('/:id/start', requireDriver, (req, res) => reservationsController.start(req, res));

// Terminer la course
router.patch('/:id/complete', requireDriver, (req, res) => reservationsController.complete(req, res));

// ── Routes admin / manager ────────────────────────────────────────────────────

// Liste de toutes les réservations avec filtres
router.get('/', requireStaff, (req, res) => reservationsController.listAll(req, res));

// Affecter un chauffeur à une réservation
router.post('/:id/assign', requireStaff, (req, res) => reservationsController.assign(req, res));

// ── Routes communes ───────────────────────────────────────────────────────────

// Détail d'une réservation (accès contrôlé par rôle dans le service)
router.get('/:id', requireRole('client', 'driver', 'admin', 'manager'), (req, res) =>
  reservationsController.getById(req, res),
);

// Annulation (client sur ses propres courses, admin sur toutes)
router.patch('/:id/cancel', requireRole('client', 'admin', 'manager'), (req, res) =>
  reservationsController.cancel(req, res),
);

export default router;
