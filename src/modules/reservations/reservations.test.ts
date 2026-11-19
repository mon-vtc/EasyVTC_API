// ──────────────────────────────────────────────────────────────────────────────
// INTEGRATION TESTS — Module Réservations
// Stratégie : supertest sur l'app Express complète (HTTP layer).
//   - supabaseAdmin        → jest.unstable_mockModule (auth middleware + driver lookup)
//   - reservationsService  → jest.unstable_mockModule (isole le controller)
// ──────────────────────────────────────────────────────────────────────────────

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import request from 'supertest';

// ── Variables de mock (as any : évite les erreurs de type strict Jest 30) ─────

/* eslint-disable @typescript-eslint/no-explicit-any */
const mockGetUser                = jest.fn() as any;
const mockFrom                   = jest.fn() as any;

const mockCreateReservation      = jest.fn() as any;
const mockListReservations       = jest.fn() as any;
const mockListMyReservations     = jest.fn() as any;
const mockListDriverReservations = jest.fn() as any;
const mockGetDriverActive        = jest.fn() as any;
const mockUpdateAddresses        = jest.fn() as any;
const mockAssignDriver           = jest.fn() as any;
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Mocks modules ─────────────────────────────────────────────────────────────

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: { getUser: mockGetUser, signOut: jest.fn() },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('./reservations.service.js', () => ({
  reservationsService: {
    createReservation:          mockCreateReservation,
    listReservations:           mockListReservations,
    listMyReservations:         mockListMyReservations,
    listDriverReservations:     mockListDriverReservations,
    getDriverActiveReservation: mockGetDriverActive,
    getById:                    jest.fn(),
    assignDriver:               mockAssignDriver,
    updateAddresses:            mockUpdateAddresses,
    markDriverArrived:          jest.fn(),
    startTrip:                  jest.fn(),
    completeTrip:               jest.fn(),
    cancelReservation:          jest.fn(),
    getAvailableDrivers:        jest.fn(),
  },
}));

// ── Imports dynamiques ────────────────────────────────────────────────────────

const { default: app } = await import('../../app.js');

// ── Données de test ───────────────────────────────────────────────────────────

