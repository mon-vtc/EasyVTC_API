// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module RGPD
// Sprint 7 — EasyVTC
//
// Montage dans app.ts :
//   app.use('/users', rgpdRouter)
//
// Endpoints résultants :
//   GET    /users/:id/data-export   Authentifié (soi-même ou admin) : export JSON
//   DELETE /users/:id/anonymize     Authentifié (soi-même ou admin) : effacement RGPD
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { rgpdController } from './rgpd.controller.js';

export const rgpdRouter = Router();

rgpdRouter.use(authMiddleware);

rgpdRouter.get(
  '/:id/data-export',
  (req, res) => rgpdController.exportData(req, res),
);

rgpdRouter.delete(
  '/:id/anonymize',
  (req, res) => rgpdController.anonymize(req, res),
);
