// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Ratings (Évaluations)
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin  → jest.unstable_mockModule (auth middleware)
//   - ratingsService → jest.unstable_mockModule (isole le controller)
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser          = jest.fn() as any;
const mockFrom             = jest.fn() as any;

const mockSubmitRating     = jest.fn() as any;
const mockGetMyRatings     = jest.fn() as any;
const mockGetDriverRatings = jest.fn() as any;
const mockListAll          = jest.fn() as any;
const mockDeleteRating     = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('./ratings.service.js', () => ({
  ratingsService: {
    submitRating:     mockSubmitRating,
    getMyRatings:     mockGetMyRatings,
    getDriverRatings: mockGetDriverRatings,
    listAll:          mockListAll,
    deleteRating:     mockDeleteRating,
    getAverage:       jest.fn(),
  },
}));

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id: '550e8400-e29b-41d4-a716-446655440090', email: 'client@test.com', role: 'client',
  first_name: 'Jean', last_name: 'Dupont', phone: '+33612345678',
  status: 'active', deleted_at: null, created_at: new Date().toISOString(),
  permissions: [],
};

const MOCK_DRIVER = {
  ...MOCK_CLIENT,
  id: '550e8400-e29b-41d4-a716-446655440091', email: 'driver@test.com', role: 'driver',
};

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id: '550e8400-e29b-41d4-a716-446655440092', email: 'admin@test.com', role: 'admin',
};

const RATING_ID = '550e8400-e29b-41d4-a716-446655440093';
const RESA_ID   = '550e8400-e29b-41d4-a716-446655440094';
const DRIVER_ID = '550e8400-e29b-41d4-a716-446655440095';

const MOCK_RATING = {
  id: RATING_ID, reservation_id: RESA_ID,
  client_id: MOCK_CLIENT.id, driver_id: DRIVER_ID,
  score: 5, comment: 'Excellent chauffeur',
  created_at: new Date().toISOString(),
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

describe('Ratings routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── POST /reservations/:id/rating — client après course ─────────────────────

  describe('POST /reservations/:id/rating', () => {
    const VALID_BODY = { note: 5, comment: 'Excellent chauffeur' };

    it('retourne 401 sans token', async () => {
      const res = await request(app)
        .post(`/reservations/${RESA_ID}/rating`)
        .send(VALID_BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .post(`/reservations/${RESA_ID}/rating`)
        .set('Authorization', 'Bearer driver-token')
        .send(VALID_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 403 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      const res = await request(app)
        .post(`/reservations/${RESA_ID}/rating`)
        .set('Authorization', 'Bearer admin-token')
        .send(VALID_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 201 pour un client après une course terminée', async () => {
      setupValidToken(MOCK_CLIENT);
      mockSubmitRating.mockResolvedValue(MOCK_RATING);
      const res = await request(app)
        .post(`/reservations/${RESA_ID}/rating`)
        .set('Authorization', 'Bearer client-token')
        .send(VALID_BODY);
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 409 si l\'évaluation a déjà été soumise', async () => {
      setupValidToken(MOCK_CLIENT);
      mockSubmitRating.mockRejectedValue({ status: 409, message: 'Évaluation déjà soumise' });
      const res = await request(app)
        .post(`/reservations/${RESA_ID}/rating`)
        .set('Authorization', 'Bearer client-token')
        .send(VALID_BODY);
      expect(res.status).toBe(409);
    });
  });

  // ── GET /drivers/me/ratings — chauffeur voit ses évaluations ────────────────

  describe('GET /drivers/me/ratings', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/drivers/me/ratings');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/drivers/me/ratings')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      mockGetMyRatings.mockResolvedValue({ data: [MOCK_RATING], total: 1, average: 5 });
      const res = await request(app)
        .get('/drivers/me/ratings')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /admin/drivers/:id/ratings ──────────────────────────────────────────

  describe('GET /admin/drivers/:id/ratings', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get(`/admin/drivers/${DRIVER_ID}/ratings`);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get(`/admin/drivers/${DRIVER_ID}/ratings`)
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get(`/admin/drivers/${DRIVER_ID}/ratings`)
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetDriverRatings.mockResolvedValue({ data: [MOCK_RATING], total: 1, average: 5 });
      const res = await request(app)
        .get(`/admin/drivers/${DRIVER_ID}/ratings`)
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /admin/ratings ────────────────────────────────────────────────────────

  describe('GET /admin/ratings', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/ratings');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/admin/ratings')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin avec toutes les évaluations', async () => {
      setupValidToken(MOCK_ADMIN);
      mockListAll.mockResolvedValue({ data: [MOCK_RATING], total: 1, page: 1, limit: 10 });
      const res = await request(app)
        .get('/admin/ratings')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});

