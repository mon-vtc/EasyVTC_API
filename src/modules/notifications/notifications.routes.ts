// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Notifications
// Sprint 3 — EasyVTC
//
// Toutes les routes sont protégées (authMiddleware).
// Les notifications sont personnelles : chaque utilisateur ne voit que les siennes.
//
// POST   /notifications/token         → Enregistrer le token FCM de l'appareil
// DELETE /notifications/token         → Supprimer le token FCM
// GET    /notifications               → Liste des notifications (paginée)
// PATCH  /notifications/read-all      → Tout marquer comme lu
// PATCH  /notifications/:id/read      → Marquer une notification comme lue
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireStaff } from '../../middlewares/role.middleware.js';
import { requireCronSecret } from '../../middlewares/cron.middleware.js';
import { notificationsController } from './notifications.controller.js';

const router = Router();

// Toutes les routes notifications nécessitent une authentification
router.use(authMiddleware);

// Token FCM — gestion de l'appareil mobile
router.post  ('/token', (req, res) => notificationsController.registerToken(req, res));
router.delete('/token', (req, res) => notificationsController.removeToken(req, res));

// Notifications — lecture et gestion
router.get  ('/',            (req, res) => notificationsController.list(req, res));
router.patch('/read-all',    (req, res) => notificationsController.markAllAsRead(req, res));
router.patch('/:id/read',    (req, res) => notificationsController.markAsRead(req, res));

// Envoi manuel (admin/manager uniquement)
router.post('/send', requireStaff, (req, res) => notificationsController.send(req, res));

export default router;

// ── Routes cron (montées sur /cron/notifications dans app.ts) ────────────────
//
// Fréquences recommandées (Railway Cron ou GitHub Actions) :
//   reminders              → toutes les 15min   (fenêtres glissantes 1h client)
//   driver-reminders       → toutes les 15min   (fenêtres J-1 / H-2 / H-30min)
//   pending-documents      → toutes les 12h     (escalade docs non traités)
//   unassigned-reservations → chaque soir 20h   (courses J+1 sans chauffeur)
//   weekly-digest          → lundi 8h (1×/semaine)
import { Router as CronRouter } from 'express';
export const cronNotificationsRouter = CronRouter();

cronNotificationsRouter.post('/reminders',               requireCronSecret, (req, res) => notificationsController.sendTripReminders(req, res));
cronNotificationsRouter.post('/driver-reminders',        requireCronSecret, (req, res) => notificationsController.sendDriverReminders(req, res));
cronNotificationsRouter.post('/pending-documents',       requireCronSecret, (req, res) => notificationsController.sendPendingDocumentsDigest(req, res));
cronNotificationsRouter.post('/unassigned-reservations', requireCronSecret, (req, res) => notificationsController.sendUnassignedReservationsAlert(req, res));
cronNotificationsRouter.post('/weekly-digest',           requireCronSecret, (req, res) => notificationsController.sendWeeklyDigest(req, res));
