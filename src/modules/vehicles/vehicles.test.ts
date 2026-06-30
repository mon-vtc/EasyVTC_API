// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Vehicles
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin → jest.unstable_mockModule (auth middleware)
//   - VehiclesService → jest.unstable_mockModule (classe instanciée dans controller)
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser       = jest.fn() as any;
const mockFrom          = jest.fn() as any;

const mockCreateVehicle = jest.fn() as any;
const mockGetMyVehicles = jest.fn() as any;
const mockGetMyVehicle  = jest.fn() as any;
const mockUpdateVehicle = jest.fn() as any;
const mockDeleteVehicle = jest.fn() as any;
const mockGetAllVehicles = jest.fn() as any;
const mockGetVehicleById = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

// VehiclesService est une classe — le controller fait `new VehiclesService()`
jest.unstable_mockModule('./vehicles.service.js', () => ({
  VehiclesService: jest.fn().mockImplementation(() => ({
    createVehicle:      mockCreateVehicle,
    uploadVehiclePhoto: (jest.fn() as any).mockResolvedValue({ url: 'https://example.com/photo.jpg' }),
    getMyVehicles:      mockGetMyVehicles,
    getMyVehicle:       mockGetMyVehicle,
    updateVehicle:      mockUpdateVehicle,
    deleteVehicle:      mockDeleteVehicle,
    getAllVehicles:      mockGetAllVehicles,
    getVehicleById:     mockGetVehicleById,
  })),
}));

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id: 'client-uuid-vehicles-test', email: 'client@test.com', role: 'client',
  first_name: 'Jean', last_name: 'Dupont', phone: '+33612345678',
  status: 'active', deleted_at: null, created_at: new Date().toISOString(),
  permissions: [],
};

const MOCK_DRIVER = {
  ...MOCK_CLIENT,
  id: 'driver-uuid-vehicles-test', email: 'driver@test.com', role: 'driver',
};

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id: 'admin-uuid-vehicles-test', email: 'admin@test.com', role: 'admin',
};

const VEHICLE_ID = '550e8400-e29b-41d4-a716-446655440070';
const DRIVER_ID  = '550e8400-e29b-41d4-a716-446655440071';

const MOCK_VEHICLE = {
  id: VEHICLE_ID, driver_id: DRIVER_ID,
  brand: 'Peugeot', model: '508', year: 2022,
  license_plate: 'AB-123-CD', color: 'Noir',
  vehicle_type: 'berline', seats: 4,
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

describe('Vehicles routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── GET /drivers/vehicles ────────────────────────────────────────────────────

  describe('GET /drivers/vehicles', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/drivers/vehicles');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/drivers/vehicles')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      mockGetMyVehicles.mockResolvedValue([MOCK_VEHICLE]);
      const res = await request(app)
        .get('/drivers/vehicles')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── POST /drivers/vehicles ────────────────────────────────────────────────────

  describe('POST /drivers/vehicles', () => {
    const VALID_BODY = {
      plate_number: 'XY-456-ZA',
      brand: 'Toyota', model: 'Camry', year: 2023,
      color: 'Blanc', type: 'berline',
    };

    it('retourne 401 sans token', async () => {
      const res = await request(app).post('/drivers/vehicles').send(VALID_BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .post('/drivers/vehicles')
        .set('Authorization', 'Bearer client-token')
        .send(VALID_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 201 après création par un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      mockCreateVehicle.mockResolvedValue({ ...MOCK_VEHICLE, ...VALID_BODY });
      const res = await request(app)
        .post('/drivers/vehicles')
        .set('Authorization', 'Bearer driver-token')
        .send(VALID_BODY);
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── PATCH /drivers/vehicles/:id ──────────────────────────────────────────────

  describe('PATCH /drivers/vehicles/:id', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).patch(`/drivers/vehicles/${VEHICLE_ID}`).send({ color: 'Gris' });
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .patch(`/drivers/vehicles/${VEHICLE_ID}`)
        .set('Authorization', 'Bearer client-token')
        .send({ color: 'Gris' });
      expect(res.status).toBe(403);
    });

    it('retourne 200 après mise à jour par un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      mockUpdateVehicle.mockResolvedValue({ ...MOCK_VEHICLE, color: 'Gris' });
      const res = await request(app)
        .patch(`/drivers/vehicles/${VEHICLE_ID}`)
        .set('Authorization', 'Bearer driver-token')
        .send({ color: 'Gris' });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 404 si le véhicule est introuvable', async () => {
      setupValidToken(MOCK_DRIVER);
      mockUpdateVehicle.mockRejectedValue({ status: 404, message: 'Véhicule introuvable' });
      const res = await request(app)
        .patch('/drivers/vehicles/99999999-0000-4000-8000-000000000000')
        .set('Authorization', 'Bearer driver-token')
        .send({ color: 'Gris' });
      expect(res.status).toBe(404);
    });
  });

  // ── DELETE /drivers/vehicles/:id ─────────────────────────────────────────────

  describe('DELETE /drivers/vehicles/:id', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).delete(`/drivers/vehicles/${VEHICLE_ID}`);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un admin (route driver only)', async () => {
      setupValidToken(MOCK_ADMIN);
      const res = await request(app)
        .delete(`/drivers/vehicles/${VEHICLE_ID}`)
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 après suppression par un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      mockDeleteVehicle.mockResolvedValue({ message: 'Véhicule supprimé' });
      const res = await request(app)
        .delete(`/drivers/vehicles/${VEHICLE_ID}`)
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /admin/vehicles ──────────────────────────────────────────────────────

  describe('GET /admin/vehicles', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/vehicles');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get('/admin/vehicles')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetAllVehicles.mockResolvedValue({ data: [MOCK_VEHICLE], total: 1, page: 1, limit: 10 });
      const res = await request(app)
        .get('/admin/vehicles')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // PATCH /admin/vehicles/:id — non implémenté dans le code actuel (routes admin = GET only)
});
