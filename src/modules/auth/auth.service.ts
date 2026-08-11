import { supabaseAdmin } from '../../database/supabase/client.js';
import { sendWelcomeEmail, sendResetPasswordEmail, sendPasswordChangedEmail } from '../../utils/email.service.js';
import { generatePassword } from '../../utils/generate-password.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { env } from '../../config/env.js';
import { logger } from '../../utils/logger.js';
import type { Vehicle } from '../vehicles/vehicles.types.js'
import type { RegisterDto, LoginDto, AuthResponse, AuthUser, DriverProfile, GoogleAuthOptions } from './auth.types.js';
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
      .select('id, status, vehicle_type, siret, tva_rate, is_online, created_at, updated_at')
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

    // Alerte aux admins — nouveau compte créé (fire-and-forget)
    const roleLabel = dto.role === 'driver' ? 'chauffeur' : 'client';
    notificationsService.sendToAdmins(
      'new_user_admin',
      'Nouveau compte créé',
      `Un nouveau compte ${roleLabel} vient de s'inscrire : ${dto.first_name} ${dto.last_name} (${dto.email}).`,
      { user_id: authData.user.id, role: dto.role },
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
      logger.error('auth', 'Erreur fetchFullProfile après login', err);
      throw err;
    }


  }

  // ── LOGOUT ────────────────────────────────────────────────────────────────
  async logout(accessToken: string): Promise<void> {
    const { error } = await supabaseAdmin.auth.admin.signOut(accessToken);
    if (error) logger.warn('auth', `Logout warning: ${error.message}`);
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

    // On utilise hashed_token (attendu tel quel par verifyOtp ci-dessous) plutôt que
    // action_link : ce dernier est une URL Supabase à usage unique, consommée dès sa
    // première visite (y compris par les scanners de sécurité automatiques des clients
    // mail), ce qui rendait le lien systématiquement "invalide ou expiré" pour
    // l'utilisateur réel. Le token est affiché en clair dans l'email pour copier-coller.
    if (userProfile?.first_name) {
      sendResetPasswordEmail(
        email,
        userProfile.first_name,
        data.properties.hashed_token
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
    const defaultCallback = `${env.APP_URL}/auth/google/callback`;
    const sanitized = this._sanitizeRedirectTo(redirectTo, defaultCallback);
    const callbackUrl = encodeURIComponent(sanitized);
    const supabaseUrl = env.SUPABASE_URL.replace(/\/$/, '');
    return `${supabaseUrl}/auth/v1/authorize?provider=google&redirect_to=${callbackUrl}`;
  }

  private _sanitizeRedirectTo(redirectTo: string | undefined, fallback: string): string {
    if (!redirectTo) return fallback;

    // Origines autorisées : APP_URL, deep links mobile, localhost dev
    const isAllowed =
      redirectTo.startsWith(env.APP_URL) ||
      redirectTo.startsWith(`${env.MOBILE_DEEP_LINK_SCHEME}://`) ||
      redirectTo.startsWith('exp://') ||
      (env.NODE_ENV !== 'production' && (
        redirectTo.startsWith('http://localhost') ||
        redirectTo.startsWith('http://10.0.2.2')
      ));

    if (!isAllowed) {
      console.warn(`[Auth] redirect_to rejeté (open redirect) : ${redirectTo}`);
      return fallback;
    }
    return redirectTo;
  }

  /**
   * Génère un mot de passe temporaire pour un compte Google — Google ne fournit
   * aucun mot de passe applicatif, ce qui bloquait la suppression/anonymisation
   * RGPD du compte (nécessitait un mot de passe pour confirmer, cf. auth_provider
   * dans rgpd.service.ts qui dispense désormais ces comptes de cette étape).
   * Le mot de passe est défini côté Supabase Auth (hashé, jamais stocké en clair),
   * envoyé une seule fois par email, et retourné une seule fois dans la réponse
   * pour affichage côté mobile. Rappelée à chaque connexion tant qu'elle n'a
   * jamais réussi (google_password_set_at NULL) — évite qu'un échec silencieux
   * (ex: updateUserById en erreur) ne bloque le compte définitivement.
   */
  private async _ensureGooglePassword(userId: string, email: string, firstName: string): Promise<string | undefined> {
    const tempPassword = generatePassword();
    const { error: pwError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: tempPassword,
    });
    if (pwError) {
      logger.warn('auth', `Mot de passe temporaire Google non défini: ${pwError.message}`);
      return undefined;
    }

    await supabaseAdmin
      .from('users')
      .update({ google_password_set_at: new Date().toISOString() })
      .eq('id', userId);

    if (email) {
      sendWelcomeEmail(email, firstName || 'Utilisateur', undefined, tempPassword).catch((err) =>
        console.warn('[Email] Welcome Google email failed:', err)
      );
    }
    return tempPassword;
  }

  /**
   * Rafraîchit la session après _ensureGooglePassword : changer le mot de passe
   * d'un utilisateur via l'API admin invalide sa session en cours (constaté en
   * test — le access_token utilisé pour l'appel devient un 401 immédiat juste
   * après). Sans ce rafraîchissement, la réponse renverrait au mobile un couple
   * de tokens déjà morts.
   */
  private async _refreshSessionAfterPasswordChange(
    email: string,
    tempPassword: string,
    fallback: { access_token: string; refresh_token: string | null },
  ): Promise<{ access_token: string; refresh_token: string | null }> {
    const { data, error } = await supabaseAdmin.auth.signInWithPassword({ email, password: tempPassword });
    if (error || !data.session) {
      logger.warn('auth', `Impossible de rafraîchir la session après le mot de passe temporaire Google: ${error?.message}`);
      return fallback;
    }
    return { access_token: data.session.access_token, refresh_token: data.session.refresh_token };
  }

  /**
   * Résout une connexion/inscription Google, commune à handleGoogleCallback et
   * handleGoogleToken. Le trigger DB handle_new_user() a déjà créé la ligne
   * public.users à l'insertion de l'identité Supabase Auth (avec le bon prénom/
   * nom extraits des métadonnées Google) — cette méthode ne fait que :
   *   1. attendre que le trigger ait fini (même logique de retry que register()),
   *   2. refuser la connexion si cet email appartient déjà à un AUTRE compte
   *      (évite de créer un profil fantôme au lieu de réutiliser l'existant),
   *   3. exiger un passage explicite par l'inscription (intent=register + rôle +
   *      CGU) tant que le compte n'a jamais été inscrit,
   *   4. garantir qu'un mot de passe temporaire a bien été généré.
   */
  private async _resolveGoogleSignIn(
    supabaseUser: { id: string; email?: string | null },
    session: { access_token: string; refresh_token: string | null },
    options: GoogleAuthOptions,
  ): Promise<AuthResponse> {
    let profile: {
      id: string;
      first_name: string;
      registration_completed_at: string | null;
      google_password_set_at: string | null;
      auth_provider: 'password' | 'google';
    } | null = null;

    for (let attempt = 0; attempt < 5; attempt++) {
      const { data } = await supabaseAdmin
        .from('users')
        .select('id, first_name, registration_completed_at, google_password_set_at, auth_provider')
        .eq('id', supabaseUser.id)
        .single();
      if (data) { profile = data; break; }
      await new Promise((r) => setTimeout(r, 300));
    }

    if (!profile) {
      throw { status: 500, message: 'Erreur lors de la création du profil Google' };
    }

    const normalizedEmail = (supabaseUser.email ?? '').trim().toLowerCase();

    if (normalizedEmail) {
      const { data: emailOwner } = await supabaseAdmin
        .from('users')
        .select('id')
        .eq('email', normalizedEmail)
        .neq('id', supabaseUser.id)
        .maybeSingle();

      if (emailOwner) {
        throw {
          status: 409,
          message: 'Un compte existe déjà avec cet email. Connectez-vous avec votre mot de passe pour y accéder.',
        };
      }
    }

    const isRegistered = profile.registration_completed_at !== null;

    if (!isRegistered) {
      if (options.intent !== 'register') {
        throw { status: 404, message: 'Aucun compte associé à ce compte Google. Inscrivez-vous d\'abord.' };
      }
      if (!options.accept_terms) {
        throw { status: 400, message: 'Vous devez accepter les CGU pour vous inscrire.' };
      }

      const role = options.role === 'driver' ? 'driver' : 'client';
      const now = new Date().toISOString();

      const { error: updateError } = await supabaseAdmin
        .from('users')
        .update({
          role,
          rgpd_consent: true,
          rgpd_consent_at: now,
          registration_completed_at: now,
        })
        .eq('id', supabaseUser.id);

      if (updateError) {
        throw { status: 500, message: 'Erreur lors de la finalisation de l\'inscription Google' };
      }

      if (role === 'driver') {
        await supabaseAdmin
          .from('drivers')
          .upsert({ user_id: supabaseUser.id }, { onConflict: 'user_id', ignoreDuplicates: true });
      }

      notificationsService.sendToAdmins(
        'new_user_admin',
        'Nouveau compte créé (Google)',
        `Un nouveau compte ${role === 'driver' ? 'chauffeur' : 'client'} vient de s'inscrire via Google : ${profile.first_name} (${normalizedEmail}).`,
        { user_id: supabaseUser.id, role },
      );
    }

    // Ne jamais générer/écraser de mot de passe pour un compte 'password' — ne
    // concerne que les comptes réellement créés via Google (auth_provider), pas
    // un compte email/mdp que Supabase aurait lié à la même identité Google.
    const tempPassword = profile.auth_provider === 'google' && !profile.google_password_set_at
      ? await this._ensureGooglePassword(supabaseUser.id, normalizedEmail, profile.first_name)
      : undefined;

    // Changer le mot de passe invalide la session en cours (cf. commentaire sur
    // _refreshSessionAfterPasswordChange) — on en récupère une fraîche pour ne
    // pas renvoyer des tokens déjà morts au mobile.
    const finalSession = tempPassword
      ? await this._refreshSessionAfterPasswordChange(normalizedEmail, tempPassword, session)
      : session;

    const userProfile = await this.fetchFullProfile(supabaseUser.id);

    if (userProfile.deleted_at !== null || userProfile.status !== 'active') {
      throw { status: 403, message: 'Votre compte a été désactivé. Contactez le support.' };
    }

    return {
      user: userProfile,
      access_token: finalSession.access_token,
      refresh_token: finalSession.refresh_token,
      token_type: 'Bearer',
      ...(tempPassword ? { temp_password: tempPassword } : {}),
    };
  }

  // ── GOOGLE AUTH — Échange du code ─────────────────────────────────────────
  async handleGoogleCallback(code: string, options: GoogleAuthOptions = {}): Promise<AuthResponse> {
    const { data, error } = await supabaseAdmin.auth.exchangeCodeForSession(code);

    if (error || !data.session) {
      throw { status: 401, message: 'Code Google invalide ou expiré' };
    }

    return this._resolveGoogleSignIn(
      data.user,
      { access_token: data.session.access_token, refresh_token: data.session.refresh_token },
      options,
    );
  }

  // ── GOOGLE AUTH — Depuis access_token fragment ────────────────────────────
  async handleGoogleToken(accessToken: string, refreshToken?: string, options: GoogleAuthOptions = {}): Promise<AuthResponse> {
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(accessToken);

    if (error || !user) {
      throw { status: 401, message: 'Token Google invalide ou expiré' };
    }

    return this._resolveGoogleSignIn(
      user,
      { access_token: accessToken, refresh_token: refreshToken ?? null },
      options,
    );
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