// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module RGPD
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin → jest.unstable_mockModule (auth middleware)
//   - rgpdService   → jest.unstable_mockModule (isole le controller)
//   - authService   → jest.unstable_mockModule (appelé par anonymize dans le service)
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser      = jest.fn() as any;
const mockFrom         = jest.fn() as any;

const mockExportData   = jest.fn() as any;
const mockAnonymize    = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('./rgpd.service.js', () => ({
  RgpdService: jest.fn(),
  rgpdService: {
    exportData: mockExportData,
    anonymize:  mockAnonymize,
  },
}));

jest.unstable_mockModule('../auth/auth.service.js', () => ({
  authService: { login: jest.fn() },
}));

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id: '550e8400-e29b-41d4-a716-4466554400a0', email: 'client@test.com', role: 'client',
  first_name: 'Jean', last_name: 'Dupont', phone: '+33612345678',
  status: 'active', deleted_at: null, created_at: new Date().toISOString(),
  permissions: [],
};

const MOCK_DRIVER = {
  ...MOCK_CLIENT,
  id: '550e8400-e29b-41d4-a716-4466554400a1', email: 'driver@test.com', role: 'driver',
};

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id: '550e8400-e29b-41d4-a716-4466554400a2', email: 'admin@test.com', role: 'admin',
};

const USER_ID   = MOCK_CLIENT.id;
const DRIVER_ID = '550e8400-e29b-41d4-a716-4466554400a3';

const MOCK_EXPORT = {
  user_id:      USER_ID,
  exported_at:  new Date().toISOString(),
  legal_basis:  'RGPD Art. 15 — Droit d\'accès',
  profile:      { email: MOCK_CLIENT.email, first_name: 'Jean', last_name: 'Dupont' },
  reservations: [], orders: [], favorites: [], ratings: [],
  notifications: [], messages: [], driver_profile: null,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeChain(data: unknown, error: unknown = null) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain: any = {
    select: jest.fn().mockReturnThis(), eq: jest.fn().mockReturnThis(),
    neq: jest.fn().mockReturnThis(), order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(), limit: jest.fn().mockReturnThis(),
    is: jest.fn().mockReturnThis(),
    single: (jest.fn() as any).mockResolvedValue({ data, error }),
    maybeSingle: (jest.fn() as any).mockResolvedValue({ data, error }),
  };
  chain.then = (resolve: (v: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(resolve);
  return chain;
}

function setupValidToken(user: typeof MOCK_CLIENT | typeof MOCK_DRIVER | typeof MOCK_ADMIN) {
  mockGetUser.mockResolvedValue({ data: { user: { id: user.id } }, error: null });
  mockFrom.mockImplementation((table: unknown) => {
    if (table === 'drivers') return makeChain({ id: DRIVER_ID, user_id: user.id });
    return makeChain(user);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('RGPD routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── GET /users/:id/data-export (Art. 15) ────────────────────────────────────

  describe('GET /users/:id/data-export', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get(`/users/${USER_ID}/data-export`);
      expect(res.status).toBe(401);
    });

    it('retourne 403 si un client tente d\'exporter les données d\'un autre utilisateur', async () => {
      setupValidToken(MOCK_CLIENT);
      mockExportData.mockRejectedValue({ status: 403, message: 'Accès refusé' });
      const res = await request(app)
        .get('/users/99999999-0000-4000-8000-000000000001/data-export')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un client qui exporte ses propres données', async () => {
      setupValidToken(MOCK_CLIENT);
      mockExportData.mockResolvedValue(MOCK_EXPORT);
      const res = await request(app)
        .get(`/users/${USER_ID}/data-export`)
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 200 pour un admin qui exporte les données d\'un autre utilisateur', async () => {
      setupValidToken(MOCK_ADMIN);
      mockExportData.mockResolvedValue({ ...MOCK_EXPORT, user_id: USER_ID });
      const res = await request(app)
        .get(`/users/${USER_ID}/data-export`)
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── DELETE /users/:id/anonymize (Art. 17) ────────────────────────────────────

  describe('DELETE /users/:id/anonymize', () => {
    const BODY = { confirm: true, password: 'password123' };

    it('retourne 401 sans token', async () => {
      const res = await request(app).delete(`/users/${USER_ID}/anonymize`).send(BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 403 si un client tente d\'anonymiser le compte d\'un autre', async () => {
      setupValidToken(MOCK_CLIENT);
      mockAnonymize.mockRejectedValue({ status: 403, message: 'Accès refusé' });
      const res = await request(app)
        .delete('/users/99999999-0000-4000-8000-000000000001/anonymize')
        .set('Authorization', 'Bearer client-token')
        .send(BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 200 après anonymisation de son propre compte', async () => {
      setupValidToken(MOCK_CLIENT);
      mockAnonymize.mockResolvedValue({
        user_id: USER_ID, anonymized_at: new Date().toISOString(),
        message: 'Compte anonymisé avec succès',
      });
      const res = await request(app)
        .delete(`/users/${USER_ID}/anonymize`)
        .set('Authorization', 'Bearer client-token')
        .send(BODY);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 200 pour un admin qui anonymise un compte utilisateur', async () => {
      setupValidToken(MOCK_ADMIN);
      mockAnonymize.mockResolvedValue({
        user_id: USER_ID, anonymized_at: new Date().toISOString(),
        message: 'Compte anonymisé avec succès',
      });
      const res = await request(app)
        .delete(`/users/${USER_ID}/anonymize`)
        .set('Authorization', 'Bearer admin-token')
        .send(BODY);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 422 si le compte a déjà été anonymisé', async () => {
      setupValidToken(MOCK_CLIENT);
      mockAnonymize.mockRejectedValue({ status: 422, message: 'Compte déjà anonymisé' });
      const res = await request(app)
        .delete(`/users/${USER_ID}/anonymize`)
        .set('Authorization', 'Bearer client-token')
        .send(BODY);
      expect(res.status).toBe(422);
    });
  });
});

