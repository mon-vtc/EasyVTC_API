// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Notifications
// Sprint 3 — EazyVTC
//
// Architecture push :
//   - Stockage systématique en BDD (table notifications)
//   - Envoi push via FCM Legacy HTTP API (nécessite FCM_SERVER_KEY dans .env)
//   - Les notifications sont fire-and-forget : elles ne bloquent jamais
//     le flux principal (réservation, assignation…)
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../../database/supabase/client.js';
import { env } from '../../config/env.js';
import type {
  Notification,
  NotificationType,
  CreateNotificationDto,
  NotificationListFilters,
} from './notifications.types.js';

// ══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ══════════════════════════════════════════════════════════════════════════════

export class NotificationsService {

  // ──────────────────────────────────────────────────────────────────────────
  // ENVOI
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Crée la notification en BDD puis l'envoie sur le canal approprié.
   * À appeler depuis d'autres services (reservations, driver-documents…).
   */
  async send(dto: CreateNotificationDto): Promise<Notification> {
    const { data: notif, error } = await supabaseAdmin
      .from('notifications')
      .insert({
        user_id: dto.user_id,
        type:    dto.type,
        channel: dto.channel,
        status:  'pending',
        title:   dto.title,
        body:    dto.body,
        data:    dto.data ?? null,
      })
      .select()
      .single();

    if (error || !notif) {
      throw { status: 500, message: 'Erreur lors de la création de la notification' };
    }

    if (dto.channel === 'push') {
      // Fire-and-forget : l'échec FCM ne remonte pas au caller
      this._dispatchPush(notif.id as string, dto.user_id, dto.title, dto.body, dto.data).catch(
        (err) => console.error('[Notifications] Erreur dispatch push:', err),
      );
    }

    return notif as Notification;
  }

  /**
   * Raccourci pour envoyer une notification push à un utilisateur (fire-and-forget).
   * Ne lève jamais d'erreur — utilisé dans les transitions de statut des réservations.
   */
  sendToUser(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): void {
    this.send({ user_id: userId, type, channel: 'push', title, body, data }).catch(
      (err) => console.error(`[Notifications] Erreur pour user ${userId}:`, err),
    );
  }

  /**
   * Envoie la même notification à plusieurs utilisateurs en parallèle.
   */
  sendToMany(
    userIds: string[],
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): void {
    for (const userId of userIds) {
      this.sendToUser(userId, type, title, body, data);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // LECTURE — API utilisateur (application mobile)
  // ──────────────────────────────────────────────────────────────────────────

  async getForUser(
    userId: string,
    filters: NotificationListFilters,
  ): Promise<{
    notifications: Notification[];
    total: number;
    page: number;
    limit: number;
    unread_count: number;
  }> {
    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 20;
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    let query = supabaseAdmin
      .from('notifications')
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.unread_only) {
      query = query.is('read_at', null);
    }

    const { data, error, count } = await query;
    if (error) throw { status: 500, message: 'Erreur lors de la récupération des notifications' };

    // Compteur de non-lues (indépendant de la pagination)
    const { count: unreadCount } = await supabaseAdmin
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .is('read_at', null);

    return {
      notifications: (data ?? []) as Notification[],
      total:         count ?? 0,
      page,
      limit,
      unread_count:  unreadCount ?? 0,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // MARQUAGE LU
  // ──────────────────────────────────────────────────────────────────────────

  async markAsRead(notificationId: string, userId: string): Promise<void> {
    const { data: existing } = await supabaseAdmin
      .from('notifications')
      .select('id, user_id, read_at')
      .eq('id', notificationId)
      .single();

    if (!existing) throw { status: 404, message: 'Notification introuvable' };
    if (existing.user_id !== userId) throw { status: 403, message: 'Accès refusé' };
    if (existing.read_at) return; // Déjà lue — idempotent

    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('id', notificationId);

    if (error) throw { status: 500, message: 'Erreur lors de la mise à jour' };
  }

  async markAllAsRead(userId: string): Promise<{ updated: number }> {
    const { error, count } = await supabaseAdmin
      .from('notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', userId)
      .is('read_at', null);

    if (error) throw { status: 500, message: 'Erreur lors de la mise à jour' };

    return { updated: count ?? 0 };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TOKEN FCM — Enregistrement device mobile
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Enregistre ou met à jour le token FCM de l'appareil mobile de l'utilisateur.
   * À appeler au démarrage de l'app ou quand FCM génère un nouveau token.
   */
  async registerToken(userId: string, deviceToken: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('users')
      .update({ device_token: deviceToken })
      .eq('id', userId);

    if (error) throw { status: 500, message: "Erreur lors de l'enregistrement du token" };
  }

  /**
   * Supprime le token FCM (déconnexion ou désactivation des notifications).
   */
  async removeToken(userId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('users')
      .update({ device_token: null })
      .eq('id', userId);

    if (error) throw { status: 500, message: 'Erreur lors de la suppression du token' };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Dispatch FCM Legacy HTTP API
  // ──────────────────────────────────────────────────────────────────────────

  private async _dispatchPush(
    notifId:  string,
    userId:   string,
    title:    string,
    body:     string,
    data?:    Record<string, string>,
  ): Promise<void> {
    // Récupérer le device_token de l'utilisateur
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('device_token')
      .eq('id', userId)
      .single();

    if (!user?.device_token) {
      await supabaseAdmin
        .from('notifications')
        .update({ status: 'failed', error_log: 'Aucun device_token enregistré pour cet utilisateur' })
        .eq('id', notifId);
      return;
    }

    if (!env.FCM_SERVER_KEY) {
      console.warn('[Notifications] FCM_SERVER_KEY non configuré — notification non envoyée');
      await supabaseAdmin
        .from('notifications')
        .update({ status: 'failed', error_log: 'FCM_SERVER_KEY manquant dans la configuration' })
        .eq('id', notifId);
      return;
    }

    try {
      const response = await fetch('https://fcm.googleapis.com/fcm/send', {
        method:  'POST',
        headers: {
          Authorization:  `key=${env.FCM_SERVER_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          to: user.device_token,
          notification: {
            title,
            body,
            sound: 'default',
            badge: 1,
          },
          data:     data ?? {},
          priority: 'high',
          // content_available: true pour iOS background notifications
          content_available: true,
        }),
      });

      if (response.ok) {
        const fcmResponse = await response.json() as { success?: number; failure?: number };
        if (fcmResponse.failure && fcmResponse.failure > 0) {
          // Token invalide ou révoqué
          await supabaseAdmin
            .from('notifications')
            .update({ status: 'failed', error_log: `FCM failure: ${JSON.stringify(fcmResponse)}` })
            .eq('id', notifId);
        } else {
          await supabaseAdmin
            .from('notifications')
            .update({ status: 'sent', sent_at: new Date().toISOString() })
            .eq('id', notifId);
        }
      } else {
        const errorText = await response.text();
        await supabaseAdmin
          .from('notifications')
          .update({ status: 'failed', error_log: errorText.substring(0, 500) })
          .eq('id', notifId);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau FCM inconnue';
      await supabaseAdmin
        .from('notifications')
        .update({ status: 'failed', error_log: msg })
        .eq('id', notifId);
    }
  }
}

export const notificationsService = new NotificationsService();
