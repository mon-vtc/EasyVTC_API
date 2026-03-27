// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Véhicules
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

// ── Enums (correspondant à la BDD) ───────────────────────────────────────────
export type VehicleType = 'standard' | 'berline' | 'van';

// ── Véhicule (entité BDD) ─────────────────────────────────────────────────────
export interface Vehicle {
  id: string;
  driver_id: string;
  plate_number: string;
  brand: string;
  model: string;
  year: number | null;
  color: string | null;
  type: VehicleType;
  photo_url: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

// ── Véhicule avec infos chauffeur (pour admin) ────────────────────────────────
export interface VehicleWithDriver extends Vehicle {
  driver: {
    id: string;
    user_id: string;
    status: string;
    user: {
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      phone: string | null;
    };
  };
}

// ── DTO pour création ─────────────────────────────────────────────────────────
export interface CreateVehicleDto {
  plate_number: string;
  brand: string;
  model: string;
  year?: number;
  color?: string;
  type: VehicleType;
}

// ── DTO pour mise à jour ──────────────────────────────────────────────────────
export interface UpdateVehicleDto {
  plate_number?: string;
  brand?: string;
  model?: string;
  year?: number;
  color?: string;
  type?: VehicleType;
  is_active?: boolean;
}

// ── Filtres pour liste admin ──────────────────────────────────────────────────
export interface VehicleListFilters {
  driver_id?: string;
  type?: VehicleType;
  is_active?: boolean;
  page?: number;
  limit?: number;
}

// ── Résultat paginé ───────────────────────────────────────────────────────────
export interface VehicleListResult {
  vehicles: VehicleWithDriver[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}
