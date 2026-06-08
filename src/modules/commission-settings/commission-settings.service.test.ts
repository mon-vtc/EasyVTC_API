import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (obligatoire ESM)
// ══════════════════════════════════════════════════════════════════════════════

const mockFrom = jest.fn();

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: { from: mockFrom },
}));

const { CommissionSettingsService } = await import('./commission-settings.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const ADMIN_ID   = 'admin-uuid-001';
const SETTING_ID = 'setting-uuid-001';
const RESA_ID    = 'resa-uuid-002';
const DRIVER_ID  = 'driver-uuid-003';

const mockSettingPercentageFrance = {
  id:           SETTING_ID,
  label:        'Commission France standard',
  zone:         'france',
  vehicle_type: 'standard',
  rate_type:    'percentage',
  rate_value:   15,
  is_active:    true,
  created_by:   ADMIN_ID,
  created_at:   '2026-05-01T00:00:00.000Z',
  updated_at:   '2026-05-01T00:00:00.000Z',
};

const mockSettingFlatSenegal = {
  id:           'setting-uuid-002',
  label:        'Commission fixe Sénégal',
  zone:         'senegal',
  vehicle_type: null,
  rate_type:    'flat',
  rate_value:   500,
  is_active:    true,
  created_by:   ADMIN_ID,
  created_at:   '2026-05-01T00:00:00.000Z',
  updated_at:   '2026-05-01T00:00:00.000Z',
};

const mockCommissionRow = {
  id:                    'comm-uuid-001',
  reservation_id:        RESA_ID,
  driver_id:             DRIVER_ID,
  commission_setting_id: SETTING_ID,
  zone:                  'france',
  rate_type:             'percentage',
  rate_value:            15,
  gross_amount:          100,
  commission_amount:     15,
  driver_net_amount:     85,
  currency:              'EUR',
  calculated_at:         '2026-06-01T10:00:00.000Z',
  reservation: {
    scheduled_at:   '2026-06-01T09:00:00.000Z',
    pickup_address: '10 rue de la Paix, Paris',
    dest_address:   'Aéroport d\'Orly, Terminal 2',
    vehicle_type:   'standard',
  },
  driver: { user: { first_name: 'Jean', last_name: 'Dupont' } },
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPER — Chaîne Supabase simulée
// ══════════════════════════════════════════════════════════════════════════════

function chain(data: unknown, error: unknown = null, count: number | null = null) {
  const resolved = { data, error, count } as never;
  const c: Record<string, unknown> = {
    select:      jest.fn().mockReturnThis(),
    insert:      jest.fn().mockReturnThis(),
    update:      jest.fn().mockReturnThis(),
    delete:      jest.fn().mockReturnThis(),
    eq:          jest.fn().mockReturnThis(),
    neq:         jest.fn().mockReturnThis(),
    is:          jest.fn().mockReturnThis(),
    order:       jest.fn().mockReturnThis(),
    range:       jest.fn().mockReturnThis(),
    limit:       jest.fn().mockReturnThis(),
    gte:         jest.fn().mockReturnThis(),
    lte:         jest.fn().mockReturnThis(),
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

describe('CommissionSettingsService', () => {
  let service: InstanceType<typeof CommissionSettingsService>;

  beforeEach(() => {
    service = new CommissionSettingsService();
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // listSettings
  // ──────────────────────────────────────────────────────────────────────────
  describe('listSettings()', () => {

    it('retourne tous les paramétrages sans filtre', async () => {
      mockFrom.mockReturnValueOnce(chain([mockSettingPercentageFrance]));

      const result = await service.listSettings({});

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe(SETTING_ID);
      expect(result[0].zone).toBe('france');
    });

    it('retourne un tableau vide si aucun paramétrage', async () => {
      mockFrom.mockReturnValueOnce(chain([]));

      const result = await service.listSettings({});

      expect(result).toEqual([]);
    });

    it('applique les filtres zone et is_active sans erreur', async () => {
      mockFrom.mockReturnValueOnce(chain([mockSettingPercentageFrance]));

      const result = await service.listSettings({ zone: 'france', is_active: true });

      expect(result).toHaveLength(1);
    });

    it('lève 500 en cas d\'erreur DB', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'connexion perdue' }));

      await expect(service.listSettings({})).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getSettingById
  // ──────────────────────────────────────────────────────────────────────────
  describe('getSettingById()', () => {

    it('retourne le paramétrage si trouvé', async () => {
      mockFrom.mockReturnValueOnce(chain(mockSettingPercentageFrance));

      const result = await service.getSettingById(SETTING_ID);

      expect(result.id).toBe(SETTING_ID);
      expect(result.rate_type).toBe('percentage');
      expect(result.rate_value).toBe(15);
    });

    it('lève 404 si le paramétrage est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(service.getSettingById('inexistant')).rejects.toMatchObject({ status: 404 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // createSetting
  // ──────────────────────────────────────────────────────────────────────────
  describe('createSetting()', () => {

    const dto = {
      label:        'Taux France standard',
      zone:         'france' as const,
      vehicle_type: 'standard',
      rate_type:    'percentage' as const,
      rate_value:   15,
    };

    it('crée un paramétrage avec succès', async () => {
      mockFrom
        .mockReturnValueOnce(chain(null))                         // _checkUniqueness → aucun doublon
        .mockReturnValueOnce(chain(mockSettingPercentageFrance)); // insert

      const result = await service.createSetting(dto, ADMIN_ID);

      expect(result.id).toBe(SETTING_ID);
      expect(result.is_active).toBe(true);
    });

    it('lève 409 si un taux actif existe déjà pour la même combinaison zone/vehicle_type', async () => {
      mockFrom.mockReturnValueOnce(chain({ id: 'doublon-id' })); // _checkUniqueness → conflit

      await expect(service.createSetting(dto, ADMIN_ID)).rejects.toMatchObject({ status: 409 });
    });

    it('lève 409 sur contrainte unique DB (code 23505)', async () => {
      mockFrom
        .mockReturnValueOnce(chain(null))                                           // _checkUniqueness → OK
        .mockReturnValueOnce(chain(null, { code: '23505', message: 'duplicate' })); // insert échoue

      await expect(service.createSetting(dto, ADMIN_ID)).rejects.toMatchObject({ status: 409 });
    });

    it('lève 500 sur erreur DB générique à l\'insertion', async () => {
      mockFrom
        .mockReturnValueOnce(chain(null))                                                  // _checkUniqueness → OK
        .mockReturnValueOnce(chain(null, { code: '08006', message: 'connexion perdue' })); // insert échoue

      await expect(service.createSetting(dto, ADMIN_ID)).rejects.toMatchObject({ status: 500 });
    });

    it('crée un taux générique (vehicle_type absent → null)', async () => {
      const genericDto = { label: 'Taux France global', zone: 'france' as const, rate_type: 'flat' as const, rate_value: 200 };
      const mockGeneric = { ...mockSettingPercentageFrance, vehicle_type: null, rate_type: 'flat', rate_value: 200 };

      mockFrom
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain(mockGeneric));

      const result = await service.createSetting(genericDto, ADMIN_ID);

      expect(result.vehicle_type).toBeNull();
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // updateSetting
  // ──────────────────────────────────────────────────────────────────────────
  describe('updateSetting()', () => {

    it('met à jour le libellé sans déclencher de vérification d\'unicité', async () => {
      const updated = { ...mockSettingPercentageFrance, label: 'Nouveau libellé' };

      mockFrom
        .mockReturnValueOnce(chain(mockSettingPercentageFrance)) // getSettingById (guard)
        .mockReturnValueOnce(chain(updated));                    // update

      const result = await service.updateSetting(SETTING_ID, { label: 'Nouveau libellé' });

      expect(result.label).toBe('Nouveau libellé');
    });

    it('active un paramétrage inactif sans conflit', async () => {
      const inactive = { ...mockSettingPercentageFrance, is_active: false };
      const activated = { ...mockSettingPercentageFrance, is_active: true };

      mockFrom
        .mockReturnValueOnce(chain(inactive))  // 1er getSettingById (guard)
        .mockReturnValueOnce(chain(inactive))  // 2e getSettingById (dans le bloc is_active===true)
        .mockReturnValueOnce(chain(null))      // _checkUniqueness → aucun conflit
        .mockReturnValueOnce(chain(activated)); // update

      const result = await service.updateSetting(SETTING_ID, { is_active: true });

      expect(result.is_active).toBe(true);
    });

    it('lève 409 si un autre taux actif existe lors de l\'activation', async () => {
      const inactive = { ...mockSettingPercentageFrance, is_active: false };

      mockFrom
        .mockReturnValueOnce(chain(inactive))             // 1er getSettingById
        .mockReturnValueOnce(chain(inactive))             // 2e getSettingById
        .mockReturnValueOnce(chain({ id: 'autre-id' })); // _checkUniqueness → conflit

      await expect(
        service.updateSetting(SETTING_ID, { is_active: true }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('lève 404 si le paramétrage est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(
        service.updateSetting('inexistant', { rate_value: 20 }),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('lève 409 sur contrainte unique DB lors de la mise à jour', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockSettingPercentageFrance))
        .mockReturnValueOnce(chain(null, { code: '23505', message: 'duplicate key' }));

      await expect(
        service.updateSetting(SETTING_ID, { rate_value: 20 }),
      ).rejects.toMatchObject({ status: 409 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // deleteSetting
  // ──────────────────────────────────────────────────────────────────────────
  describe('deleteSetting()', () => {

    it('supprime le paramétrage si aucune commission ne le référence', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockSettingPercentageFrance)) // getSettingById
        .mockReturnValueOnce(chain(null, null, 0))               // count commissions → 0
        .mockReturnValueOnce(chain(null));                       // delete

      await expect(service.deleteSetting(SETTING_ID)).resolves.toBeUndefined();
    });

    it('lève 409 si des commissions référencent déjà ce paramétrage', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockSettingPercentageFrance)) // getSettingById
        .mockReturnValueOnce(chain(null, null, 5));              // count commissions → 5

      await expect(service.deleteSetting(SETTING_ID)).rejects.toMatchObject({ status: 409 });
    });

    it('lève 404 si le paramétrage est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(service.deleteSetting('inexistant')).rejects.toMatchObject({ status: 404 });
    });

    it('lève 500 si la suppression DB échoue', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockSettingPercentageFrance))              // getSettingById
        .mockReturnValueOnce(chain(null, null, 0))                            // count → 0
        .mockReturnValueOnce(chain(null, { message: 'foreign key violation' })); // delete échoue

      await expect(service.deleteSetting(SETTING_ID)).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // findApplicableSetting
  // ──────────────────────────────────────────────────────────────────────────
  describe('findApplicableSetting()', () => {

    it('retourne le taux spécifique (zone + vehicle_type exact) en priorité', async () => {
      mockFrom.mockReturnValueOnce(chain(mockSettingPercentageFrance)); // taux spécifique trouvé

      const result = await service.findApplicableSetting('france', 'standard');

      expect(result?.id).toBe(SETTING_ID);
      expect(result?.vehicle_type).toBe('standard');
      expect(mockFrom).toHaveBeenCalledTimes(1);
    });

    it('retourne le taux générique (vehicle_type=null) si le spécifique est absent', async () => {
      const generic = { ...mockSettingPercentageFrance, vehicle_type: null };

      mockFrom
        .mockReturnValueOnce(chain(null))     // taux spécifique → absent
        .mockReturnValueOnce(chain(generic)); // taux générique → trouvé

      const result = await service.findApplicableSetting('france', 'berline');

      expect(result?.vehicle_type).toBeNull();
      expect(mockFrom).toHaveBeenCalledTimes(2);
    });

    it('retourne null si aucun taux applicable (ni spécifique ni générique)', async () => {
      mockFrom
        .mockReturnValueOnce(chain(null))  // spécifique → absent
        .mockReturnValueOnce(chain(null)); // générique → absent

      const result = await service.findApplicableSetting('france', 'van');

      expect(result).toBeNull();
    });

    it('ne lance qu\'une seule requête si vehicleType est null (saute le taux spécifique)', async () => {
      const generic = { ...mockSettingPercentageFrance, vehicle_type: null };

      mockFrom.mockReturnValueOnce(chain(generic)); // seule la recherche générique est lancée

      const result = await service.findApplicableSetting('france', null);

      expect(result?.vehicle_type).toBeNull();
      expect(mockFrom).toHaveBeenCalledTimes(1);
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // calculateAndRecord
  // ──────────────────────────────────────────────────────────────────────────
  describe('calculateAndRecord()', () => {

    const baseInput = {
      reservation_id: RESA_ID,
      driver_id:      DRIVER_ID,
      gross_amount:   100,
      zone:           'france' as const,
      vehicle_type:   'standard',
      currency:       'EUR',
    };

    it('est idempotent : ne relance pas le calcul si une commission existe déjà', async () => {
      mockFrom.mockReturnValueOnce(chain({ id: 'comm-existante' })); // doublon trouvé

      await service.calculateAndRecord(baseInput);

      expect(mockFrom).toHaveBeenCalledTimes(1); // aucun insert lancé
    });

    it('calcule une commission en pourcentage : 15% × 100 EUR = 15 EUR, net = 85 EUR', async () => {
      let insertedData: unknown;
      const insertChain = chain(null);
      (insertChain.insert as ReturnType<typeof jest.fn>).mockImplementation((data: unknown) => {
        insertedData = data;
        return insertChain;
      });

      mockFrom
        .mockReturnValueOnce(chain(null))                          // check idempotence → aucune commission
        .mockReturnValueOnce(chain(mockSettingPercentageFrance))   // findApplicable → taux spécifique
        .mockReturnValueOnce(insertChain);                         // insert commission

      await service.calculateAndRecord(baseInput);

      expect(insertedData).toMatchObject({
        gross_amount:      100,
        commission_amount: 15,
        driver_net_amount: 85,
        rate_type:         'percentage',
        rate_value:        15,
        currency:          'EUR',
      });
    });

    it('calcule une commission flat : 500 XOF fixe sur 3000 XOF brut', async () => {
      const input = { ...baseInput, gross_amount: 3000, zone: 'senegal' as const, vehicle_type: null, currency: 'XOF' };

      let insertedData: unknown;
      const insertChain = chain(null);
      (insertChain.insert as ReturnType<typeof jest.fn>).mockImplementation((data: unknown) => {
        insertedData = data;
        return insertChain;
      });

      mockFrom
        .mockReturnValueOnce(chain(null))                // check idempotence
        .mockReturnValueOnce(chain(mockSettingFlatSenegal)) // findApplicable (vehicleType=null → générique)
        .mockReturnValueOnce(insertChain);               // insert

      await service.calculateAndRecord(input);

      expect(insertedData).toMatchObject({
        commission_amount:  500,
        driver_net_amount:  2500,
        rate_type:          'flat',
        currency:           'XOF',
      });
    });

    it('arrondit la commission XOF à l\'entier (pas de centimes)', async () => {
      // 3500 XOF × 15% = 525 XOF (entier, pas de virgule)
      const input = { ...baseInput, gross_amount: 3500, zone: 'senegal' as const, currency: 'XOF' };
      const xofSetting = { ...mockSettingPercentageFrance, zone: 'senegal', vehicle_type: 'standard', rate_value: 15 };

      let insertedData: unknown;
      const insertChain = chain(null);
      (insertChain.insert as ReturnType<typeof jest.fn>).mockImplementation((data: unknown) => {
        insertedData = data;
        return insertChain;
      });

      mockFrom
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain(xofSetting))
        .mockReturnValueOnce(insertChain);

      await service.calculateAndRecord(input);

      expect(insertedData).toMatchObject({ commission_amount: 525, driver_net_amount: 2975 });
      expect(Number.isInteger((insertedData as { commission_amount: number }).commission_amount)).toBe(true);
    });

    it('plafonne la commission au montant brut (commission ne peut pas dépasser le prix de la course)', async () => {
      // gross=50 EUR, taux flat=200 EUR → commission plafonnée à 50, net = 0
      const input = { ...baseInput, gross_amount: 50 };
      const highFlatSetting = { ...mockSettingPercentageFrance, rate_type: 'flat', rate_value: 200 };

      let insertedData: unknown;
      const insertChain = chain(null);
      (insertChain.insert as ReturnType<typeof jest.fn>).mockImplementation((data: unknown) => {
        insertedData = data;
        return insertChain;
      });

      mockFrom
        .mockReturnValueOnce(chain(null))
        .mockReturnValueOnce(chain(highFlatSetting))
        .mockReturnValueOnce(insertChain);

      await service.calculateAndRecord(input);

      expect(insertedData).toMatchObject({ commission_amount: 50, driver_net_amount: 0 });
    });

    it('enregistre une commission = 0 et rate_type = none si aucun taux applicable', async () => {
      let insertedData: unknown;
      const insertChain = chain(null);
      (insertChain.insert as ReturnType<typeof jest.fn>).mockImplementation((data: unknown) => {
        insertedData = data;
        return insertChain;
      });

      mockFrom
        .mockReturnValueOnce(chain(null))  // check idempotence
        .mockReturnValueOnce(chain(null))  // findApplicable → spécifique absent
        .mockReturnValueOnce(chain(null))  // findApplicable → générique absent
        .mockReturnValueOnce(insertChain); // insert

      await service.calculateAndRecord(baseInput);

      expect(insertedData).toMatchObject({
        commission_amount:     0,
        driver_net_amount:     100,
        rate_type:             'none',
        commission_setting_id: null,
      });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // listCommissions
  // ──────────────────────────────────────────────────────────────────────────
  describe('listCommissions()', () => {

    const baseFilters = { period: 'month' as const, page: 1, limit: 20 };

    it('retourne les commissions paginées avec les métadonnées correctes', async () => {
      mockFrom.mockReturnValueOnce(chain([mockCommissionRow], null, 1));

      const result = await service.listCommissions(baseFilters);

      expect(result.commissions).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total_pages).toBe(1);
    });

    it('transforme les données driver (aplati depuis driver.user)', async () => {
      mockFrom.mockReturnValueOnce(chain([mockCommissionRow], null, 1));

      const result = await service.listCommissions(baseFilters);

      expect(result.commissions[0].driver).toEqual({ first_name: 'Jean', last_name: 'Dupont' });
    });

    it('calcule correctement total_pages : ceil(42 / 10) = 5', async () => {
      mockFrom.mockReturnValueOnce(chain(Array(10).fill(mockCommissionRow), null, 42));

      const result = await service.listCommissions({ ...baseFilters, limit: 10 });

      expect(result.total).toBe(42);
      expect(result.total_pages).toBe(5);
    });

    it('retourne 0 commission si la période est vide', async () => {
      mockFrom.mockReturnValueOnce(chain([], null, 0));

      const result = await service.listCommissions(baseFilters);

      expect(result.commissions).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.total_pages).toBe(0);
    });

    it('lève 500 en cas d\'erreur DB', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'timeout' }));

      await expect(service.listCommissions(baseFilters)).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getSummary
  // ──────────────────────────────────────────────────────────────────────────
  describe('getSummary()', () => {

    it('agrège EUR et XOF séparément et correctement', async () => {
      const rows = [
        { gross_amount: 100,  commission_amount: 15,  driver_net_amount: 85,   currency: 'EUR', calculated_at: '2026-06-01T10:00:00Z', reservation: null, driver: null },
        { gross_amount: 80,   commission_amount: 12,  driver_net_amount: 68,   currency: 'EUR', calculated_at: '2026-06-01T11:00:00Z', reservation: null, driver: null },
        { gross_amount: 5000, commission_amount: 500, driver_net_amount: 4500, currency: 'XOF', calculated_at: '2026-06-01T12:00:00Z', reservation: null, driver: null },
      ];

      mockFrom.mockReturnValueOnce(chain(rows));

      const result = await service.getSummary('all');

      expect(result.total_rides).toBe(3);
      expect(result.total_gross_eur).toBe(180);
      expect(result.total_commission_eur).toBe(27);
      expect(result.total_net_eur).toBe(153);
      expect(result.total_gross_xof).toBe(5000);
      expect(result.total_commission_xof).toBe(500);
      expect(result.total_net_xof).toBe(4500);
    });

    it('retourne des totaux à zéro si aucune commission sur la période', async () => {
      mockFrom.mockReturnValueOnce(chain([]));

      const result = await service.getSummary('month');

      expect(result.total_rides).toBe(0);
      expect(result.total_gross_eur).toBe(0);
      expect(result.total_commission_eur).toBe(0);
      expect(result.total_gross_xof).toBe(0);
    });

    it('retourne date_from et date_to null pour period=all', async () => {
      mockFrom.mockReturnValueOnce(chain([]));

      const result = await service.getSummary('all');

      expect(result.period).toBe('all');
      expect(result.date_from).toBeNull();
      expect(result.date_to).toBeNull();
    });

    it('calcule les bornes de semaine pour period=week (lundi → dimanche)', async () => {
      mockFrom.mockReturnValueOnce(chain([]));

      // 2026-06-02 est un mardi → semaine : lundi 01 juin au dimanche 07 juin
      const result = await service.getSummary('week', '2026-06-02');

      expect(result.period).toBe('week');
      expect(result.date_from).not.toBeNull();
      expect(result.date_to).not.toBeNull();
      expect(result.date_from!.startsWith('2026-06-01')).toBe(true);
      expect(result.date_to!.startsWith('2026-06-07')).toBe(true);
    });

    it('calcule les bornes de mois pour period=month (1er au dernier jour)', async () => {
      mockFrom.mockReturnValueOnce(chain([]));

      const result = await service.getSummary('month', '2026-06-15');

      expect(result.date_from!.startsWith('2026-06-01')).toBe(true);
      expect(result.date_to!.startsWith('2026-06-30')).toBe(true);
    });

    it('lève 500 en cas d\'erreur DB', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'timeout' }));

      await expect(service.getSummary('month')).rejects.toMatchObject({ status: 500 });
    });
  });
});
