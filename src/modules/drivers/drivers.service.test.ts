import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (obligatoire ESM)
// ══════════════════════════════════════════════════════════════════════════════

const mockFrom = jest.fn();

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: { from: mockFrom },
}));

const { DriversService } = await import('./drivers.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const DRIVER_USER_ID = 'user-driver-uuid-111';
const DRIVER_ID      = 'driver-uuid-222';
const ADMIN_ID       = 'admin-uuid-333';

const mockDriverRecord = { id: DRIVER_ID };

const mockDriverWithUser = {
  id:           DRIVER_ID,
  user_id:      DRIVER_USER_ID,
  status:       'active',
  vehicle_type: 'berline',
  siret:        '12345678900011',
  tva_rate:     10,
  is_online:    false,
  zone:         'france',
  created_at:   '2026-03-01T10:00:00Z',
  updated_at:   '2026-03-01T10:00:00Z',
  user: {
    id:                DRIVER_USER_ID,
    email:             'driver@easyvtc.com',
    first_name:        'Jean',
    last_name:         'Dupont',
    phone:             '+33600000001',
    profile_photo_url: null,
    status:            'active',
    created_at:        '2026-03-01T10:00:00Z',
  },
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function chain(data: unknown, error: unknown = null, count: number | null = null) {
  const resolved = { data, error, count } as never;
  const c: Record<string, unknown> = {
    select:      jest.fn().mockReturnThis(),
    insert:      jest.fn().mockReturnThis(),
    update:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
    neq:         jest.fn().mockReturnThis(),
    or:          jest.fn().mockReturnThis(),
    in:          jest.fn().mockReturnThis(),
    gte:         jest.fn().mockReturnThis(),
    lte:         jest.fn().mockReturnThis(),
    order:       jest.fn().mockReturnThis(),
    range:       jest.fn().mockReturnThis(),
    single:      jest.fn().mockResolvedValue(resolved),
    maybeSingle: jest.fn().mockResolvedValue(resolved),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(resolved).then(resolve, reject),
  };
  return c;
}

// Chain pour la table commissions (resolves via .in())
function commChain(commissions: unknown[] = []) {
  const resolved = { data: commissions, error: null } as never;
  return {
    select: jest.fn().mockReturnThis(),
    in:     jest.fn().mockResolvedValue(resolved),
  };
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('DriversService', () => {
  let service: InstanceType<typeof DriversService>;

  beforeEach(() => {
    service = new DriversService();
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // getMyProfile
  // ────────────────────────────────────────────────────────────────────────────
  describe('getMyProfile()', () => {
    it(' retourne le profil complet du chauffeur connecté', async () => {
      mockFrom.mockReturnValueOnce(chain(mockDriverWithUser));

      const result = await service.getMyProfile(DRIVER_USER_ID);
      expect(result.id).toBe(DRIVER_ID);
      expect(result.user.email).toBe('driver@easyvtc.com');
    });

    it(' lève 404 si le profil est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));
      await expect(service.getMyProfile(DRIVER_USER_ID))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // updateMyProfile
  // ────────────────────────────────────────────────────────────────────────────
  describe('updateMyProfile()', () => {
    it(' met à jour siret et zone', async () => {
      const updated = { ...mockDriverWithUser, siret: '99999999900099', zone: 'senegal' };
      mockFrom.mockReturnValueOnce(chain(updated));

      const result = await service.updateMyProfile(DRIVER_USER_ID, { siret: '99999999900099', zone: 'senegal' });
      expect(result.siret).toBe('99999999900099');
      expect(result.zone).toBe('senegal');
    });

    it(' lève 500 si la mise à jour échoue', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'db error' }));
      await expect(service.updateMyProfile(DRIVER_USER_ID, { zone: 'france' }))
        .rejects.toMatchObject({ status: 500 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // setOnlineStatus
  // ────────────────────────────────────────────────────────────────────────────
  describe('setOnlineStatus()', () => {
    it(' passe en ligne un chauffeur actif', async () => {
      const onlineDriver = { ...mockDriverWithUser, is_online: true };
      mockFrom
        .mockReturnValueOnce(chain({ status: 'active' }))  // fetch status
        .mockReturnValueOnce(chain(onlineDriver));          // update

      const result = await service.setOnlineStatus(DRIVER_USER_ID, true);
      expect(result.is_online).toBe(true);
    });

    it(' passe hors ligne (pas de vérification de statut requise)', async () => {
      const offlineDriver = { ...mockDriverWithUser, is_online: false };
      mockFrom
        .mockReturnValueOnce(chain({ status: 'active' }))
        .mockReturnValueOnce(chain(offlineDriver));

      const result = await service.setOnlineStatus(DRIVER_USER_ID, false);
      expect(result.is_online).toBe(false);
    });

    it(' lève 403 si le chauffeur est en mission (on_trip)', async () => {
      mockFrom.mockReturnValueOnce(chain({ status: 'on_trip' }));
      await expect(service.setOnlineStatus(DRIVER_USER_ID, false))
        .rejects.toMatchObject({ status: 403 });
    });

    it(' lève 403 si le chauffeur n\'est pas actif et veut se mettre en ligne', async () => {
      mockFrom.mockReturnValueOnce(chain({ status: 'pending' }));
      await expect(service.setOnlineStatus(DRIVER_USER_ID, true))
        .rejects.toMatchObject({ status: 403 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // listDrivers (admin)
  // ────────────────────────────────────────────────────────────────────────────
  describe('listDrivers()', () => {
    it(' retourne la liste paginée des chauffeurs', async () => {
      const listChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        order:   jest.fn().mockReturnThis(),
        range:   jest.fn().mockResolvedValue({
          data: [mockDriverWithUser], error: null, count: 1,
        } as never),
      };
      mockFrom.mockReturnValueOnce(listChain);

      const result = await service.listDrivers({ page: 1, limit: 20 });
      expect(result.drivers).toHaveLength(1);
      expect(result.total).toBe(1);
    });

    it(' filtre par statut et zone', async () => {
      const listChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        order:   jest.fn().mockReturnThis(),
        range:   jest.fn().mockResolvedValue({ data: [], error: null, count: 0 } as never),
      };
      mockFrom.mockReturnValueOnce(listChain);

      const result = await service.listDrivers({ status: 'active', zone: 'france', page: 1, limit: 20 });
      expect(result.drivers).toHaveLength(0);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // changeDriverStatus (admin)
  // ────────────────────────────────────────────────────────────────────────────
  describe('changeDriverStatus()', () => {
    it(' valide (active) un chauffeur pending', async () => {
      const activeDriver = { ...mockDriverWithUser, status: 'active' };
      mockFrom
        .mockReturnValueOnce(chain({ id: DRIVER_ID, status: 'pending' }))  // fetch existing
        .mockReturnValueOnce(chain(activeDriver));                           // update

      const result = await service.changeDriverStatus(DRIVER_ID, { status: 'active', reason: 'Documents validés' });
      expect(result.status).toBe('active');
    });

    it(' suspend un chauffeur actif et le passe hors ligne', async () => {
      const suspendedDriver = { ...mockDriverWithUser, status: 'suspended', is_online: false };
      mockFrom
        .mockReturnValueOnce(chain({ id: DRIVER_ID, status: 'active' }))
        .mockReturnValueOnce(chain(suspendedDriver));

      const result = await service.changeDriverStatus(DRIVER_ID, { status: 'suspended', reason: 'Comportement inapproprié' });
      expect(result.status).toBe('suspended');
      expect(result.is_online).toBe(false);
    });

    it(' lève 400 si le statut est déjà le même', async () => {
      mockFrom.mockReturnValueOnce(chain({ id: DRIVER_ID, status: 'active' }));
      await expect(service.changeDriverStatus(DRIVER_ID, { status: 'active', reason: 'Déjà actif' }))
        .rejects.toMatchObject({ status: 400 });
    });

    it(' lève 400 si un chauffeur rejeté est mis sur un autre statut que active', async () => {
      mockFrom.mockReturnValueOnce(chain({ id: DRIVER_ID, status: 'rejected' }));
      await expect(service.changeDriverStatus(DRIVER_ID, { status: 'suspended', reason: 'test' }))
        .rejects.toMatchObject({ status: 400 });
    });

    it(' lève 404 si le chauffeur est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));
      await expect(service.changeDriverStatus('unknown-id', { status: 'active', reason: 'test' }))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // setOnTripStatus (interne)
  // ────────────────────────────────────────────────────────────────────────────
  describe('setOnTripStatus()', () => {
    it(' passe un chauffeur actif en on_trip', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ id: DRIVER_ID, status: 'active' }))  // fetch
        .mockReturnValueOnce({                                              // update
          update: jest.fn().mockReturnThis(),
          eq:     jest.fn().mockResolvedValue({ error: null } as never),
        });

      await expect(service.setOnTripStatus(DRIVER_ID, true)).resolves.toBeUndefined();
    });

    it(' idempotent — ne fait rien si already active et onTrip=false', async () => {
      mockFrom.mockReturnValueOnce(chain({ id: DRIVER_ID, status: 'active' }));
      // Pas d'update attendu
      await expect(service.setOnTripStatus(DRIVER_ID, false)).resolves.toBeUndefined();
    });

    it(' lève 400 si on essaie de mettre en mission un chauffeur suspended', async () => {
      mockFrom.mockReturnValueOnce(chain({ id: DRIVER_ID, status: 'suspended' }));
      await expect(service.setOnTripStatus(DRIVER_ID, true))
        .rejects.toMatchObject({ status: 400 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // getPlanning
  // ────────────────────────────────────────────────────────────────────────────
  describe('getPlanning()', () => {
    const mockReservations = [
      {
        id: 'resa-1', status: 'assigned',
        scheduled_at: '2026-04-14T09:00:00Z',
        pickup_address: '1 rue de la Paix', dest_address: 'CDG',
        vehicle_type: 'berline', price_estimated: 45, price_final: null,
        country: 'france', client: { first_name: 'Marie', last_name: 'Martin', phone: null },
        trip: null,
      },
    ];

    it(' retourne le planning de la semaine courante', async () => {
      const planningChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        neq:     jest.fn().mockReturnThis(), // exclure les 'cancelled'
        gte:     jest.fn().mockReturnThis(),
        lte:     jest.fn().mockReturnThis(),
        order:   jest.fn().mockResolvedValue({ data: mockReservations, error: null } as never),
      };
      mockFrom
        .mockReturnValueOnce(chain(mockDriverRecord))  // resolveDriverId
        .mockReturnValueOnce(planningChain);           // query réservations

      const result = await service.getPlanning(DRIVER_USER_ID, 'week');
      expect(result.period).toBe('week');
      expect(result.reservations).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.date_from).toBeTruthy();
      expect(result.date_to).toBeTruthy();
    });

    it(' retourne le planning mensuel', async () => {
      const planningChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        neq:     jest.fn().mockReturnThis(), // exclure les 'cancelled'
        gte:     jest.fn().mockReturnThis(),
        lte:     jest.fn().mockReturnThis(),
        order:   jest.fn().mockResolvedValue({ data: [], error: null } as never),
      };
      mockFrom
        .mockReturnValueOnce(chain(mockDriverRecord))
        .mockReturnValueOnce(planningChain);

      const result = await service.getPlanning(DRIVER_USER_ID, 'month', '2026-04-01');
      expect(result.period).toBe('month');
      // date_from doit correspondre au 1er avril 2026
      expect(result.date_from).toContain('2026-04-01');
    });

    it(' date_from/date_to pour semaine (lundi→dimanche)', async () => {
      const planningChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        neq:     jest.fn().mockReturnThis(), // exclure les 'cancelled'
        gte:     jest.fn().mockReturnThis(),
        lte:     jest.fn().mockReturnThis(),
        order:   jest.fn().mockResolvedValue({ data: [], error: null } as never),
      };
      mockFrom
        .mockReturnValueOnce(chain(mockDriverRecord))
        .mockReturnValueOnce(planningChain);

      // Le 9 avril 2026 est un jeudi → semaine UTC : lundi 6 avril → dimanche 12 avril
      const result = await service.getPlanning(DRIVER_USER_ID, 'week', '2026-04-09');
      expect(result.date_from).toContain('2026-04-06');  // lundi
      expect(result.date_to).toContain('2026-04-12');    // dimanche
    });

    it(' lève 404 si le profil chauffeur est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));
      await expect(service.getPlanning(DRIVER_USER_ID, 'week'))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // getRevenues
  // ────────────────────────────────────────────────────────────────────────────
  describe('getRevenues()', () => {
    // price_adjusted null → fallback sur price_final
    const mockCompletedResas = [
      {
        id: 'resa-1', scheduled_at: '2026-04-10T09:00:00Z',
        pickup_address: '1 rue de la Paix', dest_address: 'CDG',
        price_final: 48.50, price_adjusted: null, country: 'france',
      },
      {
        id: 'resa-2', scheduled_at: '2026-04-12T14:00:00Z',
        pickup_address: 'Gare du Nord', dest_address: 'Orly',
        price_final: 55.00, price_adjusted: null, country: 'france',
      },
    ];

    it(' retourne le total des revenus sur la semaine (sans commission configurée)', async () => {
      const resolved = { data: mockCompletedResas, error: null } as never;
      const revenuesChain: Record<string, unknown> = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        gte:     jest.fn().mockReturnThis(),
        lte:     jest.fn().mockReturnThis(),
        order:   jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
          Promise.resolve(resolved).then(resolve, reject),
      };
      mockFrom
        .mockReturnValueOnce(chain(mockDriverRecord))  // resolveDriverId
        .mockReturnValueOnce(revenuesChain)            // réservations
        .mockReturnValueOnce(commChain());             // commissions (vides = non configurées)

      const result = await service.getRevenues(DRIVER_USER_ID, 'week', '2026-04-09');
      expect(result.total_trips).toBe(2);
      // Sans commission, net = gross
      expect(result.total_gross).toBeCloseTo(103.50, 2);
      expect(result.total_commission).toBe(0);
      expect(result.total_net).toBeCloseTo(103.50, 2);
      expect(result.total_revenue).toBeCloseTo(103.50, 2);
      expect(result.currency).toBe('EUR');
      expect(result.trips).toHaveLength(2);
      expect(result.trips[0].commission_amount).toBe(0);
    });

    it(' period = all — retourne toutes les courses sans filtre de date', async () => {
      const resolved = { data: mockCompletedResas, error: null } as never;
      const revenuesChain: Record<string, unknown> = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        order:   jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
          Promise.resolve(resolved).then(resolve, reject),
      };
      mockFrom
        .mockReturnValueOnce(chain(mockDriverRecord))
        .mockReturnValueOnce(revenuesChain)
        .mockReturnValueOnce(commChain());

      const result = await service.getRevenues(DRIVER_USER_ID, 'all');
      expect(result.period).toBe('all');
      expect(result.date_from).toBeNull();
      expect(result.date_to).toBeNull();
      expect(result.total_trips).toBe(2);
    });

    it(' retourne total_revenue = 0 si aucune course complétée', async () => {
      const resolvedEmpty = { data: [], error: null } as never;
      const emptyChain: Record<string, unknown> = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        gte:     jest.fn().mockReturnThis(),
        lte:     jest.fn().mockReturnThis(),
        order:   jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
          Promise.resolve(resolvedEmpty).then(resolve, reject),
      };
      mockFrom
        .mockReturnValueOnce(chain(mockDriverRecord))
        .mockReturnValueOnce(emptyChain);
      // Pas de mock commissions car early return si rows.length === 0

      const result = await service.getRevenues(DRIVER_USER_ID, 'month', '2026-04-01');
      expect(result.total_trips).toBe(0);
      expect(result.total_revenue).toBe(0);
      expect(result.total_gross).toBe(0);
      expect(result.total_commission).toBe(0);
    });

    it(' price_adjusted écrase price_final dans le calcul du total', async () => {
      const resasWithAdjustment = [
        { id: 'resa-1', scheduled_at: '2026-04-10T09:00:00Z',
          pickup_address: '1 rue de la Paix', dest_address: 'CDG',
          price_final: 48.50, price_adjusted: 60.00, country: 'france' },
        { id: 'resa-2', scheduled_at: '2026-04-12T14:00:00Z',
          pickup_address: 'Gare du Nord', dest_address: 'Orly',
          price_final: 55.00, price_adjusted: null, country: 'france' },
      ];
      const resolved = { data: resasWithAdjustment, error: null } as never;
      const revenuesChain: Record<string, unknown> = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        gte:    jest.fn().mockReturnThis(),
        lte:    jest.fn().mockReturnThis(),
        order:  jest.fn().mockReturnThis(),
        then:   (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
          Promise.resolve(resolved).then(resolve, reject),
      };
      mockFrom
        .mockReturnValueOnce(chain(mockDriverRecord))
        .mockReturnValueOnce(revenuesChain)
        .mockReturnValueOnce(commChain());

      const result = await service.getRevenues(DRIVER_USER_ID, 'week', '2026-04-09');
      // gross: 60.00 (ajusté) + 55.00 = 115.00, sans commission net = gross
      expect(result.total_gross).toBeCloseTo(115.00, 2);
      expect(result.total_net).toBeCloseTo(115.00, 2);
      expect(result.total_revenue).toBeCloseTo(115.00, 2);
    });

    it(' lève 404 si le profil chauffeur est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));
      await expect(service.getRevenues(DRIVER_USER_ID, 'month'))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // adminUpdateDriver
  // ────────────────────────────────────────────────────────────────────────────
  describe('adminUpdateDriver()', () => {
    it(' met à jour tva_rate et siret', async () => {
      const updated = { ...mockDriverWithUser, tva_rate: 20, siret: '99999999900099' };
      mockFrom
        .mockReturnValueOnce(chain({ id: DRIVER_ID }))  // existence check
        .mockReturnValueOnce(chain(updated));            // update

      const result = await service.adminUpdateDriver(DRIVER_ID, { tva_rate: 20, siret: '99999999900099' });
      expect(result.tva_rate).toBe(20);
    });

    it(' lève 404 si le chauffeur est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null));
      await expect(service.adminUpdateDriver('unknown-id', { tva_rate: 10 }))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // getPlanningAdmin
  // ────────────────────────────────────────────────────────────────────────────
  describe('getPlanningAdmin()', () => {
    const mockReservations = [
      {
        id: 'resa-admin-1', status: 'completed',
        scheduled_at: '2026-06-01T10:00:00Z',
        pickup_address: '12 av. Victor Hugo', dest_address: 'Aéroport CDG T2',
        vehicle_type: 'berline', price_estimated: 78, price_final: 78,
        country: 'france', client: { first_name: 'Alice', last_name: 'Dubois', phone: '+33600000002' },
        trip: { id: 'trip-1', started_at: '2026-06-01T10:15:00Z', ended_at: '2026-06-01T11:05:00Z', actual_distance_km: 42, actual_duration_min: 50 },
      },
    ];

    it(' retourne le planning d\'un chauffeur par son driver_id (admin)', async () => {
      const planningChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        neq:     jest.fn().mockReturnThis(),
        gte:     jest.fn().mockReturnThis(),
        lte:     jest.fn().mockReturnThis(),
        order:   jest.fn().mockResolvedValue({ data: mockReservations, error: null } as never),
      };
      mockFrom
        .mockReturnValueOnce(chain({ id: DRIVER_ID }))  // vérification existence
        .mockReturnValueOnce(planningChain);             // requête réservations

      const result = await service.getPlanningAdmin(DRIVER_ID, 'month', '2026-06-01');
      expect(result.period).toBe('month');
      expect(result.reservations).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.date_from).toContain('2026-06-01');
    });

    it(' retourne le planning hebdo vide pour un chauffeur sans course', async () => {
      const planningChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        neq:     jest.fn().mockReturnThis(),
        gte:     jest.fn().mockReturnThis(),
        lte:     jest.fn().mockReturnThis(),
        order:   jest.fn().mockResolvedValue({ data: [], error: null } as never),
      };
      mockFrom
        .mockReturnValueOnce(chain({ id: DRIVER_ID }))
        .mockReturnValueOnce(planningChain);

      const result = await service.getPlanningAdmin(DRIVER_ID, 'week');
      expect(result.reservations).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it(' lève 404 si le driver_id est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));
      await expect(service.getPlanningAdmin('unknown-driver-id', 'week'))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // getRevenuesAdmin
  // ────────────────────────────────────────────────────────────────────────────
  describe('getRevenuesAdmin()', () => {
    const mockCompletedResas = [
      {
        id: 'resa-a1', scheduled_at: '2026-06-02T09:00:00Z',
        pickup_address: 'Gare de Lyon', dest_address: 'Orly T4',
        price_final: 62.00, price_adjusted: null, country: 'france',
      },
      {
        id: 'resa-a2', scheduled_at: '2026-06-04T14:00:00Z',
        pickup_address: 'Montparnasse', dest_address: 'CDG T1',
        price_final: 85.50, price_adjusted: null, country: 'france',
      },
    ];

    it(' retourne les revenus d\'un chauffeur par son driver_id (admin, mois, sans commission)', async () => {
      const resolved = { data: mockCompletedResas, error: null } as never;
      const revenuesChain: Record<string, unknown> = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        gte:     jest.fn().mockReturnThis(),
        lte:     jest.fn().mockReturnThis(),
        order:   jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
          Promise.resolve(resolved).then(resolve, reject),
      };
      mockFrom
        .mockReturnValueOnce(chain({ id: DRIVER_ID }))  // vérification existence
        .mockReturnValueOnce(revenuesChain)             // requête revenus
        .mockReturnValueOnce(commChain());              // commissions vides

      const result = await service.getRevenuesAdmin(DRIVER_ID, 'month', '2026-06-01');
      expect(result.total_trips).toBe(2);
      expect(result.total_gross).toBeCloseTo(147.50, 2);
      expect(result.total_commission).toBe(0);
      expect(result.total_net).toBeCloseTo(147.50, 2);
      expect(result.total_revenue).toBeCloseTo(147.50, 2);
      expect(result.currency).toBe('EUR');
      expect(result.revenue_by_currency.XOF).toBe(0);
    });

    it(' revenue_by_currency.XOF correctement agrégé pour un chauffeur Sénégal', async () => {
      const xofResas = [
        { id: 'xof-1', scheduled_at: '2026-06-03T08:00:00Z',
          pickup_address: 'Dakar Centre', dest_address: 'Aéroport LSS',
          price_final: 25000, price_adjusted: null, country: 'senegal' },
        { id: 'xof-2', scheduled_at: '2026-06-05T16:00:00Z',
          pickup_address: 'Plateau', dest_address: 'Almadies',
          price_final: 12000, price_adjusted: 10000, country: 'senegal' },
      ];
      const resolved = { data: xofResas, error: null } as never;
      const revenuesChain: Record<string, unknown> = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
          Promise.resolve(resolved).then(resolve, reject),
      };
      mockFrom
        .mockReturnValueOnce(chain({ id: DRIVER_ID }))
        .mockReturnValueOnce(revenuesChain)
        .mockReturnValueOnce(commChain());

      const result = await service.getRevenuesAdmin(DRIVER_ID, 'all');
      // xof-1: 25000, xof-2: price_adjusted=10000 (écrase 12000) → gross=35000
      expect(result.total_gross).toBe(35000);
      expect(result.revenue_by_currency.XOF).toBe(35000);
      expect(result.revenue_by_currency.EUR).toBe(0);
      expect(result.total_revenue).toBe(35000);
      expect(result.currency).toBe('XOF');
    });

    it(' revenue_by_currency.XOF avec commission prélevée', async () => {
      const xofResas = [
        { id: 'xof-1', scheduled_at: '2026-06-03T08:00:00Z',
          pickup_address: 'Dakar Centre', dest_address: 'Aéroport LSS',
          price_final: 25000, price_adjusted: null, country: 'senegal' },
      ];
      const resolved = { data: xofResas, error: null } as never;
      const revenuesChain: Record<string, unknown> = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
          Promise.resolve(resolved).then(resolve, reject),
      };
      // Commission de 12% sur 25000 XOF = 3000 XOF → net = 22000 XOF
      mockFrom
        .mockReturnValueOnce(chain({ id: DRIVER_ID }))
        .mockReturnValueOnce(revenuesChain)
        .mockReturnValueOnce(commChain([
          { reservation_id: 'xof-1', commission_amount: 3000, driver_net_amount: 22000 },
        ]));

      const result = await service.getRevenuesAdmin(DRIVER_ID, 'all');
      expect(result.total_gross).toBe(25000);
      expect(result.total_commission).toBe(3000);
      expect(result.total_net).toBe(22000);
      expect(result.revenue_by_currency.XOF).toBe(22000); // net
    });

    it(' lève 404 si le driver_id est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));
      await expect(service.getRevenuesAdmin('unknown-driver-id', 'month'))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // revenue_by_currency — correction du bug XOF exclu (getRevenues self)
  // ────────────────────────────────────────────────────────────────────────────
  describe('getRevenues() — commission avec montant réel', () => {
    it(' total_net = gross - commission quand commission configurée (EUR)', async () => {
      const resas = [
        { id: 'r1', scheduled_at: '2026-06-01T09:00:00Z',
          pickup_address: 'Paris', dest_address: 'CDG',
          price_final: 80, price_adjusted: null, country: 'france' },
        { id: 'r2', scheduled_at: '2026-06-02T10:00:00Z',
          pickup_address: 'Gare de Lyon', dest_address: 'Orly',
          price_final: 55, price_adjusted: null, country: 'france' },
      ];
      const resolved = { data: resas, error: null } as never;
      const revenuesChain: Record<string, unknown> = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
          Promise.resolve(resolved).then(resolve, reject),
      };
      // 15% sur r1 = 12€, 15% sur r2 = 8.25€
      mockFrom
        .mockReturnValueOnce(chain(mockDriverRecord))
        .mockReturnValueOnce(revenuesChain)
        .mockReturnValueOnce(commChain([
          { reservation_id: 'r1', commission_amount: 12.00, driver_net_amount: 68.00 },
          { reservation_id: 'r2', commission_amount:  8.25, driver_net_amount: 46.75 },
        ]));

      const result = await service.getRevenues(DRIVER_USER_ID, 'all');
      expect(result.total_gross).toBeCloseTo(135, 2);
      expect(result.total_commission).toBeCloseTo(20.25, 2);
      expect(result.total_net).toBeCloseTo(114.75, 2);
      expect(result.total_revenue).toBeCloseTo(114.75, 2);
      // revenue_by_currency reflète les montants nets
      expect(result.revenue_by_currency.EUR).toBeCloseTo(114.75, 2);
      expect(result.trips[0].commission_amount).toBeCloseTo(12.00, 2);
      expect(result.trips[0].net_amount).toBeCloseTo(68.00, 2);
    });
  });
});
