import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (obligatoire ESM)
// ══════════════════════════════════════════════════════════════════════════════

const mockFrom = jest.fn();

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: { from: mockFrom },
}));

const { VehicleTypesService } = await import('./vehicle-types.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const TYPE_ID = 'vtype-uuid-001';

const mockTypeRecord = {
  id:                 TYPE_ID,
  code:               'berline',
  label:              'Berline',
  description:        'Véhicule de berline confortable',
  capacity:           4,
  icon:               'car-berline',
  base_price_france:  3.5,
  base_price_senegal: 2.0,
  is_active:          true,
  sort_order:         2,
  created_at:         '2026-04-22T10:00:00.000Z',
  updated_at:         '2026-04-22T10:00:00.000Z',
};

const mockTypeStandard = {
  ...mockTypeRecord,
  id:        'vtype-uuid-002',
  code:      'standard',
  label:     'Standard',
  sort_order: 1,
};

const mockTypeInactive = {
  ...mockTypeRecord,
  id:        'vtype-uuid-003',
  code:      'van',
  label:     'Van',
  is_active: false,
  sort_order: 3,
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPER — Chaîne Supabase simulée
// ══════════════════════════════════════════════════════════════════════════════

function chain(data: unknown, error: unknown = null, count: number | null = null) {
  const resolved = { data, error, count } as never;
  const c: Record<string, unknown> = {
    select:  jest.fn().mockReturnThis(),
    insert:  jest.fn().mockReturnThis(),
    update:  jest.fn().mockReturnThis(),
    delete:  jest.fn().mockReturnThis(),
    eq:      jest.fn().mockReturnThis(),
    order:   jest.fn().mockReturnThis(),
    single:  jest.fn().mockResolvedValue(resolved),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(resolved).then(resolve, reject),
  };
  return c;
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('VehicleTypesService', () => {
  let service: InstanceType<typeof VehicleTypesService>;

  beforeEach(() => {
    service = new VehicleTypesService();
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getActiveTypes
  // ──────────────────────────────────────────────────────────────────────────
  describe('getActiveTypes()', () => {

    it('retourne les types actifs avec prix France par défaut', async () => {
      mockFrom.mockReturnValueOnce(chain([mockTypeStandard, mockTypeRecord]));

      const result = await service.getActiveTypes();

      expect(result).toHaveLength(2);
      expect(result[0].code).toBe('standard');
      expect(result[0].base_price).toBe(3.5);
      expect(result[1].code).toBe('berline');
    });

    it('retourne les prix Sénégal quand country=senegal', async () => {
      mockFrom.mockReturnValueOnce(chain([mockTypeRecord]));

      const result = await service.getActiveTypes('senegal');

      expect(result[0].base_price).toBe(2.0);
    });

    it('retourne les prix France quand country=france', async () => {
      mockFrom.mockReturnValueOnce(chain([mockTypeRecord]));

      const result = await service.getActiveTypes('france');

      expect(result[0].base_price).toBe(3.5);
    });

    it('retourne un tableau vide si aucun type actif', async () => {
      mockFrom.mockReturnValueOnce(chain([]));

      const result = await service.getActiveTypes();

      expect(result).toEqual([]);
    });

    it('lève 500 en cas d\'erreur DB', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'connexion perdue' }));

      await expect(service.getActiveTypes()).rejects.toMatchObject({ status: 500 });
    });

    it('n\'inclut pas les types inactifs', async () => {
      mockFrom.mockReturnValueOnce(chain([mockTypeRecord]));

      const result = await service.getActiveTypes();

      expect(result.every(t => t.code !== 'van')).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getAllTypes
  // ──────────────────────────────────────────────────────────────────────────
  describe('getAllTypes()', () => {

    it('retourne tous les types y compris inactifs', async () => {
      mockFrom.mockReturnValueOnce(chain([mockTypeStandard, mockTypeRecord, mockTypeInactive]));

      const result = await service.getAllTypes();

      expect(result).toHaveLength(3);
      expect(result.some(t => !t.is_active)).toBe(true);
    });

    it('retourne un tableau vide si aucun type', async () => {
      mockFrom.mockReturnValueOnce(chain([]));

      const result = await service.getAllTypes();

      expect(result).toEqual([]);
    });

    it('lève 500 en cas d\'erreur DB', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'erreur interne' }));

      await expect(service.getAllTypes()).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getTypeById
  // ──────────────────────────────────────────────────────────────────────────
  describe('getTypeById()', () => {

    it('retourne un type par son ID', async () => {
      mockFrom.mockReturnValueOnce(chain(mockTypeRecord));

      const result = await service.getTypeById(TYPE_ID);

      expect(result.id).toBe(TYPE_ID);
      expect(result.code).toBe('berline');
    });

    it('lève 404 si le type n\'existe pas', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { code: 'PGRST116' }));

      await expect(service.getTypeById('inexistant')).rejects.toMatchObject({ status: 404 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // createType
  // ──────────────────────────────────────────────────────────────────────────
  describe('createType()', () => {

    const dto = {
      code:               'premium',
      label:              'Premium',
      description:        'Véhicule haut de gamme',
      capacity:           4,
      icon:               'car-premium',
      base_price_france:  5.0,
      base_price_senegal: 3.0,
      is_active:          true,
      sort_order:         4,
    };

    it('crée un nouveau type de véhicule', async () => {
      const newType = { ...mockTypeRecord, ...dto, id: 'vtype-uuid-new' };
      mockFrom.mockReturnValueOnce(chain(newType));

      const result = await service.createType(dto);

      expect(result.code).toBe('premium');
      expect(result.base_price_france).toBe(5.0);
    });

    it('lève 409 si le code existe déjà', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { code: '23505' }));

      await expect(service.createType(dto)).rejects.toMatchObject({ status: 409 });
    });

    it('lève 500 en cas d\'erreur DB générique', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { code: '50000', message: 'erreur interne' }));

      await expect(service.createType(dto)).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // updateType
  // ──────────────────────────────────────────────────────────────────────────
  describe('updateType()', () => {

    it('met à jour le label d\'un type existant', async () => {
      const updated = { ...mockTypeRecord, label: 'Berline Premium' };
      mockFrom
        .mockReturnValueOnce(chain({ id: TYPE_ID }))
        .mockReturnValueOnce(chain(updated));

      const result = await service.updateType(TYPE_ID, { label: 'Berline Premium' });

      expect(result.label).toBe('Berline Premium');
    });

    it('met à jour is_active à false (désactivation)', async () => {
      const updated = { ...mockTypeRecord, is_active: false };
      mockFrom
        .mockReturnValueOnce(chain({ id: TYPE_ID }))
        .mockReturnValueOnce(chain(updated));

      const result = await service.updateType(TYPE_ID, { is_active: false });

      expect(result.is_active).toBe(false);
    });

    it('lève 404 si le type n\'existe pas', async () => {
      mockFrom.mockReturnValueOnce(chain(null));

      await expect(
        service.updateType('inexistant', { label: 'Test' }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('lève 500 en cas d\'erreur DB à la mise à jour', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ id: TYPE_ID }))
        .mockReturnValueOnce(chain(null, { message: 'erreur update' }));

      await expect(
        service.updateType(TYPE_ID, { label: 'Fail' }),
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // deleteType
  // ──────────────────────────────────────────────────────────────────────────
  describe('deleteType()', () => {

    it('supprime un type sans dépendances', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ id: TYPE_ID, code: 'berline' })) // existence check
        .mockReturnValueOnce(chain(null, null, 0))                     // reservationCount = 0
        .mockReturnValueOnce(chain(null, null, 0))                     // vehicleCount = 0
        .mockReturnValueOnce(chain(null));                             // delete

      await expect(service.deleteType(TYPE_ID)).resolves.toBeUndefined();
    });

    it('lève 404 si le type n\'existe pas', async () => {
      mockFrom.mockReturnValueOnce(chain(null));

      await expect(service.deleteType('inexistant')).rejects.toMatchObject({ status: 404 });
    });

    it('lève 409 si des réservations utilisent ce type', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ id: TYPE_ID, code: 'berline' }))
        .mockReturnValueOnce(chain(null, null, 3)); // 3 réservations

      await expect(service.deleteType(TYPE_ID)).rejects.toMatchObject({ status: 409 });
    });

    it('lève 409 si des véhicules utilisent ce type', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ id: TYPE_ID, code: 'berline' }))
        .mockReturnValueOnce(chain(null, null, 0)) // pas de réservation
        .mockReturnValueOnce(chain(null, null, 2)); // 2 véhicules

      await expect(service.deleteType(TYPE_ID)).rejects.toMatchObject({ status: 409 });
    });

    it('lève 500 en cas d\'erreur DB à la suppression', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ id: TYPE_ID, code: 'berline' }))
        .mockReturnValueOnce(chain(null, null, 0))
        .mockReturnValueOnce(chain(null, null, 0))
        .mockReturnValueOnce(chain(null, { message: 'erreur delete' }));

      await expect(service.deleteType(TYPE_ID)).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // validateCode
  // ──────────────────────────────────────────────────────────────────────────
  describe('validateCode()', () => {

    it('ne lève pas d\'erreur pour un code actif valide', async () => {
      mockFrom.mockReturnValueOnce(chain({ id: TYPE_ID }));

      await expect(service.validateCode('berline')).resolves.toBeUndefined();
    });

    it('lève 400 si le code est inexistant ou inactif', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { code: 'PGRST116' }));

      await expect(service.validateCode('inexistant')).rejects.toMatchObject({ status: 400 });
    });
  });
});
