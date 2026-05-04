import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (obligatoire ESM)
// ══════════════════════════════════════════════════════════════════════════════

const mockFrom    = jest.fn();
const mockStorage = { from: jest.fn() };

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    from:    mockFrom,
    storage: mockStorage,
  },
}));

const { VehiclesService } = await import('./vehicles.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const DRIVER_USER_ID = 'user-driver-uuid-111';
const DRIVER_ID      = 'driver-uuid-222';
const VEHICLE_ID     = 'vehicle-uuid-333';

const mockVehicle = {
  id:           VEHICLE_ID,
  driver_id:    DRIVER_ID,
  plate_number: 'AB-123-CD',
  brand:        'Peugeot',
  model:        '508',
  year:         2022,
  color:        'Noir',
  type:         'berline',
  photo_url:    null,
  is_active:    true,
  created_at:   '2026-03-01T10:00:00Z',
  updated_at:   '2026-03-01T10:00:00Z',
};

const mockDriver = { id: DRIVER_ID };

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function chain(data: unknown, error: unknown = null, count: number | null = null) {
  const resolved = { data, error, count } as never;
  const c: Record<string, unknown> = {
    select:      jest.fn().mockReturnThis(),
    insert:      jest.fn().mockReturnThis(),
    update:      jest.fn().mockReturnThis(),
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

function mockStorageOk() {
  const bucket = {
    upload:          jest.fn().mockResolvedValue({ error: null } as never),
    createSignedUrl: jest.fn().mockResolvedValue({
      data:  { signedUrl: 'https://storage.example.com/vehicles/photo.jpg' },
      error: null,
    } as never),
    remove: jest.fn().mockResolvedValue({ error: null } as never),
  };
  mockStorage.from.mockReturnValue(bucket);
  return bucket;
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('VehiclesService', () => {
  let service: InstanceType<typeof VehiclesService>;

  beforeEach(() => {
    service = new VehiclesService();
    jest.clearAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // getDriverIdFromUserId
  // ────────────────────────────────────────────────────────────────────────────
  describe('getDriverIdFromUserId()', () => {
    it(' retourne le driver_id', async () => {
      mockFrom.mockReturnValueOnce(chain(mockDriver));
      const id = await service.getDriverIdFromUserId(DRIVER_USER_ID);
      expect(id).toBe(DRIVER_ID);
    });

    it(' lève 404 si le profil chauffeur est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));
      await expect(service.getDriverIdFromUserId(DRIVER_USER_ID))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // createVehicle
  // ────────────────────────────────────────────────────────────────────────────
  describe('createVehicle()', () => {
    const dto = {
      plate_number: 'AB-123-CD',
      brand:        'Peugeot',
      model:        '508',
      type:         'berline' as const,
    };

    it(' crée un véhicule et le retourne', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockDriver))    // getDriverIdFromUserId
        .mockReturnValueOnce(chain(mockVehicle));  // insert

      const result = await service.createVehicle(DRIVER_USER_ID, dto);
      expect(result.plate_number).toBe('AB-123-CD');
      expect(result.driver_id).toBe(DRIVER_ID);
    });

    it(' lève 500 si l\'insertion échoue', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockDriver))
        .mockReturnValueOnce(chain(null, { message: 'db error' }));

      await expect(service.createVehicle(DRIVER_USER_ID, dto))
        .rejects.toMatchObject({ status: 500 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // getMyVehicles
  // ────────────────────────────────────────────────────────────────────────────
  describe('getMyVehicles()', () => {
    it(' retourne la liste des véhicules du chauffeur', async () => {
      const list = [mockVehicle, { ...mockVehicle, id: 'vehicle-uuid-444', plate_number: 'XY-456-ZT' }];
      const listChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        order:   jest.fn().mockResolvedValue({ data: list, error: null } as never),
      };
      mockFrom
        .mockReturnValueOnce(chain(mockDriver))   // getDriverIdFromUserId
        .mockReturnValueOnce(listChain);          // select véhicules

      const result = await service.getMyVehicles(DRIVER_USER_ID);
      expect(result).toHaveLength(2);
    });

    it(' retourne tableau vide si aucun véhicule', async () => {
      const emptyChain = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockResolvedValue({ data: [], error: null } as never),
      };
      mockFrom
        .mockReturnValueOnce(chain(mockDriver))
        .mockReturnValueOnce(emptyChain);

      const result = await service.getMyVehicles(DRIVER_USER_ID);
      expect(result).toEqual([]);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // getMyVehicle
  // ────────────────────────────────────────────────────────────────────────────
  describe('getMyVehicle()', () => {
    it(' retourne un véhicule par ID (ownership vérifié)', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockDriver))
        .mockReturnValueOnce(chain(mockVehicle));

      const result = await service.getMyVehicle(DRIVER_USER_ID, VEHICLE_ID);
      expect(result.id).toBe(VEHICLE_ID);
    });

    it(' lève 404 si le véhicule n\'appartient pas au chauffeur', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockDriver))
        .mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(service.getMyVehicle(DRIVER_USER_ID, VEHICLE_ID))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // updateVehicle
  // ────────────────────────────────────────────────────────────────────────────
  describe('updateVehicle()', () => {
    it(' met à jour et retourne le véhicule', async () => {
      const updated = { ...mockVehicle, color: 'Blanc' };
      mockFrom
        .mockReturnValueOnce(chain(mockDriver))              // getDriverId
        .mockReturnValueOnce(chain({ id: VEHICLE_ID }))     // ownership check
        .mockReturnValueOnce(chain(updated));                // update

      const result = await service.updateVehicle(DRIVER_USER_ID, VEHICLE_ID, { color: 'Blanc' });
      expect(result.color).toBe('Blanc');
    });

    it(' lève 404 si le véhicule n\'existe pas', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockDriver))
        .mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(service.updateVehicle(DRIVER_USER_ID, VEHICLE_ID, { color: 'Rouge' }))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // deleteVehicle
  // ────────────────────────────────────────────────────────────────────────────
  describe('deleteVehicle()', () => {
    it(' supprime un véhicule sans photo', async () => {
      const vehicleNoPhoto = { ...mockVehicle, photo_url: null };
      const deleteChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        delete:  jest.fn().mockReturnThis(),
        single:  jest.fn().mockResolvedValue({ data: vehicleNoPhoto, error: null } as never),
      };
      mockFrom
        .mockReturnValueOnce(chain(mockDriver))
        .mockReturnValueOnce(chain(vehicleNoPhoto)) // fetch
        .mockReturnValueOnce({                       // delete
          delete: jest.fn().mockReturnThis(),
          eq:     jest.fn().mockResolvedValue({ error: null } as never),
        });

      await expect(service.deleteVehicle(DRIVER_USER_ID, VEHICLE_ID)).resolves.toBeUndefined();
    });

    it(' supprime la photo du storage avant de supprimer le véhicule', async () => {
      const vehicleWithPhoto = {
        ...mockVehicle,
        photo_url: 'https://storage.example.com/object/sign/driver-vehicles/driver-222/vehicle_123.jpg',
      };
      const storageBucket = mockStorageOk();

      mockFrom
        .mockReturnValueOnce(chain(mockDriver))
        .mockReturnValueOnce(chain(vehicleWithPhoto))  // fetch
        .mockReturnValueOnce({                          // delete
          delete: jest.fn().mockReturnThis(),
          eq:     jest.fn().mockResolvedValue({ error: null } as never),
        });

      await service.deleteVehicle(DRIVER_USER_ID, VEHICLE_ID);
      expect(storageBucket.remove).toHaveBeenCalled();
    });

    it(' lève 404 si le véhicule est introuvable', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockDriver))
        .mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(service.deleteVehicle(DRIVER_USER_ID, VEHICLE_ID))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // uploadVehiclePhoto
  // ────────────────────────────────────────────────────────────────────────────
  describe('uploadVehiclePhoto()', () => {
    const buffer = Buffer.from('fake-image-data');

    it(' uploade une photo JPEG et retourne le véhicule mis à jour', async () => {
      const vehicleNoPhoto = { ...mockVehicle, photo_url: null };
      const signedUrl = 'https://storage.example.com/vehicles/photo.jpg';
      const storageBucket = mockStorageOk();

      mockFrom
        .mockReturnValueOnce(chain(mockDriver))                  // getDriverId
        .mockReturnValueOnce(chain(vehicleNoPhoto))              // fetch ownership
        .mockReturnValueOnce(chain(null))                        // update photo_url
        .mockReturnValueOnce(chain({ ...vehicleNoPhoto, photo_url: signedUrl })); // fetch updated

      const result = await service.uploadVehiclePhoto(DRIVER_USER_ID, VEHICLE_ID, buffer, 'image/jpeg');
      expect(storageBucket.upload).toHaveBeenCalled();
      expect(result.photo_url).toBe(signedUrl);
    });

    it(' rejette un format non supporté', async () => {
      await expect(service.uploadVehiclePhoto(DRIVER_USER_ID, VEHICLE_ID, buffer, 'image/gif'))
        .rejects.toMatchObject({ status: 400, message: expect.stringContaining('Format non supporté') });
    });

    it(' rejette un fichier trop volumineux (> 5 Mo)', async () => {
      const bigBuffer = Buffer.alloc(6 * 1024 * 1024);
      await expect(service.uploadVehiclePhoto(DRIVER_USER_ID, VEHICLE_ID, bigBuffer, 'image/jpeg'))
        .rejects.toMatchObject({ status: 400, message: expect.stringContaining('volumineux') });
    });

    it(' lève 404 si le véhicule n\'appartient pas au chauffeur', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockDriver))
        .mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(service.uploadVehiclePhoto(DRIVER_USER_ID, VEHICLE_ID, buffer, 'image/png'))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // getAllVehicles (admin)
  // ────────────────────────────────────────────────────────────────────────────
  describe('getAllVehicles()', () => {
    it(' retourne la liste paginée avec total', async () => {
      const vehicles = [{ ...mockVehicle, driver: {} }];
      const adminChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        order:   jest.fn().mockReturnThis(),
        range:   jest.fn().mockResolvedValue({ data: vehicles, error: null, count: 1 } as never),
      };
      mockFrom.mockReturnValueOnce(adminChain);

      const result = await service.getAllVehicles({ page: 1, limit: 20 });
      expect(result.total).toBe(1);
      expect(result.total_pages).toBe(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // getVehicleById (admin)
  // ────────────────────────────────────────────────────────────────────────────
  describe('getVehicleById()', () => {
    it(' retourne le véhicule avec les infos du chauffeur', async () => {
      const vehicleWithDriver = { ...mockVehicle, driver: { id: DRIVER_ID, user: {} } };
      mockFrom.mockReturnValueOnce(chain(vehicleWithDriver));

      const result = await service.getVehicleById(VEHICLE_ID);
      expect(result.id).toBe(VEHICLE_ID);
      expect(result.driver).toBeDefined();
    });

    it(' lève 404 si le véhicule n\'existe pas', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));
      await expect(service.getVehicleById('unknown-id'))
        .rejects.toMatchObject({ status: 404 });
    });
  });
});
