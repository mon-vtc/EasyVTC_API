// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Véhicules
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireRole, requireAdmin } from '../../middlewares/role.middleware.js';
import * as controller from './vehicles.controller.js';

// ── Configuration Multer (images uniquement) ──────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 Mo max
  },
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowedMimes = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format non supporté. Formats acceptés: JPG, PNG, WebP'));
    }
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// ROUTE PUBLIQUE — /vehicle-types
// ══════════════════════════════════════════════════════════════════════════════

export const vehicleTypesRoutes = Router();

vehicleTypesRoutes.get(
  '/',
  (req, res) => controller.getVehicleTypes(req, res)
);

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES CHAUFFEUR — /drivers/vehicles
// ══════════════════════════════════════════════════════════════════════════════

export const vehiclesRoutes = Router();

vehiclesRoutes.use(authMiddleware);

vehiclesRoutes.post(
  '/',
  requireRole('driver'),
  (req, res) => controller.createVehicle(req, res)
);

vehiclesRoutes.post(
  '/:id/photo',
  requireRole('driver'),
  upload.single('photo'),
  (req, res) => controller.uploadVehiclePhoto(req, res)
);

vehiclesRoutes.get(
  '/',
  requireRole('driver'),
  (req, res) => controller.getMyVehicles(req, res)
);

vehiclesRoutes.get(
  '/:id',
  requireRole('driver'),
  (req, res) => controller.getMyVehicle(req, res)
);

vehiclesRoutes.patch(
  '/:id',
  requireRole('driver'),
  (req, res) => controller.updateVehicle(req, res)
);

vehiclesRoutes.delete(
  '/:id',
  requireRole('driver'),
  (req, res) => controller.deleteVehicle(req, res)
);

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES ADMIN — /admin/vehicles
// ══════════════════════════════════════════════════════════════════════════════

export const adminVehiclesRoutes = Router();

adminVehiclesRoutes.use(authMiddleware);
adminVehiclesRoutes.use(requireAdmin);

adminVehiclesRoutes.get(
  '/',
  (req, res) => controller.getAllVehicles(req, res)
);

adminVehiclesRoutes.get(
  '/:id',
  (req, res) => controller.getVehicleById(req, res)
);
