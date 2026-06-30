// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Auth
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin  → jest.unstable_mockModule (intercepte auth middleware)
//   - authService    → jest.unstable_mockModule (isole le controller)
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

// ── Variables de mock (as any : évite les erreurs de type strict Jest 30) ─────

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser        = jest.fn() as any;
const mockSignOut        = jest.fn() as any;
const mockFrom           = jest.fn() as any;

const mockRegister       = jest.fn() as any;
const mockLogin          = jest.fn() as any;
const mockLogout         = jest.fn() as any;
const mockRefreshToken   = jest.fn() as any;
const mockGetMe          = jest.fn() as any;
const mockForgotPassword = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Mocks modules (AVANT les imports dynamiques) ──────────────────────────────

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: mockSignOut },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('./auth.service.js', () => ({
  authService: {
    register:             mockRegister,
    login:                mockLogin,
    logout:               mockLogout,
    refreshToken:         mockRefreshToken,
    getMe:                mockGetMe,
    forgotPassword:       mockForgotPassword,
    resetPassword:        jest.fn(),
    changePassword:       jest.fn(),
    getGoogleAuthUrl:     jest.fn(),
    handleGoogleCallback: jest.fn(),
    handleGoogleToken:    jest.fn(),
  },
}));

// ── Imports dynamiques (APRÈS unstable_mockModule) ────────────────────────────

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id:          'client-uuid-auth-test',
  email:       'client@test.com',
  role:        'client',
  first_name:  'Jean',
  last_name:   'Dupont',
  phone:       '+33612345678',
  status:      'active',
  deleted_at:  null,
  created_at:  new Date().toISOString(),
  permissions: [],
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeChain(data: unknown, error: unknown = null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
    neq:         jest.fn().mockReturnThis(),
    order:       jest.fn().mockReturnThis(),
    range:       jest.fn().mockReturnThis(),
    limit:       jest.fn().mockReturnThis(),
    is:          jest.fn().mockReturnThis(),
    single:      (jest.fn() as any).mockResolvedValue({ data, error }),
    maybeSingle: (jest.fn() as any).mockResolvedValue({ data, error }),
  };
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(resolve);
  return chain;
}

function setupValidToken(user = MOCK_CLIENT) {
  mockGetUser.mockResolvedValue({ data: { user: { id: user.id } }, error: null });
  mockFrom.mockImplementation(() => makeChain(user));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Auth routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── POST /auth/login ────────────────────────────────────────────────────────

  describe('POST /auth/login', () => {
    const VALID_BODY   = { email: 'client@test.com', password: 'P@sser1234' };
    const MOCK_TOKENS  = {
      access_token:  'mock-access-token',
      refresh_token: 'mock-refresh-token',
      user:          MOCK_CLIENT,
    };

    it('retourne 200 avec les tokens sur credentials valides', async () => {
      mockLogin.mockResolvedValue(MOCK_TOKENS);

      const res = await request(app).post('/auth/login').send(VALID_BODY);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.access_token).toBe('mock-access-token');
    });

    it('retourne 400 si le mot de passe est manquant', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'client@test.com' });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it('retourne 400 si l\'email est mal formé', async () => {
      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'pas-un-email', password: 'P@sser1234' });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('retourne 401 sur mauvais mot de passe', async () => {
      mockLogin.mockRejectedValue({ status: 401, message: 'Email ou mot de passe incorrect' });

      const res = await request(app)
        .post('/auth/login')
        .send({ email: 'client@test.com', password: 'MauvaisPass!' });

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
      expect(res.body.message).toMatch(/incorrect/i);
    });
  });

  // ── POST /auth/register ─────────────────────────────────────────────────────

  describe('POST /auth/register', () => {
    const VALID_BODY = {
      email:        'nouveau@test.com',
      password:     'P@sser1234',
      first_name:   'Marie',
      last_name:    'Martin',
      phone:        '+33612345679',
      role:         'client',
      accept_terms: true,
    };

    it('retourne 201 sur inscription valide', async () => {
      mockRegister.mockResolvedValue({
        user: { ...MOCK_CLIENT, id: 'new-uuid', email: 'nouveau@test.com' },
      });

      const res = await request(app).post('/auth/register').send(VALID_BODY);

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 400 si les champs requis sont absents', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ email: 'nouveau@test.com' });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it('retourne 409 si l\'email est déjà utilisé', async () => {
      mockRegister.mockRejectedValue({
        status:  409,
        message: 'Cet email est déjà utilisé',
      });

      const res = await request(app).post('/auth/register').send(VALID_BODY);

      expect(res.status).toBe(409);
      expect(res.body.ok).toBe(false);
    });
  });

  // ── GET /auth/me ────────────────────────────────────────────────────────────

  describe('GET /auth/me', () => {
    it('retourne 200 avec le profil utilisateur si le token est valide', async () => {
      setupValidToken(MOCK_CLIENT);
      mockGetMe.mockResolvedValue(MOCK_CLIENT);

      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer valid-test-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.email).toBe('client@test.com');
      expect(res.body.data.role).toBe('client');
    });

    it('retourne 401 sans header Authorization', async () => {
      const res = await request(app).get('/auth/me');

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('retourne 401 avec un token invalide', async () => {
      mockGetUser.mockResolvedValue({
        data:  { user: null },
        error: { message: 'Token invalide' },
      });

      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', 'Bearer token-invalide');

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });
  });

  // ── POST /auth/logout ───────────────────────────────────────────────────────

  describe('POST /auth/logout', () => {
    it('retourne 200 sur déconnexion réussie', async () => {
      setupValidToken(MOCK_CLIENT);
      mockLogout.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/auth/logout')
        .set('Authorization', 'Bearer valid-test-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 401 sans token', async () => {
      const res = await request(app).post('/auth/logout');

      expect(res.status).toBe(401);
    });
  });

  // ── POST /auth/forgot-password ──────────────────────────────────────────────

  describe('POST /auth/forgot-password', () => {
    it('retourne 200 quel que soit l\'email (sécurité : ne révèle pas les comptes)', async () => {
      mockForgotPassword.mockResolvedValue(undefined);

      const res = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'quelquun@test.com' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.message).toMatch(/envoy/i);
    });

    it('retourne 400 sur un format d\'email invalide', async () => {
      const res = await request(app)
        .post('/auth/forgot-password')
        .send({ email: 'pas-un-email' });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });
  });

  // ── POST /auth/refresh ──────────────────────────────────────────────────────

  describe('POST /auth/refresh', () => {
    it('retourne 200 avec de nouveaux tokens sur refresh_token valide', async () => {
      mockRefreshToken.mockResolvedValue({
        access_token:  'new-access-token',
        refresh_token: 'new-refresh-token',
      });

      const res = await request(app)
        .post('/auth/refresh')
        .send({ refresh_token: 'valid-refresh-token' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.access_token).toBe('new-access-token');
    });

    it('retourne 400 si refresh_token est absent', async () => {
      const res = await request(app).post('/auth/refresh').send({});

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });

    it('retourne 401 sur refresh_token expiré', async () => {
      mockRefreshToken.mockRejectedValue({
        status:  401,
        message: 'Refresh token expiré ou invalide',
      });

      const res = await request(app)
        .post('/auth/refresh')
        .send({ refresh_token: 'expired-token' });

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });
  });
});
