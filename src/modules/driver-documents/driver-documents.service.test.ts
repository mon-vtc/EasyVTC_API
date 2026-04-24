import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — Avec ESM, on doit utiliser unstable_mockModule AVANT les imports
// ══════════════════════════════════════════════════════════════════════════════

const mockFrom = jest.fn();
const mockStorageFrom = jest.fn();

// Mock du client Supabase
jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    from: mockFrom,
    storage: {
      from: mockStorageFrom,
    },
  },
}));

// Import dynamique APRÈS le mock (obligatoire avec ESM)
const { DriverDocumentsService } = await import('./driver-documents.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const mockDriver = {
  id: 'driver-uuid-123',
  user_id: 'user-uuid-123',
  status: 'active',
};

const mockDocument = {
  id: 'doc-uuid-123',
  driver_id: 'driver-uuid-123',
  doc_type: 'license',
  status: 'pending',
  file_url: 'driver-uuid-123/license_1234567890.pdf',
  expiry_date: '2027-12-31',
  alert_30d_sent: false,
  alert_7d_sent: false,
  rejection_reason: null,
  validated_at: null,
  validated_by: null,
  created_at: '2026-03-23T10:00:00Z',
  updated_at: '2026-03-23T10:00:00Z',
};

const mockValidatedDocument = {
  ...mockDocument,
  id: 'doc-uuid-456',
  status: 'validated',
  validated_at: '2026-03-23T12:00:00Z',
  validated_by: 'admin-uuid-123',
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function setupFromMock(returnData: unknown, returnError: unknown = null) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    delete: jest.fn().mockReturnThis(),
    eq: jest.fn().mockReturnThis(),
    in: jest.fn().mockReturnThis(),
    lte: jest.fn().mockReturnThis(),
    gte: jest.fn().mockReturnThis(),
    lt: jest.fn().mockReturnThis(),
    order: jest.fn().mockReturnThis(),
    range: jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: returnData, error: returnError } as never),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

