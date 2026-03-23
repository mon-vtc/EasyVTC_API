import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — Avec ESM, on doit utiliser unstable_mockModule AVANT les imports
// ══════════════════════════════════════════════════════════════════════════════

const mockCreateUser     = jest.fn();
const mockDeleteUser     = jest.fn();
const mockSignOut        = jest.fn();
const mockUpdateUserById = jest.fn();
const mockGenerateLink   = jest.fn();
const mockSignIn         = jest.fn();
const mockRefreshSession = jest.fn();
const mockVerifyOtp      = jest.fn();
const mockGetUser        = jest.fn();
const mockExchangeCode   = jest.fn();
const mockFrom           = jest.fn();


// Au début du fichier de test, après les imports
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

// Mock du client Supabase
jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        createUser:     mockCreateUser,
        deleteUser:     mockDeleteUser,
        signOut:        mockSignOut,
        updateUserById: mockUpdateUserById,
        generateLink:   mockGenerateLink,
      },
      signInWithPassword:    mockSignIn,
      refreshSession:        mockRefreshSession,
      verifyOtp:             mockVerifyOtp,
      getUser:               mockGetUser,
      exchangeCodeForSession: mockExchangeCode,
    },
    from: mockFrom,
  },
}));

// Mock du service email (non bloquant)
jest.unstable_mockModule('../../utils/email.service.js', () => ({
  sendWelcomeEmail:         jest.fn().mockImplementation(() => Promise.resolve()),
  sendResetPasswordEmail:   jest.fn().mockImplementation(() => Promise.resolve()),
  sendPasswordChangedEmail: jest.fn().mockImplementation(() => Promise.resolve()),
}));

// Import dynamique APRÈS le mock (obligatoire avec ESM)
const { AuthService } = await import('./auth.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const mockUser = {
  id: 'uuid-123',
  email: 'test@easyvtc.com',
  role: 'client',
  first_name: 'Jean',
  last_name: 'Dupont',
  phone: '+33612345678',
  deleted_at: null,
  created_at: '2026-03-16T10:00:00Z',
};

