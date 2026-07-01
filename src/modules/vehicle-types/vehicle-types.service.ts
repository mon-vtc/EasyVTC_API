// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Vehicle Types
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../../database/supabase/client.js';
import type {
  VehicleTypeRecord,
  VehicleTypePublic,
  CreateVehicleTypeDto,
  UpdateVehicleTypeDto,
} from './vehicle-types.types.js';

export class VehicleTypesService {

  // ── PUBLIC : Liste des types actifs (endpoint mobile / client) ───────────────
  async getActiveTypes(country?: string): Promise<VehicleTypePublic[]> {
    const { data, error } = await supabaseAdmin
      .from('vehicle_types')
      .select('code, label, description, capacity, icon, base_price_france, base_price_senegal')
      .eq('is_active', true)
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[VehicleTypes] getActiveTypes error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des types de véhicule' };
    }

    const isSenegal = country === 'senegal';

    return (data ?? []).map((row) => ({
      code:        row.code,
      label:       row.label,
      description: row.description,
      capacity:    row.capacity,
      icon:        row.icon,
      base_price:  isSenegal ? Number(row.base_price_senegal) : Number(row.base_price_france),
    }));
  }

  // ── ADMIN : Liste complète (actifs + inactifs) ────────────────────────────────
  async getAllTypes(): Promise<VehicleTypeRecord[]> {
    const { data, error } = await supabaseAdmin
      .from('vehicle_types')
      .select('*')
      .order('sort_order', { ascending: true });

    if (error) {
      console.error('[VehicleTypes] getAllTypes error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des types de véhicule' };
    }

    return data ?? [];
  }

  // ── ADMIN : Récupérer un type par ID ──────────────────────────────────────────
  async getTypeById(id: string): Promise<VehicleTypeRecord> {
    const { data, error } = await supabaseAdmin
      .from('vehicle_types')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      throw { status: 404, message: 'Type de véhicule non trouvé' };
    }

    return data;
  }

  // ── ADMIN : Créer un type ─────────────────────────────────────────────────────
  async createType(dto: CreateVehicleTypeDto): Promise<VehicleTypeRecord> {
    const { data, error } = await supabaseAdmin
      .from('vehicle_types')
      .insert({
        code:               dto.code,
        label:              dto.label,
        description:        dto.description ?? null,
        capacity:           dto.capacity,
        icon:               dto.icon ?? null,
        base_price_france:  dto.base_price_france,
        base_price_senegal: dto.base_price_senegal,
        is_active:          dto.is_active,
        sort_order:         dto.sort_order,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw { status: 409, message: `Un type de véhicule avec le code "${dto.code}" existe déjà` };
      }
      console.error('[VehicleTypes] createType error:', error);
      throw { status: 500, message: 'Erreur lors de la création du type de véhicule' };
    }

    return data!;
  }

  // ── ADMIN : Mettre à jour un type ─────────────────────────────────────────────
  async updateType(id: string, dto: UpdateVehicleTypeDto): Promise<VehicleTypeRecord> {
    const { data: existing } = await supabaseAdmin
      .from('vehicle_types')
      .select('id')
      .eq('id', id)
      .single();

    if (!existing) {
      throw { status: 404, message: 'Type de véhicule non trouvé' };
    }

    const { data, error } = await supabaseAdmin
      .from('vehicle_types')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      console.error('[VehicleTypes] updateType error:', error);
      throw { status: 500, message: 'Erreur lors de la mise à jour du type de véhicule' };
    }

    return data;
  }

  // ── ADMIN : Supprimer un type ─────────────────────────────────────────────────
  // Hard delete uniquement si aucune référence active n'existe.
  // Si des réservations ou véhicules utilisent ce code, on lève une erreur 409.
  async deleteType(id: string): Promise<void> {
    const { data: existing } = await supabaseAdmin
      .from('vehicle_types')
      .select('id, code')
      .eq('id', id)
      .single();

    if (!existing) {
      throw { status: 404, message: 'Type de véhicule non trouvé' };
    }

    const code = existing.code;

    // Vérifier les réservations qui référencent ce code
    const { count: reservationCount, error: resError } = await supabaseAdmin
      .from('reservations')
      .select('id', { count: 'exact', head: true })
      .eq('vehicle_type', code);

    if (resError) {
      throw { status: 500, message: 'Erreur lors de la vérification des dépendances' };
    }

    if ((reservationCount ?? 0) > 0) {
      throw {
        status: 409,
        message: `Impossible de supprimer ce type : ${reservationCount} réservation(s) l'utilisent. Désactivez-le à la place (is_active: false).`,
      };
    }

    // Vérifier les véhicules qui référencent ce code
    const { count: vehicleCount, error: vehError } = await supabaseAdmin
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .eq('type', code);

    if (vehError) {
      throw { status: 500, message: 'Erreur lors de la vérification des dépendances' };
    }

    if ((vehicleCount ?? 0) > 0) {
      throw {
        status: 409,
        message: `Impossible de supprimer ce type : ${vehicleCount} véhicule(s) l'utilisent. Désactivez-le à la place (is_active: false).`,
      };
    }

    const { error: deleteError } = await supabaseAdmin
      .from('vehicle_types')
      .delete()
      .eq('id', id);

    if (deleteError) {
      console.error('[VehicleTypes] deleteType error:', deleteError);
      throw { status: 500, message: 'Erreur lors de la suppression du type de véhicule' };
    }
  }

  // ── UTILITAIRE : Valider qu'un code est actif (utilisé par d'autres services) ─
  async validateCode(code: string): Promise<void> {
    const { data, error } = await supabaseAdmin
      .from('vehicle_types')
      .select('id')
      .eq('code', code)
      .eq('is_active', true)
      .single();

    if (error || !data) {
      throw { status: 400, message: `Type de véhicule invalide ou inactif : "${code}"` };
    }
  }
}

export const vehicleTypesService = new VehicleTypesService();