const MOCK_CLIENT = {
  id:          'client-uuid-resa-test',
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

const MOCK_DRIVER = {
  ...MOCK_CLIENT,
  id:    'driver-uuid-resa-test',
  email: 'driver@test.com',
  role:  'driver',
};

const MOCK_ADMIN = {
  ...MOCK_CLIENT,
  id:    'admin-uuid-resa-test',
  email: 'admin@test.com',
  role:  'admin',
};

const MOCK_RESERVATION = {
  id:                  'resa-uuid-1',
  client_id:           MOCK_CLIENT.id,
  driver_id:           null,
  status:              'pending',
  origin_address:      '1 Rue de Rivoli, 75001 Paris',
  origin_lat:          48.8566,
  origin_lng:          2.3522,
  destination_address: 'Aéroport CDG, Terminal 2',
  destination_lat:     49.0097,
  destination_lng:     2.5479,
  pickup_datetime:     new Date(Date.now() + 86400000).toISOString(),
  vehicle_type:        'standard',
  passengers_count:    2,
  distance_km:         30,
  duration_min:        45,
  price_estimate:      54.0,
  created_at:          new Date().toISOString(),
};

const VALID_CREATE_BODY = {
  pickup_address: '1 Rue de Rivoli, 75001 Paris',
  pickup_lat:     48.8566,
  pickup_lng:     2.3522,
  dest_address:   'Aéroport CDG, Terminal 2',
  dest_lat:       49.0097,
  dest_lng:       2.5479,
  scheduled_at:   new Date(Date.now() + 86400000).toISOString(),
  vehicle_type:   'standard',
  nb_passengers:  2,
  distance_km:    30,
  duration_min:   45,
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

/**
 * Configure Supabase pour simuler un token valide.
 * Pour les chauffeurs : les appels sur la table 'drivers' retournent le driverRecord.
 */
function setupValidToken(
  user: typeof MOCK_CLIENT | typeof MOCK_DRIVER | typeof MOCK_ADMIN,
  driverRecordId = 'driver-record-uuid-1',
) {
  mockGetUser.mockResolvedValue({ data: { user: { id: user.id } }, error: null });
  mockFrom.mockImplementation((table: unknown) => {
    if (table === 'users')   return makeChain(user);
    if (table === 'drivers') return makeChain({ id: driverRecordId });
    return makeChain([]);
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Reservations routes', () => {
  beforeEach(() => { jest.clearAllMocks(); });

  // ── GET /reservations/mine (client) ────────────────────────────────────────

  describe('GET /reservations/mine', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/reservations/mine');

      expect(res.status).toBe(401);
      expect(res.body.ok).toBe(false);
    });

    it('retourne 200 avec les réservations du client', async () => {
      setupValidToken(MOCK_CLIENT);
      mockListMyReservations.mockResolvedValue({
        data: [MOCK_RESERVATION], total: 1, page: 1, limit: 10,
      });

      const res = await request(app)
        .get('/reservations/mine')
        .set('Authorization', 'Bearer client-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 403 pour un admin (route réservée aux clients)', async () => {
      setupValidToken(MOCK_ADMIN);

      const res = await request(app)
        .get('/reservations/mine')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(403);
      expect(res.body.ok).toBe(false);
    });
  });

  // ── POST /reservations (client) ────────────────────────────────────────────

  describe('POST /reservations', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).post('/reservations').send(VALID_CREATE_BODY);

      expect(res.status).toBe(401);
    });

    it('retourne 201 sur création réussie par un client', async () => {
      setupValidToken(MOCK_CLIENT);
      mockCreateReservation.mockResolvedValue(MOCK_RESERVATION);

      const res = await request(app)
        .post('/reservations')
        .set('Authorization', 'Bearer client-token')
        .send(VALID_CREATE_BODY);

      expect(res.status).toBe(201);
      expect(res.body.ok).toBe(true);
      expect(res.body.data.status).toBe('pending');
    });

    it('retourne 400 si les données sont invalides', async () => {
      setupValidToken(MOCK_CLIENT);

      const res = await request(app)
        .post('/reservations')
        .set('Authorization', 'Bearer client-token')
        .send({ origin_address: '1 Rue de Rivoli' });

      expect(res.status).toBe(400);
      expect(res.body.ok).toBe(false);
      expect(res.body.errors).toBeDefined();
    });

    it('retourne 403 si un admin essaie de créer une réservation', async () => {
      setupValidToken(MOCK_ADMIN);

      const res = await request(app)
        .post('/reservations')
        .set('Authorization', 'Bearer admin-token')
        .send(VALID_CREATE_BODY);

      expect(res.status).toBe(403);
    });
  });

  // ── GET /reservations (admin) ──────────────────────────────────────────────

  describe('GET /reservations', () => {
    it('retourne 401 sans token', async () => {
      const res = await request(app).get('/reservations');

      expect(res.status).toBe(401);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);

      const res = await request(app)
        .get('/reservations')
        .set('Authorization', 'Bearer client-token');

      expect(res.status).toBe(403);
    });

    it('retourne 200 pour un admin avec toutes les réservations', async () => {
      setupValidToken(MOCK_ADMIN);
      mockListReservations.mockResolvedValue({
        data: [MOCK_RESERVATION], total: 1, page: 1, limit: 10,
      });

      const res = await request(app)
        .get('/reservations')
        .set('Authorization', 'Bearer admin-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });
  });

  // ── GET /reservations/driver (chauffeur) ───────────────────────────────────

  describe('GET /reservations/driver', () => {
    it('retourne 200 avec l\'historique du chauffeur', async () => {
      setupValidToken(MOCK_DRIVER);
      mockListDriverReservations.mockResolvedValue({
        data: [MOCK_RESERVATION], total: 1, page: 1, limit: 10,
      });

      const res = await request(app)
        .get('/reservations/driver')
        .set('Authorization', 'Bearer driver-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);

      const res = await request(app)
        .get('/reservations/driver')
        .set('Authorization', 'Bearer client-token');

      expect(res.status).toBe(403);
    });
  });

  // ── GET /reservations/driver/active ────────────────────────────────────────

  describe('GET /reservations/driver/active', () => {
    it('retourne 200 avec la course active du chauffeur', async () => {
      setupValidToken(MOCK_DRIVER);
      mockGetDriverActive.mockResolvedValue(MOCK_RESERVATION);

      const res = await request(app)
        .get('/reservations/driver/active')
        .set('Authorization', 'Bearer driver-token');

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);

      const res = await request(app)
        .get('/reservations/driver/active')
        .set('Authorization', 'Bearer client-token');

      expect(res.status).toBe(403);
    });
  });

  // ── PATCH /reservations/:id/addresses ──────────────────────────────────────

  describe('PATCH /reservations/:id/addresses', () => {
    const RESA_UUID = '11111111-1111-4111-8111-111111111111';
    const VALID_BODY = { dest_address: '10 avenue de la Défense, Puteaux', dest_lat: 48.892, dest_lng: 2.236 };

    it('retourne 401 sans token', async () => {
      const res = await request(app).patch(`/reservations/${RESA_UUID}/addresses`).send(VALID_BODY);

      expect(res.status).toBe(401);
    });

    it('retourne 200 et transmet le rôle du demandeur au service (client)', async () => {
      setupValidToken(MOCK_CLIENT);
      mockUpdateAddresses.mockResolvedValue({ ...MOCK_RESERVATION, dest_address: VALID_BODY.dest_address });

      const res = await request(app)
        .patch(`/reservations/${RESA_UUID}/addresses`)
        .set('Authorization', 'Bearer client-token')
        .send(VALID_BODY);

      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
      expect(mockUpdateAddresses).toHaveBeenCalledWith(RESA_UUID, MOCK_CLIENT.id, 'client', VALID_BODY);
    });

    it('accepte le chauffeur et l\'admin', async () => {
      mockUpdateAddresses.mockResolvedValue(MOCK_RESERVATION);

      for (const [user, token] of [[MOCK_DRIVER, 'driver-token'], [MOCK_ADMIN, 'admin-token']] as const) {
        setupValidToken(user);
        const res = await request(app)
          .patch(`/reservations/${RESA_UUID}/addresses`)
          .set('Authorization', `Bearer ${token}`)
          .send(VALID_BODY);
        expect(res.status).toBe(200);
      }
    });

    it('retourne 403 pour un gestionnaire sans la permission assign_reservation', async () => {
      setupValidToken({ ...MOCK_ADMIN, id: 'manager-uuid', role: 'manager' } as typeof MOCK_ADMIN);

      const res = await request(app)
        .patch(`/reservations/${RESA_UUID}/addresses`)
        .set('Authorization', 'Bearer manager-token')
        .send(VALID_BODY);

      expect(res.status).toBe(403);
      expect(mockUpdateAddresses).not.toHaveBeenCalled();
    });

    it('retourne 400 si une adresse arrive sans coordonnées', async () => {
      setupValidToken(MOCK_CLIENT);

      const res = await request(app)
        .patch(`/reservations/${RESA_UUID}/addresses`)
        .set('Authorization', 'Bearer client-token')
        .send({ dest_address: '10 avenue de la Défense, Puteaux' });

      expect(res.status).toBe(400);
      expect(res.body.errors?.dest_address).toBeDefined();
      expect(mockUpdateAddresses).not.toHaveBeenCalled();
    });

    it('retourne 400 si aucune adresse n\'est fournie', async () => {
      setupValidToken(MOCK_CLIENT);

      const res = await request(app)
        .patch(`/reservations/${RESA_UUID}/addresses`)
        .set('Authorization', 'Bearer client-token')
        .send({});

      expect(res.status).toBe(400);
    });

    it('retourne 400 si l\'ID n\'est pas un UUID', async () => {
      setupValidToken(MOCK_CLIENT);

      const res = await request(app)
        .patch('/reservations/pas-un-uuid/addresses')
        .set('Authorization', 'Bearer client-token')
        .send(VALID_BODY);

      expect(res.status).toBe(400);
    });

    it('relaie le statut d\'erreur du service (course démarrée)', async () => {
      setupValidToken(MOCK_CLIENT);
      mockUpdateAddresses.mockRejectedValue({ status: 400, message: 'La course a démarré' });

      const res = await request(app)
        .patch(`/reservations/${RESA_UUID}/addresses`)
        .set('Authorization', 'Bearer client-token')
        .send(VALID_BODY);

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('démarré');
    });
  });

  // ── POST /reservations/:id/assign (réattribution) ──────────────────────────

  describe('POST /reservations/:id/assign', () => {
    const RESA_UUID   = '11111111-1111-4111-8111-111111111111';
    const DRIVER_UUID = '22222222-2222-4222-8222-222222222222';

    it('retourne 200 pour une réattribution par l\'admin', async () => {
      setupValidToken(MOCK_ADMIN);
      mockAssignDriver.mockResolvedValue({ ...MOCK_RESERVATION, status: 'assigned', driver_id: DRIVER_UUID });

      const res = await request(app)
        .post(`/reservations/${RESA_UUID}/assign`)
        .set('Authorization', 'Bearer admin-token')
        .send({ driver_id: DRIVER_UUID });

      expect(res.status).toBe(200);
      expect(mockAssignDriver).toHaveBeenCalledWith(RESA_UUID, { driver_id: DRIVER_UUID }, MOCK_ADMIN.id);
    });

    it('relaie le 400 « déjà assigné » du service', async () => {
      setupValidToken(MOCK_ADMIN);
      mockAssignDriver.mockRejectedValue({ status: 400, message: 'Ce chauffeur est déjà assigné à cette course' });

      const res = await request(app)
        .post(`/reservations/${RESA_UUID}/assign`)
        .set('Authorization', 'Bearer admin-token')
        .send({ driver_id: DRIVER_UUID });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('déjà assigné');
    });

    it('retourne 403 pour un client', async () => {
      setupValidToken(MOCK_CLIENT);

      const res = await request(app)
        .post(`/reservations/${RESA_UUID}/assign`)
        .set('Authorization', 'Bearer client-token')
        .send({ driver_id: DRIVER_UUID });

      expect(res.status).toBe(403);
    });
  });
});
