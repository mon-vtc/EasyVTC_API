import type { UserStatus } from '../users/users.types.js';

// ── Permissions RBAC gestionnaire ────────────────────────────────────────────

export const MANAGER_PERMISSIONS = [
  'view_reservations',
  'assign_reservation',
  'cancel_reservation',
  'view_users',
  'view_drivers',
  'view_clients',
  'view_pricing',
  'manage_pricing',
  'view_orders',
  'view_invoices',
  'view_documents',
] as const;

export type ManagerPermission = typeof MANAGER_PERMISSIONS[number];

export interface SetManagerPermissionsDto {
  permissions: ManagerPermission[];
}

export interface ManagerPermissionsResult {
  manager_id:  string;
  permissions: ManagerPermission[];
}

// ── Module Clients (admin) ────────────────────────────────────────────────────

export interface ClientGlobalStats {
  active_count:  number;
  total_trips:   number;
  total_revenue: number;
}

export interface ClientWithStats {
  id:                string;
  email:             string;
  first_name:        string;
  last_name:         string;
  phone:             string | null;
  profile_photo_url: string | null;
  status:            UserStatus;
  status_reason:     string | null;
  status_changed_at: string | null;
  status_changed_by: string | null;
  rgpd_consent:      boolean;
  rgpd_consent_at:   string | null;
  created_at:        string;
  updated_at:        string;
  // Stats calculées depuis la table reservations
  total_trips:        number;
  total_spent:        number;
  last_trip_date:     string | null;
  avg_rating:         number | null;  // S6 — null jusqu'au module ratings
  cancellation_rate:  number;         // pourcentage (0–100)
}

export interface ClientListFilters {
  status?: UserStatus;
  search?: string;
  page?:   number;
  limit?:  number;
}

export interface ClientListResult {
  clients:      ClientWithStats[];
  total:        number;
  page:         number;
  limit:        number;
  total_pages:  number;
  global_stats: ClientGlobalStats;
}

export interface ClientTripItem {
  id:                string;
  scheduled_at:      string;
  pickup_address:    string;
  dest_address:      string;
  price_final:       number | null;
  price_estimated:   number;
  status:            string;
  driver_first_name: string | null;
  driver_last_name:  string | null;
  rating:            number | null;  // S6 — null jusqu'au module ratings
}

export interface ClientTripsResult {
  trips:       ClientTripItem[];
  total:       number;
  page:        number;
  limit:       number;
  total_pages: number;
}

// ── Création d'un gestionnaire ────────────────────────────────────────────────

export interface CreateManagerDto {
  email: string;
  password?: string;
  first_name: string;
  last_name: string;
  phone?: string;
  coverage_zone?: string;
  priority_level?: number;
}

export interface UpdateManagerDto {
  first_name?: string;
  last_name?: string;
  phone?: string;
  coverage_zone?: string;
  priority_level?: number;
}

export interface ChangeManagerStatusDto {
  status: UserStatus;
  reason: string;
}

export interface ManagerListFilters {
  status?: UserStatus;
  search?: string;
  page?: number;
  limit?: number;
}

// ── Statistiques globales dashboard (admin) ───────────────────────────────────

export type AdminStatsPeriod = 'all' | 'day' | 'week' | 'month';

export interface AdminStatsFilters {
  period?:    AdminStatsPeriod;
  date?:      string;
  date_from?: string;
  date_to?:   string;
}

export interface AdminStats {
  date_from?: string | null;
  date_to?:   string | null;
  reservations: {
    total:       number;
    by_status:   Record<string, number>;
  };
  revenue: {
    total_eur:   number;
    total_xof:   number;
  };
  drivers: {
    total:       number;
    active:      number;
    online:      number;
    on_trip:     number;
  };
  clients: {
    total:       number;
    active:      number;
  };
  vehicle_type_distribution: Record<string, number>;
}
