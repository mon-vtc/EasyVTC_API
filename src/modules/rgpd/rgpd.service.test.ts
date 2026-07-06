import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (obligatoire ESM)
// ══════════════════════════════════════════════════════════════════════════════

const mockFrom           = jest.fn();
const mockUpdateUserById = jest.fn();
const mockAuthSignOut    = jest.fn();
const mockStorageRemove  = jest.fn();
const mockStorageFrom    = jest.fn();
const mockAuthLogin      = jest.fn();

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    from:    mockFrom,
    auth:    { admin: { updateUserById: mockUpdateUserById, signOut: mockAuthSignOut } },
    storage: { from: mockStorageFrom },
  },
}));

jest.unstable_mockModule('../auth/auth.service.js', () => ({
  authService: { login: mockAuthLogin },
}));

const { RgpdService } = await import('./rgpd.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const USER_ID  = 'user-uuid-001';
const OTHER_ID = 'user-uuid-002';
const ADMIN_ID = 'admin-uuid-003';
const RESA_ID  = 'resa-uuid-004';

const mockProfile = {
  id:                USER_ID,
  email:             'client@example.com',
  first_name:        'Marie',
  last_name:         'Martin',
  phone:             '+33612345678',
  role:              'client',
  profile_photo_url: 'https://storage.example.com/avatar.jpg',
  rgpd_consent:      true,
  rgpd_consent_at:   '2026-03-01T00:00:00.000Z',
  created_at:        '2026-03-01T00:00:00.000Z',
  updated_at:        '2026-05-01T00:00:00.000Z',
};

const mockUserForAnonymize = {
  id:                USER_ID,
  role:              'client',
  deleted_at:        null,
  profile_photo_url: 'https://storage.example.com/avatar.jpg',
};

const mockReservation = {
  id:              RESA_ID,
  status:          'completed',
  pickup_address:  '1 rue de la Paix, Paris',
  dest_address:    'Aéroport CDG',
  vehicle_type:    'berline',
  price_estimated: 45.50,
  price_final:     45.50,
  scheduled_at:    '2026-05-15T09:00:00.000Z',
  created_at:      '2026-05-14T18:00:00.000Z',
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPER — Chaîne Supabase simulée
// ══════════════════════════════════════════════════════════════════════════════

function chain(data: unknown, error: unknown = null) {
  const resolved = { data, error, count: null } as never;
  const c: Record<string, unknown> = {
    select:      jest.fn().mockReturnThis(),
    update:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
    in:          jest.fn().mockReturnThis(),
    order:       jest.fn().mockReturnThis(),
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

describe('RgpdService', () => {
  let service: InstanceType<typeof RgpdService>;

  beforeEach(() => {
    service = new RgpdService();
    // resetAllMocks vide la queue mockReturnValueOnce pour éviter le saignement
    // entre tests — clearAllMocks ne suffit pas pour les queues Once
    jest.resetAllMocks();
    mockUpdateUserById.mockResolvedValue({ data: {}, error: null } as never);
    mockAuthSignOut.mockResolvedValue({ error: null } as never);
    mockStorageRemove.mockResolvedValue({ error: null } as never);
    mockStorageFrom.mockReturnValue({ remove: mockStorageRemove });
    mockAuthLogin.mockResolvedValue({ user: { id: USER_ID } } as never);
  });

  // ──────────────────────────────────────────────────────────────────────────
  // exportData — Phase 1 (profile + reservations + driver) en parallèle
  //              Phase 2 (orders? + favorites + ratings + notifications + messages)
  // ──────────────────────────────────────────────────────────────────────────
  describe('exportData()', () => {

    it('retourne l\'export complet avec profil, réservations et activités', async () => {
      // Phase 1 (3 appels) : users, reservations=[mockReservation], drivers=null
      mockFrom
        .mockReturnValueOnce(chain(mockProfile))         // users
        .mockReturnValueOnce(chain([mockReservation]))   // reservations
        .mockReturnValueOnce(chain(null));               // drivers

      // Phase 2 (5 appels) : orders via reservation_id + 4 autres tables
      mockFrom
        .mockReturnValueOnce(chain([]))  // orders
        .mockReturnValueOnce(chain([]))  // user_favorites
        .mockReturnValueOnce(chain([]))  // ratings
        .mockReturnValueOnce(chain([]))  // notifications
        .mockReturnValueOnce(chain([])); // chat_messages

      const result = await service.exportData(USER_ID, USER_ID, 'client');

      expect(result.user_id).toBe(USER_ID);
      expect(result.profile).toMatchObject({ email: 'client@example.com' });
      expect(result.reservations).toHaveLength(1);
      expect(result.driver_profile).toBeNull();
      expect(result.legal_basis).toContain('RGPD');
      expect(result.exported_at).toBeDefined();
    });

    it('inclut le profil chauffeur si l\'utilisateur est driver', async () => {
      const mockDriverProfile = { id: 'driver-uuid', status: 'active', zone: 'france' };

      // Phase 1 (3 appels) : users, reservations=[] (vide), drivers=mockDriverProfile
      mockFrom
        .mockReturnValueOnce(chain({ ...mockProfile, role: 'driver' }))
        .mockReturnValueOnce(chain([]))           // reservations vides
        .mockReturnValueOnce(chain(mockDriverProfile));

      // Phase 2 (4 appels) : reservationIds=[] → orders utilise Promise.resolve (pas de from())
      // Seules 4 tables appellent from() : favorites, ratings, notifications, messages
      mockFrom
        .mockReturnValueOnce(chain([]))  // user_favorites
        .mockReturnValueOnce(chain([]))  // ratings
        .mockReturnValueOnce(chain([]))  // notifications
        .mockReturnValueOnce(chain([])); // chat_messages

      const result = await service.exportData(USER_ID, USER_ID, 'driver');

      expect(result.driver_profile).toMatchObject({ status: 'active' });
    });

    it('orders est vide et ne fait pas de requête DB quand aucune réservation', async () => {
      // Phase 1 (3 appels) : reservations vide → reservationIds = []
      mockFrom
        .mockReturnValueOnce(chain(mockProfile))
        .mockReturnValueOnce(chain([]))   // reservations vides
        .mockReturnValueOnce(chain(null));

      // Phase 2 : 4 appels (orders n'utilise pas mockFrom quand reservationIds=[])
      mockFrom
        .mockReturnValueOnce(chain([]))
        .mockReturnValueOnce(chain([]))
        .mockReturnValueOnce(chain([]))
        .mockReturnValueOnce(chain([]));

      const result = await service.exportData(USER_ID, USER_ID, 'client');

      expect(result.reservations).toHaveLength(0);
      expect(result.orders).toHaveLength(0);
      expect(mockFrom).toHaveBeenCalledTimes(7); // 3 phase1 + 4 phase2 (pas d'orders)
    });

    it('un admin peut exporter les données de n\'importe quel utilisateur', async () => {
      // Phase 1
      mockFrom
        .mockReturnValueOnce(chain(mockProfile))
        .mockReturnValueOnce(chain([]))
        .mockReturnValueOnce(chain(null));
      // Phase 2
      mockFrom
        .mockReturnValueOnce(chain([]))
        .mockReturnValueOnce(chain([]))
        .mockReturnValueOnce(chain([]))
        .mockReturnValueOnce(chain([]));

      const result = await service.exportData(USER_ID, ADMIN_ID, 'admin');

      expect(result.user_id).toBe(USER_ID);
    });

    it('lève 403 si un utilisateur tente d\'exporter les données d\'un autre', async () => {
      await expect(
        service.exportData(USER_ID, OTHER_ID, 'client'),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('lève 404 si le profil est introuvable en base', async () => {
      // Phase 1 (3 appels toujours lancés même si profile est null)
      mockFrom
        .mockReturnValueOnce(chain(null, { message: 'not found' })) // users → data=null
        .mockReturnValueOnce(chain([]))
        .mockReturnValueOnce(chain(null));

      await expect(
        service.exportData(USER_ID, USER_ID, 'client'),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // anonymize — 2 appels from() : 1 select (user) + 1 update
  // ──────────────────────────────────────────────────────────────────────────
  describe('anonymize()', () => {

    it('anonymise le compte avec succès et retourne le résultat', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockUserForAnonymize)) // select user
        .mockReturnValueOnce(chain(null));                // update → OK

      const result = await service.anonymize(USER_ID, USER_ID, 'client', 'password123');

      expect(result.user_id).toBe(USER_ID);
      expect(result.anonymized_at).toBeDefined();
      expect(result.message).toContain('anonymisé');
    });

    it('met à jour Supabase Auth avec l\'email anonymisé', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockUserForAnonymize))
        .mockReturnValueOnce(chain(null));

      await service.anonymize(USER_ID, USER_ID, 'client', 'password123');

      expect(mockUpdateUserById).toHaveBeenCalledWith(
        USER_ID,
        expect.objectContaining({ email: `anonymized_${USER_ID}@deleted.easyvtc.fr` }),
      );
    });

    it('invalide toutes les sessions Auth', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockUserForAnonymize))
        .mockReturnValueOnce(chain(null));

      await service.anonymize(USER_ID, USER_ID, 'client', 'password123');

      expect(mockAuthSignOut).toHaveBeenCalledWith(USER_ID, 'global');
    });

    it('supprime la photo de profil du Storage si elle existe', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockUserForAnonymize))
        .mockReturnValueOnce(chain(null));

      await service.anonymize(USER_ID, USER_ID, 'client', 'password123');

      expect(mockStorageFrom).toHaveBeenCalledWith('profile-photos');
      expect(mockStorageRemove).toHaveBeenCalled();
    });

    it('ne touche pas le Storage si profile_photo_url est null', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ ...mockUserForAnonymize, profile_photo_url: null }))
        .mockReturnValueOnce(chain(null));

      await service.anonymize(USER_ID, USER_ID, 'client', 'password123');

      expect(mockStorageFrom).not.toHaveBeenCalled();
    });

    it('lève 404 si l\'utilisateur est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(
        service.anonymize(USER_ID, USER_ID, 'client', 'password123'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('lève 422 si le compte a déjà été anonymisé (deleted_at non null)', async () => {
      mockFrom.mockReturnValueOnce(
        chain({ ...mockUserForAnonymize, deleted_at: '2026-06-01T00:00:00.000Z' }),
      );

      await expect(
        service.anonymize(USER_ID, USER_ID, 'client', 'password123'),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('lève 403 si on tente d\'anonymiser un compte administrateur', async () => {
      mockFrom.mockReturnValueOnce(
        chain({ ...mockUserForAnonymize, role: 'admin' }),
      );

      await expect(
        service.anonymize(USER_ID, ADMIN_ID, 'admin', 'password123'),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('lève 500 si la mise à jour DB échoue', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockUserForAnonymize))
        .mockReturnValueOnce(chain(null, { message: 'DB error' }));

      await expect(
        service.anonymize(USER_ID, USER_ID, 'client', 'password123'),
      ).rejects.toMatchObject({ status: 500 });
    });

    it('lève 403 si un utilisateur tente d\'anonymiser le compte d\'un autre', async () => {
      await expect(
        service.anonymize(USER_ID, OTHER_ID, 'client', 'password123'),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('un admin peut anonymiser n\'importe quel compte (hors admin)', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockUserForAnonymize))
        .mockReturnValueOnce(chain(null));

      const result = await service.anonymize(USER_ID, ADMIN_ID, 'admin', 'password123');

      expect(result.user_id).toBe(USER_ID);
    });

    it('reste non bloquant même si Supabase Auth est injoignable', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockUserForAnonymize))
        .mockReturnValueOnce(chain(null));

      // Les appels Auth échouent mais sont fire-and-forget avec .catch()
      mockUpdateUserById.mockRejectedValue(new Error('Auth unreachable') as never);
      mockAuthSignOut.mockRejectedValue(new Error('Auth unreachable') as never);

      const result = await service.anonymize(USER_ID, USER_ID, 'client', 'password123');
      // Laisser les promesses fire-and-forget se terminer avant d'asserter
      await new Promise((r) => setTimeout(r, 0));

      expect(result.user_id).toBe(USER_ID);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Contrôle d'accès
  // ──────────────────────────────────────────────────────────────────────────
  describe('contrôle d\'accès', () => {

    it('un driver ne peut accéder qu\'à ses propres données', async () => {
      await expect(
        service.exportData(USER_ID, OTHER_ID, 'driver'),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('un manager ne peut pas accéder aux données d\'un autre utilisateur', async () => {
      await expect(
        service.anonymize(USER_ID, OTHER_ID, 'manager', 'password123'),
      ).rejects.toMatchObject({ status: 403 });
    });
  });
});
