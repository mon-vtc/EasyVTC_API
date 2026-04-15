import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (obligatoire ESM)
// ══════════════════════════════════════════════════════════════════════════════

const mockFrom          = jest.fn();
const mockComputePrice  = jest.fn();
const mockSendToUser    = jest.fn();

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: { from: mockFrom },
}));

jest.unstable_mockModule('../pricing/pricing.service.js', () => ({
  pricingService: { computePrice: mockComputePrice },
}));

jest.unstable_mockModule('../notifications/notifications.service.js', () => ({
  notificationsService: { sendToUser: mockSendToUser },
}));

// Référence nommée pour pouvoir asserter les appels dans les tests
const mockSetOnTripStatus = jest.fn().mockResolvedValue(undefined as never);

// driversService et ordersService utilisent supabaseAdmin mocké — mock minimal pour éviter
// les appels réels lors des tests de completeTrip / assignDriver
jest.unstable_mockModule('../drivers/drivers.service.js', () => ({
  driversService: {
    setOnTripStatus: mockSetOnTripStatus,
    resolveDriverId: jest.fn().mockResolvedValue('driver-uuid-333' as never),
  },
}));

jest.unstable_mockModule('../orders/orders.service.js', () => ({
  ordersService: {
    createFromReservation: jest.fn().mockResolvedValue({} as never),
  },
}));

// invoicesService — mock pour le fire-and-forget dans completeTrip
jest.unstable_mockModule('../invoices/invoices.service.js', () => ({
  invoicesService: {
    createFromTrip: jest.fn().mockResolvedValue({} as never),
  },
}));

