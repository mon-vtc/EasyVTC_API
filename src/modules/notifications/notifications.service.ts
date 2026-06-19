// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Notifications
// Sprint 3 — EazyVTC
//
// Architecture push :
//   - Stockage systématique en BDD (table notifications)
//   - Envoi push via Firebase Admin SDK / FCM v1 (nécessite FIREBASE_PROJECT_ID,
//     FIREBASE_PRIVATE_KEY, FIREBASE_CLIENT_EMAIL dans .env)
//   - Les notifications sont fire-and-forget : elles ne bloquent jamais
//     le flux principal (réservation, assignation…)
// ══════════════════════════════════════════════════════════════════════════════

import admin from 'firebase-admin';
import { supabaseAdmin } from '../../database/supabase/client.js';
import { env } from '../../config/env.js';
import { sendNotificationEmail } from '../../utils/email.service.js';
import type {
  Notification,
  NotificationType,
  CreateNotificationDto,
  NotificationListFilters,
} from './notifications.types.js';

// ── Firebase Admin SDK — initialisation lazy (singleton) ─────────────────────
let _firebaseApp: admin.app.App | null = null;
let _firebaseWarningLogged = false;

function getFirebaseApp(): admin.app.App | null {
  if (!env.FIREBASE_PROJECT_ID || !env.FIREBASE_PRIVATE_KEY || !env.FIREBASE_CLIENT_EMAIL) {
    return null;
  }
  if (!_firebaseApp) {
    _firebaseApp = admin.initializeApp({
      credential: admin.credential.cert({
        projectId:   env.FIREBASE_PROJECT_ID,
        privateKey:  env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        clientEmail: env.FIREBASE_CLIENT_EMAIL,
      }),
    });
  }
  return _firebaseApp;
}

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
    } else if (dto.channel === 'email') {
      // Fire-and-forget : l'échec email ne remonte pas au caller
      this._dispatchEmail(notif.id as string, dto.user_id, dto.type, dto.title, dto.body).catch(
        (err) => console.error('[Notifications] Erreur dispatch email:', err),
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

  /**
   * Envoie une notification push à tous les utilisateurs ayant le rôle admin.
   * Fire-and-forget — ne lève jamais d'erreur.
   */
  sendToAdmins(
    type: NotificationType,
    title: string,
    body: string,
    data?: Record<string, string>,
  ): void {
    (async () => {
      const { data: admins } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('role', 'admin');
      if (admins?.length) {
        this.sendToMany(admins.map((a) => a.id as string), type, title, body, data);
      }
    })().catch((err: unknown) => console.error('[Notifications] Erreur sendToAdmins:', err));
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
  // RAPPELS AVANT COURSE — appelé par le cron
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Envoie une notification push + stocke en BDD pour chaque réservation
   * dont l'horaire est dans la fenêtre [now + 45min, now + 75min].
   * Idempotent : ignore les réservations déjà rappelées (trip_reminder existant).
   */
  async sendUpcomingTripReminders(): Promise<{ sent: number }> {
    const now      = new Date();
    const from     = new Date(now.getTime() + 45 * 60 * 1000).toISOString();
    const to       = new Date(now.getTime() + 75 * 60 * 1000).toISOString();

    const { data: reservations } = await supabaseAdmin
      .from('reservations')
      .select('id, client_id, scheduled_at, pickup_address, dest_address')
      .in('status', ['assigned', 'driver_arrived'])
      .gte('scheduled_at', from)
      .lte('scheduled_at', to);

    if (!reservations?.length) return { sent: 0 };

    // Exclure les réservations déjà rappelées
    const reservationIds = reservations.map(r => r.id);
    const { data: alreadySent } = await supabaseAdmin
      .from('notifications')
      .select('data')
      .eq('type', 'trip_reminder')
      .in('data->>reservation_id', reservationIds);

    const alreadySentIds = new Set(
      (alreadySent ?? []).map(n => (n.data as Record<string, string>)?.reservation_id).filter(Boolean),
    );

    let sent = 0;
    for (const r of reservations) {
      if (alreadySentIds.has(r.id)) continue;

      const scheduledTime = new Date(r.scheduled_at).toLocaleTimeString('fr-FR', {
        hour: '2-digit', minute: '2-digit',
      });

      this.sendToUser(
        r.client_id,
        'trip_reminder',
        'Rappel — votre course approche',
        `Votre chauffeur vous prendra en charge à ${scheduledTime} au ${r.pickup_address}.`,
        { reservation_id: r.id },
      );
      sent++;
    }

    return { sent };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // TOKEN FCM — Enregistrement device mobile
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Enregistre ou met à jour le token FCM de l'appareil mobile de l'utilisateur.
   * À appeler au démarrage de l'app ou quand FCM génère un nouveau token.
   * Le token est stocké dans la table users (device_token) pour simplifier le dispatch
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
  // PRIVÉ — Dispatch push via Firebase Admin SDK (FCM v1)
  // ──────────────────────────────────────────────────────────────────────────

  private async _dispatchPush(
    notifId: string,
    userId:  string,
    title:   string,
    body:    string,
    data?:   Record<string, string>,
  ): Promise<void> {
    // Vérification Firebase avant toute requête BDD (early exit si non configuré)
    const firebaseApp = getFirebaseApp();
    if (!firebaseApp) {
      if (!_firebaseWarningLogged) {
        console.warn('[Notifications] Firebase non configuré — notifications push désactivées (FIREBASE_PROJECT_ID / FIREBASE_PRIVATE_KEY / FIREBASE_CLIENT_EMAIL manquants dans .env)');
        _firebaseWarningLogged = true;
      }
      await supabaseAdmin
        .from('notifications')
        .update({ status: 'failed', error_log: 'Firebase Admin SDK non configuré' })
        .eq('id', notifId);
      return;
    }

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

    try {
      await admin.messaging(firebaseApp).send({
        token: user.device_token as string,
        notification: { title, body },
        data: data ?? {},
        android: { priority: 'high' },
        apns: {
          payload: { aps: { sound: 'default', badge: 1, contentAvailable: true } },
        },
      });

      await supabaseAdmin
        .from('notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', notifId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur Firebase inconnue';
      await supabaseAdmin
        .from('notifications')
        .update({ status: 'failed', error_log: msg.substring(0, 500) })
        .eq('id', notifId);
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Dispatch email via SendGrid (prod) / Mailtrap (dev)
  // ──────────────────────────────────────────────────────────────────────────

  private async _dispatchEmail(
    notifId: string,
    userId:  string,
    type:    NotificationType,
    title:   string,
    body:    string,
  ): Promise<void> {
    const { data: user } = await supabaseAdmin
      .from('users')
      .select('email, first_name')
      .eq('id', userId)
      .single();

    if (!user?.email) {
      await supabaseAdmin
        .from('notifications')
        .update({ status: 'failed', error_log: 'Aucun email enregistré pour cet utilisateur' })
        .eq('id', notifId);
      return;
    }

    try {
      await sendNotificationEmail(user.email, user.first_name as string, type, title, body);

      await supabaseAdmin
        .from('notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', notifId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur email inconnue';
      await supabaseAdmin
        .from('notifications')
        .update({ status: 'failed', error_log: msg.substring(0, 500) })
        .eq('id', notifId);
    }
  }
}

export const notificationsService = new NotificationsService();
