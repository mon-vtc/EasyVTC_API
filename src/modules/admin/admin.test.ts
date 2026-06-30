// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Admin
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin    → jest.unstable_mockModule (auth middleware)
//   - adminService     → jest.unstable_mockModule
//   - usersService     → jest.unstable_mockModule (routes /admin/users)
//   - reservationsService → jest.unstable_mockModule (routes /admin/reservations)
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser = jest.fn() as any;
const mockFrom    = jest.fn() as any;

// adminService
const mockCreateManager          = jest.fn() as any;
const mockListManagers           = jest.fn() as any;
const mockGetManagerById         = jest.fn() as any;
const mockUpdateManager          = jest.fn() as any;
const mockGetManagerPermissions  = jest.fn() as any;
const mockSetManagerPermissions  = jest.fn() as any;
const mockGetStats               = jest.fn() as any;
const mockListClients            = jest.fn() as any;

// usersService
const mockListUsers              = jest.fn() as any;
const mockChangeUserStatus       = jest.fn() as any;

// reservationsService
const mockListReservations       = jest.fn() as any;
const mockAssignDriver           = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('./admin.service.js', () => ({
  adminService: {
    createManager:         mockCreateManager,
    listManagers:          mockListManagers,
    getManagerById:        mockGetManagerById,
    updateManager:         mockUpdateManager,
    deleteManager:         jest.fn(),
    getManagerPermissions: mockGetManagerPermissions,
    setManagerPermissions: mockSetManagerPermissions,
    getStats:              mockGetStats,
    listClients:           mockListClients,
    getClientById:         jest.fn(),
    getClientTrips:        jest.fn(),
    getDashboard:          jest.fn(),
  },
}));

jest.unstable_mockModule('../users/users.service.js', () => ({
  usersService: {
    listUsers:       mockListUsers,
    changeUserStatus: mockChangeUserStatus,
    getUserById:     jest.fn(),
    updateUser:      jest.fn(),
  },
}));

jest.unstable_mockModule('../reservations/reservations.service.js', () => ({
  reservationsService: {
    listReservations:          mockListReservations,
    assignDriver:              mockAssignDriver,
    getById:                   jest.fn(),
    createReservation:         jest.fn(),
    cancelReservation:         jest.fn(),
    getAvailableDrivers:       jest.fn(),
    arriveAtPickup:            jest.fn(),
    startTrip:                 jest.fn(),
    completeTrip:              jest.fn(),
    getMyReservations:         jest.fn(),
    getDriverReservations:     jest.fn(),
    getDriverActiveReservation: jest.fn(),
  },
}));

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id: 'client-uuid-admin-test', email: 'client@test.com', role: 'client',
  first_name: 'Jean', last_name: 'Dupont', phone: '+33612345678',
  status: 'active', deleted_at: null, created_at: new Date().toISOString(),
  permissions: [],
};

const MOCK_DRIVER = {
  ...MOCK_CLIENT,
  id: 'driver-uuid-admin-test', email: 'driver@test.com', role: 'driver',
};

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id: 'admin-uuid-admin-test', email: 'admin@test.com', role: 'admin',
};

const MANAGER_ID = '550e8400-e29b-41d4-a716-446655440040';
const USER_ID    = '550e8400-e29b-41d4-a716-446655440041';
const RESA_ID    = '550e8400-e29b-41d4-a716-446655440042';
const DRIVER_ID  = '550e8400-e29b-41d4-a716-446655440043';

