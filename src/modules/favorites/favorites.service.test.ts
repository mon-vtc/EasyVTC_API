import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (obligatoire ESM)
// ══════════════════════════════════════════════════════════════════════════════

const mockFrom = jest.fn();

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: { from: mockFrom },
}));

const { FavoritesService } = await import('./favorites.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const USER_ID    = 'user-uuid-001';
const OTHER_ID   = 'user-uuid-002';
const ADMIN_ID   = 'admin-uuid-003';
const FAV_ID     = 'fav-uuid-001';

const mockFavorite = {
  id:         FAV_ID,
  user_id:    USER_ID,
  label:      'Maison',
  address:    '12 rue des Lilas, 75010 Paris',
  lat:        48.8698,
  lng:        2.3533,
  created_at: '2026-06-02T10:00:00.000Z',
  updated_at: '2026-06-02T10:00:00.000Z',
};

const mockFavoriteNoCoords = {
  ...mockFavorite,
  id:    'fav-uuid-002',
  label: 'Bureau',
  lat:   null,
  lng:   null,
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPER — Chaîne Supabase simulée
// ══════════════════════════════════════════════════════════════════════════════

function chain(data: unknown, error: unknown = null, count: number | null = null) {
  const resolved = { data, error, count } as never;
  const c: Record<string, unknown> = {
    select:      jest.fn().mockReturnThis(),
    insert:      jest.fn().mockReturnThis(),
    delete:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
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

describe('FavoritesService', () => {
  let service: InstanceType<typeof FavoritesService>;

  beforeEach(() => {
    service = new FavoritesService();
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // list
  // ──────────────────────────────────────────────────────────────────────────
  describe('list()', () => {

    it('retourne les favoris d\'un utilisateur', async () => {
      mockFrom.mockReturnValueOnce(chain([mockFavorite, mockFavoriteNoCoords]));

      const result = await service.list(USER_ID, USER_ID, 'client');

      expect(result).toHaveLength(2);
      expect(result[0].label).toBe('Maison');
      expect(result[1].label).toBe('Bureau');
    });

    it('retourne un tableau vide si aucun favori', async () => {
      mockFrom.mockReturnValueOnce(chain([]));

      const result = await service.list(USER_ID, USER_ID, 'client');

      expect(result).toEqual([]);
    });

    it('un admin peut lister les favoris de n\'importe quel utilisateur', async () => {
      mockFrom.mockReturnValueOnce(chain([mockFavorite]));

      const result = await service.list(USER_ID, ADMIN_ID, 'admin');

      expect(result).toHaveLength(1);
    });

    it('lève 403 si un client tente d\'accéder aux favoris d\'un autre utilisateur', async () => {
      await expect(
        service.list(USER_ID, OTHER_ID, 'client'),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('lève 403 si un driver tente d\'accéder aux favoris', async () => {
      await expect(
        service.list(USER_ID, USER_ID, 'driver'),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('lève 500 en cas d\'erreur DB', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'connexion perdue' }));

      await expect(
        service.list(USER_ID, USER_ID, 'client'),
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // create
  // ──────────────────────────────────────────────────────────────────────────
  describe('create()', () => {

    const dto = {
      label:   'Maison',
      address: '12 rue des Lilas, 75010 Paris',
      lat:     48.8698,
      lng:     2.3533,
    };

    it('ajoute un favori avec coordonnées GPS', async () => {
      mockFrom
        .mockReturnValueOnce(chain(null, null, 3))   // count favoris → 3 (sous la limite)
        .mockReturnValueOnce(chain(mockFavorite));    // insert

      const result = await service.create(USER_ID, USER_ID, 'client', dto);

      expect(result.id).toBe(FAV_ID);
      expect(result.label).toBe('Maison');
      expect(result.lat).toBe(48.8698);
    });

    it('ajoute un favori sans coordonnées GPS', async () => {
      const noCoordsFav = { ...mockFavorite, lat: null, lng: null };

      mockFrom
        .mockReturnValueOnce(chain(null, null, 0))
        .mockReturnValueOnce(chain(noCoordsFav));

      const result = await service.create(USER_ID, USER_ID, 'client', { label: 'Bureau', address: '5 avenue de la Gare' });

      expect(result.lat).toBeNull();
      expect(result.lng).toBeNull();
    });

    it('lève 422 si la limite de 20 favoris est atteinte', async () => {
      mockFrom.mockReturnValueOnce(chain(null, null, 20)); // count → 20

      await expect(
        service.create(USER_ID, USER_ID, 'client', dto),
      ).rejects.toMatchObject({ status: 422 });
    });

    it('lève 403 si un client tente d\'ajouter un favori pour un autre utilisateur', async () => {
      await expect(
        service.create(USER_ID, OTHER_ID, 'client', dto),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('un admin peut ajouter un favori pour n\'importe quel utilisateur', async () => {
      mockFrom
        .mockReturnValueOnce(chain(null, null, 0))
        .mockReturnValueOnce(chain(mockFavorite));

      const result = await service.create(USER_ID, ADMIN_ID, 'admin', dto);

      expect(result.id).toBe(FAV_ID);
    });

    it('lève 500 en cas d\'erreur DB à l\'insertion', async () => {
      mockFrom
        .mockReturnValueOnce(chain(null, null, 0))
        .mockReturnValueOnce(chain(null, { message: 'DB error' }));

      await expect(
        service.create(USER_ID, USER_ID, 'client', dto),
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // delete
  // ──────────────────────────────────────────────────────────────────────────
  describe('delete()', () => {

    it('supprime un favori avec succès', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ id: FAV_ID })) // vérif existence
        .mockReturnValueOnce(chain(null));           // delete

      await expect(
        service.delete(USER_ID, FAV_ID, USER_ID, 'client'),
      ).resolves.toBeUndefined();
    });

    it('lève 404 si le favori n\'existe pas ou n\'appartient pas à cet utilisateur', async () => {
      mockFrom.mockReturnValueOnce(chain(null)); // maybeSingle → null

      await expect(
        service.delete(USER_ID, FAV_ID, USER_ID, 'client'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('lève 403 si un client tente de supprimer un favori d\'un autre utilisateur', async () => {
      await expect(
        service.delete(USER_ID, FAV_ID, OTHER_ID, 'client'),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('un admin peut supprimer un favori de n\'importe quel utilisateur', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ id: FAV_ID }))
        .mockReturnValueOnce(chain(null));

      await expect(
        service.delete(USER_ID, FAV_ID, ADMIN_ID, 'admin'),
      ).resolves.toBeUndefined();
    });

    it('lève 500 si la suppression DB échoue', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ id: FAV_ID }))
        .mockReturnValueOnce(chain(null, { message: 'FK violation' }));

      await expect(
        service.delete(USER_ID, FAV_ID, USER_ID, 'client'),
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // Contrôle d'accès — cas limites
  // ──────────────────────────────────────────────────────────────────────────
  describe('contrôle d\'accès', () => {

    it('un manager est refusé (pas de favoris dans son périmètre)', async () => {
      await expect(
        service.list(USER_ID, USER_ID, 'manager'),
      ).rejects.toMatchObject({ status: 403 });
    });

    it('un client peut accéder à ses propres favoris (userId === requesterId)', async () => {
      mockFrom.mockReturnValueOnce(chain([]));

      await expect(
        service.list(USER_ID, USER_ID, 'client'),
      ).resolves.toEqual([]);
    });
  });
});
