// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Promo Codes
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin    → jest.unstable_mockModule (auth middleware)
//   - promoCodesService → jest.unstable_mockModule (isole le controller)
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser          = jest.fn() as any;
const mockFrom             = jest.fn() as any;

const mockList             = jest.fn() as any;
const mockGetById          = jest.fn() as any;
const mockCreate           = jest.fn() as any;
const mockBulkAssign       = jest.fn() as any;
const mockUpdate           = jest.fn() as any;
const mockDelete           = jest.fn() as any;
const mockGetMine          = jest.fn() as any;
const mockValidateCode     = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('./promo-codes.service.js', () => ({
  promoCodesService: {
    list:         mockList,
    getById:      mockGetById,
    create:       mockCreate,
    bulkAssign:   mockBulkAssign,
    update:       mockUpdate,
    delete:       mockDelete,
    getMine:      mockGetMine,
    validateCode: mockValidateCode,
  },
}));

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id: '550e8400-e29b-41d4-a716-4466554400b0', email: 'client@test.com', role: 'client',
  first_name: 'Jean', last_name: 'Dupont', phone: '+33612345678',
  status: 'active', deleted_at: null, created_at: new Date().toISOString(),
  permissions: [],
};

const MOCK_DRIVER = {
  ...MOCK_CLIENT,
  id: '550e8400-e29b-41d4-a716-4466554400b1', email: 'driver@test.com', role: 'driver',
};

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id: '550e8400-e29b-41d4-a716-4466554400b2', email: 'admin@test.com', role: 'admin',
};

const PROMO_ID  = '550e8400-e29b-41d4-a716-4466554400b3';
const DRIVER_ID = '550e8400-e29b-41d4-a716-4466554400b4';

const MOCK_PROMO = {
  id: PROMO_ID, code: 'SUMMER10', discount_type: 'percentage',
  discount_value: 10, is_active: true, usage_count: 0,
  max_uses: 100, expires_at: '2027-01-01',
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

describe('Promo Codes routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── GET /admin/promo-codes ───────────────────────────────────────────────────

  describe('GET /admin/promo-codes', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/promo-codes');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/admin/promo-codes')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get('/admin/promo-codes')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockList.mockResolvedValue({ data: [MOCK_PROMO], total: 1, page: 1, limit: 10 });
      const res = await request(app)
        .get('/admin/promo-codes')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── POST /admin/promo-codes ──────────────────────────────────────────────────

  describe('POST /admin/promo-codes', () => {
    const VALID_BODY = {
      code: 'NEWCODE20', discount_type: 'percent', discount_value: 20,
      max_uses: 50, valid_until: '2027-06-01T00:00:00.000Z',
    };

    it('retourne 401 sans token', async () => {
      const res = await request(app).post('/admin/promo-codes').send(VALID_BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .post('/admin/promo-codes')
        .set('Authorization', 'Bearer client-token')
        .send(VALID_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 201 après création par un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockCreate.mockResolvedValue({ ...MOCK_PROMO, ...VALID_BODY });
      const res = await request(app)
        .post('/admin/promo-codes')
        .set('Authorization', 'Bearer admin-token')
        .send(VALID_BODY);
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── PATCH /admin/promo-codes/:id ─────────────────────────────────────────────

  describe('PATCH /admin/promo-codes/:id', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).patch(`/admin/promo-codes/${PROMO_ID}`).send({ is_active: false });
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .patch(`/admin/promo-codes/${PROMO_ID}`)
        .set('Authorization', 'Bearer client-token')
        .send({ is_active: false });
      expect(res.status).toBe(403);
    });

    it('retourne 200 après mise à jour par un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockUpdate.mockResolvedValue({ ...MOCK_PROMO, is_active: false });
      const res = await request(app)
        .patch(`/admin/promo-codes/${PROMO_ID}`)
        .set('Authorization', 'Bearer admin-token')
        .send({ is_active: false });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── DELETE /admin/promo-codes/:id ────────────────────────────────────────────

  describe('DELETE /admin/promo-codes/:id', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).delete(`/admin/promo-codes/${PROMO_ID}`);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .delete(`/admin/promo-codes/${PROMO_ID}`)
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 après désactivation par un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockDelete.mockResolvedValue({ message: 'Code désactivé' });
      const res = await request(app)
        .delete(`/admin/promo-codes/${PROMO_ID}`)
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── POST /admin/promo-codes/:id/bulk-assign ──────────────────────────────────

  describe('POST /admin/promo-codes/:id/bulk-assign', () => {
    const BULK_BODY = { user_ids: ['550e8400-e29b-41d4-a716-4466554400b5', '550e8400-e29b-41d4-a716-4466554400b6', '550e8400-e29b-41d4-a716-4466554400b7'] };

    it('retourne 401 sans token', async () => {
      const res = await request(app)
        .post(`/admin/promo-codes/${PROMO_ID}/bulk-assign`)
        .send(BULK_BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .post(`/admin/promo-codes/${PROMO_ID}/bulk-assign`)
        .set('Authorization', 'Bearer client-token')
        .send(BULK_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 200 après assignation en masse', async () => {
      setupValidToken(MOCK_ADMIN);
      mockBulkAssign.mockResolvedValue({ assigned: 3, failed: 0 });
      const res = await request(app)
        .post(`/admin/promo-codes/${PROMO_ID}/bulk-assign`)
        .set('Authorization', 'Bearer admin-token')
        .send(BULK_BODY);
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /promo-codes/mine — codes du client ──────────────────────────────────

  describe('GET /promo-codes/mine', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/promo-codes/mine');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get('/promo-codes/mine')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 avec les codes du client', async () => {
      setupValidToken(MOCK_CLIENT);
      mockGetMine.mockResolvedValue({
        active: [MOCK_PROMO], expired: [], total_saved: 0,
      });
      const res = await request(app)
        .get('/promo-codes/mine')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── POST /promo-codes/validate — valider un code ─────────────────────────────

  describe('POST /promo-codes/validate', () => {
    const VALID_BODY = { code: 'SUMMER10', order_amount: 50 };

    it('retourne 401 sans token', async () => {
      const res = await request(app).post('/promo-codes/validate').send(VALID_BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .post('/promo-codes/validate')
        .set('Authorization', 'Bearer driver-token')
        .send(VALID_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 200 avec le résultat de la validation', async () => {
      setupValidToken(MOCK_CLIENT);
      mockValidateCode.mockResolvedValue({
        valid: true, discount_amount: 5, final_amount: 45,
        promo: MOCK_PROMO,
      });
      const res = await request(app)
        .post('/promo-codes/validate')
        .set('Authorization', 'Bearer client-token')
        .send(VALID_BODY);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 404 si le code est invalide ou expiré', async () => {
      setupValidToken(MOCK_CLIENT);
      mockValidateCode.mockRejectedValue({ status: 404, message: 'Code promo introuvable' });
      const res = await request(app)
        .post('/promo-codes/validate')
        .set('Authorization', 'Bearer client-token')
        .send({ code: 'INVALID99', order_amount: 50 });
      expect(res.status).toBe(404);
    });
  });
});

