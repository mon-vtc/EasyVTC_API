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
    it('✅ retourne le profil complet du chauffeur connecté', async () => {
      mockFrom.mockReturnValueOnce(chain(mockDriverWithUser));

      const result = await service.getMyProfile(DRIVER_USER_ID);
      expect(result.id).toBe(DRIVER_ID);
      expect(result.user.email).toBe('driver@easyvtc.com');
    });

    it('❌ lève 404 si le profil est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));
      await expect(service.getMyProfile(DRIVER_USER_ID))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // updateMyProfile
  // ────────────────────────────────────────────────────────────────────────────
  describe('updateMyProfile()', () => {
    it('✅ met à jour siret et zone', async () => {
      const updated = { ...mockDriverWithUser, siret: '99999999900099', zone: 'senegal' };
      mockFrom.mockReturnValueOnce(chain(updated));

      const result = await service.updateMyProfile(DRIVER_USER_ID, { siret: '99999999900099', zone: 'senegal' });
      expect(result.siret).toBe('99999999900099');
      expect(result.zone).toBe('senegal');
    });

    it('❌ lève 500 si la mise à jour échoue', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'db error' }));
      await expect(service.updateMyProfile(DRIVER_USER_ID, { zone: 'france' }))
        .rejects.toMatchObject({ status: 500 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // setOnlineStatus
  // ────────────────────────────────────────────────────────────────────────────
  describe('setOnlineStatus()', () => {
    it('✅ passe en ligne un chauffeur actif', async () => {
      const onlineDriver = { ...mockDriverWithUser, is_online: true };
      mockFrom
        .mockReturnValueOnce(chain({ status: 'active' }))  // fetch status
        .mockReturnValueOnce(chain(onlineDriver));          // update

      const result = await service.setOnlineStatus(DRIVER_USER_ID, true);
      expect(result.is_online).toBe(true);
    });

    it('✅ passe hors ligne (pas de vérification de statut requise)', async () => {
      const offlineDriver = { ...mockDriverWithUser, is_online: false };
      mockFrom
        .mockReturnValueOnce(chain({ status: 'active' }))
        .mockReturnValueOnce(chain(offlineDriver));

      const result = await service.setOnlineStatus(DRIVER_USER_ID, false);
      expect(result.is_online).toBe(false);
    });

    it('❌ lève 403 si le chauffeur est en mission (on_trip)', async () => {
      mockFrom.mockReturnValueOnce(chain({ status: 'on_trip' }));
      await expect(service.setOnlineStatus(DRIVER_USER_ID, false))
        .rejects.toMatchObject({ status: 403 });
    });

    it('❌ lève 403 si le chauffeur n\'est pas actif et veut se mettre en ligne', async () => {
      mockFrom.mockReturnValueOnce(chain({ status: 'pending' }));
      await expect(service.setOnlineStatus(DRIVER_USER_ID, true))
        .rejects.toMatchObject({ status: 403 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // listDrivers (admin)
  // ────────────────────────────────────────────────────────────────────────────
  describe('listDrivers()', () => {
    it('✅ retourne la liste paginée des chauffeurs', async () => {
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

    it('✅ filtre par statut et zone', async () => {
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
    it('✅ valide (active) un chauffeur pending', async () => {
      const activeDriver = { ...mockDriverWithUser, status: 'active' };
      mockFrom
        .mockReturnValueOnce(chain({ id: DRIVER_ID, status: 'pending' }))  // fetch existing
        .mockReturnValueOnce(chain(activeDriver));                           // update

      const result = await service.changeDriverStatus(DRIVER_ID, { status: 'active', reason: 'Documents validés' });
      expect(result.status).toBe('active');
    });

    it('✅ suspend un chauffeur actif et le passe hors ligne', async () => {
      const suspendedDriver = { ...mockDriverWithUser, status: 'suspended', is_online: false };
      mockFrom
        .mockReturnValueOnce(chain({ id: DRIVER_ID, status: 'active' }))
        .mockReturnValueOnce(chain(suspendedDriver));

      const result = await service.changeDriverStatus(DRIVER_ID, { status: 'suspended', reason: 'Comportement inapproprié' });
      expect(result.status).toBe('suspended');
      expect(result.is_online).toBe(false);
    });

    it('❌ lève 400 si le statut est déjà le même', async () => {
      mockFrom.mockReturnValueOnce(chain({ id: DRIVER_ID, status: 'active' }));
      await expect(service.changeDriverStatus(DRIVER_ID, { status: 'active', reason: 'Déjà actif' }))
        .rejects.toMatchObject({ status: 400 });
    });

    it('❌ lève 400 si un chauffeur rejeté est mis sur un autre statut que active', async () => {
      mockFrom.mockReturnValueOnce(chain({ id: DRIVER_ID, status: 'rejected' }));
      await expect(service.changeDriverStatus(DRIVER_ID, { status: 'suspended', reason: 'test' }))
        .rejects.toMatchObject({ status: 400 });
    });

    it('❌ lève 404 si le chauffeur est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));
      await expect(service.changeDriverStatus('unknown-id', { status: 'active', reason: 'test' }))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // setOnTripStatus (interne)
  // ────────────────────────────────────────────────────────────────────────────
  describe('setOnTripStatus()', () => {
    it('✅ passe un chauffeur actif en on_trip', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ id: DRIVER_ID, status: 'active' }))  // fetch
        .mockReturnValueOnce({                                              // update
          update: jest.fn().mockReturnThis(),
          eq:     jest.fn().mockResolvedValue({ error: null } as never),
        });

      await expect(service.setOnTripStatus(DRIVER_ID, true)).resolves.toBeUndefined();
    });

    it('✅ idempotent — ne fait rien si already active et onTrip=false', async () => {
      mockFrom.mockReturnValueOnce(chain({ id: DRIVER_ID, status: 'active' }));
      // Pas d'update attendu
      await expect(service.setOnTripStatus(DRIVER_ID, false)).resolves.toBeUndefined();
    });

    it('❌ lève 400 si on essaie de mettre en mission un chauffeur suspended', async () => {
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

    it('✅ retourne le planning de la semaine courante', async () => {
      const planningChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
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

    it('✅ retourne le planning mensuel', async () => {
      const planningChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
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

    it('✅ date_from/date_to pour semaine (lundi→dimanche)', async () => {
      const planningChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
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

    it('❌ lève 404 si le profil chauffeur est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));
      await expect(service.getPlanning(DRIVER_USER_ID, 'week'))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // getRevenues
  // ────────────────────────────────────────────────────────────────────────────
  describe('getRevenues()', () => {
    const mockCompletedResas = [
      {
        id: 'resa-1', scheduled_at: '2026-04-10T09:00:00Z',
        pickup_address: '1 rue de la Paix', dest_address: 'CDG',
        price_final: 48.50, country: 'france',
      },
      {
        id: 'resa-2', scheduled_at: '2026-04-12T14:00:00Z',
        pickup_address: 'Gare du Nord', dest_address: 'Orly',
        price_final: 55.00, country: 'france',
      },
    ];

    it('✅ retourne le total des revenus sur la semaine', async () => {
      // La chaîne revenues : select→eq→eq→order→gte→lte→await
      // Toutes les méthodes retournent this, la résolution se fait via then()
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
        .mockReturnValueOnce(chain(mockDriverRecord))
        .mockReturnValueOnce(revenuesChain);

      const result = await service.getRevenues(DRIVER_USER_ID, 'week', '2026-04-09');
      expect(result.total_trips).toBe(2);
      expect(result.total_revenue).toBeCloseTo(103.50, 2);
      expect(result.currency).toBe('EUR');
      expect(result.trips).toHaveLength(2);
    });

    it('✅ period = all — retourne toutes les courses sans filtre de date', async () => {
      const revenuesChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        order:   jest.fn().mockResolvedValue({ data: mockCompletedResas, error: null } as never),
      };
      mockFrom
        .mockReturnValueOnce(chain(mockDriverRecord))
        .mockReturnValueOnce(revenuesChain);

      const result = await service.getRevenues(DRIVER_USER_ID, 'all');
      expect(result.period).toBe('all');
      expect(result.date_from).toBeNull();
      expect(result.date_to).toBeNull();
      expect(result.total_trips).toBe(2);
    });

    it('✅ retourne total_revenue = 0 si aucune course complétée', async () => {
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

      const result = await service.getRevenues(DRIVER_USER_ID, 'month', '2026-04-01');
      expect(result.total_trips).toBe(0);
      expect(result.total_revenue).toBe(0);
    });

    it('❌ lève 404 si le profil chauffeur est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));
      await expect(service.getRevenues(DRIVER_USER_ID, 'month'))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // adminUpdateDriver
  // ────────────────────────────────────────────────────────────────────────────
  describe('adminUpdateDriver()', () => {
    it('✅ met à jour tva_rate et siret', async () => {
      const updated = { ...mockDriverWithUser, tva_rate: 20, siret: '99999999900099' };
      mockFrom
        .mockReturnValueOnce(chain({ id: DRIVER_ID }))  // existence check
        .mockReturnValueOnce(chain(updated));            // update

      const result = await service.adminUpdateDriver(DRIVER_ID, { tva_rate: 20, siret: '99999999900099' });
      expect(result.tva_rate).toBe(20);
    });

    it('❌ lève 404 si le chauffeur est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null));
      await expect(service.adminUpdateDriver('unknown-id', { tva_rate: 10 }))
        .rejects.toMatchObject({ status: 404 });
    });
  });
});
