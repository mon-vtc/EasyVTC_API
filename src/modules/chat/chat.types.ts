// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Chat
// Sprint 5 — EazyVTC
//
// Architecture :
//   - Les messages sont stockés dans la table `chat_messages` (Supabase).
//   - Le temps-réel est assuré par Supabase Realtime côté mobile :
//     les apps s'abonnent au channel `chat:reservation:{id}` et reçoivent
//     chaque INSERT sur la table via postgres_changes.
//   - Le backend expose uniquement des routes REST pour l'historique
//     et l'envoi (INSERT BDD → Realtime broadcast automatique).
// ══════════════════════════════════════════════════════════════════════════════

export type ChatSenderRole = 'client' | 'driver' | 'admin' | 'manager';

// ── Entité BDD ────────────────────────────────────────────────────────────────

export interface ChatMessage {
  id:             string;
  reservation_id: string;
  sender_id:      string;
  sender_role:    ChatSenderRole;
  content:        string;
  created_at:     string;
  read_at:        string | null;
}

// ── DTO d'envoi ───────────────────────────────────────────────────────────────

export interface SendMessageDto {
  content: string;
}

// ── Résultat paginé ───────────────────────────────────────────────────────────

export interface ChatMessageListResult {
  messages:    ChatMessage[];
  total:       number;
  page:        number;
  limit:       number;
  total_pages: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Canal support (chat:support:{ticketId})
// ══════════════════════════════════════════════════════════════════════════════

export type SupportTicketCategory = 'reservation' | 'payment' | 'driver' | 'account' | 'technical' | 'other';
export type SupportTicketStatus   = 'pending' | 'in_progress' | 'resolved';
export type SupportTicketPriority = 'normal' | 'urgent';

export interface SupportTicket {
  id:         string;
  user_id:    string;
  user_role:  ChatSenderRole;
  category:   SupportTicketCategory;
  subject:    string;
  status:     SupportTicketStatus;
  priority:   SupportTicketPriority;
  created_at: string;
  updated_at: string;
  closed_at:  string | null;
}

export interface SupportMessage {
  id:          string;
  ticket_id:   string;
  sender_id:   string;
  sender_role: ChatSenderRole;
  content:     string;
  created_at:  string;
  read_at:     string | null;
}

export interface CreateSupportTicketDto {
  category: SupportTicketCategory;
  subject:  string;
  message:  string;
}

export interface SupportTicketDetail extends SupportTicket {
  messages: SupportMessage[];
  user:     { id: string; first_name: string; last_name: string } | null;
}

export interface SupportTicketRow extends SupportTicket {
  user: { id: string; first_name: string; last_name: string } | null;
}

export interface SupportTicketListResult {
  tickets:     SupportTicketRow[];
  total:       number;
  page:        number;
  limit:       number;
  total_pages: number;
}

// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Liste de conversations (vue  — client / driver)
// ══════════════════════════════════════════════════════════════════════════════

export interface ConversationParty {
  id:                string;
  first_name:        string;
  last_name:         string;
  profile_photo_url: string | null;
  role:              'client' | 'driver';
}

export interface ConversationLastMessage {
  content:     string;
  created_at:  string;
  sender_role: string;
  is_mine:     boolean;
}

export interface ConversationSummary {
  reservation_id: string;
  status:         string;
  scheduled_at:   string;
  pickup_address: string;
  dest_address:   string;
  other_party:    ConversationParty | null;
  last_message:   ConversationLastMessage | null;
  unread_count:   number;
}

export interface ConversationListResult {
  conversations: ConversationSummary[];
  total:         number;
  page:          number;
  limit:         number;
  total_pages:   number;
}

// ── Conversation active (vue admin) ──────────────────────────────────────────

export interface ActiveConversation {
  reservation_id:   string;
  scheduled_at:     string;
  pickup_address:   string;
  dest_address:     string;
  last_message:     string | null;
  last_message_at:  string | null;
  unread_count:     number;
  client: {
    id:         string;
    first_name: string;
    last_name:  string;
  } | null;
  driver: {
    id:         string;
    first_name: string;
    last_name:  string;
  } | null;
}
