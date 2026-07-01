// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Vehicle Types
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin       → jest.unstable_mockModule (auth middleware)
//   - vehicleTypesService → jest.unstable_mockModule (isole le controller)
//
// Routes :
//   GET    /vehicle-types              Public — types actifs
//   GET    /admin/vehicle-types        Admin  — tous les types
//   POST   /admin/vehicle-types        Admin  — créer un type
//   PATCH  /admin/vehicle-types/:code  Admin  — modifier un type
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser        = jest.fn() as any;
const mockFrom           = jest.fn() as any;

const mockGetActiveTypes = jest.fn() as any;
const mockGetAllTypes    = jest.fn() as any;
const mockGetTypeById    = jest.fn() as any;
const mockCreateType     = jest.fn() as any;
const mockUpdateType     = jest.fn() as any;
const mockDeleteType     = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('./vehicle-types.service.js', () => ({
  vehicleTypesService: {
    getActiveTypes: mockGetActiveTypes,
    getAllTypes:    mockGetAllTypes,
    getTypeById:   mockGetTypeById,
    createType:    mockCreateType,
    updateType:    mockUpdateType,
    deleteType:    mockDeleteType,
  },
}));

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id: '550e8400-e29b-41d4-a716-4466554400e0', email: 'client@test.com', role: 'client',
  first_name: 'Jean', last_name: 'Dupont', phone: '+33612345678',
  status: 'active', deleted_at: null, created_at: new Date().toISOString(),
  permissions: [],
};

const MOCK_DRIVER = {
  ...MOCK_CLIENT,
  id: '550e8400-e29b-41d4-a716-4466554400e1', email: 'driver@test.com', role: 'driver',
};

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id: '550e8400-e29b-41d4-a716-4466554400e2', email: 'admin@test.com', role: 'admin',
};

const TYPE_CODE = 'berline';
const TYPE_ID   = '550e8400-e29b-41d4-a716-4466554400e4';
const DRIVER_ID = '550e8400-e29b-41d4-a716-4466554400e3';

const MOCK_TYPE = {
  id: 'type-uuid-001', code: TYPE_CODE, name: 'Berline',
  description: 'Voiture berline confort', seats: 4,
  is_active: true, base_price_france: 8.00, base_price_senegal: 2000,
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

describe('Vehicle Types routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── GET /vehicle-types — route publique ────────────────────────────────────

  describe('GET /vehicle-types', () => {
    it('retourne 200 sans authentification (route publique)', async () => {
      mockGetActiveTypes.mockResolvedValue([MOCK_TYPE]);
      const res = await request(app).get('/vehicle-types');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 200 avec un token client', async () => {
      setupValidToken(MOCK_CLIENT);
      mockGetActiveTypes.mockResolvedValue([MOCK_TYPE, { ...MOCK_TYPE, code: 'van', name: 'Van' }]);
      const res = await request(app)
        .get('/vehicle-types')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 200 avec liste vide si aucun type actif', async () => {
      mockGetActiveTypes.mockResolvedValue([]);
      const res = await request(app).get('/vehicle-types');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /admin/vehicle-types ─────────────────────────────────────────────────

  describe('GET /admin/vehicle-types', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/admin/vehicle-types');
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .get('/admin/vehicle-types')
        .set('Authorization', 'Bearer client-token');
      expect(res.status).toBe(403);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .get('/admin/vehicle-types')
        .set('Authorization', 'Bearer driver-token');
      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin (inclut types inactifs)', async () => {
      setupValidToken(MOCK_ADMIN);
      mockGetAllTypes.mockResolvedValue([
        MOCK_TYPE,
        { ...MOCK_TYPE, code: 'limousine', name: 'Limousine', is_active: false },
      ]);
      const res = await request(app)
        .get('/admin/vehicle-types')
        .set('Authorization', 'Bearer admin-token');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── POST /admin/vehicle-types ────────────────────────────────────────────────

  describe('POST /admin/vehicle-types', () => {
    const VALID_BODY = {
      code: 'luxury', label: 'Luxe', description: 'Véhicule haut de gamme',
      capacity: 4, base_price_france: 15.00, base_price_senegal: 3000,
    };

    it('retourne 401 sans token', async () => {
      const res = await request(app).post('/admin/vehicle-types').send(VALID_BODY);
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .post('/admin/vehicle-types')
        .set('Authorization', 'Bearer client-token')
        .send(VALID_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .post('/admin/vehicle-types')
        .set('Authorization', 'Bearer driver-token')
        .send(VALID_BODY);
      expect(res.status).toBe(403);
    });

    it('retourne 201 après création par un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockCreateType.mockResolvedValue({ ...MOCK_TYPE, ...VALID_BODY });
      const res = await request(app)
        .post('/admin/vehicle-types')
        .set('Authorization', 'Bearer admin-token')
        .send(VALID_BODY);
      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── PATCH /admin/vehicle-types/:code ────────────────────────────────────────

  describe('PATCH /admin/vehicle-types/:code', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app)
        .patch(`/admin/vehicle-types/${TYPE_ID}`)
        .send({ base_price_france: 10.00 });
      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);
      const res = await request(app)
        .patch(`/admin/vehicle-types/${TYPE_ID}`)
        .set('Authorization', 'Bearer client-token')
        .send({ base_price_france: 10.00 });
      expect(res.status).toBe(403);
    });

    it('retourne 403 pour un driver', async () => {
      setupValidToken(MOCK_DRIVER);
      const res = await request(app)
        .patch(`/admin/vehicle-types/${TYPE_ID}`)
        .set('Authorization', 'Bearer driver-token')
        .send({ base_price_france: 10.00 });
      expect(res.status).toBe(403);
    });

    it('retourne 200 après mise à jour par un admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockUpdateType.mockResolvedValue({ ...MOCK_TYPE, base_price_france: 10.00 });
      const res = await request(app)
        .patch(`/admin/vehicle-types/${TYPE_ID}`)
        .set('Authorization', 'Bearer admin-token')
        .send({ base_price_france: 10.00 });
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 404 si le type est introuvable', async () => {
      setupValidToken(MOCK_ADMIN);
      mockUpdateType.mockRejectedValue({ status: 404, message: 'Type de véhicule introuvable' });
      const res = await request(app)
        .patch('/admin/vehicle-types/99999999-0000-4000-8000-000000000000')
        .set('Authorization', 'Bearer admin-token')
        .send({ base_price_france: 10.00 });
      expect(res.status).toBe(404);
    });
  });
});

