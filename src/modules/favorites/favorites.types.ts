// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Destinations Favorites
// Sprint 6 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

// ── Entité BDD ────────────────────────────────────────────────────────────────
export interface Favorite {
  id: string;
  user_id: string;
  label: string;
  address: string;
  lat: number | null;
  lng: number | null;
  created_at: string;
  updated_at: string;
}

// ── DTOs ──────────────────────────────────────────────────────────────────────
export interface CreateFavoriteDto {
  label: string;
  address: string;
  lat?: number;
  lng?: number;
}
