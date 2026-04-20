// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Admin (Gestion des gestionnaires)
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin }         from '../../database/supabase/client.js';
import { sendWelcomeEmail }      from '../../utils/email.service.js';
import { usersService }          from '../users/users.service.js';
import type { UserProfile }      from '../users/users.types.js';
import type {
  CreateManagerDto,
  ChangeManagerStatusDto,
  ManagerListFilters,
  ManagerListResult,
} from './admin.types.js';

// Colonnes sélectionnées — identiques à users.service
const USER_PROFILE_COLUMNS = `
  id, email, role, first_name, last_name, phone,
  profile_photo_url, status, status_changed_by, status_changed_at, status_reason,
  rgpd_consent, rgpd_consent_at, deleted_at, created_at, updated_at
`;

export class AdminService {

  // ══════════════════════════════════════════════════════════════════════════
  // CRÉER UN GESTIONNAIRE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Crée un compte gestionnaire via Supabase Auth puis attend le trigger
   * handle_new_user. Si le trigger tarde, un insert manuel est effectué.
   * L'email de bienvenue est envoyé de façon non bloquante.
   */
  async createManager(dto: CreateManagerDto, adminId: string): Promise<UserProfile> {
    // 1. Création du compte auth
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email:         dto.email,
        password:      dto.password,
        phone:         dto.phone,
        email_confirm: true,
        user_metadata: {
          first_name: dto.first_name,
          last_name:  dto.last_name,
          role:       'manager',
        },
      });

    if (authError) {
      if (
        authError.message.includes('already registered') ||
        authError.code === 'email_exists' ||
        authError.message.includes('already been registered')
      ) {
        throw { status: 409, message: 'Un compte existe déjà avec cet email' };
      }
      throw { status: 400, message: authError.message };
    }

    if (!authData.user) {
      throw { status: 500, message: 'Erreur lors de la création du compte' };
    }

    const userId = authData.user.id;

    // 2. Attendre le trigger handle_new_user (jusqu'à 5 tentatives × 400 ms)
    let profileExists = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', userId)
        .single();

      if (data) { profileExists = true; break; }
      await new Promise((r) => setTimeout(r, 400));
    }

    // 3. Fallback : insert manuel si le trigger n'a pas réagi
    if (!profileExists) {
      console.warn('[AdminService] Trigger handle_new_user timed out — fallback insert manuel');

      const { error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          id:               userId,
          email:            dto.email,
          first_name:       dto.first_name,
          last_name:        dto.last_name,
          phone:            dto.phone ?? null,
          role:             'manager',
          status:           'active',
          status_changed_by: adminId,
          status_changed_at: new Date().toISOString(),
          status_reason:    'Compte créé par un administrateur',
          rgpd_consent:     false,
        });

      if (insertError) {
        console.error('[AdminService] Fallback insert échoué :', insertError.message);
        // Nettoyer l'entrée auth pour éviter un compte orphelin
        await supabaseAdmin.auth.admin.deleteUser(userId);
        throw { status: 500, message: 'Erreur lors de la création du profil gestionnaire' };
      }
    }

    // 4. Récupérer le profil complet
    const { data: profile, error: profileError } = await supabaseAdmin
      .from('users')
      .select(USER_PROFILE_COLUMNS)
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      throw { status: 500, message: 'Profil créé mais introuvable' };
    }

    // 5. Email de bienvenue (non bloquant)
    sendWelcomeEmail(dto.email, dto.first_name).catch((err) =>
      console.warn('[AdminService] Welcome email failed:', err)
    );

    return profile as UserProfile;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // LISTER LES GESTIONNAIRES
  // ══════════════════════════════════════════════════════════════════════════

  async listManagers(filters: ManagerListFilters): Promise<ManagerListResult> {
    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 20;
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    let query = supabaseAdmin
      .from('users')
      .select(USER_PROFILE_COLUMNS, { count: 'exact' })
      .eq('role', 'manager')
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.search) {
      const s = `%${filters.search}%`;
      query = query.or(
        `email.ilike.${s},first_name.ilike.${s},last_name.ilike.${s}`
      );
    }

    const { data, error, count } = await query;

    if (error) {
      throw { status: 500, message: 'Erreur lors de la récupération des gestionnaires' };
    }

    const total       = count ?? 0;
    const total_pages = Math.ceil(total / limit);

    return {
      managers: (data ?? []) as UserProfile[],
      total,
      page,
      limit,
      total_pages,
    };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // DÉTAIL D'UN GESTIONNAIRE
  // ══════════════════════════════════════════════════════════════════════════

  async getManagerById(managerId: string): Promise<UserProfile> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select(USER_PROFILE_COLUMNS)
      .eq('id', managerId)
      .eq('role', 'manager')
      .is('deleted_at', null)
      .single();

    if (error || !data) {
      throw { status: 404, message: 'Gestionnaire introuvable' };
    }

    return data as UserProfile;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CHANGER LE STATUT D'UN GESTIONNAIRE
  // ══════════════════════════════════════════════════════════════════════════

  /**
   * Délègue à usersService.changeUserStatus — même logique métier,
   * avec vérification supplémentaire que la cible est bien un gestionnaire.
   */
  async changeManagerStatus(
    managerId: string,
    dto:       ChangeManagerStatusDto,
    adminId:   string,
  ): Promise<UserProfile> {
    // Vérifier que la cible est bien un gestionnaire
    await this.getManagerById(managerId);

    // Réutiliser la logique éprouvée du module users
    return usersService.changeUserStatus(managerId, dto, adminId);
  }
}

export const adminService = new AdminService();
