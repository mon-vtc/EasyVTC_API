import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ── Avec ESM, on doit utiliser unstable_mockModule AVANT les imports ──────────
const mockCreateUser     = jest.fn();
const mockDeleteUser     = jest.fn();
const mockSignOut        = jest.fn();
const mockUpdateUserById = jest.fn();
const mockSignIn         = jest.fn();
const mockRefreshSession = jest.fn();
const mockResetPassword  = jest.fn();
const mockGetUser        = jest.fn();
const mockFrom           = jest.fn();

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        createUser:     mockCreateUser,
        deleteUser:     mockDeleteUser,
        signOut:        mockSignOut,
        updateUserById: mockUpdateUserById,
      },
      signInWithPassword:    mockSignIn,
      refreshSession:        mockRefreshSession,
      resetPasswordForEmail: mockResetPassword,
      getUser:               mockGetUser,
    },
    from: mockFrom,
  },
}));

// Import dynamique APRÈS le mock (obligatoire avec ESM)
const { AuthService } = await import('./auth.service.js');

// ── Données de test ───────────────────────────────────────────────────────────
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

// ── Helper : mock de .from().select().eq().single() ───────────────────────────
function setupFromMock(returnData: unknown, returnError: unknown = null) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: returnData, error: returnError } as never),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

// ─────────────────────────────────────────────────────────────────────────────
describe('AuthService', () => {
  let service: InstanceType<typeof AuthService>;

  beforeEach(() => {
    service = new AuthService();
    jest.clearAllMocks();
  });

  // ── REGISTER ─────────────────────────────────────────────────────────────
  describe('register()', () => {

    it(' crée un compte avec succès', async () => {
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

    it(' rejette un email déjà utilisé (409)', async () => {
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
  });

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  describe('login()', () => {

    it(' retourne user + tokens si credentials valides', async () => {
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

    it(' rejette un mauvais mot de passe (401)', async () => {
      mockSignIn.mockResolvedValue({
        data: { user: null, session: null },
        error: { message: 'Invalid credentials' },
      } as never);

      await expect(
        service.login({ email: 'test@easyvtc.com', password: 'WrongPass!' })
      ).rejects.toMatchObject({ status: 401 });
    });

    it(' rejette un compte supprimé (403)', async () => {
      mockSignIn.mockResolvedValue({
        data: { user: { id: 'uuid-123' }, session: mockSession },
        error: null,
      } as never);

      setupFromMock({ ...mockUser, deleted_at: '2026-01-01T00:00:00Z' });

      await expect(
        service.login({ email: 'test@easyvtc.com', password: 'Test1234!' })
      ).rejects.toMatchObject({ status: 403 });
    });
  });

  // ── REFRESH TOKEN ─────────────────────────────────────────────────────────
  describe('refreshToken()', () => {

    it(' retourne de nouveaux tokens si refresh valide', async () => {
      mockRefreshSession.mockResolvedValue({
        data: { session: { access_token: 'new-access', refresh_token: 'new-refresh' } },
        error: null,
      } as never);

      const result = await service.refreshToken('valid-refresh-token');
      expect(result.access_token).toBe('new-access');
      expect(result.refresh_token).toBe('new-refresh');
    });

    it(' rejette un refresh token expiré (401)', async () => {
      mockRefreshSession.mockResolvedValue({
        data: { session: null },
        error: { message: 'Token expired' },
      } as never);

      await expect(
        service.refreshToken('expired-token')
      ).rejects.toMatchObject({ status: 401 });
    });
  });

  // ── LOGOUT ────────────────────────────────────────────────────────────────
  describe('logout()', () => {

    it(' déconnecte sans erreur', async () => {
      mockSignOut.mockResolvedValue({ error: null } as never);
      await expect(service.logout('valid-token')).resolves.not.toThrow();
    });
  });

  // ── GET ME ────────────────────────────────────────────────────────────────
  describe('getMe()', () => {

    it(' retourne le profil du user connecté', async () => {
      setupFromMock(mockUser);
      const result = await service.getMe('uuid-123');
      expect(result.id).toBe('uuid-123');
      expect(result.first_name).toBe('Jean');
    });

    it(' lève une erreur 404 si user inexistant', async () => {
      setupFromMock(null, { message: 'Not found' });
      await expect(service.getMe('ghost-id')).rejects.toMatchObject({ status: 404 });
    });
  });
});