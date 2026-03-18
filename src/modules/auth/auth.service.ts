import { supabaseAdmin } from '../../database/supabase/client.js';
import { sendWelcomeEmail, sendResetPasswordEmail } from '../../utils/email.service.js';
import { env } from '../../config/env.js';
import type { RegisterDto, LoginDto, AuthResponse, AuthUser } from './auth.types.js';

export class AuthService {

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
    let userProfile: AuthUser | null = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      const { data } = await supabaseAdmin
        .from('users')
        .select('id, email, role, first_name, last_name, phone, deleted_at, created_at')
        .eq('id', authData.user.id)
        .single();

      if (data) { userProfile = data as AuthUser; break; }
      await new Promise((r) => setTimeout(r, 300));
    }

    if (!userProfile) {
      await supabaseAdmin.auth.admin.deleteUser(authData.user.id);
      throw { status: 500, message: 'Erreur lors de la création du profil' };
    }

    const { data: signIn, error: signInError } = await supabaseAdmin.auth.signInWithPassword({
      email: dto.email,
      password: dto.password,
    });

    if (signInError || !signIn.session) {
      throw { status: 500, message: 'Compte créé mais impossible de générer le token' };
    }

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

    const { data: userProfile, error: profileError } = await supabaseAdmin
      .from('users')
      .select('id, email, role, first_name, last_name, phone, deleted_at, created_at')
      .eq('id', data.user.id)
      .single();

    if (profileError || !userProfile) {
      throw { status: 404, message: 'Profil utilisateur introuvable' };
    }

    if (userProfile.deleted_at !== null) {
      throw { status: 403, message: 'Votre compte a été désactivé. Contactez le support.' };
    }

    return {
      user: userProfile as AuthUser,
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
      token_type: 'Bearer',
    };
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
    // 1. Vérifier si l'utilisateur existe (sans révéler l'info dans la réponse)
    const { data: userProfile } = await supabaseAdmin
      .from('users')
      .select('first_name')
      .eq('email', email)
      .single();

    // 2. Générer le lien Supabase
    const { data, error } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: {
        redirectTo: `${env.APP_URL}/auth/reset-password`,
      },
    });

    if (error || !data) {
      console.warn('[Auth] Generate reset link warning:', error?.message);
      return; // Ne pas révéler l'erreur
    }

    // 3. Envoyer l'email via Mailtrap (non bloquant si user inexistant)
    if (userProfile?.first_name) {
      sendResetPasswordEmail(
        email,
        userProfile.first_name,
        data.properties.action_link
      ).catch((err) => console.warn('[Email] Reset email failed:', err));
    }
  }

  // ── RESET PASSWORD ────────────────────────────────────────────────────────
  async resetPassword(accessToken: string, newPassword: string): Promise<void> {
    const { data: { user }, error: userError } = await supabaseAdmin.auth.getUser(accessToken);

    if (userError || !user) {
      throw { status: 401, message: 'Token de réinitialisation invalide ou expiré' };
    }

    const { error } = await supabaseAdmin.auth.admin.updateUserById(user.id, {
      password: newPassword,
    });

    if (error) {
      throw { status: 400, message: 'Impossible de mettre à jour le mot de passe' };
    }
  }

  // ── ME ────────────────────────────────────────────────────────────────────
  async getMe(userId: string): Promise<AuthUser> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('id, email, role, first_name, last_name, phone, deleted_at, created_at')
      .eq('id', userId)
      .single();

    if (error || !data) {
      throw { status: 404, message: 'Utilisateur introuvable' };
    }

    return data as AuthUser;
  }
}

export const authService = new AuthService();