// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Drivers
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireRole, requireAdmin } from '../../middlewares/role.middleware.js';
import * as controller from './drivers.controller.js';

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES CHAUFFEUR — /drivers/me
// ══════════════════════════════════════════════════════════════════════════════

export const driversSelfRoutes = Router();

driversSelfRoutes.use(authMiddleware);
driversSelfRoutes.use(requireRole('driver'));

// Profil
driversSelfRoutes.get(
  '/me',
  (req, res) => controller.getMyProfile(req, res)
);

driversSelfRoutes.patch(
  '/me',
  (req, res) => controller.updateMyProfile(req, res)
);

// Statut en ligne
driversSelfRoutes.patch(
  '/me/online',
  (req, res) => controller.setOnlineStatus(req, res)
);

// Planning (hebdo / mensuel)
driversSelfRoutes.get(
  '/me/planning',
  (req, res) => controller.getMyPlanning(req, res)
);

// Revenus (hebdo / mensuel / total)
driversSelfRoutes.get(
  '/me/revenues',
  (req, res) => controller.getMyRevenues(req, res)
);

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES ADMIN — /admin/drivers
// ══════════════════════════════════════════════════════════════════════════════

export const adminDriversRoutes = Router();

adminDriversRoutes.use(authMiddleware);
adminDriversRoutes.use(requireAdmin);

// Liste paginée
adminDriversRoutes.get(
  '/',
  (req, res) => controller.listDrivers(req, res)
);

// Détail par ID
adminDriversRoutes.get(
  '/:id',
  (req, res) => controller.getDriverById(req, res)
);

// Mise à jour admin (tva_rate, siret, zone, vehicle_type)
adminDriversRoutes.patch(
  '/:id',
  (req, res) => controller.adminUpdateDriver(req, res)
);

// Changement de statut (valider / rejeter / suspendre)
adminDriversRoutes.patch(
  '/:id/status',
  (req, res) => controller.changeDriverStatus(req, res)
);
