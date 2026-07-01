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
  ConversationSummary,
  ConversationListResult,
  CreateSupportTicketDto,
  SupportTicket,
  SupportMessage,
  SupportTicketDetail,
  SupportTicketListResult,
  SupportTicketStatus,
  SupportTicketPriority,
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
  // 3b. LISTE DE CONVERSATIONS — Vue  (client / driver)
  //
  // Stratégie : pivot depuis chat_messages pour éviter toute itération côté client.
  //   Requête 1 : reservation_ids de l'utilisateur (IDs seulement)
  //   Requête 2 : messages sur ces IDs, triés par created_at DESC
  //              → déduplication JS → orderedIds (ordre ) + lastMsgMap
  //   Requête 3+4 (parallèles) : données réservation + non-lus pour la page courante
  //
  //   Total : 3 requêtes fixes (4 si driver — résolution driverId)
  //   Coût constant indépendant du nombre de réservations de l'utilisateur.
  // ──────────────────────────────────────────────────────────────────────────

  async listConversations(
    userId:   string,
    userRole: UserRole,
    page:     number,
    limit:    number,
  ): Promise<ConversationListResult> {
    const empty = { conversations: [], total: 0, page, limit, total_pages: 0 };
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    // ── Résoudre le driver_id (uniquement si chauffeur) ────────────────────
    let driverRecordId: string | null = null;
    if (userRole === 'driver') {
      const { data: driverRecord } = await supabaseAdmin
        .from('drivers')
        .select('id')
        .eq('user_id', userId)
        .single();
      driverRecordId = (driverRecord as any)?.id ?? null;
      if (!driverRecordId) return empty;
    }

    // ── Récupérer les reservation_ids de l'utilisateur (IDs seuls) ─────────
    const { data: userResRows } = userRole === 'client'
      ? await supabaseAdmin.from('reservations').select('id').eq('client_id', userId)
      : await supabaseAdmin.from('reservations').select('id').eq('driver_id', driverRecordId!);

    const userResIds = userResRows?.map((r: any) => r.id) ?? [];
    if (!userResIds.length) return empty;

    // ── Requête pivot : messages sur ces réservations, triés par date DESC ──
    // Une seule requête donne à la fois :
    //   - l'ordre  (dernier message en tête)
    //   - le contenu du dernier message (preview)
    const { data: msgRows } = await supabaseAdmin
      .from('chat_messages')
      .select('reservation_id, content, created_at, sender_role, sender_id')
      .in('reservation_id', userResIds)
      .order('created_at', { ascending: false });

    // Déduplication JS : on garde uniquement la première occurrence par reservation_id
    // (= le message le plus récent) — O(n) avec Set
    const seen       = new Set<string>();
    const orderedIds: string[] = [];
    const lastMsgMap = new Map<string, {
      content: string; created_at: string; sender_role: string; sender_id: string;
    }>();

    for (const m of msgRows ?? []) {
      if (!seen.has(m.reservation_id)) {
        seen.add(m.reservation_id);
        orderedIds.push(m.reservation_id);
        lastMsgMap.set(m.reservation_id, {
          content:     m.content,
          created_at:  m.created_at,
          sender_role: m.sender_role,
          sender_id:   m.sender_id,
        });
      }
    }

    const total   = orderedIds.length;
    const pageIds = orderedIds.slice(from, to + 1);

    if (!pageIds.length) {
      return { conversations: [], total, page, limit, total_pages: Math.ceil(total / limit) };
    }

    // ── Enrichir la page : données réservation + non-lus (2 requêtes parallèles) ─
    const [{ data: reservationRows }, { data: unreadRows }] = await Promise.all([
      supabaseAdmin
        .from('reservations')
        .select(`
          id, scheduled_at, status, pickup_address, dest_address,
          client:users!client_id(id, first_name, last_name, profile_photo_url),
          driver:drivers!driver_id(user:users!user_id(id, first_name, last_name, profile_photo_url))
        `)
        .in('id', pageIds),

      supabaseAdmin
        .from('chat_messages')
        .select('reservation_id')
        .in('reservation_id', pageIds)
        .neq('sender_id', userId)
        .is('read_at', null),
    ]);

    // ── Construire les Maps secondaires ────────────────────────────────────
    const reservationMap = new Map<string, any>();
    for (const r of reservationRows ?? []) reservationMap.set(r.id, r);

    const unreadMap = new Map<string, number>();
    for (const m of unreadRows ?? []) {
      unreadMap.set(m.reservation_id, (unreadMap.get(m.reservation_id) ?? 0) + 1);
    }

    // ── Assemblage final dans l'ordre  ─────────────────────────────
    const conversations: ConversationSummary[] = pageIds
      .map(resId => {
        const r = reservationMap.get(resId);
        if (!r) return null;

        const last       = lastMsgMap.get(resId) ?? null;
        const driverUser = r.driver?.user ?? null;

        const otherParty = userRole === 'client'
          ? driverUser
            ? { id: driverUser.id, first_name: driverUser.first_name, last_name: driverUser.last_name, profile_photo_url: driverUser.profile_photo_url ?? null, role: 'driver' as const }
            : null
          : r.client
            ? { id: r.client.id, first_name: r.client.first_name, last_name: r.client.last_name, profile_photo_url: r.client.profile_photo_url ?? null, role: 'client' as const }
            : null;

        return {
          reservation_id: resId,
          status:         r.status,
          scheduled_at:   r.scheduled_at,
          pickup_address: r.pickup_address,
          dest_address:   r.dest_address,
          other_party:    otherParty,
          last_message:   last ? {
            content:     last.content.length > 80 ? last.content.substring(0, 80) + '…' : last.content,
            created_at:  last.created_at,
            sender_role: last.sender_role,
            is_mine:     last.sender_id === userId,
          } : null,
          unread_count: unreadMap.get(resId) ?? 0,
        };
      })
      .filter((c): c is ConversationSummary => c !== null);

    return { conversations, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUPPORT — chat:support:{ticketId}
  // ══════════════════════════════════════════════════════════════════════════

  // ──────────────────────────────────────────────────────────────────────────
  // 4. CRÉER UN TICKET DE SUPPORT
  // ──────────────────────────────────────────────────────────────────────────

  async createSupportTicket(
    userId:   string,
    userRole: UserRole,
    dto:      CreateSupportTicketDto,
  ): Promise<SupportTicketDetail> {
    if (userRole !== 'client' && userRole !== 'driver') {
      throw { status: 403, message: 'Seuls les clients et chauffeurs peuvent ouvrir un ticket' };
    }

    const { data: ticket, error: ticketErr } = await supabaseAdmin
      .from('support_tickets')
      .insert({
        user_id:   userId,
        user_role: userRole,
        category:  dto.category,
        subject:   dto.subject,
      })
      .select()
      .single();

    if (ticketErr || !ticket) {
      console.error('[Chat Support] Erreur création ticket:', ticketErr);
      throw { status: 500, message: 'Erreur lors de la création du ticket de support' };
    }

    const { data: message, error: msgErr } = await supabaseAdmin
      .from('support_messages')
      .insert({
        ticket_id:   ticket.id,
        sender_id:   userId,
        sender_role: userRole,
        content:     dto.message,
      })
      .select()
      .single();

    if (msgErr || !message) {
      console.error('[Chat Support] Erreur insertion message initial:', msgErr);
      throw { status: 500, message: 'Erreur lors de l\'envoi du message initial' };
    }

    // Alerte aux admins — nouveau ticket support (fire-and-forget)
    const roleLabel = userRole === 'driver' ? 'chauffeur' : 'client';
    notificationsService.sendToAdmins(
      'new_support_ticket_admin',
      'Nouveau ticket support',
      `Un ${roleLabel} a ouvert un ticket : "${dto.subject}" (catégorie : ${dto.category}).`,
      { ticket_id: ticket.id as string, category: dto.category, user_id: userId },
    );

    return {
      ...(ticket as SupportTicket),
      messages: [message as SupportMessage],
      user:     null,
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. LISTER LES TICKETS DE SUPPORT
  // ──────────────────────────────────────────────────────────────────────────

  async listSupportTickets(
    requesterId:   string,
    requesterRole: UserRole,
    filters:       { page: number; limit: number; status?: SupportTicketStatus },
  ): Promise<SupportTicketListResult> {
    const { page, limit, status } = filters;
    const from = (page - 1) * limit;
    const to   = from + limit - 1;

    let query = supabaseAdmin
      .from('support_tickets')
      .select('*, user:users!user_id(id, first_name, last_name)', { count: 'exact' });

    if (requesterRole !== 'admin' && requesterRole !== 'manager') {
      query = query.eq('user_id', requesterId);
    }

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query
      .order('updated_at', { ascending: false })
      .range(from, to);

    if (error) throw { status: 500, message: 'Erreur lors de la récupération des tickets' };

    const total = count ?? 0;
    return {
      tickets:     (data ?? []) as SupportTicketListResult['tickets'],
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. DÉTAIL D'UN TICKET + MESSAGES
  // ──────────────────────────────────────────────────────────────────────────

  async getSupportTicketDetail(
    ticketId:      string,
    requesterId:   string,
    requesterRole: UserRole,
  ): Promise<SupportTicketDetail> {
    const { data: ticket, error } = await supabaseAdmin
      .from('support_tickets')
      .select('*, user:users!user_id(id, first_name, last_name)')
      .eq('id', ticketId)
      .single();

    if (error || !ticket) throw { status: 404, message: 'Ticket introuvable' };

    if (requesterRole !== 'admin' && requesterRole !== 'manager') {
      if ((ticket as any).user_id !== requesterId) {
        throw { status: 403, message: 'Accès refusé' };
      }
    }

    const { data: messages, error: msgErr } = await supabaseAdmin
      .from('support_messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('created_at', { ascending: true });

    if (msgErr) throw { status: 500, message: 'Erreur lors de la récupération des messages' };

    // Marquer les messages non-lus de l'interlocuteur comme lus (fire-and-forget)
    void supabaseAdmin
      .from('support_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('ticket_id', ticketId)
      .neq('sender_id', requesterId)
      .is('read_at', null);

    const t = ticket as any;
    return {
      id:         t.id,
      user_id:    t.user_id,
      user_role:  t.user_role,
      category:   t.category,
      subject:    t.subject,
      status:     t.status,
      priority:   t.priority,
      created_at: t.created_at,
      updated_at: t.updated_at,
      closed_at:  t.closed_at,
      user:       t.user ?? null,
      messages:   (messages ?? []) as SupportMessage[],
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. MODIFIER LE STATUT D'UN TICKET (admin / manager)
  // ──────────────────────────────────────────────────────────────────────────

  async updateSupportTicketStatus(
    ticketId:  string,
    status:    SupportTicketStatus,
    priority?: SupportTicketPriority,
  ): Promise<SupportTicket> {
    const update: Record<string, unknown> = { status };
    if (priority) update.priority = priority;
    if (status === 'resolved') update.closed_at = new Date().toISOString();
    if (status !== 'resolved') update.closed_at = null;

    const { data, error } = await supabaseAdmin
      .from('support_tickets')
      .update(update)
      .eq('id', ticketId)
      .select()
      .single();

    if (error || !data) {
      if (error?.code === 'PGRST116') throw { status: 404, message: 'Ticket introuvable' };
      throw { status: 500, message: 'Erreur lors de la mise à jour du ticket' };
    }

    return data as SupportTicket;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 8. ENVOYER UN MESSAGE DANS UN TICKET
  // ──────────────────────────────────────────────────────────────────────────

  async sendSupportMessage(
    ticketId:    string,
    senderId:    string,
    senderRole:  UserRole,
    content:     string,
  ): Promise<SupportMessage> {
    const { data: ticket, error: ticketErr } = await supabaseAdmin
      .from('support_tickets')
      .select('id, user_id, status')
      .eq('id', ticketId)
      .single();

    if (ticketErr || !ticket) throw { status: 404, message: 'Ticket introuvable' };

    const t = ticket as any;

    if (senderRole !== 'admin' && senderRole !== 'manager') {
      if (t.user_id !== senderId) throw { status: 403, message: 'Accès refusé' };
    }

    if (t.status === 'resolved' && (senderRole === 'client' || senderRole === 'driver')) {
      // Réouverture automatique si l'utilisateur répond sur un ticket résolu
      void supabaseAdmin
        .from('support_tickets')
        .update({ status: 'in_progress', closed_at: null })
        .eq('id', ticketId);
    }

    const { data: message, error: msgErr } = await supabaseAdmin
      .from('support_messages')
      .insert({
        ticket_id:   ticketId,
        sender_id:   senderId,
        sender_role: senderRole,
        content,
      })
      .select()
      .single();

    if (msgErr || !message) {
      console.error('[Chat Support] Erreur envoi message:', msgErr);
      throw { status: 500, message: 'Erreur lors de l\'envoi du message' };
    }

    this._notifySupportRecipient(ticketId, t.user_id, senderId, senderRole, content);

    return message as SupportMessage;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 9. MARQUER LES MESSAGES D'UNE CONVERSATION COMME LUS
  // ──────────────────────────────────────────────────────────────────────────

  async markChatMessagesAsRead(
    reservationId: string,
    requesterId:   string,
    requesterRole: UserRole,
  ): Promise<{ updated: number }> {
    await this._assertAccess(reservationId, requesterId, requesterRole);

    const { error, count } = await supabaseAdmin
      .from('chat_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('reservation_id', reservationId)
      .neq('sender_id', requesterId)
      .is('read_at', null);

    if (error) throw { status: 500, message: 'Erreur lors du marquage des messages' };
    return { updated: count ?? 0 };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 10. MARQUER LES MESSAGES D'UN TICKET SUPPORT COMME LUS
  // ──────────────────────────────────────────────────────────────────────────

  async markSupportMessagesAsRead(
    ticketId:      string,
    requesterId:   string,
    requesterRole: UserRole,
  ): Promise<{ updated: number }> {
    const { data: ticket, error } = await supabaseAdmin
      .from('support_tickets')
      .select('id, user_id')
      .eq('id', ticketId)
      .single();

    if (error || !ticket) throw { status: 404, message: 'Ticket introuvable' };

    if (requesterRole !== 'admin' && requesterRole !== 'manager') {
      if ((ticket as any).user_id !== requesterId) {
        throw { status: 403, message: 'Accès refusé' };
      }
    }

    const { error: updateError, count } = await supabaseAdmin
      .from('support_messages')
      .update({ read_at: new Date().toISOString() })
      .eq('ticket_id', ticketId)
      .neq('sender_id', requesterId)
      .is('read_at', null);

    if (updateError) throw { status: 500, message: 'Erreur lors du marquage des messages' };
    return { updated: count ?? 0 };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Notification support (fire-and-forget)
  // ──────────────────────────────────────────────────────────────────────────

  private _notifySupportRecipient(
    ticketId:   string,
    ticketOwner: string,
    senderId:   string,
    senderRole: UserRole,
    content:    string,
  ): void {
    void (async () => {
      try {
        const recipientId = (senderRole === 'admin' || senderRole === 'manager')
          ? ticketOwner
          : null; // Les messages utilisateurs n'envoient pas de notif admin (pas de token)

        if (!recipientId || recipientId === senderId) return;

        const preview = content.length > 60 ? content.substring(0, 60) + '…' : content;

        notificationsService.sendToUser(
          recipientId,
          'support_reply',
          'Réponse du support',
          preview,
          { ticket_id: ticketId },
        );
      } catch (err) {
        console.error('[Chat Support] Erreur notification:', err);
      }
    })();
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

    if (requesterRole === 'driver') {
      // Les deux requêtes sont indépendantes — on les lance en parallèle
      const [{ data: reservation, error }, { data: driverRecord }] = await Promise.all([
        supabaseAdmin
          .from('reservations')
          .select('client_id, driver_id')
          .eq('id', reservationId)
          .single(),
        supabaseAdmin
          .from('drivers')
          .select('id')
          .eq('user_id', requesterId)
          .single(),
      ]);

      if (error || !reservation) throw { status: 404, message: 'Réservation introuvable' };
      if (!driverRecord || reservation.driver_id !== (driverRecord as any).id) {
        throw { status: 403, message: 'Accès refusé' };
      }
      return;
    }

    // client
    const { data: reservation, error } = await supabaseAdmin
      .from('reservations')
      .select('client_id, driver_id')
      .eq('id', reservationId)
      .single();

    if (error || !reservation) throw { status: 404, message: 'Réservation introuvable' };

    if (reservation.client_id !== requesterId) {
      throw { status: 403, message: 'Accès refusé' };
    }
  }
}

export const chatService = new ChatService();
