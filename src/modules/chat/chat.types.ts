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
