// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Vehicle Types
// Sprint 3 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

export interface VehicleTypeRecord {
  id: string;
  code: string;
  label: string;
  description: string | null;
  capacity: number;
  icon: string | null;
  base_price_france: number;
  base_price_senegal: number;
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface VehicleTypePublic {
  code: string;
  label: string;
  description: string | null;
  capacity: number;
  icon: string | null;
  base_price: number;
}

export type CreateVehicleTypeDto = Omit<VehicleTypeRecord, 'id' | 'created_at' | 'updated_at'>;
export type UpdateVehicleTypeDto = Partial<Omit<CreateVehicleTypeDto, 'code'>>;
