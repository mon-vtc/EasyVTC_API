import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (obligatoire ESM)
// ══════════════════════════════════════════════════════════════════════════════

const mockFrom = jest.fn();

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: { from: mockFrom },
}));

const { RatingsService } = await import('./ratings.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const CLIENT_ID  = 'client-uuid-111';
const DRIVER_ID  = 'driver-uuid-222';
const RESA_ID    = 'resa-uuid-333';
const RATING_ID  = 'rating-uuid-444';

const mockReservationCompleted = {
  id:        RESA_ID,
  client_id: CLIENT_ID,
  driver_id: DRIVER_ID,
  status:    'completed',
};

const mockRating = {
  id:             RATING_ID,
  reservation_id: RESA_ID,
  client_id:      CLIENT_ID,
  driver_id:      DRIVER_ID,
  note:           4,
  created_at:     '2026-05-29T10:00:00.000Z',
};

const mockRatingWithClient = {
  ...mockRating,
  client:      { first_name: 'Marie', last_name: 'Martin' },
  reservation: { scheduled_at: '2026-05-28T09:00:00.000Z' },
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function chain(data: unknown, error: unknown = null, count: number | null = null) {
  const resolved = { data, error, count } as never;
  const c: Record<string, unknown> = {
    select:      jest.fn().mockReturnThis(),
    insert:      jest.fn().mockReturnThis(),
    delete:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
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

describe('RatingsService', () => {
  let service: InstanceType<typeof RatingsService>;

  beforeEach(() => {
    service = new RatingsService();
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // submitRating
  // ──────────────────────────────────────────────────────────────────────────
  describe('submitRating()', () => {

    it('soumet une note avec succès', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockReservationCompleted))  // fetch réservation
        .mockReturnValueOnce(chain(null))                      // vérif doublon → aucune note
        .mockReturnValueOnce(chain(mockRating));               // insert

      const result = await service.submitRating(RESA_ID, CLIENT_ID, { note: 4 });

      expect(result.note).toBe(4);
      expect(result.reservation_id).toBe(RESA_ID);
      expect(result.driver_id).toBe(DRIVER_ID);
    });

    it('lève 404 si la réservation est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(
        service.submitRating(RESA_ID, CLIENT_ID, { note: 4 }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('lève 403 si le client n\'est pas le demandeur de la course', async () => {
      mockFrom.mockReturnValueOnce(
        chain({ ...mockReservationCompleted, client_id: 'autre-client-id' }),
      );

      await expect(
        service.submitRating(RESA_ID, CLIENT_ID, { note: 4 }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('lève 422 si la course n\'est pas terminée', async () => {
      mockFrom.mockReturnValueOnce(
        chain({ ...mockReservationCompleted, status: 'in_progress' }),
      );

      await expect(
        service.submitRating(RESA_ID, CLIENT_ID, { note: 4 }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('lève 422 si aucun chauffeur n\'est assigné', async () => {
      mockFrom.mockReturnValueOnce(
        chain({ ...mockReservationCompleted, driver_id: null }),
      );

      await expect(
        service.submitRating(RESA_ID, CLIENT_ID, { note: 4 }),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('lève 409 si la course a déjà été évaluée', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockReservationCompleted))
        .mockReturnValueOnce(chain({ id: RATING_ID }));

      await expect(
        service.submitRating(RESA_ID, CLIENT_ID, { note: 4 }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getDriverRatings
  // ──────────────────────────────────────────────────────────────────────────
  describe('getDriverRatings()', () => {

    it('admin peut lire les évaluations d\'un chauffeur', async () => {
      mockFrom
        .mockReturnValueOnce(chain([mockRatingWithClient], null, 1))  // liste paginée
        .mockReturnValueOnce(chain([{ note: 4 }]));                   // avg

      const result = await service.getDriverRatings(DRIVER_ID, 'admin-id', 'admin', {});

      expect(result.ratings).toHaveLength(1);
      expect(result.avg_note).toBe(4);
      expect(result.total).toBe(1);
    });

    it('manager peut lire les évaluations d\'un chauffeur', async () => {
      mockFrom
        .mockReturnValueOnce(chain([mockRatingWithClient], null, 1))
        .mockReturnValueOnce(chain([{ note: 5 }]));

      const result = await service.getDriverRatings(DRIVER_ID, 'manager-id', 'manager', {});

      expect(result.avg_note).toBe(5);
    });

    it('le chauffeur peut lire ses propres évaluations', async () => {
      mockFrom
        .mockReturnValueOnce(chain([mockRatingWithClient], null, 1))
        .mockReturnValueOnce(chain([{ note: 4 }]));

      const result = await service.getDriverRatings(DRIVER_ID, DRIVER_ID, 'driver', {});

      expect(result.ratings).toHaveLength(1);
    });

    it('lève 403 si un chauffeur tente de lire les évaluations d\'un autre', async () => {
      await expect(
        service.getDriverRatings(DRIVER_ID, 'autre-driver-id', 'driver', {}),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('lève 403 pour un client', async () => {
      await expect(
        service.getDriverRatings(DRIVER_ID, CLIENT_ID, 'client', {}),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('retourne avg_note null si aucune évaluation', async () => {
      mockFrom
        .mockReturnValueOnce(chain([], null, 0))
        .mockReturnValueOnce(chain([]));

      const result = await service.getDriverRatings(DRIVER_ID, 'admin-id', 'admin', {});

      expect(result.avg_note).toBeNull();
      expect(result.total).toBe(0);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // deleteRating
  // ──────────────────────────────────────────────────────────────────────────
  describe('deleteRating()', () => {

    it('supprime une évaluation avec succès', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ id: RATING_ID }))  // vérif existence
        .mockReturnValueOnce(chain(null));               // delete

      await expect(service.deleteRating(RATING_ID)).resolves.toBeUndefined();
    });

    it('lève 404 si l\'évaluation est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null));

      await expect(service.deleteRating(RATING_ID)).rejects.toMatchObject({ status: 404 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // computeAvgForDriver
  // ──────────────────────────────────────────────────────────────────────────
  describe('computeAvgForDriver()', () => {

    it('calcule la moyenne arrondie à 1 décimale', async () => {
      mockFrom.mockReturnValueOnce(chain([{ note: 3 }, { note: 4 }, { note: 5 }]));

      const avg = await service.computeAvgForDriver(DRIVER_ID);
      expect(avg).toBe(4);
    });

    it('retourne null si aucune évaluation', async () => {
      mockFrom.mockReturnValueOnce(chain([]));

      const avg = await service.computeAvgForDriver(DRIVER_ID);
      expect(avg).toBeNull();
    });

    it('arrondit correctement (ex: 4.16 → 4.2)', async () => {
      mockFrom.mockReturnValueOnce(chain([{ note: 4 }, { note: 4 }, { note: 5 }]));

      const avg = await service.computeAvgForDriver(DRIVER_ID);
      // (4 + 4 + 5) / 3 = 4.333... → arrondi à 4.3
      expect(avg).toBe(4.3);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getRatingForReservation
  // ──────────────────────────────────────────────────────────────────────────
  describe('getRatingForReservation()', () => {

    it('retourne la note si la réservation a été évaluée', async () => {
      mockFrom.mockReturnValueOnce(chain({ note: 5 }));

      const note = await service.getRatingForReservation(RESA_ID);
      expect(note).toBe(5);
    });

    it('retourne null si aucune évaluation', async () => {
      mockFrom.mockReturnValueOnce(chain(null));

      const note = await service.getRatingForReservation(RESA_ID);
      expect(note).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // computeAvgSubmittedByClient
  // ──────────────────────────────────────────────────────────────────────────
  describe('computeAvgSubmittedByClient()', () => {

    it('calcule la moyenne des notes soumises par le client', async () => {
      mockFrom.mockReturnValueOnce(chain([{ note: 5 }, { note: 3 }]));

      const avg = await service.computeAvgSubmittedByClient(CLIENT_ID);
      expect(avg).toBe(4);
    });

    it('retourne null si le client n\'a soumis aucune évaluation', async () => {
      mockFrom.mockReturnValueOnce(chain([]));

      const avg = await service.computeAvgSubmittedByClient(CLIENT_ID);
      expect(avg).toBeNull();
    });
  });
});
