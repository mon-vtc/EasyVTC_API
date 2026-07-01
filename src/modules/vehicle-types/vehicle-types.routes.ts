// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Vehicle Types
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireAdmin } from '../../middlewares/role.middleware.js';
import * as controller from './vehicle-types.controller.js';

// ── Route publique : GET /vehicle-types ───────────────────────────────────────
export const vehicleTypesPublicRoutes = Router();

vehicleTypesPublicRoutes.get(
  '/',
  (req, res) => controller.getActiveTypes(req, res)
);

// ── Routes admin : /admin/vehicle-types ───────────────────────────────────────
export const vehicleTypesAdminRoutes = Router();

vehicleTypesAdminRoutes.use(authMiddleware);
vehicleTypesAdminRoutes.use(requireAdmin);

vehicleTypesAdminRoutes.get(
  '/',
  (req, res) => controller.getAllTypes(req, res)
);

vehicleTypesAdminRoutes.get(
  '/:id',
  (req, res) => controller.getTypeById(req, res)
);

vehicleTypesAdminRoutes.post(
  '/',
  (req, res) => controller.createType(req, res)
);

vehicleTypesAdminRoutes.patch(
  '/:id',
  (req, res) => controller.updateType(req, res)
);

vehicleTypesAdminRoutes.delete(
  '/:id',
  (req, res) => controller.deleteType(req, res)
);