const mockSession = {
  access_token: 'fake-access-token',
  refresh_token: 'fake-refresh-token',
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Configure le mock de .from().select().eq().single()
 */
function setupFromMock(returnData: unknown, returnError: unknown = null) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: returnData, error: returnError } as never),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('AuthService', () => {
  let service: InstanceType<typeof AuthService>;

  beforeEach(() => {
    service = new AuthService();
    jest.clearAllMocks();
  });

  // ── REGISTER ─────────────────────────────────────────────────────────────────
  describe('register()', () => {

    it('✅ crée un compte avec succès', async () => {
      mockCreateUser.mockResolvedValue({
        data: { user: { id: 'uuid-123' } },
        error: null,
      } as never);

      setupFromMock(mockUser);

      mockSignIn.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      } as never);

      const result = await service.register({
        email: 'test@easyvtc.com',
        password: 'Test1234!',
        first_name: 'Jean',
        last_name: 'Dupont',
        phone: '+33612345678',
        role: 'client',
        accept_terms: true,
      });

      expect(result.user.email).toBe('test@easyvtc.com');
      expect(result.access_token).toBe('fake-access-token');
      expect(result.token_type).toBe('Bearer');
    });

    it('❌ rejette un email déjà utilisé (409)', async () => {
      mockCreateUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'User already registered', code: 'email_exists' },
      } as never);

      await expect(
        service.register({
          email: 'test@easyvtc.com',
          password: 'Test1234!',
          first_name: 'Jean',
          last_name: 'Dupont',
          phone: '+33612345678',
          role: 'client',
          accept_terms: true,
        })
      ).rejects.toMatchObject({ status: 409 });
    });

    it('❌ rejette si createUser échoue (400)', async () => {
      mockCreateUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid email format' },
      } as never);

      await expect(
        service.register({
          email: 'invalid-email',
          password: 'Test1234!',
          first_name: 'Jean',
          last_name: 'Dupont',
          phone: '+33612345678',
          role: 'client',
          accept_terms: true,
        })
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  // ── LOGIN ────────────────────────────────────────────────────────────────────
  describe('login()', () => {

    it('✅ retourne user + tokens si credentials valides', async () => {
      mockSignIn.mockResolvedValue({
        data: { user: { id: 'uuid-123' }, session: mockSession },
        error: null,
      } as never);

      setupFromMock(mockUser);

      const result = await service.login({
        email: 'test@easyvtc.com',
        password: 'Test1234!',
      });

      expect(result.user.role).toBe('client');
      expect(result.access_token).toBe('fake-access-token');
    });

    it('❌ rejette un mauvais mot de passe (401)', async () => {
      mockSignIn.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid credentials' },
      } as never);

      await expect(
        service.login({ email: 'test@easyvtc.com', password: 'WrongPass!' })
      ).rejects.toMatchObject({ status: 401 });
    });

    it('❌ rejette un compte supprimé (403)', async () => {
      mockSignIn.mockResolvedValue({
        data: { user: { id: 'uuid-123' }, session: mockSession },
        error: null,
      } as never);

      setupFromMock({ ...mockUser, deleted_at: '2026-01-01T00:00:00Z' });

      await expect(
        service.login({ email: 'test@easyvtc.com', password: 'Test1234!' })
      ).rejects.toMatchObject({ status: 403 });
    });

    it('❌ rejette si profil introuvable (404)', async () => {
      mockSignIn.mockResolvedValue({
        data: { user: { id: 'uuid-123' }, session: mockSession },
        error: null,
      } as never);

      setupFromMock(null, { message: 'Not found' });

      await expect(
        service.login({ email: 'test@easyvtc.com', password: 'Test1234!' })
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  // ── REFRESH TOKEN ────────────────────────────────────────────────────────────
  describe('refreshToken()', () => {

    it('✅ retourne de nouveaux tokens si refresh valide', async () => {
      mockRefreshSession.mockResolvedValue({
        data: { session: { access_token: 'new-access', refresh_token: 'new-refresh' } },
        error: null,
      } as never);

      const result = await service.refreshToken('valid-refresh-token');
      expect(result.access_token).toBe('new-access');
      expect(result.refresh_token).toBe('new-refresh');
    });

    it('❌ rejette un refresh token expiré (401)', async () => {
      mockRefreshSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Token expired' },
      } as never);

      await expect(
        service.refreshToken('expired-token')
      ).rejects.toMatchObject({ status: 401 });
    });
  });

  // ── LOGOUT ───────────────────────────────────────────────────────────────────
  describe('logout()', () => {

    it('✅ déconnecte sans erreur', async () => {
      mockSignOut.mockResolvedValue({ error: null } as never);
      await expect(service.logout('valid-token')).resolves.not.toThrow();
    });

    it('✅ gère silencieusement une erreur de logout', async () => {
      mockSignOut.mockResolvedValue({ error: { message: 'Session not found' } } as never);
      // Ne doit pas lever d'exception
      await expect(service.logout('invalid-token')).resolves.not.toThrow();
    });
  });

  // ── FORGOT PASSWORD ──────────────────────────────────────────────────────────
  describe('forgotPassword()', () => {

    it('✅ génère un lien de reset sans erreur', async () => {
      setupFromMock({ first_name: 'Jean' });

      mockGenerateLink.mockResolvedValue({
        data: { properties: { action_link: 'https://example.com/reset?token=xyz' } },
        error: null,
      } as never);

      await expect(service.forgotPassword('test@easyvtc.com')).resolves.not.toThrow();
      expect(mockGenerateLink).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'recovery', email: 'test@easyvtc.com' })
      );
    });

    it('✅ ne lève pas d\'erreur si email inexistant (sécurité)', async () => {
      setupFromMock(null);

      mockGenerateLink.mockResolvedValue({
        data: null,
        error: { message: 'User not found' },
      } as never);

      // Ne doit pas révéler si l'email existe ou non
      await expect(service.forgotPassword('ghost@easyvtc.com')).resolves.not.toThrow();
    });
  });

  // ── RESET PASSWORD ───────────────────────────────────────────────────────────
  describe('resetPassword()', () => {

    it('✅ réinitialise le mot de passe avec un JWT valide', async () => {
      const jwtToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test';

      mockGetUser.mockResolvedValue({
        data: { user: { id: 'uuid-123', email: 'test@easyvtc.com' } },
        error: null,
      } as never);

      setupFromMock({ first_name: 'Jean' });

      mockUpdateUserById.mockResolvedValue({ error: null } as never);

      await expect(service.resetPassword(jwtToken, 'NewPass123!')).resolves.not.toThrow();
      expect(mockUpdateUserById).toHaveBeenCalledWith('uuid-123', { password: 'NewPass123!' });
    });

    it('✅ réinitialise le mot de passe avec un token OTP', async () => {
      const otpToken = 'abc123xyz';

      mockVerifyOtp.mockResolvedValue({
        data: { user: { id: 'uuid-456', email: 'otp@easyvtc.com' } },
        error: null,
      } as never);

      setupFromMock({ first_name: 'Marie' });

      mockUpdateUserById.mockResolvedValue({ error: null } as never);

      await expect(service.resetPassword(otpToken, 'NewPass456!')).resolves.not.toThrow();
      expect(mockVerifyOtp).toHaveBeenCalledWith({ token_hash: otpToken, type: 'recovery' });
    });

    it('❌ rejette un token JWT invalide (401)', async () => {
      const invalidJwt = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.invalid';

      mockGetUser.mockResolvedValue({
        data: { user: null },
        error: { message: 'Invalid token' },
      } as never);

      await expect(
        service.resetPassword(invalidJwt, 'NewPass123!')
      ).rejects.toMatchObject({ status: 401 });
    });

    it('❌ rejette un token OTP expiré (401)', async () => {
      mockVerifyOtp.mockResolvedValue({
        data: { user: null },
        error: { message: 'Token expired' },
      } as never);

      await expect(
        service.resetPassword('expired-otp', 'NewPass123!')
      ).rejects.toMatchObject({ status: 401 });
    });
  });

  // ── GET ME ───────────────────────────────────────────────────────────────────
  describe('getMe()', () => {

    it('✅ retourne le profil du user connecté', async () => {
      setupFromMock(mockUser);

      const result = await service.getMe('uuid-123');

      expect(result.id).toBe('uuid-123');
      expect(result.first_name).toBe('Jean');
      expect(result.email).toBe('test@easyvtc.com');
    });

    it('❌ lève une erreur 404 si user inexistant', async () => {
      setupFromMock(null, { message: 'Not found' });

      await expect(service.getMe('ghost-id')).rejects.toMatchObject({ status: 404 });
    });
  });

  // ── CHANGE PASSWORD ──────────────────────────────────────────────────────────
  describe('changePassword()', () => {

    it('✅ change le mot de passe si l\'ancien est correct', async () => {
      // Mock pour récupérer le profil (email + first_name)
      setupFromMock({ email: 'test@easyvtc.com', first_name: 'Jean' });

      // Mock de la vérification de l'ancien mot de passe
      mockSignIn.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      } as never);

      // Mock de la mise à jour du mot de passe
      mockUpdateUserById.mockResolvedValue({ error: null } as never);

      await expect(
        service.changePassword('uuid-123', 'OldPass123!', 'NewPass456!')
      ).resolves.not.toThrow();

      expect(mockSignIn).toHaveBeenCalledWith({
        email: 'test@easyvtc.com',
        password: 'OldPass123!',
      });
      expect(mockUpdateUserById).toHaveBeenCalledWith('uuid-123', { password: 'NewPass456!' });
    });

    it('❌ rejette si l\'ancien mot de passe est incorrect (401)', async () => {
      setupFromMock({ email: 'test@easyvtc.com', first_name: 'Jean' });

      mockSignIn.mockResolvedValue({
        data: { session: null },
        error: { message: 'Invalid credentials' },
      } as never);

      await expect(
        service.changePassword('uuid-123', 'WrongOldPass!', 'NewPass456!')
      ).rejects.toMatchObject({ status: 401, message: 'Mot de passe actuel incorrect' });
    });

    it('❌ rejette si l\'utilisateur est introuvable (404)', async () => {
      setupFromMock(null, { message: 'Not found' });

      await expect(
        service.changePassword('ghost-id', 'OldPass123!', 'NewPass456!')
      ).rejects.toMatchObject({ status: 404 });
    });

    it('❌ rejette si la mise à jour échoue (400)', async () => {
      setupFromMock({ email: 'test@easyvtc.com', first_name: 'Jean' });

      mockSignIn.mockResolvedValue({
        data: { session: mockSession },
        error: null,
      } as never);

      mockUpdateUserById.mockResolvedValue({
        error: { message: 'Password too weak' },
      } as never);

      await expect(
        service.changePassword('uuid-123', 'OldPass123!', 'weak')
      ).rejects.toMatchObject({ status: 400 });
    });
  });

  // ── GOOGLE AUTH ──────────────────────────────────────────────────────────────
  describe('Google OAuth', () => {

    describe('getGoogleAuthUrl()', () => {
      it('✅ génère une URL de redirection Google', async () => {
        const url = await service.getGoogleAuthUrl();
        expect(url).toContain('/auth/v1/authorize?provider=google');
      });

      it('✅ accepte un redirectTo personnalisé', async () => {
        const url = await service.getGoogleAuthUrl('https://myapp.com/callback');
        expect(url).toContain('redirect_to=');
      });
    });

    describe('handleGoogleCallback()', () => {
      it('✅ échange le code et retourne user + tokens', async () => {
        mockExchangeCode.mockResolvedValue({
          data: {
            user: {
              id: 'google-uuid',
              email: 'google@gmail.com',
              user_metadata: { given_name: 'Google', family_name: 'User' },
            },
            session: mockSession,
          },
          error: null,
        } as never);

        setupFromMock({
          id: 'google-uuid',
          email: 'google@gmail.com',
          role: 'client',
          first_name: 'Google',
          last_name: 'User',
          phone: null,
          deleted_at: null,
          created_at: '2026-03-16T10:00:00Z',
        });

        const result = await service.handleGoogleCallback('valid-code');

        expect(result.user.email).toBe('google@gmail.com');
        expect(result.access_token).toBe('fake-access-token');
      });

      it('❌ rejette un code invalide (401)', async () => {
        mockExchangeCode.mockResolvedValue({
          data: { user: null, session: null },
          error: { message: 'Invalid code' },
        } as never);

        await expect(
          service.handleGoogleCallback('invalid-code')
        ).rejects.toMatchObject({ status: 401 });
      });
    });

    describe('handleGoogleToken()', () => {
      it('✅ valide un access_token et retourne le profil', async () => {
        mockGetUser.mockResolvedValue({
          data: {
            user: {
              id: 'google-uuid',
              email: 'google@gmail.com',
              user_metadata: { given_name: 'Google', family_name: 'User' },
            },
          },
          error: null,
        } as never);

        setupFromMock({
          id: 'google-uuid',
          email: 'google@gmail.com',
          role: 'client',
          first_name: 'Google',
          last_name: 'User',
          phone: null,
          deleted_at: null,
          created_at: '2026-03-16T10:00:00Z',
        });

        const result = await service.handleGoogleToken('valid-google-token', 'refresh-token');

        expect(result.user.email).toBe('google@gmail.com');
        expect(result.access_token).toBe('valid-google-token');
      });

      it('❌ rejette un token Google invalide (401)', async () => {
        mockGetUser.mockResolvedValue({
          data: { user: null },
          error: { message: 'Invalid token' },
        } as never);

        await expect(
          service.handleGoogleToken('invalid-google-token')
        ).rejects.toMatchObject({ status: 401 });
      });
    });
  });
});
