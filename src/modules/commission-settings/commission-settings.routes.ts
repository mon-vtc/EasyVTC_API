// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Commission Settings
// Sprint 6 — EazyVTC
//
// Montage dans app.ts :
//   app.use('/admin/commission-settings', commissionSettingsRouter);
//   app.use('/admin/commissions',         commissionsReportingRouter);
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireAdmin } from '../../middlewares/role.middleware.js';
import * as controller from './commission-settings.controller.js';

// ── Paramétrage des taux ──────────────────────────────────────────────────────
// /admin/commission-settings
export const commissionSettingsRouter = Router();
commissionSettingsRouter.use(authMiddleware, requireAdmin);

commissionSettingsRouter.get(  '/',    (req, res) => controller.listSettings(req, res));
commissionSettingsRouter.get(  '/:id', (req, res) => controller.getSettingById(req, res));
commissionSettingsRouter.post( '/',    (req, res) => controller.createSetting(req, res));
commissionSettingsRouter.patch('/:id', (req, res) => controller.updateSetting(req, res));
commissionSettingsRouter.delete('/:id',(req, res) => controller.deleteSetting(req, res));

// ── Reporting commissions ────────────────────────────────────────────────────
// /admin/commissions
export const commissionsReportingRouter = Router();
commissionsReportingRouter.use(authMiddleware, requireAdmin);

// Résumé agrégé (revenus plateforme sur une période)
commissionsReportingRouter.get('/summary', (req, res) => controller.getCommissionSummary(req, res));
// Liste détaillée des commissions par course
commissionsReportingRouter.get('/',        (req, res) => controller.listCommissions(req, res));
