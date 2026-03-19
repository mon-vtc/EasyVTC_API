import { supabaseAdmin } from '../../database/supabase/client.js';
import type { UserProfile, UpdateProfileDto, UploadAvatarResult } from './users.types.js';

export class UsersService {

  // ── GET MON PROFIL ────────────────────────────────────────────────────────
  async getProfile(userId: string): Promise<UserProfile> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select(`
        id, email, role, first_name, last_name, phone,
        profile_photo_url, rgpd_consent, rgpd_consent_at,
        deleted_at, created_at, updated_at
      `)
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw { status: 404, message: 'Utilisateur introuvable' };
    }

    return data as UserProfile;
  }

  // ── MODIFIER MON PROFIL ───────────────────────────────────────────────────
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfile> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .select(`
        id, email, role, first_name, last_name, phone,
        profile_photo_url, rgpd_consent, rgpd_consent_at,
        deleted_at, created_at, updated_at
      `)
      .single();

    if (error || !data) {
      // Vérifier si numéro de téléphone déjà utilisé
      if (error?.code === '23505') {
        throw { status: 409, message: 'Ce numéro de téléphone est déjà utilisé' };
      }
      throw { status: 500, message: 'Erreur lors de la mise à jour du profil' };
    }

    return data as UserProfile;
  }

  // ── UPLOAD PHOTO DE PROFIL ────────────────────────────────────────────────
  async uploadAvatar(userId: string, fileBuffer: Buffer, mimeType: string): Promise<UploadAvatarResult> {

    // Vérifier le type MIME
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowedTypes.includes(mimeType)) {
      throw { status: 400, message: 'Format non supporté. Utilisez JPG, PNG ou WebP.' };
    }

    const ext = mimeType.split('/')[1] === 'jpeg' ? 'jpg' : mimeType.split('/')[1];
    const filePath = `${userId}/avatar.${ext}`;

    // Upload dans le bucket Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from('profile-photos')
      .upload(filePath, fileBuffer, {
        contentType: mimeType,
        upsert: true,  // Remplace si existe déjà
      });

    if (uploadError) {
      throw { status: 500, message: `Erreur upload : ${uploadError.message}` };
    }

    // Générer une URL signée valable 1 an (365 jours)
    const { data: signedUrl, error: urlError } = await supabaseAdmin.storage
      .from('profile-photos')
      .createSignedUrl(filePath, 60 * 60 * 24 * 365);

    if (urlError || !signedUrl) {
      throw { status: 500, message: 'Erreur lors de la génération de l\'URL' };
    }

    // Mettre à jour la colonne profile_photo_url dans la table users
    const { error: updateError } = await supabaseAdmin
      .from('users')
      .update({
        profile_photo_url: signedUrl.signedUrl,
        updated_at: new Date().toISOString(),
      })
      .eq('id', userId);

    if (updateError) {
      throw { status: 500, message: 'Erreur lors de la sauvegarde de l\'URL' };
    }

    return { profile_photo_url: signedUrl.signedUrl };
  }

  // ── SUPPRIMER MON COMPTE (soft delete) ────────────────────────────────────
  async deleteAccount(userId: string): Promise<void> {
    const { error } = await supabaseAdmin
      .from('users')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      throw { status: 500, message: 'Erreur lors de la suppression du compte' };
    }
  }
}

export const usersService = new UsersService();