// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module App Config
//
// GET  /admin/app-config       → Lire les coordonnées du support
// PUT  /admin/app-config/:key  → Mettre à jour une valeur de configuration
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireAdmin } from '../../middlewares/role.middleware.js';
import { appConfigController } from './app-config.controller.js';

const router = Router();

router.use(authMiddleware);

router.get('/',     requireAdmin, (req, res) => appConfigController.getSupportConfig(req, res));
router.put('/:key', requireAdmin, (req, res) => appConfigController.upsert(req, res));

export default router;
