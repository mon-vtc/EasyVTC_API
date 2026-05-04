import { supabaseAdmin } from '../../database/supabase/client.js';
import { sendWelcomeEmail, sendResetPasswordEmail, sendPasswordChangedEmail } from '../../utils/email.service.js';
import { env } from '../../config/env.js';
import type { Vehicle } from '../vehicles/vehicles.types.js'
import type { RegisterDto, LoginDto, AuthResponse, AuthUser, DriverProfile } from './auth.types.js';
import type { ManagerPermission } from '../admin/admin.types.js';

export class AuthService {

  // ── HELPER PRIVÉ : récupérer le profil complet (users + driver si applicable) ──
private async fetchFullProfile(userId: string): Promise<AuthUser> {
  const { data: user, error } = await supabaseAdmin
    .from('users')
    .select('*')
    .eq('id', userId)
    .single();

  if (error || !user) {
    throw { status: 404, message: 'Profil utilisateur introuvable' };
  }

  let driver: DriverProfile | null = null;
  let vehicle: Vehicle | null = null;
  let permissions: ManagerPermission[] = [];

  if (user.role === 'driver') {
    const { data: driverData } = await supabaseAdmin
      .from('drivers')
      .select('id, status, vehicle_type, siret, tva_rate, is_online, zone, created_at, updated_at')
      .eq('user_id', userId)
      .single();

    driver = driverData ?? null;

    if (driverData?.id) {
      const { data: vehicleData } = await supabaseAdmin
        .from('vehicles')
        .select('*')
        .eq('driver_id', driverData.id)
        .eq('is_active', true)
        .single();

      vehicle = vehicleData ?? null;
    }
  }

  if (user.role === 'manager') {
    const { data: permsData } = await supabaseAdmin
      .from('manager_permissions')
      .select('permission')
      .eq('manager_id', userId);
    permissions = (permsData ?? []).map(r => r.permission as ManagerPermission);
  }

  return { ...user, driver, vehicle, permissions } as AuthUser;
}
 
  // ── REGISTER ──────────────────────────────────────────────────────────────
  async register(dto: RegisterDto): Promise<AuthResponse> {
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: dto.email,
      password: dto.password,
      phone: dto.phone,
      email_confirm: true,
      user_metadata: {
        first_name: dto.first_name,
        last_name: dto.last_name,
        role: dto.role,
        rgpd_consent: dto.rgpd_consent ?? false,
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

    // Retry : attendre que le trigger handle_new_user s'exécute
    let profileExists = false;
    for (let attempt = 0; attempt < 5; attempt++) {
      const { data } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('id', authData.user.id)
        .single();

      if (data) { profileExists = true; break; }
      await new Promise((r) => setTimeout(r, 400));
    }

    // Fallback : si le trigger n'a pas créé le profil, on le crée manuellement
    if (!profileExists) {
      console.warn('[Register] Trigger handle_new_user timed out — fallback insert manuel');

      const { error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          id:              authData.user.id,
          email:           dto.email,
          first_name:      dto.first_name,
          last_name:       dto.last_name,
          phone:           dto.phone,
          role:            dto.role,
          rgpd_consent:    dto.rgpd_consent ?? false,
          rgpd_consent_at: dto.rgpd_consent ? new Date().toISOString() : null,
        });

      if (insertError) {
        console.error('[Register] Fallback insert échoué :', insertError?.message);
        await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
        throw { status: 500, message: 'Erreur lors de la création du profil' };
      }

      // Si c'est un chauffeur, créer aussi le profil driver
      if (dto.role === 'driver') {
        await supabaseAdmin
          .from('drivers')
          .upsert({ user_id: authData.user.id }, { onConflict: 'user_id', ignoreDuplicates: true });
      }
    }

    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (signInError || !signIn.session) {
      throw { status: 500, message: 'Compte créé mais impossible de générer le token' };
    }

    const userProfile = await this.fetchFullProfile(authData.user.id);

    // ── Email de bienvenue (non bloquant) ──────────────────────────────────
    sendWelcomeEmail(dto.email, dto.first_name).catch((err) =>
      console.warn('[Email] Welcome email failed:', err)
    );

    return {
      user: userProfile,
      access_token: signIn.session.access_token,
      refresh_token: signIn.session.refresh_token,
      token_type: 'Bearer',
    };
  }

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  async login(dto: LoginDto): Promise<AuthResponse> {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (error || !data.session) {
      throw { status: 401, message: 'Email ou mot de passe incorrect' };
    }

    // Dans ton ExceptionFilter ou directement dans le service
    try {
      const userProfile = await this.fetchFullProfile(data.user.id);
      if (userProfile.deleted_at !== null || userProfile.status !== 'active') {
        throw { status: 403, message: 'Votre compte a été désactivé. Contactez le support.' };
      }
      return {
        user: userProfile,
        access_token: data.session.access_token,
        refresh_token: data.session.refresh_token,
        token_type: 'Bearer',
      };
    } catch (err) {
      console.error('[Login] Erreur fetchFullProfile:', err); // ← log complet
      throw err;
    }


  }

