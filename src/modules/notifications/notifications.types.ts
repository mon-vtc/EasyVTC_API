// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Notifications
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

// ── Énumérations (miroir des enums PostgreSQL) ────────────────────────────────

export type NotificationType =
  | 'reservation_confirmed'   // Client : réservation créée avec succès
  | 'trip_assigned'           // Chauffeur : course lui est affectée / Client : chauffeur assigné
  | 'trip_reminder'           // Client : rappel avant la course
  | 'driver_arrived'          // Client : le chauffeur est arrivé au point de pickup
  | 'invoice_available'       // Client : facture disponible après la course
  | 'document_expiry'         // Chauffeur : document bientôt expiré
  | 'document_validated'      // Chauffeur : document validé par l'admin
  | 'document_rejected'       // Chauffeur : document rejeté par l'admin (avec motif)
  | 'reservation_cancelled'   // Chauffeur ou client : course annulée
  | 'new_message'             // Destinataire : nouveau message reçu dans le chat course
  | 'support_reply'           // Utilisateur : réponse du support à son ticket
  | 'new_reservation_admin'      // Admin : nouvelle réservation en attente d'attribution
  | 'new_document_admin'        // Admin : nouveau document chauffeur en attente de validation
  | 'new_user_admin'            // Admin : nouveau compte utilisateur créé
  | 'user_status_changed_admin' // Admin : statut d'un compte modifié (suspension, activation)
  | 'user_anonymized_admin'     // Admin : compte anonymisé suite à demande RGPD Art.17
  | 'trip_completed_admin'      // Admin : course terminée (suivi revenus)
  | 'new_support_ticket_admin'  // Admin : nouveau ticket support ouvert
  | 'low_rating_admin'          // Admin : évaluation ≤ 2 étoiles soumise
  | 'trip_started'              // Client : le chauffeur a démarré la course (client à bord)
  | 'driver_reminder_24h'      // Chauffeur : rappel J-1 (24h avant la course)
  | 'driver_reminder_2h'       // Chauffeur : rappel H-2 (2h avant la course)
  | 'driver_reminder_30min'    // Chauffeur : rappel H-30min (mise en route)
  | 'weekly_digest_admin'      // Admin : bilan hebdomadaire automatique
  | 'marketing'                // Push marketing envoyé depuis une campagne admin
  | 'support_reply';           // Utilisateur : réponse du support à son ticket

export type NotificationChannel = 'push' | 'email';
export type NotificationStatus  = 'pending' | 'sent' | 'failed' | 'delivered';

// ── Entité BDD ────────────────────────────────────────────────────────────────

export interface Notification {
  id: string;
  user_id: string;
  type: NotificationType;
  channel: NotificationChannel;
  status: NotificationStatus;
  title: string;
  body: string;
  /** Payload contextuel envoyé dans la notification push (ex: reservation_id) */
  data: Record<string, string> | null;
  /** null = non lue */
  read_at: string | null;
  sent_at: string | null;
  error_log: string | null;
  created_at: string;
}

// ── DTOs ─────────────────────────────────────────────────────────────────────

/** Utilisé en interne par les autres services pour déclencher une notification. */
export interface CreateNotificationDto {
  user_id: string;
  type: NotificationType;
  channel: NotificationChannel;
  title: string;
  body: string;
  /** Données additionnelles passées dans le payload push (deep link, IDs…) */
  data?: Record<string, string>;
}

export interface NotificationListFilters {
  page?: number;
  limit?: number;
  unread_only?: boolean;
}
