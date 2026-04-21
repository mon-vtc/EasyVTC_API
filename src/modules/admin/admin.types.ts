// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Admin
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import type { UserProfile, UserStatus }  from '../users/users.types.js';
import type { UserRole }                  from '../auth/auth.types.js';

// ── Création d'un gestionnaire ────────────────────────────────────────────────
export interface CreateManagerDto {
  email:       string;
  password?:   string;   // Optionnel — mot de passe temporaire auto-généré si absent
  first_name:  string;
  last_name:   string;
  phone?:      string;
}

// ── Changement de statut ──────────────────────────────────────────────────────
export interface ChangeManagerStatusDto {
  status: UserStatus;
  reason: string;
}

// ── Filtres liste gestionnaires ───────────────────────────────────────────────
export interface ManagerListFilters {
  status?: UserStatus;
  search?: string;
  page?:   number;
  limit?:  number;
}

// ── Résultat paginé gestionnaires ─────────────────────────────────────────────
export interface ManagerListResult {
  managers:    UserProfile[];
  total:       number;
  page:        number;
  limit:       number;
  total_pages: number;
}

// ── Filtres liste utilisateurs (admin global) ─────────────────────────────────
export interface AdminUserListFilters {
  role?:   UserRole;
  status?: UserStatus;
  search?: string;
  page?:   number;
  limit?:  number;
}

// ── Statistiques globales ─────────────────────────────────────────────────────
export interface AdminStatsResult {
  reservations: {
    total:       number;
    pending:     number;
    assigned:    number;
    in_progress: number;
    completed:   number;
    cancelled:   number;
  };
  drivers: {
    total:  number;
    online: number;
  };
  users: {
    clients:  number;
    managers: number;
  };
  revenue: {
    estimated: number;
    confirmed: number;
  };
  vehicle_breakdown: Record<string, number>;
}
