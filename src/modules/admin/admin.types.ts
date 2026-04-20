// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Admin (Gestion des gestionnaires)
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import type { UserProfile } from '../users/users.types.js';

// ── Création d'un gestionnaire ────────────────────────────────────────────────
export interface CreateManagerDto {
  email:      string;
  password:   string;
  first_name: string;
  last_name:  string;
  phone?:     string;
}

// ── Changement de statut ──────────────────────────────────────────────────────
export interface ChangeManagerStatusDto {
  status: 'active' | 'inactive' | 'locked';
  reason: string;
}

// ── Filtres liste gestionnaires ───────────────────────────────────────────────
export interface ManagerListFilters {
  status?: 'active' | 'inactive' | 'locked';
  search?: string;
  page?:   number;
  limit?:  number;
}

// ── Résultat paginé ───────────────────────────────────────────────────────────
export interface ManagerListResult {
  managers:    UserProfile[];
  total:       number;
  page:        number;
  limit:       number;
  total_pages: number;
}
