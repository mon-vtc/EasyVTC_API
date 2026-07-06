// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Évaluations (Ratings)
// Sprint 6 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

// ── Entité BDD ────────────────────────────────────────────────────────────────

export interface Rating {
  id:             string;
  reservation_id: string;
  client_id:      string;
  driver_id:      string;
  note:           number; // 1–5
  comment:        string | null;
  created_at:     string;
}

// ── Vue enrichie (avec infos client + réservation) ────────────────────────────

export interface RatingWithClient extends Rating {
  client_first_name:        string | null;
  client_last_name:         string | null;
  reservation_scheduled_at: string | null;
}

// ── Vue admin enrichie (avec infos chauffeur + client) ────────────────────────

export interface RatingAdmin extends RatingWithClient {
  driver_first_name: string | null;
  driver_last_name:  string | null;
}

// ── DTO soumission ────────────────────────────────────────────────────────────

export interface SubmitRatingDto {
  note:     number;          // entier 1–5
  comment?: string | null;   // commentaire facultatif (max 500 chars)
}

// ── Filtres liste ─────────────────────────────────────────────────────────────

export interface RatingListFilters {
  page?:  number;
  limit?: number;
}

// ── Résultats paginés ─────────────────────────────────────────────────────────

export interface DriverRatingsResult {
  ratings:  RatingWithClient[];
  avg_note: number | null;
  total:        number;
  page:         number;
  limit:        number;
  total_pages:  number;
}

export interface AdminRatingsResult {
  ratings:     RatingAdmin[];
  total:       number;
  page:        number;
  limit:       number;
  total_pages: number;
}
