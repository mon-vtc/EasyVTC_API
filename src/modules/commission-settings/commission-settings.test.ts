// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Commission Settings
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin              → jest.unstable_mockModule (auth middleware)
//   - commissionSettingsService  → jest.unstable_mockModule (isole le controller)
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser         = jest.fn() as any;
const mockFrom            = jest.fn() as any;

const mockListSettings    = jest.fn() as any;
const mockGetSettingById  = jest.fn() as any;
const mockCreateSetting   = jest.fn() as any;
const mockUpdateSetting   = jest.fn() as any;
const mockDeleteSetting   = jest.fn() as any;
const mockGetSummary      = jest.fn() as any;
const mockListCommissions = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('./commission-settings.service.js', () => ({
  commissionSettingsService: {
    listSettings:    mockListSettings,
    getSettingById:  mockGetSettingById,
    createSetting:   mockCreateSetting,
    updateSetting:   mockUpdateSetting,
    deleteSetting:   mockDeleteSetting,
    getSummary:      mockGetSummary,
    listCommissions: mockListCommissions,
  },
}));

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id: '550e8400-e29b-41d4-a716-4466554400c0', email: 'client@test.com', role: 'client',
  first_name: 'Jean', last_name: 'Dupont', phone: '+33612345678',
  status: 'active', deleted_at: null, created_at: new Date().toISOString(),
  permissions: [],
};

const MOCK_DRIVER = {
  ...MOCK_CLIENT,
  id: '550e8400-e29b-41d4-a716-4466554400c1', email: 'driver@test.com', role: 'driver',
};

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id: '550e8400-e29b-41d4-a716-4466554400c2', email: 'admin@test.com', role: 'admin',
};

const SETTING_ID = '550e8400-e29b-41d4-a716-4466554400c3';
const DRIVER_ID  = '550e8400-e29b-41d4-a716-4466554400c4';

const MOCK_SETTING = {
  id: SETTING_ID, zone: 'france', vehicle_type: 'standard',
  commission_rate: 15, is_active: true,
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

describe('Commission Settings routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── GET /admin/commission-settings ──────────────────────────────────────────

  describe('GET /admin/commission-settings', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/commission-settings');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/admin/commission-settings')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get('/admin/commission-settings')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockListSettings.mockResolvedValue({ data: [MOCK_SETTING], total: 1 });
      const res = await request(app)
        .get('/admin/commission-settings')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── POST /admin/commission-settings ─────────────────────────────────────────

  describe('POST /admin/commission-settings', () => {
    const VALID_BODY = { label: 'Commission van Sénégal', zone: 'senegal', vehicle_type: 'van', rate_type: 'percentage', rate_value: 12 };

    it('retourne 401 sans token', async () => {
      const res = await request(app).post('/admin/commission-settings').send(VALID_BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .post('/admin/commission-settings')
        .set('Authorization', 'Bearer client-token')
        .send(VALID_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 201 après création par un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockCreateSetting.mockResolvedValue({ ...MOCK_SETTING, ...VALID_BODY });
      const res = await request(app)
        .post('/admin/commission-settings')
        .set('Authorization', 'Bearer admin-token')
        .send(VALID_BODY);
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── PATCH /admin/commission-settings/:id ────────────────────────────────────

  describe('PATCH /admin/commission-settings/:id', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app)
        .patch(`/admin/commission-settings/${SETTING_ID}`)
        .send({ rate_value: 18 });
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .patch(`/admin/commission-settings/${SETTING_ID}`)
        .set('Authorization', 'Bearer driver-token')
        .send({ rate_value: 18 });
      expect(res.status).toBe(403);
    });

    it('retourne 200 après mise à jour par un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockUpdateSetting.mockResolvedValue({ ...MOCK_SETTING, rate_value: 18 });
      const res = await request(app)
        .patch(`/admin/commission-settings/${SETTING_ID}`)
        .set('Authorization', 'Bearer admin-token')
        .send({ rate_value: 18 });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /admin/commissions/summary ────────────────────────────────────────────

  describe('GET /admin/commissions/summary', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/commissions/summary');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/admin/commissions/summary')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 avec le rapport pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetSummary.mockResolvedValue({
        total_commissions: 1500, period: 'month',
        by_driver: [{ driver_id: DRIVER_ID, amount: 150 }],
      });
      const res = await request(app)
        .get('/admin/commissions/summary')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /admin/commissions ───────────────────────────────────

  describe('GET /admin/commissions', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/commissions');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get('/admin/commissions')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 avec le rapport détaillé pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockListCommissions.mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 });
      const res = await request(app)
        .get('/admin/commissions')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});


