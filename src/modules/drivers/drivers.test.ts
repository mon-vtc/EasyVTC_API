// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Drivers
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin  → jest.unstable_mockModule (auth middleware)
//   - driversService → jest.unstable_mockModule (isole le controller)
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser              = jest.fn() as any;
const mockFrom                 = jest.fn() as any;

const mockGetMyProfile         = jest.fn() as any;
const mockUpdateMyProfile      = jest.fn() as any;
const mockSetOnlineStatus      = jest.fn() as any;
const mockGetPlanning          = jest.fn() as any;
const mockGetRevenues          = jest.fn() as any;
const mockListUnavailability   = jest.fn() as any;
const mockCreateUnavailability = jest.fn() as any;
const mockListDrivers          = jest.fn() as any;
const mockGetDriverById        = jest.fn() as any;
const mockChangeDriverStatus   = jest.fn() as any;
const mockAdminUpdateDriver    = jest.fn() as any;
const mockGetRevenuesAdmin     = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('./drivers.service.js', () => ({
  driversService: {
    getMyProfile:             mockGetMyProfile,
    updateMyProfile:          mockUpdateMyProfile,
    setOnlineStatus:          mockSetOnlineStatus,
    getPlanning:              mockGetPlanning,
    getRevenues:              mockGetRevenues,
    getAvailability:          jest.fn(),
    getSchedule:              jest.fn(),
    setSchedule:              jest.fn(),
    listUnavailability:       mockListUnavailability,
    createUnavailability:     mockCreateUnavailability,
    deleteUnavailability:     jest.fn(),
    listDrivers:              mockListDrivers,
    getDriverById:            mockGetDriverById,
    changeDriverStatus:       mockChangeDriverStatus,
    adminUpdateDriver:        mockAdminUpdateDriver,
    getRevenuesAdmin:         mockGetRevenuesAdmin,
    getPlanningAdmin:         jest.fn(),
    getAvailabilityAdmin:     jest.fn(),
    listUnavailabilityAdmin:  jest.fn(),
    createUnavailabilityAdmin: jest.fn(),
    deleteUnavailabilityAdmin: jest.fn(),
    getMonthlyStats:          jest.fn(),
    getTripsHistory:          jest.fn(),
    getScheduleAdmin:         jest.fn(),
  },
}));

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id: 'c1a2b3c4-d5e6-4f78-9012-abcdef012345', email: 'client@test.com', role: 'client',
  first_name: 'Jean', last_name: 'Dupont', phone: '+33612345678',
  status: 'active', deleted_at: null, created_at: new Date().toISOString(),
  permissions: [],
};

const MOCK_DRIVER = {
  ...MOCK_CLIENT,
  id: 'd1e2f3a4-b5c6-4d78-9012-fedcba012345', email: 'driver@test.com', role: 'driver',
};

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id: 'a1b2c3d4-e5f6-4789-0123-abcdef098765', email: 'admin@test.com', role: 'admin',
};

// UUID v4 valide pour les paramètres de route
const DRIVER_ID = 'b8f4e2a1-9c3d-4e5f-8a7b-6c5d4e3f2a1b';