  // ── LOGOUT ────────────────────────────────────────────────────────────────
  async logout(accessToken: string): Promise<void> {
    const { error } = await supabaseAdmin.auth.admin.signOut(accessToken);
    if (error) console.warn('[Auth] Logout warning:', error.message);
  }

  // ── REFRESH TOKEN ─────────────────────────────────────────────────────────
  async refreshToken(refreshToken: string): Promise<{ access_token: string; refresh_token: string }> {
    const { data, error } = await supabaseAdmin.auth.refreshSession({ refresh_token: refreshToken });

    if (error || !data.session) {
      throw { status: 401, message: 'Refresh token invalide ou expiré. Reconnectez-vous.' };
    }

    return {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    };
  }

  // ── FORGOT PASSWORD ───────────────────────────────────────────────────────
  async forgotPassword(email: string): Promise<void> {
    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('first_name')
      .eq('email', email)
      .single();

    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${env.MOBILE_DEEP_LINK_SCHEME}://reset-password`,
      },
    });

    if (error || !data) {
      console.warn('[Auth] Generate reset link warning:', error?.message);
      return;
    }

    if (userProfile?.first_name) {
      sendResetPasswordEmail(
        email,
        userProfile.first_name,
        data.properties.action_link
      ).catch((err) => console.warn('[Email] Reset email failed:', err));
    }
  }

  // ── RESET PASSWORD ────────────────────────────────────────────────────────
  async resetPassword(tokenOrJwt: string, newPassword: string): Promise<void> {

    let userId: string | null = null;
    let userEmail: string | null = null;
    let userFirstName: string | null = null;

    if (tokenOrJwt.startsWith('eyJ')) {
      const { data: { user }, error } = await supabaseAdmin.auth.getUser(tokenOrJwt);
      if (error || !user) {
        throw { status: 401, message: 'Token invalide ou expiré' };
      }
      userId = user.id;
      userEmail = user.email ?? null;
    } else {
      const { data, error } = await supabaseAdmin.auth.verifyOtp({
        token_hash: tokenOrJwt,
        type: 'recovery',
      });
      if (error || !data.user) {
        throw { status: 401, message: 'Token de réinitialisation invalide ou expiré' };
      }
      userId = data.user.id;
      userEmail = data.user.email ?? null;
    }

    const { data: profile } = await supabaseAdmin
      .from('users')
      .select('first_name')
      .eq('id', userId)
      .single();
    userFirstName = profile?.first_name ?? null;

    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      throw { status: 400, message: 'Impossible de mettre à jour le mot de passe' };
    }

    if (userEmail && userFirstName) {
      sendPasswordChangedEmail(userEmail, userFirstName).catch((err) =>
        console.warn('[Email] Password changed email failed:', err)
      );
    }
  }

  // ── ME ────────────────────────────────────────────────────────────────────
  async getMe(userId: string): Promise<AuthUser> {
    return this.fetchFullProfile(userId);
  }

  // ── GOOGLE AUTH — URL de redirection ─────────────────────────────────────
  async getGoogleAuthUrl(redirectTo?: string): Promise<string> {
    const callbackUrl = encodeURIComponent(
      redirectTo ?? `${env.APP_URL}/auth/google/callback`
    );
    const supabaseUrl = env.SUPABASE_URL.replace(/\/$/, '');
    return `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${callbackUrl}`;
  }

  // ── GOOGLE AUTH — Échange du code ─────────────────────────────────────────
  async handleGoogleCallback(code: string): Promise<AuthResponse> {
    const { data, error } = await supabaseAdmin.auth.exchangeCodeForSession(code);

    if (error || !data.session) {
      throw { status: 401, message: 'Code Google invalide ou expiré' };
    }

    const supabaseUser = data.user;

    // Vérifier si le profil existe déjà
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', supabaseUser.id)
      .single();

    if (!existing) {
      const firstName = supabaseUser.user_metadata?.['given_name']
                     ?? supabaseUser.user_metadata?.['full_name']?.split(' ')[0]
                     ?? 'Utilisateur';
      const lastName  = supabaseUser.user_metadata?.['family_name']
                     ?? supabaseUser.user_metadata?.['full_name']?.split(' ').slice(1).join(' ')
                     ?? '';

      const { error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          id: supabaseUser.id, email: supabaseUser.email,
          first_name: firstName, last_name: lastName,
          phone: null, role: 'client', rgpd_consent: false,
        });

      if (insertError) {
        throw { status: 500, message: 'Erreur lors de la création du profil Google' };
      }
      sendWelcomeEmail(supabaseUser.email!, firstName).catch((err) =>
        console.warn('[Email] Welcome Google email failed:', err)
      );
    }

    const userProfile = await this.fetchFullProfile(supabaseUser.id);

    if (userProfile.deleted_at !== null || userProfile.status !== 'active') {
      throw { status: 403, message: 'Votre compte a été désactivé. Contactez le support.' };
    }

    return {
      user: userProfile,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      token_type: 'Bearer',
    };
  }

  // ── GOOGLE AUTH — Depuis access_token fragment ────────────────────────────
  async handleGoogleToken(accessToken: string, refreshToken?: string): Promise<AuthResponse> {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);

    if (error || !user) {
      throw { status: 401, message: 'Token Google invalide ou expiré' };
    }

    // Vérifier si le profil existe déjà
    const { data: existing } = await supabaseAdmin
      .from('users')
      .select('id')
      .eq('id', user.id)
      .single();

    if (!existing) {
      const firstName = user.user_metadata?.['given_name']
                     ?? user.user_metadata?.['full_name']?.split(' ')[0]
                     ?? 'Utilisateur';
      const lastName  = user.user_metadata?.['family_name']
                     ?? user.user_metadata?.['full_name']?.split(' ').slice(1).join(' ')
                     ?? '';

      const { error: insertError } = await supabaseAdmin
        .from('users')
        .insert({
          id: user.id, email: user.email,
          first_name: firstName, last_name: lastName,
          phone: null, role: 'client', rgpd_consent: false,
        });

      if (insertError) {
        throw { status: 500, message: 'Erreur lors de la création du profil Google' };
      }
      sendWelcomeEmail(user.email!, firstName).catch((err) =>
        console.warn('[Email] Welcome Google email failed:', err)
      );
    }

    const userProfile = await this.fetchFullProfile(user.id);

    if (userProfile.deleted_at !== null || userProfile.status !== 'active') {
      throw { status: 403, message: 'Compte désactivé. Contactez le support.' };
    }

    return {
      user: userProfile,
      access_token: accessToken,
      refresh_token: refreshToken ?? null,
      token_type: 'Bearer',
    };
  }

  // ── CHANGE PASSWORD (utilisateur connecté) ─────────────────────────────────
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    // 1. Récupérer l'email de l'utilisateur
    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('email, first_name')
      .eq('id', userId)
      .single();

    if (profileError || !userProfile?.email) {
      throw { status: 404, message: 'Utilisateur introuvable' };
    }

    // 2. Vérifier l'ancien mot de passe en tentant une connexion
    const { error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: userProfile.email,
      password: currentPassword,
    });

    if (signInError) {
      throw { status: 401, message: 'Mot de passe actuel incorrect' };
    }

    // 3. Mettre à jour le mot de passe
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: newPassword,
    });

    if (updateError) {
      throw { status: 400, message: 'Impossible de mettre à jour le mot de passe' };
    }

    // 4. Envoyer l'email de confirmation
    if (userProfile.first_name) {
      sendPasswordChangedEmail(userProfile.email, userProfile.first_name).catch((err) =>
        console.warn('[Email] Password changed email failed:', err)
      );
    }
  }
}

export const authService = new AuthService();