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
}

export const notificationsController = new NotificationsController();
