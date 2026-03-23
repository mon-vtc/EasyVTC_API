import { supabaseAdmin } from '../../database/supabase/client.js';
import type { 
  UserProfile, 
  UpdateProfileDto, 
  UploadAvatarResult, 
  ChangeUserStatusDto,
  UserListFilters,
  UserListResult,
} from './users.types.js';

// Colonnes sélectionnées pour le profil utilisateur
const USER_PROFILE_COLUMNS = `
  id, email, role, first_name, last_name, phone,
  profile_photo_url, status, status_changed_by, status_changed_at, status_reason,
  rgpd_consent, rgpd_consent_at, deleted_at, created_at, updated_at
`;

export class UsersService {

  // ══════════════════════════════════════════════════════════════════════════
  // ENDPOINTS UTILISATEUR (self)
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET MON PROFIL ────────────────────────────────────────────────────────
  async getProfile(userId: string): Promise<UserProfile> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select(USER_PROFILE_COLUMNS)
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw { status: 404, message: 'Utilisateur introuvable' };
    }

    // Vérifier le statut du compte
    if (data.status === 'inactive') {
      throw { status: 403, message: 'Votre compte a été désactivé. Contactez le support.' };
    }
    if (data.status === 'locked') {
      throw { status: 403, message: 'Votre compte est temporairement verrouillé. Contactez le support.' };
    }

    return data as UserProfile;
  }

  // ── MODIFIER MON PROFIL ───────────────────────────────────────────────────
  async updateProfile(userId: string, dto: UpdateProfileDto): Promise<UserProfile> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', userId)
      .eq('status', 'active') // Seuls les comptes actifs peuvent être modifiés
      .select(USER_PROFILE_COLUMNS)
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

  // ══════════════════════════════════════════════════════════════════════════
  // ENDPOINTS ADMIN
  // ══════════════════════════════════════════════════════════════════════════

  // ── LISTER LES UTILISATEURS (pagination + filtres) ────────────────────────
  async listUsers(filters: UserListFilters): Promise<UserListResult> {
    const page = filters.page ?? 1;
    const limit = filters.limit ?? 20;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('users')
      .select(USER_PROFILE_COLUMNS, { count: 'exact' });

    // Filtres optionnels
    if (filters.role) {
      query = query.eq('role', filters.role);
    }
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.search) {
      const searchTerm = `%${filters.search}%`;
      query = query.or(`email.ilike.${searchTerm},first_name.ilike.${searchTerm},last_name.ilike.${searchTerm}`);
    }

    // Pagination et tri
    query = query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      throw { status: 500, message: 'Erreur lors de la récupération des utilisateurs' };
    }

    const total = count ?? 0;

    return {
      users: (data ?? []) as UserProfile[],
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }

  // ── OBTENIR UN UTILISATEUR PAR ID (admin) ─────────────────────────────────
  async getUserById(userId: string): Promise<UserProfile> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select(USER_PROFILE_COLUMNS)
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw { status: 404, message: 'Utilisateur introuvable' };
    }

    return data as UserProfile;
  }

  // ── CHANGER LE STATUT D'UN UTILISATEUR (admin) ────────────────────────────
  async changeUserStatus(
    targetUserId: string, 
    dto: ChangeUserStatusDto, 
    adminId: string
  ): Promise<UserProfile> {
    
    // Vérifier que l'admin ne se désactive pas lui-même
    if (targetUserId === adminId && dto.status !== 'active') {
      throw { status: 400, message: 'Vous ne pouvez pas désactiver ou verrouiller votre propre compte' };
    }

    // Vérifier que l'utilisateur cible existe
    const { data: targetUser, error: checkError } = await supabaseAdmin
      .from('users')
      .select('id, role')
      .eq('id', targetUserId)
      .single();

    if (checkError || !targetUser) {
      throw { status: 404, message: 'Utilisateur introuvable' };
    }

    // Un admin ne peut pas modifier le statut d'un autre admin
    if (targetUser.role === 'admin' && targetUserId !== adminId) {
      throw { status: 403, message: 'Vous ne pouvez pas modifier le statut d\'un autre administrateur' };
    }

    // Mettre à jour le statut
    const { data, error } = await supabaseAdmin
      .from('users')
      .update({
        status: dto.status,
        status_reason: dto.reason,
        status_changed_by: adminId,
        status_changed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', targetUserId)
      .select(USER_PROFILE_COLUMNS)
      .single();

    if (error || !data) {
      throw { status: 500, message: 'Erreur lors du changement de statut' };
    }

    // TODO: Si le statut devient 'inactive' ou 'locked', invalider les sessions de l'utilisateur
    // Cela nécessite d'appeler supabaseAdmin.auth.admin.signOut() avec l'ID de l'utilisateur
    if (dto.status !== 'active') {
      // Invalider toutes les sessions de l'utilisateur
      await supabaseAdmin.auth.admin.signOut(targetUserId, 'global').catch((err) => {
        console.warn(`[UsersService] Impossible d'invalider les sessions de ${targetUserId}:`, err);
      });
    }

    return data as UserProfile;
  }
}

export const usersService = new UsersService();