// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Notifications
// Sprint 3 — EasyVTC
//
// Architecture push :
//   - Stockage systématique en BDD (table notifications)
//   - Envoi push via Expo Push Notifications API (https://exp.host/--/api/v2/push/send)
//     Compatible Android et iOS sans configuration Firebase/APNs côté serveur.
//     Le mobile enregistre un ExponentPushToken via expo-notifications.
//   - Les notifications sont fire-and-forget : elles ne bloquent jamais
//     le flux principal (réservation, assignation…)
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../../database/supabase/client.js';
import { env } from '../../config/env.js';
import { sendNotificationEmail } from '../../utils/email.service.js';
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
  // RAPPELS CHAUFFEUR — 3 séquences (J-1 / H-2 / H-30min)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Envoie 3 vagues de rappels push aux chauffeurs pour leurs courses à venir.
   *   - J-1    : fenêtre [+23h, +25h]
   *   - H-2    : fenêtre [+1h45, +2h15]
   *   - H-30min: fenêtre [+20min, +40min]
   * Idempotent par type de rappel + reservation_id.
   * Cible uniquement les réservations au statut 'assigned'.
   */
  async sendDriverTripReminders(): Promise<{ sent_24h: number; sent_2h: number; sent_30min: number }> {
    const now = new Date();

    const windows = {
      '24h':   { from: new Date(now.getTime() + 23 * 60 * 60 * 1000),  to: new Date(now.getTime() + 25 * 60 * 60 * 1000)  },
      '2h':    { from: new Date(now.getTime() + 105 * 60 * 1000),       to: new Date(now.getTime() + 135 * 60 * 1000)       },
      '30min': { from: new Date(now.getTime() + 20 * 60 * 1000),        to: new Date(now.getTime() + 40 * 60 * 1000)        },
    } as const;

    // Récupérer les réservations assignées dans chaque fenêtre
    const fetchAssigned = async (from: Date, to: Date) => {
      const { data } = await supabaseAdmin
        .from('reservations')
        .select('id, scheduled_at, pickup_address, driver:drivers!driver_id(user_id)')
        .eq('status', 'assigned')
        .gte('scheduled_at', from.toISOString())
        .lte('scheduled_at', to.toISOString());
      return (data ?? []) as any[];
    };

    const [res24h, res2h, res30m] = await Promise.all([
      fetchAssigned(windows['24h'].from,   windows['24h'].to),
      fetchAssigned(windows['2h'].from,    windows['2h'].to),
      fetchAssigned(windows['30min'].from, windows['30min'].to),
    ]);

    // Déduplication : vérifier quelles notifications ont déjà été envoyées
    const alreadySentIds = async (type: string, ids: string[]): Promise<Set<string>> => {
      if (!ids.length) return new Set();
      const { data } = await supabaseAdmin
        .from('notifications')
        .select('data')
        .eq('type', type)
        .in('data->>reservation_id', ids);
      return new Set(
        (data ?? []).map(n => (n.data as Record<string, string>)?.reservation_id).filter(Boolean),
      );
    };

    const [sent24hSet, sent2hSet, sent30mSet] = await Promise.all([
      alreadySentIds('driver_reminder_24h',   res24h.map(r => r.id)),
      alreadySentIds('driver_reminder_2h',    res2h.map(r => r.id)),
      alreadySentIds('driver_reminder_30min', res30m.map(r => r.id)),
    ]);

    const fmt = (iso: string) =>
      new Date(iso).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

    let sent_24h = 0, sent_2h = 0, sent_30min = 0;

    for (const r of res24h) {
      const driverUserId24h = Array.isArray(r.driver) ? r.driver[0]?.user_id : r.driver?.user_id;
      if (sent24hSet.has(r.id) || !driverUserId24h) continue;
      this.sendToUser(driverUserId24h, 'driver_reminder_24h',
        'Course demain',
        `Rappel : vous avez une course demain à ${fmt(r.scheduled_at)}. Départ : ${r.pickup_address}.`,
        { reservation_id: r.id, scheduled_at: r.scheduled_at },
      );
      sent_24h++;
    }

    for (const r of res2h) {
      const driverUserId2h = Array.isArray(r.driver) ? r.driver[0]?.user_id : r.driver?.user_id;
      if (sent2hSet.has(r.id) || !driverUserId2h) continue;
      this.sendToUser(driverUserId2h, 'driver_reminder_2h',
        'Course dans 2 heures',
        `Votre course de ${fmt(r.scheduled_at)} commence dans 2h. Préparez-vous.`,
        { reservation_id: r.id, scheduled_at: r.scheduled_at },
      );
      sent_2h++;
    }

    for (const r of res30m) {
      const driverUserId30m = Array.isArray(r.driver) ? r.driver[0]?.user_id : r.driver?.user_id;
      if (sent30mSet.has(r.id) || !driverUserId30m) continue;
      this.sendToUser(driverUserId30m, 'driver_reminder_30min',
        'Course dans 30 minutes',
        `Votre course commence dans 30 min. Rejoignez le point de départ : ${r.pickup_address}.`,
        { reservation_id: r.id, scheduled_at: r.scheduled_at, pickup_address: r.pickup_address },
      );
      sent_30min++;
    }

    return { sent_24h, sent_2h, sent_30min };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CRON ADMIN — Documents en attente depuis +24h
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Alerte les admins si des documents sont en statut 'pending' depuis plus de 24h
   * sans avoir été traités. Envoie une seule notification agrégée.
   */
  async sendPendingDocumentsDigest(): Promise<{ count: number }> {
    const threshold = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { count } = await supabaseAdmin
      .from('driver_documents')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .lte('created_at', threshold);

    if (!count) return { count: 0 };

    this.sendToAdmins(
      'new_document_admin',
      `${count} document(s) en attente depuis +24h`,
      `${count} document(s) chauffeur attend${count > 1 ? 'ent' : ''} une validation depuis plus de 24h.`,
      { pending_count: String(count) },
    );

    return { count };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CRON ADMIN — Réservations non assignées à J-1
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Alerte les admins chaque soir si des réservations du lendemain
   * n'ont toujours pas de chauffeur assigné.
   */
  async sendUnassignedReservationsAlert(): Promise<{ count: number }> {
    const now = new Date();
    const tomorrowStart = new Date(now);
    tomorrowStart.setDate(tomorrowStart.getDate() + 1);
    tomorrowStart.setHours(0, 0, 0, 0);
    const tomorrowEnd = new Date(tomorrowStart);
    tomorrowEnd.setHours(23, 59, 59, 999);

    const { count } = await supabaseAdmin
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending')
      .gte('scheduled_at', tomorrowStart.toISOString())
      .lte('scheduled_at', tomorrowEnd.toISOString());

    if (!count) return { count: 0 };

    const dayLabel = tomorrowStart.toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
    this.sendToAdmins(
      'new_reservation_admin',
      `${count} course(s) sans chauffeur demain`,
      `Attention : ${count} course(s) prévue(s) le ${dayLabel} n'ont pas encore de chauffeur assigné.`,
      { unassigned_count: String(count), date: tomorrowStart.toISOString().split('T')[0] },
    );

    return { count };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // CRON ADMIN — Digest hebdomadaire (lundi matin)
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Envoie aux admins un bilan de l'activité des 7 derniers jours :
   * courses, CA, nouveaux comptes, tickets ouverts, note moyenne.
   */
  async sendWeeklyDigest(): Promise<{ sent: boolean }> {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    const [reservationsRes, usersRes, ticketsRes, ratingsRes] = await Promise.all([
      supabaseAdmin
        .from('reservations')
        .select('id, status, price_final, country')
        .gte('created_at', since),
      supabaseAdmin
        .from('users')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', since),
      supabaseAdmin
        .from('support_tickets')
        .select('id, status')
        .gte('created_at', since),
      supabaseAdmin
        .from('ratings')
        .select('note')
        .gte('created_at', since),
    ]);

    const allReservations  = (reservationsRes.data ?? []) as Array<{ id: string; status: string; price_final: number | null; country: string }>;
    const completed        = allReservations.filter(r => r.status === 'completed');
    const revenueEur       = completed.filter(r => r.country !== 'senegal').reduce((s, r) => s + (r.price_final ?? 0), 0);
    const revenueXof       = completed.filter(r => r.country === 'senegal').reduce((s, r) => s + (r.price_final ?? 0), 0);
    const newUsers         = usersRes.count ?? 0;
    const openTickets      = (ticketsRes.data ?? []).filter((t: any) => t.status === 'open').length;
    const notes            = (ratingsRes.data ?? []).map((r: any) => r.note as number);
    const avgRating        = notes.length ? Math.round(notes.reduce((a, b) => a + b, 0) / notes.length * 10) / 10 : null;

    const lines = [
      `Courses : ${allReservations.length} (${completed.length} terminées)`,
      revenueEur > 0 ? `CA France : ${revenueEur.toFixed(2)} €` : null,
      revenueXof > 0 ? `CA Sénégal : ${Math.round(revenueXof).toLocaleString('fr-FR')} XOF` : null,
      `Nouveaux comptes : ${newUsers}`,
      openTickets > 0 ? `Tickets support ouverts : ${openTickets}` : null,
      avgRating !== null ? `Note moyenne : ${avgRating}/5` : null,
    ].filter(Boolean).join(' · ');

    this.sendToAdmins(
      'weekly_digest_admin',
      'Bilan hebdomadaire EasyVTC',
      lines,
      { period: 'weekly', generated_at: new Date().toISOString() },
    );

    return { sent: true };
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
  // PRIVÉ — Dispatch push via Expo Push Notifications API
  // Fonctionne sur Android et iOS sans configuration Firebase/APNs côté serveur.
  // Attend un ExponentPushToken enregistré par expo-notifications côté mobile.
  // ──────────────────────────────────────────────────────────────────────────

  private async _dispatchPush(
    notifId: string,
    userId:  string,
    title:   string,
    body:    string,
    data?:   Record<string, string>,
  ): Promise<void> {
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

    const token = user.device_token as string;

    if (!token.startsWith('ExponentPushToken[') && !token.startsWith('ExpoPushToken[')) {
      await supabaseAdmin
        .from('notifications')
        .update({ status: 'failed', error_log: `Token non-Expo détecté — reconnexion requise : ${token.substring(0, 30)}` })
        .eq('id', notifId);
      return;
    }

    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', {
        method: 'POST',
        headers: {
          'Content-Type':   'application/json',
          'Accept':         'application/json',
          'Accept-Encoding': 'gzip, deflate',
        },
        body: JSON.stringify({
          to:       token,
          title,
          body,
          data:     data ?? {},
          sound:    'default',
          badge:    1,
          priority: 'high',
        }),
      });

      if (!response.ok) {
        throw new Error(`Expo Push API HTTP ${response.status}`);
      }

      const result = await response.json() as {
        data: { status: 'ok' | 'error'; id?: string; message?: string; details?: { error?: string } };
      };

      const ticket = result.data;

      if (ticket.status === 'error') {
        const errMsg = ticket.message ?? ticket.details?.error ?? 'Erreur Expo Push inconnue';
        await supabaseAdmin
          .from('notifications')
          .update({ status: 'failed', error_log: errMsg.substring(0, 500) })
          .eq('id', notifId);
        return;
      }

      await supabaseAdmin
        .from('notifications')
        .update({ status: 'sent', sent_at: new Date().toISOString() })
        .eq('id', notifId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erreur réseau Expo Push inconnue';
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