const { ReservationsService } = await import('./reservations.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const CLIENT_ID      = 'client-uuid-111';
const DRIVER_USER_ID = 'driver-user-uuid-222';
const DRIVER_ID      = 'driver-uuid-333';
const ADMIN_ID       = 'admin-uuid-444';
const RESA_ID        = 'resa-uuid-555';

const mockReservation = {
  id:              RESA_ID,
  client_id:       CLIENT_ID,
  driver_id:       null as string | null,
  assigned_by:     null,
  status:          'pending' as string,
  pickup_address:  '1 rue de la Paix, Paris',
  pickup_lat:      48.869,
  pickup_lng:      2.331,
  dest_address:    'CDG, Roissy',
  dest_lat:        49.009,
  dest_lng:        2.547,
  vehicle_type:    'berline',
  country:         'france',
  pricing_type:    'formula',
  flat_rate_id:    null,
  price_estimated: 45.50,
  price_final:     null,
  price_adjusted:  null,
  price_breakdown: {},
  distance_km:     30,
  duration_min:    45,
  nb_passengers:   1,
  scheduled_at:    '2026-04-15T09:00:00Z',
  driver_arrived_at: null,
  comment:         null,
  promo_code_id:   null,
  created_at:      '2026-03-27T10:00:00Z',
  updated_at:      '2026-03-27T10:00:00Z',
};

const mockAssignedReservation = {
  ...mockReservation,
  driver_id:   DRIVER_ID,
  assigned_by: ADMIN_ID,
  status:      'assigned',
};

const mockDriverArrivedReservation = {
  ...mockAssignedReservation,
  status:            'driver_arrived',
  driver_arrived_at: '2026-04-15T08:55:00Z',
};

const mockInProgressReservation = {
  ...mockAssignedReservation,
  status: 'in_progress',
};

const mockCompletedReservation = {
  ...mockAssignedReservation,
  status:      'completed',
  price_final: 45.50,
};

const mockDriver = {
  id:      DRIVER_ID,
  user_id: DRIVER_USER_ID,
  status:  'active',
  users:   { first_name: 'Jean', last_name: 'Dupont' },
};

const mockPriceResult = {
  final_price: 45.50,
  currency:    'EUR',
  breakdown:   { base_price: 5, km_cost: 36, min_cost: 7.5 },
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/** Chaîne générique couvrant single(), maybeSingle(), range() et await direct */
function chain(data: unknown, error: unknown = null, count: number | null = null) {
  const resolved = { data, error, count } as never;
  // Make the chain object itself awaitable (thenable) so that
  // `await supabaseAdmin.from(...).update(...).eq(...)` works
  const c: Record<string, unknown> = {
    select:      jest.fn().mockReturnThis(),
    insert:      jest.fn().mockReturnThis(),
    update:      jest.fn().mockReturnThis(),
    delete:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
    neq:         jest.fn().mockReturnThis(),
    in:          jest.fn().mockReturnThis(),
    order:       jest.fn().mockReturnThis(),
    range:       jest.fn().mockReturnThis(),  // returns this so chained .eq() still works
    single:      jest.fn().mockResolvedValue(resolved),
    maybeSingle: jest.fn().mockResolvedValue(resolved),
    limit:       jest.fn().mockReturnThis(),
    gte:         jest.fn().mockReturnThis(),
    lte:         jest.fn().mockReturnThis(),
    // Thenable: makes `await chainObj` resolve to `resolved`
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(resolved).then(resolve, reject),
  };
  return c;
}

/** Shorthand : mock d'un insert sans terminal (trips.insert) */
function insertChain() {
  return { insert: jest.fn().mockResolvedValue({ data: null, error: null } as never) };
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('ReservationsService', () => {
  let service: InstanceType<typeof ReservationsService>;

  beforeEach(() => {
    service = new ReservationsService();
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // createReservation
  // ──────────────────────────────────────────────────────────────────────────
  describe('createReservation()', () => {

    it('✅ crée une réservation formule et retourne le prix estimé', async () => {
      mockComputePrice.mockResolvedValue(mockPriceResult as never);
      mockFrom.mockReturnValueOnce(chain(mockReservation));

      const result = await service.createReservation(CLIENT_ID, {
        pickup_address: '1 rue de la Paix, Paris',
        dest_address:   'CDG, Roissy',
        vehicle_type:   'berline',
        country:        'france',
        scheduled_at:   '2026-04-15T09:00:00Z',
        distance_km:    30,
        duration_min:   45,
      });

      expect(result.id).toBe(RESA_ID);
      expect(result.price_estimated).toBe(45.50);
      expect(mockComputePrice).toHaveBeenCalledTimes(1);
      expect(mockSendToUser).toHaveBeenCalledTimes(1);
    });

    it('✅ crée une réservation avec flat_rate_id (pricing_type = flat_rate)', async () => {
      mockComputePrice.mockResolvedValue({ ...mockPriceResult, pricing_type: 'flat_rate' } as never);
      const flatRateResa = { ...mockReservation, pricing_type: 'flat_rate', flat_rate_id: 'flat-uuid-999' };
      mockFrom.mockReturnValueOnce(chain(flatRateResa));

      const result = await service.createReservation(CLIENT_ID, {
        pickup_address: '1 rue de la Paix, Paris',
        dest_address:   'CDG, Roissy',
        vehicle_type:   'berline',
        country:        'france',
        scheduled_at:   '2026-04-15T09:00:00Z',
        flat_rate_id:   'flat-uuid-999',
      });

      expect(result.pricing_type).toBe('flat_rate');
    });

    it('❌ lève 500 si le moteur de tarification échoue', async () => {
      mockComputePrice.mockRejectedValue({ status: 404, message: 'Aucune grille tarifaire active' } as never);

      await expect(
        service.createReservation(CLIENT_ID, {
          pickup_address: '1 rue de la Paix, Paris',
          dest_address:   'CDG, Roissy',
          vehicle_type:   'berline',
          country:        'france',
          scheduled_at:   '2026-04-15T09:00:00Z',
          distance_km:    30,
          duration_min:   45,
        })
      ).rejects.toMatchObject({ status: 404 });
    });

    it('❌ lève 500 si l\'insert en BDD échoue', async () => {
      mockComputePrice.mockResolvedValue(mockPriceResult as never);
      mockFrom.mockReturnValueOnce(chain(null, { message: 'DB error' }));

      await expect(
        service.createReservation(CLIENT_ID, {
          pickup_address: '1 rue de la Paix, Paris',
          dest_address:   'CDG, Roissy',
          vehicle_type:   'berline',
          country:        'france',
          scheduled_at:   '2026-04-15T09:00:00Z',
          distance_km:    30,
          duration_min:   45,
        })
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // listReservations
  // ──────────────────────────────────────────────────────────────────────────
  describe('listReservations()', () => {

    it('✅ retourne la liste paginée avec total_pages', async () => {
      mockFrom.mockReturnValueOnce(chain([mockReservation], null, 42));

      const result = await service.listReservations({ page: 2, limit: 10 });

      expect(result.reservations).toHaveLength(1);
      expect(result.total).toBe(42);
      expect(result.page).toBe(2);
      expect(result.limit).toBe(10);
      expect(result.total_pages).toBe(5); // ceil(42/10)
    });

    it('✅ retourne une page vide si aucune réservation', async () => {
      mockFrom.mockReturnValueOnce(chain([], null, 0));

      const result = await service.listReservations({});

      expect(result.reservations).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.total_pages).toBe(0);
    });

    it('❌ lève 500 si la requête BDD échoue', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'DB error' }));

      await expect(service.listReservations({}))
        .rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // listMyReservations
  // ──────────────────────────────────────────────────────────────────────────
  describe('listMyReservations()', () => {

    it('✅ délègue à listReservations en injectant client_id', async () => {
      mockFrom.mockReturnValueOnce(chain([mockReservation], null, 1));

      const result = await service.listMyReservations(CLIENT_ID, {});

      expect(result.reservations[0].client_id).toBe(CLIENT_ID);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getDriverActiveReservation
  // ──────────────────────────────────────────────────────────────────────────
  describe('getDriverActiveReservation()', () => {

    it('✅ retourne la course active du chauffeur (assigned)', async () => {
      mockFrom.mockReturnValueOnce(chain(mockAssignedReservation));

      const result = await service.getDriverActiveReservation(DRIVER_ID);

      expect(result?.status).toBe('assigned');
    });

    it('✅ retourne la course active du chauffeur (driver_arrived)', async () => {
      mockFrom.mockReturnValueOnce(chain(mockDriverArrivedReservation));

      const result = await service.getDriverActiveReservation(DRIVER_ID);

      expect(result?.status).toBe('driver_arrived');
    });

    it('✅ retourne null si aucune course active', async () => {
      mockFrom.mockReturnValueOnce(chain(null));

      const result = await service.getDriverActiveReservation(DRIVER_ID);

      expect(result).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getById
  // ──────────────────────────────────────────────────────────────────────────
  describe('getById()', () => {

    it('✅ un admin peut voir n\'importe quelle réservation', async () => {
      mockFrom.mockReturnValueOnce(chain(mockReservation));

      const result = await service.getById(RESA_ID, ADMIN_ID, 'admin');

      expect(result.id).toBe(RESA_ID);
    });

    it('✅ un client peut voir sa propre réservation', async () => {
      mockFrom.mockReturnValueOnce(chain(mockReservation));

      const result = await service.getById(RESA_ID, CLIENT_ID, 'client');

      expect(result.id).toBe(RESA_ID);
    });

    it('❌ un client ne peut pas voir la réservation d\'un autre (403)', async () => {
      mockFrom.mockReturnValueOnce(chain(mockReservation));

      await expect(service.getById(RESA_ID, 'autre-client-uuid', 'client'))
        .rejects.toMatchObject({ status: 403 });
    });

    it('✅ un chauffeur peut voir sa course assignée', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockAssignedReservation))   // getById fetch
        .mockReturnValueOnce(chain({ id: DRIVER_ID }));         // resolveDriverId

      const result = await service.getById(RESA_ID, DRIVER_USER_ID, 'driver');

      expect(result.driver_id).toBe(DRIVER_ID);
    });

    it('❌ un chauffeur ne peut pas voir une course qui ne lui est pas assignée (403)', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockReservation))           // réservation sans driver_id
        .mockReturnValueOnce(chain({ id: DRIVER_ID }));         // resolveDriverId

      await expect(service.getById(RESA_ID, DRIVER_USER_ID, 'driver'))
        .rejects.toMatchObject({ status: 403 });
    });

    it('❌ lève 404 si la réservation n\'existe pas', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'Not found' }));

      await expect(service.getById('ghost-id', ADMIN_ID, 'admin'))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // assignDriver
  // ──────────────────────────────────────────────────────────────────────────
  describe('assignDriver()', () => {

    it('✅ assigne un chauffeur actif et disponible', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockReservation))             // _getReservationOrThrow
        .mockReturnValueOnce(chain(mockDriver))                  // driver check
        .mockReturnValueOnce(chain(null))                        // _checkSchedulingConflict (aucun conflit)
        .mockReturnValueOnce(chain(mockAssignedReservation));    // update réservation

      const result = await service.assignDriver(RESA_ID, { driver_id: DRIVER_ID }, ADMIN_ID);

      expect(result.status).toBe('assigned');
      expect(result.driver_id).toBe(DRIVER_ID);
      expect(mockSendToUser).toHaveBeenCalledTimes(2); // chauffeur + client
      // setOnTripStatus ne doit PAS être appelé à l'assignation — seulement au démarrage physique
      expect(mockSetOnTripStatus).not.toHaveBeenCalled();
    });

    it('❌ lève 400 si la réservation n\'est pas en pending', async () => {
      mockFrom.mockReturnValueOnce(chain(mockAssignedReservation)); // déjà assigned

      await expect(service.assignDriver(RESA_ID, { driver_id: DRIVER_ID }, ADMIN_ID))
        .rejects.toMatchObject({ status: 400, message: expect.stringContaining('assigned') });
    });

    it('❌ lève 404 si le chauffeur n\'existe pas', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockReservation))
        .mockReturnValueOnce(chain(null));  // driver introuvable

      await expect(service.assignDriver(RESA_ID, { driver_id: 'ghost-driver' }, ADMIN_ID))
        .rejects.toMatchObject({ status: 404, message: expect.stringContaining('introuvable') });
    });

    it('❌ lève 400 si le chauffeur n\'est pas actif (pending)', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockReservation))
        .mockReturnValueOnce(chain({ ...mockDriver, status: 'pending' }));

      await expect(service.assignDriver(RESA_ID, { driver_id: DRIVER_ID }, ADMIN_ID))
        .rejects.toMatchObject({ status: 400, message: expect.stringContaining('attente') });
    });

    it('❌ lève 409 si le chauffeur a déjà une course active', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockReservation))
        .mockReturnValueOnce(chain(mockDriver))
        .mockReturnValueOnce(chain([mockAssignedReservation])); // déjà une course

      await expect(service.assignDriver(RESA_ID, { driver_id: DRIVER_ID }, ADMIN_ID))
        .rejects.toMatchObject({ status: 409 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // markDriverArrived
  // ──────────────────────────────────────────────────────────────────────────
  describe('markDriverArrived()', () => {

    it('✅ passe en driver_arrived, enregistre l\'horodatage et notifie le client', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockAssignedReservation))   // _getReservationOrThrow
        .mockReturnValueOnce(chain({ id: DRIVER_ID }))          // _assertDriverOwnsReservation
        .mockReturnValueOnce(chain(null));                      // update status + driver_arrived_at

      await expect(service.markDriverArrived(RESA_ID, DRIVER_USER_ID))
        .resolves.not.toThrow();

      expect(mockSendToUser).toHaveBeenCalledWith(
        CLIENT_ID,
        'driver_arrived',
        expect.any(String),
        expect.any(String),
        expect.objectContaining({ reservation_id: RESA_ID })
      );
    });

    it('❌ lève 400 si le statut n\'est pas "assigned"', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockInProgressReservation)) // en_cours, pas assigned
        .mockReturnValueOnce(chain({ id: DRIVER_ID }));

      await expect(service.markDriverArrived(RESA_ID, DRIVER_USER_ID))
        .rejects.toMatchObject({ status: 400, message: expect.stringContaining('in_progress') });
    });

    it('❌ lève 403 si le chauffeur ne possède pas cette course', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockAssignedReservation))
        .mockReturnValueOnce(chain({ id: 'autre-driver-uuid' })); // mauvais driver

      await expect(service.markDriverArrived(RESA_ID, DRIVER_USER_ID))
        .rejects.toMatchObject({ status: 403 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // startTrip
  // ──────────────────────────────────────────────────────────────────────────
  describe('startTrip()', () => {

    it('✅ passe la course en in_progress depuis assigned et appelle setOnTripStatus', async () => {
      const inProgressResa = { ...mockAssignedReservation, status: 'in_progress' };

      mockFrom
        .mockReturnValueOnce(chain(mockAssignedReservation))   // _getReservationOrThrow
        .mockReturnValueOnce(chain({ id: DRIVER_ID }))          // _assertDriverOwnsReservation
        .mockReturnValueOnce(chain(inProgressResa))             // update status
        .mockReturnValueOnce(insertChain());                    // insert trips

      const result = await service.startTrip(RESA_ID, DRIVER_USER_ID);

      expect(result.status).toBe('in_progress');
      expect(mockSendToUser).toHaveBeenCalledTimes(1);
      // Le chauffeur passe en on_trip seulement au démarrage physique
      expect(mockSetOnTripStatus).toHaveBeenCalledWith(DRIVER_ID, true);
    });

    it('✅ passe la course en in_progress depuis driver_arrived', async () => {
      const inProgressResa = { ...mockDriverArrivedReservation, status: 'in_progress' };

      mockFrom
        .mockReturnValueOnce(chain(mockDriverArrivedReservation)) // _getReservationOrThrow
        .mockReturnValueOnce(chain({ id: DRIVER_ID }))             // _assertDriverOwnsReservation
        .mockReturnValueOnce(chain(inProgressResa))                // update status
        .mockReturnValueOnce(insertChain());                       // insert trips

      const result = await service.startTrip(RESA_ID, DRIVER_USER_ID);

      expect(result.status).toBe('in_progress');
      expect(mockSetOnTripStatus).toHaveBeenCalledWith(DRIVER_ID, true);
    });

    it('❌ lève 400 si le statut n\'est ni "assigned" ni "driver_arrived"', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockInProgressReservation))
        .mockReturnValueOnce(chain({ id: DRIVER_ID }));

      await expect(service.startTrip(RESA_ID, DRIVER_USER_ID))
        .rejects.toMatchObject({ status: 400, message: expect.stringContaining('in_progress') });
    });

    it('❌ lève 403 si le chauffeur ne possède pas cette course', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockAssignedReservation))
        .mockReturnValueOnce(chain({ id: 'autre-driver-uuid' }));

      await expect(service.startTrip(RESA_ID, DRIVER_USER_ID))
        .rejects.toMatchObject({ status: 403 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // completeTrip
  // ──────────────────────────────────────────────────────────────────────────
  describe('completeTrip()', () => {

    it('✅ termine la course et recalcule le prix avec les métriques réelles', async () => {
      const completedResa = { ...mockInProgressReservation, status: 'completed', price_final: 48.00 };
      mockComputePrice.mockResolvedValue({ ...mockPriceResult, final_price: 48.00 } as never);

      mockFrom
        .mockReturnValueOnce(chain(mockInProgressReservation))  // _getReservationOrThrow
        .mockReturnValueOnce(chain({ id: DRIVER_ID }))           // _assertDriverOwnsReservation
        .mockReturnValueOnce(chain(completedResa))               // update réservation
        .mockReturnValueOnce(chain(null));                       // update trips

      const result = await service.completeTrip(RESA_ID, DRIVER_USER_ID, {
        actual_distance_km:  32,
        actual_duration_min: 47,
        driver_notes:        'RAS',
      });

      expect(result.status).toBe('completed');
      expect(mockComputePrice).toHaveBeenCalledTimes(1);
      expect(mockSendToUser).toHaveBeenCalledTimes(1);
    });

    it('✅ conserve le prix estimé si pas de métriques réelles (flat_rate)', async () => {
      const flatRateInProgress = { ...mockInProgressReservation, pricing_type: 'flat_rate' };
      const completedResa      = { ...flatRateInProgress, status: 'completed', price_final: 45.50 };

      mockFrom
        .mockReturnValueOnce(chain(flatRateInProgress))
        .mockReturnValueOnce(chain({ id: DRIVER_ID }))
        .mockReturnValueOnce(chain(completedResa))
        .mockReturnValueOnce(chain(null));

      const result = await service.completeTrip(RESA_ID, DRIVER_USER_ID, {});

      expect(result.status).toBe('completed');
      expect(mockComputePrice).not.toHaveBeenCalled(); // pas de recalcul sur flat_rate
    });

    it('❌ lève 400 si le statut n\'est pas "in_progress"', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockAssignedReservation))    // assigned, pas in_progress
        .mockReturnValueOnce(chain({ id: DRIVER_ID }));

      await expect(service.completeTrip(RESA_ID, DRIVER_USER_ID, {}))
        .rejects.toMatchObject({ status: 400, message: expect.stringContaining('assigned') });
    });

    it('❌ lève 403 si le chauffeur ne possède pas cette course', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockInProgressReservation))
        .mockReturnValueOnce(chain({ id: 'autre-driver-uuid' }));

      await expect(service.completeTrip(RESA_ID, DRIVER_USER_ID, {}))
        .rejects.toMatchObject({ status: 403 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // cancelReservation
  // ──────────────────────────────────────────────────────────────────────────
  describe('cancelReservation()', () => {

    it('✅ un client annule sa propre réservation (pending)', async () => {
      const cancelledResa = { ...mockReservation, status: 'cancelled' };

      mockFrom
        .mockReturnValueOnce(chain(mockReservation))            // _getReservationOrThrow
        .mockReturnValueOnce(chain(cancelledResa));             // update status

      const result = await service.cancelReservation(RESA_ID, CLIENT_ID, 'client');

      expect(result.status).toBe('cancelled');
    });

    it('✅ un admin annule une course assignée — setOnTripStatus NON appelé (driver pas encore en route)', async () => {
      const cancelledResa = { ...mockAssignedReservation, status: 'cancelled' };

      mockFrom
        .mockReturnValueOnce(chain(mockAssignedReservation))    // _getReservationOrThrow
        .mockReturnValueOnce(chain(cancelledResa))              // update status
        .mockReturnValueOnce(chain({ user_id: DRIVER_USER_ID })); // fetch driver.user_id

      const result = await service.cancelReservation(RESA_ID, ADMIN_ID, 'admin', 'Annulation test');

      expect(result.status).toBe('cancelled');
      expect(mockSendToUser).toHaveBeenCalledTimes(2); // notif chauffeur + notif client
      // Le driver était 'assigned' (pas physiquement en route) → son status reste 'active', rien à faire
      expect(mockSetOnTripStatus).not.toHaveBeenCalled();
    });

    it('✅ un admin annule une course in_progress — setOnTripStatus(false) appelé pour remettre le driver actif', async () => {
      const cancelledResa = { ...mockInProgressReservation, status: 'cancelled' };

      mockFrom
        .mockReturnValueOnce(chain(mockInProgressReservation))  // _getReservationOrThrow
        .mockReturnValueOnce(chain(cancelledResa))               // update status
        .mockReturnValueOnce(chain({ user_id: DRIVER_USER_ID })); // fetch driver.user_id

      const result = await service.cancelReservation(RESA_ID, ADMIN_ID, 'admin', 'Incident en course');

      expect(result.status).toBe('cancelled');
      expect(mockSetOnTripStatus).toHaveBeenCalledWith(DRIVER_ID, false);
    });

    it('❌ un client ne peut pas annuler la réservation d\'un autre (403)', async () => {
      mockFrom.mockReturnValueOnce(chain(mockReservation));

      await expect(service.cancelReservation(RESA_ID, 'autre-client', 'client'))
        .rejects.toMatchObject({ status: 403 });
    });

    it('❌ impossible d\'annuler une course terminée (400)', async () => {
      mockFrom.mockReturnValueOnce(chain(mockCompletedReservation));

      await expect(service.cancelReservation(RESA_ID, ADMIN_ID, 'admin'))
        .rejects.toMatchObject({ status: 400, message: expect.stringContaining('terminée') });
    });

    it('❌ impossible d\'annuler une course déjà annulée (400)', async () => {
      mockFrom.mockReturnValueOnce(chain({ ...mockReservation, status: 'cancelled' }));

      await expect(service.cancelReservation(RESA_ID, ADMIN_ID, 'admin'))
        .rejects.toMatchObject({ status: 400, message: expect.stringContaining('annulée') });
    });

    it('❌ un client ne peut pas annuler une course en cours (400)', async () => {
      mockFrom.mockReturnValueOnce(chain(mockInProgressReservation));

      await expect(service.cancelReservation(RESA_ID, CLIENT_ID, 'client'))
        .rejects.toMatchObject({ status: 400, message: expect.stringContaining('en cours') });
    });
  });
});
