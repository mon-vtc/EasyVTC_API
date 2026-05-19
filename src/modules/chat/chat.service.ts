// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Chat
// Sprint 5 — EazyVTC
//
// Les messages sont insérés dans `chat_messages`.
// Supabase Realtime broadcast automatiquement chaque INSERT aux clients
// abonnés au channel `chat:reservation:{id}`.
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../../database/supabase/client.js';
import { notificationsService } from '../notifications/notifications.service.js';
import type { UserRole } from '../auth/auth.types.js';
import type {
  ChatMessage,
  ChatMessageListResult,
  ActiveConversation,
  ChatSenderRole,
} from './chat.types.js';

export class ChatService {

  // ──────────────────────────────────────────────────────────────────────────
  // 1. ENVOYER UN MESSAGE
  // ──────────────────────────────────────────────────────────────────────────

  async sendMessage(
    reservationId: string,
    senderId:      string,
    senderRole:    UserRole,
    content:       string,
  ): Promise<ChatMessage> {
    // Vérifier que la réservation existe et que l'émetteur y a accès
    await this._assertAccess(reservationId, senderId, senderRole);

    const { data, error } = await supabaseAdmin
      .from('chat_messages')
      .insert({
        reservation_id: reservationId,
        sender_id:      senderId,
        sender_role:    senderRole as ChatSenderRole,
        content,
      })
      .select()
      .single();

    if (error || !data) {
      console.error('[Chat] Erreur insertion message:', error);
      throw { status: 500, message: "Erreur lors de l'envoi du message" };
    }

    this._notifyRecipient(reservationId, senderId, senderRole, content);

    return data as ChatMessage;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. HISTORIQUE D'UNE CONVERSATION
  // ──────────────────────────────────────────────────────────────────────────

  async getMessages(
    reservationId: string,
    requesterId:   string,
    requesterRole: UserRole,
    page:          number,
    limit:         number,
  ): Promise<ChatMessageListResult> {
    await this._assertAccess(reservationId, requesterId, requesterRole);

    const from = (page - 1) * limit;
    const to   = from + limit - 1;

    const { data, error, count } = await supabaseAdmin
      .from('chat_messages')
      .select('*', { count: 'exact' })
      .eq('reservation_id', reservationId)
      .order('created_at', { ascending: true })
      .range(from, to);

    if (error) throw { status: 500, message: "Erreur lors de la récupération des messages" };

    // Marquer les messages non-lus de l'interlocuteur comme lus
    void supabaseAdmin
      .from('chat_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('reservation_id', reservationId)
      .neq('sender_id', requesterId)
      .is('read_at', null);

    const total = count ?? 0;
    return {
      messages:    (data ?? []) as ChatMessage[],
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. CONVERSATIONS ACTIVES — Vue admin
  // ──────────────────────────────────────────────────────────────────────────

  async listActiveConversations(page: number, limit: number): Promise<{
    conversations: ActiveConversation[];
    total:         number;
    page:          number;
    limit:         number;
    total_pages:   number;
  }> {
    const from = (page - 1) * limit;
    const to   = from + limit - 1;

    // Récupérer les réservations qui ont au moins un message, triées par dernier message
    const { data: rows, error, count } = await supabaseAdmin
      .from('reservations')
      .select(`
        id, scheduled_at, pickup_address, dest_address,
        client:users!client_id(id, first_name, last_name),
        driver:drivers!driver_id(user:users!user_id(id, first_name, last_name))
      `, { count: 'exact' })
      .in('status', ['assigned', 'driver_arrived', 'in_progress', 'completed'])
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) throw { status: 500, message: 'Erreur lors de la récupération des conversations' };

    if (!rows?.length) {
      return { conversations: [], total: 0, page, limit, total_pages: 0 };
    }

    // Récupérer le dernier message et le nb non-lus pour chaque réservation
    const reservationIds = rows.map(r => r.id);

    const { data: lastMessages } = await supabaseAdmin
      .from('chat_messages')
      .select('reservation_id, content, created_at')
      .in('reservation_id', reservationIds)
      .order('created_at', { ascending: false });

    const { data: unreadCounts } = await supabaseAdmin
      .from('chat_messages')
      .select('reservation_id')
      .in('reservation_id', reservationIds)
      .is('read_at', null);

    const lastMsgMap  = new Map<string, { content: string; created_at: string }>();
    const unreadMap   = new Map<string, number>();

    for (const m of lastMessages ?? []) {
      if (!lastMsgMap.has(m.reservation_id)) {
        lastMsgMap.set(m.reservation_id, { content: m.content, created_at: m.created_at });
      }
    }
    for (const m of unreadCounts ?? []) {
      unreadMap.set(m.reservation_id, (unreadMap.get(m.reservation_id) ?? 0) + 1);
    }

    const conversations: ActiveConversation[] = rows.map((r: any) => {
      const last    = lastMsgMap.get(r.id);
      const driverUser = r.driver?.user ?? null;
      return {
        reservation_id:  r.id,
        scheduled_at:    r.scheduled_at,
        pickup_address:  r.pickup_address,
        dest_address:    r.dest_address,
        last_message:    last?.content    ?? null,
        last_message_at: last?.created_at ?? null,
        unread_count:    unreadMap.get(r.id) ?? 0,
        client: r.client ? {
          id:         r.client.id,
          first_name: r.client.first_name,
          last_name:  r.client.last_name,
        } : null,
        driver: driverUser ? {
          id:         driverUser.id,
          first_name: driverUser.first_name,
          last_name:  driverUser.last_name,
        } : null,
      };
    });

    const total = count ?? 0;
    return { conversations, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Notification push à l'interlocuteur (fire-and-forget)
  // ──────────────────────────────────────────────────────────────────────────

  private _notifyRecipient(
    reservationId: string,
    senderId:      string,
    senderRole:    UserRole,
    content:       string,
  ): void {
    void (async () => {
      try {
        const { data: reservation } = await supabaseAdmin
          .from('reservations')
          .select('client_id, driver_id')
          .eq('id', reservationId)
          .single();

        if (!reservation) return;

        let recipientId: string | null = null;

        if (senderRole === 'client') {
          if (!reservation.driver_id) return;
          const { data: driver } = await supabaseAdmin
            .from('drivers')
            .select('user_id')
            .eq('id', reservation.driver_id)
            .single();
          recipientId = (driver as any)?.user_id ?? null;
        } else {
          // driver, admin ou manager → notifier le client
          recipientId = reservation.client_id;
        }

        if (!recipientId || recipientId === senderId) return;

        const preview = content.length > 60 ? content.substring(0, 60) + '…' : content;

        notificationsService.sendToUser(
          recipientId,
          'new_message',
          'Nouveau message',
          preview,
          { reservation_id: reservationId },
        );
      } catch (err) {
        console.error('[Chat] Erreur notification nouveau message:', err);
      }
    })();
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Contrôle d'accès
  // ──────────────────────────────────────────────────────────────────────────

  private async _assertAccess(
    reservationId: string,
    requesterId:   string,
    requesterRole: UserRole,
  ): Promise<void> {
    if (requesterRole === 'admin' || requesterRole === 'manager') return;

    const { data: reservation, error } = await supabaseAdmin
      .from('reservations')
      .select('client_id, driver_id')
      .eq('id', reservationId)
      .single();

    if (error || !reservation) {
      throw { status: 404, message: 'Réservation introuvable' };
    }

    if (requesterRole === 'client') {
      if (reservation.client_id !== requesterId) {
        throw { status: 403, message: 'Accès refusé' };
      }
      return;
    }

    if (requesterRole === 'driver') {
      const { data: driverRecord } = await supabaseAdmin
        .from('drivers')
        .select('id')
        .eq('user_id', requesterId)
        .single();

      if (!driverRecord || reservation.driver_id !== (driverRecord as any).id) {
        throw { status: 403, message: 'Accès refusé' };
      }
    }
  }
}

export const chatService = new ChatService();