const MOCK_MANAGER = {
  id: MANAGER_ID, email: 'manager@test.com', role: 'manager',
  first_name: 'Sophie', last_name: 'Dubois', status: 'active',
  created_at: new Date().toISOString(), permissions: [],
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
    if (table === 'manager_permissions') return makeChain([]);
    return makeChain(user);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Admin routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── GET /admin/users ─────────────────────────────────────────────────────────

  describe('GET /admin/users', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/users');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/admin/users')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get('/admin/users')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin avec la liste paginée', async () => {
      setupValidToken(MOCK_ADMIN);
      mockListUsers.mockResolvedValue({ data: [MOCK_CLIENT], total: 1, page: 1, limit: 10 });
      const res = await request(app)
        .get('/admin/users')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── PUT /admin/users/:id/status ──────────────────────────────────────────────

  describe('PUT /admin/users/:id/status', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).put(`/admin/users/${USER_ID}/status`).send({ status: 'active' });
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .put(`/admin/users/${USER_ID}/status`)
        .set('Authorization', 'Bearer client-token')
        .send({ status: 'inactive' });
      expect(res.status).toBe(403);
    });

    it('retourne 200 après changement de statut', async () => {
      setupValidToken(MOCK_ADMIN);
      mockChangeUserStatus.mockResolvedValue({ ...MOCK_CLIENT, status: 'inactive' });
      const res = await request(app)
        .put(`/admin/users/${USER_ID}/status`)
        .set('Authorization', 'Bearer admin-token')
        .send({ status: 'inactive', reason: 'Désactivation temporaire du compte' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── POST /admin/managers ─────────────────────────────────────────────────────

  describe('POST /admin/managers', () => {
    const VALID_BODY = {
      email: 'newmanager@test.com', first_name: 'Alice', last_name: 'Martin',
      phone: '+33611111111',
    };

    it('retourne 401 sans token', async () => {
      const res = await request(app).post('/admin/managers').send(VALID_BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .post('/admin/managers')
        .set('Authorization', 'Bearer client-token')
        .send(VALID_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 201 après création par un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockCreateManager.mockResolvedValue({ ...MOCK_MANAGER, ...VALID_BODY });
      const res = await request(app)
        .post('/admin/managers')
        .set('Authorization', 'Bearer admin-token')
        .send(VALID_BODY);
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /admin/managers ──────────────────────────────────────────────────────

  describe('GET /admin/managers', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/managers');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/admin/managers')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockListManagers.mockResolvedValue({ data: [MOCK_MANAGER], total: 1, page: 1, limit: 10 });
      const res = await request(app)
        .get('/admin/managers')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /admin/managers/:id/permissions ──────────────────────────────────────

  describe('GET /admin/managers/:id/permissions', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get(`/admin/managers/${MANAGER_ID}/permissions`);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get(`/admin/managers/${MANAGER_ID}/permissions`)
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 avec les permissions du manager', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetManagerPermissions.mockResolvedValue(['view_drivers', 'manage_reservations']);
      const res = await request(app)
        .get(`/admin/managers/${MANAGER_ID}/permissions`)
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── PUT /admin/managers/:id/permissions ──────────────────────────────────────

  describe('PUT /admin/managers/:id/permissions', () => {
    const PERMISSIONS_BODY = { permissions: ['view_drivers', 'view_reservations'] };

    it('retourne 401 sans token', async () => {
      const res = await request(app)
        .put(`/admin/managers/${MANAGER_ID}/permissions`)
        .send(PERMISSIONS_BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .put(`/admin/managers/${MANAGER_ID}/permissions`)
        .set('Authorization', 'Bearer client-token')
        .send(PERMISSIONS_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 200 après mise à jour des permissions', async () => {
      setupValidToken(MOCK_ADMIN);
      mockSetManagerPermissions.mockResolvedValue(['view_drivers', 'manage_reservations']);
      const res = await request(app)
        .put(`/admin/managers/${MANAGER_ID}/permissions`)
        .set('Authorization', 'Bearer admin-token')
        .send(PERMISSIONS_BODY);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /admin/stats ─────────────────────────────────────────────────────────

  describe('GET /admin/stats', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/stats');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/admin/stats')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 avec les statistiques globales', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetStats.mockResolvedValue({
        total_reservations: 150, total_revenue: 7500,
        active_drivers: 8, pending_documents: 3,
      });
      const res = await request(app)
        .get('/admin/stats')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /admin/reservations ──────────────────────────────────────────────────

  describe('GET /admin/reservations', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/reservations');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get('/admin/reservations')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockListReservations.mockResolvedValue({ data: [], total: 0, page: 1, limit: 10 });
      const res = await request(app)
        .get('/admin/reservations')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── PUT /admin/reservations/:id/assign ─────────────────────────────────────

  describe('PUT /admin/reservations/:id/assign', () => {
    const ASSIGN_BODY = { driver_id: DRIVER_ID };

    it('retourne 401 sans token', async () => {
      const res = await request(app)
        .put(`/admin/reservations/${RESA_ID}/assign`)
        .send(ASSIGN_BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .put(`/admin/reservations/${RESA_ID}/assign`)
        .set('Authorization', 'Bearer client-token')
        .send(ASSIGN_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 200 après assignation par un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockAssignDriver.mockResolvedValue({ id: RESA_ID, status: 'assigned', driver_id: DRIVER_ID });
      const res = await request(app)
        .put(`/admin/reservations/${RESA_ID}/assign`)
        .set('Authorization', 'Bearer admin-token')
        .send(ASSIGN_BODY);
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /admin/clients ───────────────────────────────────────────────────────

  describe('GET /admin/clients', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/clients');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get('/admin/clients')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 avec la base clients', async () => {
      setupValidToken(MOCK_ADMIN);
      mockListClients.mockResolvedValue({ data: [{ ...MOCK_CLIENT, total_trips: 5 }], total: 1 });
      const res = await request(app)
        .get('/admin/clients')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });
});
