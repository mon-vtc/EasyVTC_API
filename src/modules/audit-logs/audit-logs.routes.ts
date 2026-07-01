import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireAdmin } from '../../middlewares/role.middleware.js';
import { auditLogsController } from './audit-logs.controller.js';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.get('/',    (req, res) => auditLogsController.list(req, res));
router.get('/:id', (req, res) => auditLogsController.getById(req, res));

export default router;
