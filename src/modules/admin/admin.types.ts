import type { UserRole, UserStatus } from '../auth/auth.types.js';

// ── Création d'un gestionnaire ────────────────────────────────────────────────
export interface CreateManagerDto {
  first_name: string;
  last_name: string;
  email: string;
  phone?: string;
}

export interface CreateManagerResult {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  phone: string | null;
  role: 'manager';
  status: UserStatus;
  created_at: string;
  updated_at: string;
}

// ── Changement de statut ──────────────────────────────────────────────────────
export interface ChangeStatusDto {
  status: UserStatus;
  reason?: string;
}

// ── Filtres liste utilisateurs ────────────────────────────────────────────────
export interface AdminUserListFilters {
  role?: UserRole;
  status?: UserStatus;
  search?: string;
  page?: number;
  limit?: number;
}

// ── Statistiques dashboard ────────────────────────────────────────────────────
export interface AdminStats {
  reservations: {
    total: number;
    pending: number;
    assigned: number;
    in_progress: number;
    completed: number;
    cancelled: number;
  };
  drivers: {
    total: number;
    active: number;
    online: number;
  };
  users: {
    total: number;
    clients: number;
    managers: number;
  };
  revenue: {
    total: number;
    currency: 'EUR';
  };
  vehicles: {
    standard: number;
    berline: number;
    van: number;
  };
}