function setupStorageMock(uploadError: unknown = null, signedUrl: string = 'https://storage.example.com/signed-url') {
  const storageBucket = {
    upload: jest.fn().mockResolvedValue({ error: uploadError } as never),
    createSignedUrl: jest.fn().mockResolvedValue({
      data: { signedUrl },
      error: null,
    } as never),
    remove: jest.fn().mockResolvedValue({ error: null } as never),
  };
  mockStorageFrom.mockReturnValue(storageBucket);
  return storageBucket;
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('DriverDocumentsService', () => {
  let service: InstanceType<typeof DriverDocumentsService>;

  beforeEach(() => {
    service = new DriverDocumentsService();
    jest.clearAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getDriverIdFromUserId
  // ══════════════════════════════════════════════════════════════════════════
  describe('getDriverIdFromUserId()', () => {
    it(' retourne le driver_id si le chauffeur existe', async () => {
      setupFromMock(mockDriver);

      const result = await service.getDriverIdFromUserId('user-uuid-123');
      expect(result).toBe('driver-uuid-123');
    });

    it(' lève une erreur 404 si le chauffeur n\'existe pas', async () => {
      setupFromMock(null, { message: 'Not found' });

      await expect(service.getDriverIdFromUserId('ghost-user'))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // uploadDocument
  // ══════════════════════════════════════════════════════════════════════════
  describe('uploadDocument()', () => {
    it(' upload un document avec succès', async () => {
      // Mock pour getDriverIdFromUserId
      const driverChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockDriver, error: null } as never),
      };

      // Mock pour vérifier si document existant
      const existingDocChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        in: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: null } as never),
      };

      // Mock pour insert du nouveau document
      const insertChain = {
        insert: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockDocument, error: null } as never),
      };

      mockFrom
        .mockReturnValueOnce(driverChain)
        .mockReturnValueOnce(existingDocChain)
        .mockReturnValueOnce(insertChain);

      setupStorageMock();

      const fileBuffer = Buffer.from('fake-pdf-data');
      const result = await service.uploadDocument(
        'user-uuid-123',
        fileBuffer,
        'application/pdf',
        { doc_type: 'license', expiry_date: '2027-12-31' }
      );

      expect(result.doc_type).toBe('license');
      expect(result.status).toBe('pending');
      expect(result.signed_url).toBeDefined();
    });

    it(' rejette un format non supporté (400)', async () => {
      const fileBuffer = Buffer.from('fake-data');

      await expect(
        service.uploadDocument('user-uuid-123', fileBuffer, 'application/zip', { doc_type: 'license' })
      ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('Format') });
    });

    it(' rejette un fichier trop volumineux (400)', async () => {
      const largeBuffer = Buffer.alloc(11 * 1024 * 1024); // 11 Mo

      await expect(
        service.uploadDocument('user-uuid-123', largeBuffer, 'application/pdf', { doc_type: 'license' })
      ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('volumineux') });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getMyDocuments
  // ══════════════════════════════════════════════════════════════════════════
  describe('getMyDocuments()', () => {
    it(' retourne la liste des documents du chauffeur', async () => {
      // Mock getDriverIdFromUserId
      const driverChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockDriver, error: null } as never),
      };

      // Mock liste documents
      const docsChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        order: jest.fn().mockResolvedValue({ data: [mockDocument, mockValidatedDocument], error: null } as never),
      };

      mockFrom
        .mockReturnValueOnce(driverChain)
        .mockReturnValueOnce(docsChain);

      setupStorageMock();

      const result = await service.getMyDocuments('user-uuid-123');

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveProperty('signed_url');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // validateDocument (Admin)
  // ══════════════════════════════════════════════════════════════════════════
  describe('validateDocument()', () => {
    it(' valide un document en attente', async () => {
      // Mock fetch document
      const fetchChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockDocument, error: null } as never),
      };

      // Mock update
      const updateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { ...mockDocument, status: 'validated', validated_at: new Date().toISOString() },
          error: null,
        } as never),
      };

      mockFrom
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.validateDocument('doc-uuid-123', 'admin-uuid-123');

      expect(result.status).toBe('validated');
    });

    it(' rejette si document non trouvé (404)', async () => {
      setupFromMock(null, { message: 'Not found' });

      await expect(service.validateDocument('ghost-doc', 'admin-uuid'))
        .rejects.toMatchObject({ status: 404 });
    });

    it(' rejette si document déjà validé (400)', async () => {
      setupFromMock(mockValidatedDocument);

      await expect(service.validateDocument('doc-uuid-456', 'admin-uuid'))
        .rejects.toMatchObject({ status: 400, message: expect.stringContaining('validated') });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // rejectDocument (Admin)
  // ══════════════════════════════════════════════════════════════════════════
  describe('rejectDocument()', () => {
    it(' rejette un document avec motif', async () => {
      // Mock fetch document
      const fetchChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockDocument, error: null } as never),
      };

      // Mock update
      const updateChain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({
          data: { ...mockDocument, status: 'rejected', rejection_reason: 'Document illisible' },
          error: null,
        } as never),
      };

      mockFrom
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.rejectDocument('doc-uuid-123', 'admin-uuid', {
        reason: 'Document illisible, veuillez re-soumettre une copie plus nette.',
      });

      expect(result.status).toBe('rejected');
      expect(result.rejection_reason).toBe('Document illisible');
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // deleteMyDocument
  // ══════════════════════════════════════════════════════════════════════════
  describe('deleteMyDocument()', () => {
    it(' supprime un document pending', async () => {
      // Mock getDriverIdFromUserId
      const driverChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockDriver, error: null } as never),
      };

      // Mock fetch document
      const fetchChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockDocument, error: null } as never),
      };

      // Mock delete
      const deleteChain = {
        delete: jest.fn().mockReturnThis(),
        eq: jest.fn().mockResolvedValue({ error: null } as never),
      };

      mockFrom
        .mockReturnValueOnce(driverChain)
        .mockReturnValueOnce(fetchChain)
        .mockReturnValueOnce(deleteChain);

      setupStorageMock();

      await expect(service.deleteMyDocument('user-uuid-123', 'doc-uuid-123'))
        .resolves.not.toThrow();
    });

    it(' rejette la suppression d\'un document validé (400)', async () => {
      // Mock getDriverIdFromUserId
      const driverChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockDriver, error: null } as never),
      };

      // Mock fetch document (validated)
      const fetchChain = {
        select: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: mockValidatedDocument, error: null } as never),
      };

      mockFrom
        .mockReturnValueOnce(driverChain)
        .mockReturnValueOnce(fetchChain);

      await expect(service.deleteMyDocument('user-uuid-123', 'doc-uuid-456'))
        .rejects.toMatchObject({ status: 400, message: expect.stringContaining('validé') });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // markExpiredDocuments (Cron)
  // ══════════════════════════════════════════════════════════════════════════
  describe('markExpiredDocuments()', () => {
    it(' marque les documents expirés', async () => {
      const chain = {
        update: jest.fn().mockReturnThis(),
        eq: jest.fn().mockReturnThis(),
        lt: jest.fn().mockReturnThis(),
        select: jest.fn().mockResolvedValue({
          data: [{ id: 'doc-1' }, { id: 'doc-2' }],
          error: null,
        } as never),
      };

      mockFrom.mockReturnValue(chain);

      const count = await service.markExpiredDocuments();

      expect(count).toBe(2);
    });
  });
});
