// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module Notifications
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import type { Request, Response } from 'express';
import { notificationsService } from './notifications.service.js';
import {
  registerTokenSchema,
  notificationIdParamSchema,
  notificationListFiltersSchema,
  sendNotificationSchema,
} from './notifications.validator.js';

export class NotificationsController {

  // GET /notifications — Liste des notifications de l'utilisateur connecté
  async list(req: Request, res: Response): Promise<void> {
    const parsed = notificationListFiltersSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Filtres invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const result = await notificationsService.getForUser(req.user!.id, parsed.data);
      res.status(200).json({ ok: true, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // PATCH /notifications/:id/read — Marquer une notification comme lue
  async markAsRead(req: Request, res: Response): Promise<void> {
    const parsed = notificationIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'ID invalide' });
      return;
    }
    try {
      await notificationsService.markAsRead(parsed.data.id, req.user!.id);
      res.status(200).json({ ok: true, message: 'Notification marquée comme lue' });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // PATCH /notifications/read-all — Marquer toutes les notifications comme lues
  async markAllAsRead(req: Request, res: Response): Promise<void> {
    try {
      const result = await notificationsService.markAllAsRead(req.user!.id);
      res.status(200).json({
        ok:      true,
        message: `${result.updated} notification(s) marquée(s) comme lue(s)`,
        data:    result,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // POST /notifications/token — Enregistrer le token FCM de l'appareil mobile
  async registerToken(req: Request, res: Response): Promise<void> {
    const parsed = registerTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      await notificationsService.registerToken(req.user!.id, parsed.data.device_token);
      res.status(200).json({ ok: true, message: 'Token FCM enregistré avec succès' });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // DELETE /notifications/token — Supprimer le token FCM (déconnexion / opt-out)
  async removeToken(req: Request, res: Response): Promise<void> {
    try {
      await notificationsService.removeToken(req.user!.id);
      res.status(200).json({ ok: true, message: 'Token FCM supprimé' });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // POST /notifications/send — Envoi manuel (admin)
  async send(req: Request, res: Response): Promise<void> {
    const parsed = sendNotificationSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ ok: false, message: 'Données invalides', errors: parsed.error.flatten().fieldErrors });
      return;
    }
    try {
      const notif = await notificationsService.send({
        user_id: parsed.data.user_id,
        type:    parsed.data.type,
        channel: 'push',
        title:   parsed.data.title,
        body:    parsed.data.body,
        data:    parsed.data.data as Record<string, string> | undefined,
      });
      res.status(201).json({ ok: true, message: 'Notification envoyée', data: notif });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // POST /cron/notifications/reminders — Rappels 1h avant course client (cron protégé)
  async sendTripReminders(req: Request, res: Response): Promise<void> {
    const cronSecret = req.headers['x-cron-secret'];
    if (!cronSecret || cronSecret !== process.env['CRON_SECRET']) {
      res.status(401).json({ ok: false, message: 'Non autorisé' });
      return;
    }
    try {
      const result = await notificationsService.sendUpcomingTripReminders();
      res.status(200).json({ ok: true, message: `${result.sent} rappel(s) envoyé(s)`, data: result });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // POST /cron/notifications/driver-reminders — 3 séquences de rappels chauffeur
  async sendDriverReminders(req: Request, res: Response): Promise<void> {
    try {
      const result = await notificationsService.sendDriverTripReminders();
      const total = result.sent_24h + result.sent_2h + result.sent_30min;
      res.status(200).json({
        ok: true,
        message: `${total} rappel(s) chauffeur envoyé(s)`,
        data: result,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // POST /cron/notifications/pending-documents — Documents en attente >24h
  async sendPendingDocumentsDigest(req: Request, res: Response): Promise<void> {
    try {
      const result = await notificationsService.sendPendingDocumentsDigest();
      res.status(200).json({
        ok: true,
        message: result.count > 0
          ? `Alerte envoyée — ${result.count} document(s) en attente`
          : 'Aucun document en attente depuis +24h',
        data: result,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // POST /cron/notifications/unassigned-reservations — Courses sans chauffeur demain
  async sendUnassignedReservationsAlert(req: Request, res: Response): Promise<void> {
    try {
      const result = await notificationsService.sendUnassignedReservationsAlert();
      res.status(200).json({
        ok: true,
        message: result.count > 0
          ? `Alerte envoyée — ${result.count} course(s) non assignée(s) demain`
          : 'Toutes les courses de demain ont un chauffeur',
        data: result,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }

  // POST /cron/notifications/weekly-digest — Bilan hebdomadaire admins
  async sendWeeklyDigest(req: Request, res: Response): Promise<void> {
    try {
      const result = await notificationsService.sendWeeklyDigest();
      res.status(200).json({
        ok: true,
        message: 'Bilan hebdomadaire envoyé aux admins',
        data: result,
      });
    } catch (err: unknown) {
      const e = err as { status?: number; message?: string };
      res.status(e.status ?? 500).json({ ok: false, message: e.message ?? 'Erreur serveur' });
    }
  }
}

export const notificationsController = new NotificationsController();