const MOCK_DRIVER_PROFILE = {
  id: DRIVER_ID, user_id: MOCK_DRIVER.id, status: 'active',
  zone: 'france', vehicle_type: 'standard', is_online: true,
  siret: '12345678901234', tva_rate: 20,
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
  mockFrom.mockImplementation(() => makeChain(user));
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Drivers routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── GET /drivers/me ─────────────────────────────────────────────────────────

  describe('GET /drivers/me', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/drivers/me');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/drivers/me')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 avec le profil du chauffeur', async () => {
      setupValidToken(MOCK_DRIVER);
      mockGetMyProfile.mockResolvedValue(MOCK_DRIVER_PROFILE);
      const res = await request(app)
        .get('/drivers/me')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── PATCH /drivers/me ───────────────────────────────────────────────────────

  describe('PATCH /drivers/me', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).patch('/drivers/me').send({ zone: 'france' });
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      const res = await request(app)
        .patch('/drivers/me')
        .set('Authorization', 'Bearer admin-token')
        .send({ zone: 'france' });
      expect(res.status).toBe(403);
    });

    it('retourne 200 après mise à jour réussie', async () => {
      setupValidToken(MOCK_DRIVER);
      mockUpdateMyProfile.mockResolvedValue({ ...MOCK_DRIVER_PROFILE, zone: 'senegal' });
      const res = await request(app)
        .patch('/drivers/me')
        .set('Authorization', 'Bearer driver-token')
        .send({ zone: 'senegal' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── PATCH /drivers/me/online ─────────────────────────────────────────────────

  describe('PATCH /drivers/me/online', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).patch('/drivers/me/online').send({ is_online: true });
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .patch('/drivers/me/online')
        .set('Authorization', 'Bearer client-token')
        .send({ is_online: true });
      expect(res.status).toBe(403);
    });

    it('retourne 200 après changement de statut', async () => {
      setupValidToken(MOCK_DRIVER);
      mockSetOnlineStatus.mockResolvedValue({ ...MOCK_DRIVER_PROFILE, is_online: true });
      const res = await request(app)
        .patch('/drivers/me/online')
        .set('Authorization', 'Bearer driver-token')
        .send({ is_online: true });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /drivers/me/revenues ─────────────────────────────────────────────────

  describe('GET /drivers/me/revenues', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/drivers/me/revenues');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      const res = await request(app)
        .get('/drivers/me/revenues')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 avec les revenus', async () => {
      setupValidToken(MOCK_DRIVER);
      mockGetRevenues.mockResolvedValue({
        period: 'week', total_revenue: 150, total_trips: 3,
        currency: 'EUR', trips: [],
      });
      const res = await request(app)
        .get('/drivers/me/revenues')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /drivers/me/planning ─────────────────────────────────────────────────

  describe('GET /drivers/me/planning', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/drivers/me/planning');
      expect(res.status).toBe(401);
    });

    it('retourne 200 avec le planning', async () => {
      setupValidToken(MOCK_DRIVER);
      mockGetPlanning.mockResolvedValue({ reservations: [], unavailabilities: [] });
      const res = await request(app)
        .get('/drivers/me/planning')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /drivers/me/unavailability ────────────────────────────────────────────

  describe('GET /drivers/me/unavailability', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/drivers/me/unavailability');
      expect(res.status).toBe(401);
    });

    it('retourne 200 avec la liste des indisponibilités', async () => {
      setupValidToken(MOCK_DRIVER);
      mockListUnavailability.mockResolvedValue([]);
      const res = await request(app)
        .get('/drivers/me/unavailability')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── POST /drivers/me/unavailability ──────────────────────────────────────────

  describe('POST /drivers/me/unavailability', () => {
    const VALID_BODY = {
      starts_at: new Date(Date.now() + 86400000).toISOString(),
      ends_at:   new Date(Date.now() + 172800000).toISOString(),
      reason:    'conge',
    };

    it('retourne 401 sans token', async () => {
      const res = await request(app).post('/drivers/me/unavailability').send(VALID_BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .post('/drivers/me/unavailability')
        .set('Authorization', 'Bearer client-token')
        .send(VALID_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 201 après création', async () => {
      setupValidToken(MOCK_DRIVER);
      mockCreateUnavailability.mockResolvedValue({ id: 'unavail-1', ...VALID_BODY });
      const res = await request(app)
        .post('/drivers/me/unavailability')
        .set('Authorization', 'Bearer driver-token')
        .send(VALID_BODY);
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /admin/drivers ──────────────────────────────────────────────────────

  describe('GET /admin/drivers', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/drivers');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/admin/drivers')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get('/admin/drivers')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin avec la liste paginée', async () => {
      setupValidToken(MOCK_ADMIN);
      mockListDrivers.mockResolvedValue({ drivers: [MOCK_DRIVER_PROFILE], total: 1 });
      const res = await request(app)
        .get('/admin/drivers')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /admin/drivers/:id ──────────────────────────────────────────────────

  describe('GET /admin/drivers/:id', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get(`/admin/drivers/${DRIVER_ID}`);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get(`/admin/drivers/${DRIVER_ID}`)
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetDriverById.mockResolvedValue(MOCK_DRIVER_PROFILE);
      const res = await request(app)
        .get(`/admin/drivers/${DRIVER_ID}`)
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 404 si le chauffeur est introuvable', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetDriverById.mockRejectedValue({ status: 404, message: 'Chauffeur introuvable' });
      const res = await request(app)
        .get(`/admin/drivers/${DRIVER_ID}`)
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(404);
    });
  });

  // ── PATCH /admin/drivers/:id ─────────────────────────────────────────────────

  describe('PATCH /admin/drivers/:id', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).patch(`/admin/drivers/${DRIVER_ID}`).send({ tva_rate: 10 });
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .patch(`/admin/drivers/${DRIVER_ID}`)
        .set('Authorization', 'Bearer driver-token')
        .send({ tva_rate: 10 });
      expect(res.status).toBe(403);
    });

    it('retourne 200 après mise à jour admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockAdminUpdateDriver.mockResolvedValue({ ...MOCK_DRIVER_PROFILE, tva_rate: 10 });
      const res = await request(app)
        .patch(`/admin/drivers/${DRIVER_ID}`)
        .set('Authorization', 'Bearer admin-token')
        .send({ tva_rate: 10 });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── PATCH /admin/drivers/:id/status ─────────────────────────────────────────

  describe('PATCH /admin/drivers/:id/status', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app)
        .patch(`/admin/drivers/${DRIVER_ID}/status`)
        .send({ status: 'active', reason: 'Motif admin' });
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .patch(`/admin/drivers/${DRIVER_ID}/status`)
        .set('Authorization', 'Bearer driver-token')
        .send({ status: 'active', reason: 'Motif admin' });
      expect(res.status).toBe(403);
    });

    it('retourne 200 après changement de statut', async () => {
      setupValidToken(MOCK_ADMIN);
      mockChangeDriverStatus.mockResolvedValue({ ...MOCK_DRIVER_PROFILE, status: 'active' });
      const res = await request(app)
        .patch(`/admin/drivers/${DRIVER_ID}/status`)
        .set('Authorization', 'Bearer admin-token')
        .send({ status: 'active', reason: 'Motif admin' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /admin/drivers/:id/revenues ─────────────────────────────────────────

  describe('GET /admin/drivers/:id/revenues', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get(`/admin/drivers/${DRIVER_ID}/revenues`);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get(`/admin/drivers/${DRIVER_ID}/revenues`)
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetRevenuesAdmin.mockResolvedValue({
        period: 'month', total_revenue: 500, total_trips: 10,
        currency: 'EUR', trips: [],
      });
      const res = await request(app)
        .get(`/admin/drivers/${DRIVER_ID}/revenues`)
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
