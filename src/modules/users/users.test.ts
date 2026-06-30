// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Users
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin → jest.unstable_mockModule (intercepte auth middleware)
//   - usersService  → jest.unstable_mockModule (isole le controller)
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

// ── Variables de mock (as any : évite les erreurs de type strict Jest 30) ─────

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser                 = jest.fn() as any;
const mockFrom                    = jest.fn() as any;

const mockGetProfile              = jest.fn() as any;
const mockUpdateProfile           = jest.fn() as any;
const mockGetNotificationPrefs    = jest.fn() as any;
const mockUpdateNotificationPrefs = jest.fn() as any;
const mockListUsers               = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Mocks modules ─────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('./users.service.js', () => ({
  usersService: {
    getProfile:              mockGetProfile,
    updateProfile:           mockUpdateProfile,
    uploadAvatar:            jest.fn(),
    getNotificationPrefs:    mockGetNotificationPrefs,
    updateNotificationPrefs: mockUpdateNotificationPrefs,
    listUsers:               mockListUsers,
    getUserById:             jest.fn(),
    changeUserStatus:        jest.fn(),
  },
}));

// ── Imports dynamiques ────────────────────────────────────────────────────────

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id:          'client-uuid-users-test',
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

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id:    'admin-uuid-users-test',
  email: 'admin@test.com',
  role:  'admin',
};

const MOCK_NOTIF_PREFS = {
  user_id:                MOCK_CLIENT.id,
  marketing_email_opt_in: true,
  marketing_sms_opt_in:   false,
  marketing_push_opt_in:  true,
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

describe('Users routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── GET /users/me ───────────────────────────────────────────────────────────

  describe('GET /users/me', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/users/me');

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('retourne 200 avec le profil de l\'utilisateur connecté', async () => {
      setupValidToken(MOCK_CLIENT);
      mockGetProfile.mockResolvedValue(MOCK_CLIENT);

      const res = await request(app)
        .get('/users/me')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.email).toBe('client@test.com');
    });

    it('retourne une erreur 404 si le service lève une exception', async () => {
      setupValidToken(MOCK_CLIENT);
      mockGetProfile.mockRejectedValue({ status: 404, message: 'Profil introuvable' });

      const res = await request(app)
        .get('/users/me')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(404);
      expect(res.body.ok).toBe(false);
    });
  });

  // ── PATCH /users/me ─────────────────────────────────────────────────────────

  describe('PATCH /users/me', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app)
        .patch('/users/me')
        .send({ first_name: 'Pierre' });

      expect(res.status).toBe(401);
    });

    it('retourne 200 sur mise à jour valide du profil', async () => {
      setupValidToken(MOCK_CLIENT);
      const updated = { ...MOCK_CLIENT, first_name: 'Pierre' };
      mockUpdateProfile.mockResolvedValue(updated);

      const res = await request(app)
        .patch('/users/me')
        .set('Authorization', 'Bearer valid-token')
        .send({ first_name: 'Pierre' });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.first_name).toBe('Pierre');
    });

    it('retourne 400 si les données de mise à jour sont invalides', async () => {
      setupValidToken(MOCK_CLIENT);

      const res = await request(app)
        .patch('/users/me')
        .set('Authorization', 'Bearer valid-token')
        .send({ email: 'pas-un-email-valide' });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
    });
  });

  // ── GET /users/me/notification-prefs ────────────────────────────────────────

  describe('GET /users/me/notification-prefs', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/users/me/notification-prefs');

      expect(res.status).toBe(401);
    });

    it('retourne 200 avec les préférences de notification', async () => {
      setupValidToken(MOCK_CLIENT);
      mockGetNotificationPrefs.mockResolvedValue(MOCK_NOTIF_PREFS);

      const res = await request(app)
        .get('/users/me/notification-prefs')
        .set('Authorization', 'Bearer valid-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.marketing_email_opt_in).toBeDefined();
    });
  });

  // ── PUT /users/me/notification-prefs ────────────────────────────────────────

  describe('PUT /users/me/notification-prefs', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app)
        .put('/users/me/notification-prefs')
        .send({ push_new_offer: false });

      expect(res.status).toBe(401);
    });

    it('retourne 200 sur mise à jour valide des préférences', async () => {
      setupValidToken(MOCK_CLIENT);
      const updated = { ...MOCK_NOTIF_PREFS, push_new_offer: false };
      mockUpdateNotificationPrefs.mockResolvedValue(updated);

      const res = await request(app)
        .put('/users/me/notification-prefs')
        .set('Authorization', 'Bearer valid-token')
        .send({ marketing_email_opt_in: false });

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /users (admin uniquement) ───────────────────────────────────────────

  describe('GET /users', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/users');

      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);

      const res = await request(app)
        .get('/users')
        .set('Authorization', 'Bearer client-token');

      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin avec la liste des utilisateurs', async () => {
      setupValidToken(MOCK_ADMIN);
      mockListUsers.mockResolvedValue({
        data: [MOCK_CLIENT], total: 1, page: 1, limit: 20,
      });

      const res = await request(app)
        .get('/users')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
