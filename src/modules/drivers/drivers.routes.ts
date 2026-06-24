// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Drivers
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireRole, requireAdmin, requireStaff, requirePermission } from '../../middlewares/role.middleware.js';
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

// Disponibilité (réservations + indisponibilités fusionnées)
driversSelfRoutes.get(
  '/me/availability',
  (req, res) => controller.getMyAvailability(req, res)
);

// Planning hebdomadaire récurrent (écran "Planifiez vos horaires")
driversSelfRoutes.get(
  '/me/schedule',
  (req, res) => controller.getMySchedule(req, res)
);
driversSelfRoutes.put(
  '/me/schedule',
  (req, res) => controller.setMySchedule(req, res)
);

// Indisponibilités
driversSelfRoutes.get(
  '/me/unavailability',
  (req, res) => controller.getMyUnavailability(req, res)
);
driversSelfRoutes.post(
  '/me/unavailability',
  (req, res) => controller.createMyUnavailability(req, res)
);
driversSelfRoutes.delete(
  '/me/unavailability/:unavailId',
  (req, res) => controller.deleteMyUnavailability(req, res)
);

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES ADMIN — /admin/drivers
// ══════════════════════════════════════════════════════════════════════════════

export const adminDriversRoutes = Router();

adminDriversRoutes.use(authMiddleware);

// Liste paginée — lecture : admin + manager avec view_drivers
adminDriversRoutes.get(
  '/',
  requireStaff, requirePermission('view_drivers'),
  (req, res) => controller.listDrivers(req, res)
);

// Planning d'un chauffeur — lecture : admin + manager avec view_drivers
adminDriversRoutes.get(
  '/:id/planning',
  requireStaff, requirePermission('view_drivers'),
  (req, res) => controller.getDriverPlanningAdmin(req, res)
);

// Revenus d'un chauffeur — lecture : admin + manager avec view_drivers
adminDriversRoutes.get(
  '/:id/revenues',
  requireStaff, requirePermission('view_drivers'),
  (req, res) => controller.getDriverRevenuesAdmin(req, res)
);

// Statistiques mensuelles d'un chauffeur — lecture : admin + manager avec view_drivers
adminDriversRoutes.get(
  '/:id/monthly-stats',
  requireStaff, requirePermission('view_drivers'),
  (req, res) => controller.getDriverMonthlyStats(req, res)
);

// Historique des courses d'un chauffeur — lecture : admin + manager avec view_drivers
adminDriversRoutes.get(
  '/:id/trips-history',
  requireStaff, requirePermission('view_drivers'),
  (req, res) => controller.getDriverTripsHistory(req, res)
);

// Détail par ID — lecture : admin + manager avec view_drivers
adminDriversRoutes.get(
  '/:id',
  requireStaff, requirePermission('view_drivers'),
  (req, res) => controller.getDriverById(req, res)
);

// Mise à jour admin (tva_rate, siret, zone, vehicle_type) — écriture : admin uniquement
adminDriversRoutes.patch(
  '/:id',
  requireAdmin,
  (req, res) => controller.adminUpdateDriver(req, res)
);

// Changement de statut (valider / rejeter / suspendre) — écriture : admin uniquement
adminDriversRoutes.patch(
  '/:id/status',
  requireAdmin,
  (req, res) => controller.changeDriverStatus(req, res)
);

// Planning hebdomadaire récurrent — lecture : admin + manager avec view_drivers
adminDriversRoutes.get(
  '/:id/schedule',
  requireStaff, requirePermission('view_drivers'),
  (req, res) => controller.getDriverScheduleAdmin(req, res)
);

// Disponibilité — lecture : admin + manager avec view_drivers
adminDriversRoutes.get(
  '/:id/availability',
  requireStaff, requirePermission('view_drivers'),
  (req, res) => controller.getDriverAvailabilityAdmin(req, res)
);

// Indisponibilités admin
adminDriversRoutes.get(
  '/:id/unavailability',
  requireStaff, requirePermission('view_drivers'),
  (req, res) => controller.getDriverUnavailabilityAdmin(req, res)
);
adminDriversRoutes.post(
  '/:id/unavailability',
  requireAdmin,
  (req, res) => controller.createDriverUnavailabilityAdmin(req, res)
);
adminDriversRoutes.delete(
  '/:id/unavailability/:unavailId',
  requireAdmin,
  (req, res) => controller.deleteDriverUnavailabilityAdmin(req, res)
);
