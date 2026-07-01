// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Véhicules
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../../database/supabase/client.js';
import { vehicleTypesService } from '../vehicle-types/vehicle-types.service.js';
import {
  Vehicle,
  VehicleWithDriver,
  CreateVehicleDto,
  UpdateVehicleDto,
  VehicleListFilters,
  VehicleListResult,
} from './vehicles.types.js';

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════════════════════

const BUCKET_NAME        = 'driver-vehicles';
const ALLOWED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX_PHOTO_SIZE      = 5 * 1024 * 1024;           // 5 Mo
const SIGNED_URL_EXPIRY   = 60 * 60 * 24 * 365;        // 1 an (comme l'avatar)

// ══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ══════════════════════════════════════════════════════════════════════════════

export class VehiclesService {

  // ────────────────────────────────────────────────────────────────────────────
  // HELPER PRIVÉ : Extraire le filePath depuis une signed URL stockée en base
  // Format : .../object/sign/driver-vehicles/<filePath>?token=...
  // ────────────────────────────────────────────────────────────────────────────
  private extractFilePath(signedUrl: string): string | null {
    try {
      const match = signedUrl.match(/\/object\/sign\/driver-vehicles\/(.+?)(\?|$)/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  // ────────────────────────────────────────────────────────────────────────────
  // HELPER PRIVÉ : Générer et stocker une signed URL (1 an)
  // ────────────────────────────────────────────────────────────────────────────
  private async createAndStoreSignedUrl(filePath: string, vehicleId: string): Promise<string> {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

    if (error || !data?.signedUrl) {
      throw { status: 500, message: "Erreur lors de la génération de l'URL signée" };
    }

    // Stocker la signed URL en base (comme l'avatar)
    const { error: updateError } = await supabaseAdmin
      .from('vehicles')
      .update({
        photo_url:  data.signedUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', vehicleId);

    if (updateError) {
      throw { status: 500, message: "Erreur lors de la sauvegarde de l'URL" };
    }

    return data.signedUrl;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Récupérer le driver_id depuis user_id
  // ────────────────────────────────────────────────────────────────────────────
  async getDriverIdFromUserId(userId: string): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw {
        status: 404,
        message: 'Profil chauffeur non trouvé. Vous devez être enregistré en tant que chauffeur.',
      };
    }

    return data.id;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CHAUFFEUR : Créer un véhicule
  // ────────────────────────────────────────────────────────────────────────────
  async createVehicle(userId: string, dto: CreateVehicleDto): Promise<Vehicle> {
    await vehicleTypesService.validateCode(dto.type);

    const driverId = await this.getDriverIdFromUserId(userId);

    const { data: vehicle, error } = await supabaseAdmin
      .from('vehicles')
      .insert({
        driver_id:    driverId,
        plate_number: dto.plate_number,
        brand:        dto.brand,
        model:        dto.model,
        year:         dto.year  ?? null,
        color:        dto.color ?? null,
        type:         dto.type,
        is_active:    true,
      })
      .select()
      .single();

    if (error || !vehicle) {
      console.error('[Vehicles] Create error:', error);
      throw { status: 500, message: 'Erreur lors de la création du véhicule' };
    }

    return vehicle;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CHAUFFEUR : Upload photo véhicule
  // ────────────────────────────────────────────────────────────────────────────
  async uploadVehiclePhoto(
    userId:     string,
    vehicleId:  string,
    fileBuffer: Buffer,
    mimeType:   string
  ): Promise<Vehicle> {

    if (!ALLOWED_IMAGE_MIMES.includes(mimeType)) {
      throw { status: 400, message: 'Format non supporté. Formats acceptés: JPG, PNG, WebP' };
    }

    if (fileBuffer.length > MAX_PHOTO_SIZE) {
      throw { status: 400, message: 'Fichier trop volumineux. Taille max: 5 Mo' };
    }

    // Vérifier l'ownership — on récupère le véhicule brut (photo_url = signed URL)
    const driverId = await this.getDriverIdFromUserId(userId);
    const { data: vehicle, error: fetchError } = await supabaseAdmin
      .from('vehicles')
      .select('*')
      .eq('id', vehicleId)
      .eq('driver_id', driverId)
      .single();

    if (fetchError || !vehicle) {
      throw { status: 404, message: 'Véhicule non trouvé' };
    }

    // Supprimer l'ancienne photo du storage si elle existe
    if (vehicle.photo_url) {
      const oldPath = this.extractFilePath(vehicle.photo_url);
      if (oldPath) {
        await supabaseAdmin.storage.from(BUCKET_NAME).remove([oldPath]);
      }
    }

    // Construire le chemin de stockage
    const ext       = mimeType.split('/')[1];
    const timestamp = Date.now();
    const filePath  = `${vehicle.driver_id}/${vehicleId}_${timestamp}.${ext}`;

    // Upload vers Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(filePath, fileBuffer, { contentType: mimeType, upsert: false });

    if (uploadError) {
      console.error('[Vehicles] Photo upload error:', uploadError);
      throw { status: 500, message: "Erreur lors de l'upload de la photo" };
    }

    // Générer la signed URL (1 an) et la stocker en base — comme l'avatar
    const signedUrl = await this.createAndStoreSignedUrl(filePath, vehicleId);

    // Retourner le véhicule mis à jour avec la signed URL
    const { data: updated, error: selectError } = await supabaseAdmin
      .from('vehicles')
      .select('*')
      .eq('id', vehicleId)
      .single();

    if (selectError || !updated) {
      throw { status: 500, message: 'Erreur lors de la récupération du véhicule mis à jour' };
    }

    return { ...updated, photo_url: signedUrl };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CHAUFFEUR : Lister ses véhicules
  // ────────────────────────────────────────────────────────────────────────────
  async getMyVehicles(userId: string): Promise<Vehicle[]> {
    const driverId = await this.getDriverIdFromUserId(userId);

    const { data: vehicles, error } = await supabaseAdmin
      .from('vehicles')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[Vehicles] List error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des véhicules' };
    }

    // La photo_url est déjà une signed URL stockée en base — on la retourne directement
    return vehicles || [];
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CHAUFFEUR : Récupérer un véhicule spécifique (vérifie l'ownership)
  // ────────────────────────────────────────────────────────────────────────────
  async getMyVehicle(userId: string, vehicleId: string): Promise<Vehicle> {
    const driverId = await this.getDriverIdFromUserId(userId);

    const { data: vehicle, error } = await supabaseAdmin
      .from('vehicles')
      .select('*')
      .eq('id', vehicleId)
      .eq('driver_id', driverId)
      .single();

    if (error || !vehicle) {
      throw { status: 404, message: 'Véhicule non trouvé' };
    }

    // La photo_url est déjà une signed URL stockée en base — on la retourne directement
    return vehicle;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CHAUFFEUR : Mettre à jour un véhicule
  // ────────────────────────────────────────────────────────────────────────────
  async updateVehicle(userId: string, vehicleId: string, dto: UpdateVehicleDto): Promise<Vehicle> {
    if (dto.type) {
      await vehicleTypesService.validateCode(dto.type);
    }

    const driverId = await this.getDriverIdFromUserId(userId);

    // Vérifier l'ownership
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('vehicles')
      .select('id')
      .eq('id', vehicleId)
      .eq('driver_id', driverId)
      .single();

    if (fetchError || !existing) {
      throw { status: 404, message: 'Véhicule non trouvé' };
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('vehicles')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', vehicleId)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('[Vehicles] Update error:', updateError);
      throw { status: 500, message: 'Erreur lors de la mise à jour du véhicule' };
    }

    return updated;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CHAUFFEUR : Supprimer un véhicule
  // ────────────────────────────────────────────────────────────────────────────
  async deleteVehicle(userId: string, vehicleId: string): Promise<void> {
    const driverId = await this.getDriverIdFromUserId(userId);

    const { data: vehicle, error: fetchError } = await supabaseAdmin
      .from('vehicles')
      .select('*')
      .eq('id', vehicleId)
      .eq('driver_id', driverId)
      .single();

    if (fetchError || !vehicle) {
      throw { status: 404, message: 'Véhicule non trouvé' };
    }

    // Extraire le filePath depuis la signed URL stockée et supprimer du storage
    if (vehicle.photo_url) {
      const filePath = this.extractFilePath(vehicle.photo_url);
      if (filePath) {
        await supabaseAdmin.storage.from(BUCKET_NAME).remove([filePath]);
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from('vehicles')
      .delete()
      .eq('id', vehicleId);

    if (deleteError) {
      console.error('[Vehicles] Delete error:', deleteError);
      throw { status: 500, message: 'Erreur lors de la suppression du véhicule' };
    }
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ADMIN : Lister tous les véhicules (avec filtres et pagination)
  // ════════════════════════════════════════════════════════════════════════════
  async getAllVehicles(filters: VehicleListFilters = {}): Promise<VehicleListResult> {
    const page   = filters.page  || 1;
    const limit  = filters.limit || 20;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('vehicles')
      .select(
        `*,
        driver:drivers!inner (
          id,
          user_id,
          status,
          user:users!inner (
            id,
            email,
            first_name,
            last_name,
            phone
          )
        )`,
        { count: 'exact' }
      );

    if (filters.driver_id)           query = query.eq('driver_id',  filters.driver_id);
    if (filters.type)                query = query.eq('type',        filters.type);
    if (filters.is_active !== undefined) query = query.eq('is_active', filters.is_active);

    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Vehicles] List all error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des véhicules' };
    }

    const total = count || 0;

    // La photo_url est déjà une signed URL en base — pas de traitement supplémentaire
    return {
      vehicles:    (data || []) as VehicleWithDriver[],
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ADMIN : Récupérer un véhicule par ID
  // ════════════════════════════════════════════════════════════════════════════
  async getVehicleById(vehicleId: string): Promise<VehicleWithDriver> {
    const { data: vehicle, error } = await supabaseAdmin
      .from('vehicles')
      .select(
        `*,
        driver:drivers!inner (
          id,
          user_id,
          status,
          user:users!inner (
            id,
            email,
            first_name,
            last_name,
            phone
          )
        )`
      )
      .eq('id', vehicleId)
      .single();

    if (error || !vehicle) {
      throw { status: 404, message: 'Véhicule non trouvé' };
    }

    return vehicle as VehicleWithDriver;
  }
}