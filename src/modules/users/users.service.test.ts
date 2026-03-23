import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — Avec ESM, on doit utiliser unstable_mockModule AVANT les imports
// ══════════════════════════════════════════════════════════════════════════════

// Au début du fichier de test, après les imports
beforeEach(() => {
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  jest.restoreAllMocks();
});

const mockFrom           = jest.fn();
const mockStorageFrom    = jest.fn();
const mockSignOut        = jest.fn();

// Mock du client Supabase
jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        signOut: mockSignOut,
      },
    },
    from: mockFrom,
    storage: {
      from: mockStorageFrom,
    },
  },
}));

// Import dynamique APRÈS le mock (obligatoire avec ESM)
const { UsersService } = await import('./users.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const mockUserProfile = {
  id: 'uuid-123',
  email: 'test@easyvtc.com',
  role: 'client',
  first_name: 'Jean',
  last_name: 'Dupont',
  phone: '+33612345678',
  profile_photo_url: null,
  status: 'active',
  status_changed_by: null,
  status_changed_at: null,
  status_reason: null,
  rgpd_consent: true,
  rgpd_consent_at: '2026-03-16T10:00:00Z',
  deleted_at: null,
  created_at: '2026-03-16T10:00:00Z',
  updated_at: '2026-03-16T10:00:00Z',
};

const mockAdminUser = {
  ...mockUserProfile,
  id: 'admin-uuid',
  email: 'admin@easyvtc.com',
  role: 'admin',
  first_name: 'Admin',
  last_name: 'System',
};

const mockDriverUser = {
  ...mockUserProfile,
  id: 'driver-uuid',
  email: 'driver@easyvtc.com',
  role: 'driver',
  first_name: 'Pierre',
  last_name: 'Martin',
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

/**
 * Configure le mock de .from().select().eq().single()
 */
function setupFromMock(returnData: unknown, returnError: unknown = null) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    update: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    or:     jest.fn().mockReturnThis(),
    order:  jest.fn().mockReturnThis(),
    range:  jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: returnData, error: returnError } as never),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

/**
 * Configure le mock pour une requête paginée (liste)
 */
function setupListMock(returnData: unknown[], count: number, returnError: unknown = null) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    or:     jest.fn().mockReturnThis(),
    order:  jest.fn().mockReturnThis(),
    range:  jest.fn().mockResolvedValue({ data: returnData, error: returnError, count } as never),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

/**
 * Configure le mock pour Supabase Storage
 */
function setupStorageMock(uploadError: unknown = null, signedUrl: string = 'https://storage.example.com/signed-url') {
  const storageBucket = {
    upload: jest.fn().mockResolvedValue({ error: uploadError } as never),
    createSignedUrl: jest.fn().mockResolvedValue({ 
      data: { signedUrl }, 
      error: null 
    } as never),
  };
  mockStorageFrom.mockReturnValue(storageBucket);
  return storageBucket;
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('UsersService', () => {
  let service: InstanceType<typeof UsersService>;

  beforeEach(() => {
    service = new UsersService();
    jest.clearAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ENDPOINTS UTILISATEUR (self)
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET PROFILE ──────────────────────────────────────────────────────────────
  describe('getProfile()', () => {

    it('✅ retourne le profil de l\'utilisateur connecté', async () => {
      setupFromMock(mockUserProfile);

      const result = await service.getProfile('uuid-123');

      expect(result.id).toBe('uuid-123');
      expect(result.email).toBe('test@easyvtc.com');
      expect(result.first_name).toBe('Jean');
      expect(result.status).toBe('active');
    });

    it('❌ lève une erreur 404 si utilisateur introuvable', async () => {
      setupFromMock(null, { message: 'Not found' });

      await expect(service.getProfile('ghost-id'))
        .rejects.toMatchObject({ status: 404 });
    });

    it('❌ lève une erreur 403 si compte inactif', async () => {
      setupFromMock({ ...mockUserProfile, status: 'inactive' });

      await expect(service.getProfile('uuid-123'))
        .rejects.toMatchObject({ status: 403, message: expect.stringContaining('désactivé') });
    });

    it('❌ lève une erreur 403 si compte verrouillé', async () => {
      setupFromMock({ ...mockUserProfile, status: 'locked' });

      await expect(service.getProfile('uuid-123'))
        .rejects.toMatchObject({ status: 403, message: expect.stringContaining('verrouillé') });
    });
  });

  // ── UPDATE PROFILE ───────────────────────────────────────────────────────────
  describe('updateProfile()', () => {

    it('✅ met à jour le profil avec succès', async () => {
      const updatedProfile = { 
        ...mockUserProfile, 
        first_name: 'Jean-Pierre',
        phone: '+33698765432',
      };
      setupFromMock(updatedProfile);

      const result = await service.updateProfile('uuid-123', {
        first_name: 'Jean-Pierre',
        phone: '+33698765432',
      });

      expect(result.first_name).toBe('Jean-Pierre');
      expect(result.phone).toBe('+33698765432');
    });

    it('❌ rejette si numéro de téléphone déjà utilisé (409)', async () => {
      setupFromMock(null, { code: '23505', message: 'duplicate key' });

      await expect(
        service.updateProfile('uuid-123', { phone: '+33600000000' })
      ).rejects.toMatchObject({ status: 409, message: expect.stringContaining('téléphone') });
    });

    it('❌ rejette en cas d\'erreur serveur (500)', async () => {
      setupFromMock(null, { message: 'Database error' });

      await expect(
        service.updateProfile('uuid-123', { first_name: 'Test' })
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  // ── UPLOAD AVATAR ────────────────────────────────────────────────────────────
  describe('uploadAvatar()', () => {

    it('✅ upload une photo de profil avec succès', async () => {
      const signedUrl = 'https://storage.supabase.com/profile-photos/uuid-123/avatar.jpg?token=xyz';
      setupStorageMock(null, signedUrl);
      setupFromMock(mockUserProfile);

      const fileBuffer = Buffer.from('fake-image-data');
      const result = await service.uploadAvatar('uuid-123', fileBuffer, 'image/jpeg');

      expect(result.profile_photo_url).toBe(signedUrl);
      expect(mockStorageFrom).toHaveBeenCalledWith('profile-photos');
    });

    it('❌ rejette un format non supporté (400)', async () => {
      const fileBuffer = Buffer.from('fake-pdf-data');

      await expect(
        service.uploadAvatar('uuid-123', fileBuffer, 'application/pdf')
      ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('Format') });
    });

    it('✅ accepte les formats JPG, PNG et WebP', async () => {
      const signedUrl = 'https://storage.example.com/signed-url';
      setupStorageMock(null, signedUrl);
      setupFromMock(mockUserProfile);

      const fileBuffer = Buffer.from('fake-image-data');

      // Test JPEG
      await expect(service.uploadAvatar('uuid-123', fileBuffer, 'image/jpeg'))
        .resolves.toMatchObject({ profile_photo_url: signedUrl });

      // Test PNG
      await expect(service.uploadAvatar('uuid-123', fileBuffer, 'image/png'))
        .resolves.toMatchObject({ profile_photo_url: signedUrl });

      // Test WebP
      await expect(service.uploadAvatar('uuid-123', fileBuffer, 'image/webp'))
        .resolves.toMatchObject({ profile_photo_url: signedUrl });
    });

    it('❌ rejette si l\'upload échoue (500)', async () => {
      setupStorageMock({ message: 'Storage error' });

      const fileBuffer = Buffer.from('fake-image-data');

      await expect(
        service.uploadAvatar('uuid-123', fileBuffer, 'image/jpeg')
      ).rejects.toMatchObject({ status: 500, message: expect.stringContaining('upload') });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // ENDPOINTS ADMIN
  // ══════════════════════════════════════════════════════════════════════════

  // ── LIST USERS ───────────────────────────────────────────────────────────────
  describe('listUsers()', () => {

    it('✅ retourne une liste paginée d\'utilisateurs', async () => {
      const users = [mockUserProfile, mockDriverUser, mockAdminUser];
      setupListMock(users, 3);

      const result = await service.listUsers({ page: 1, limit: 20 });

      expect(result.users).toHaveLength(3);
      expect(result.total).toBe(3);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total_pages).toBe(1);
    });

    it('✅ filtre par rôle', async () => {
      setupListMock([mockDriverUser], 1);

      const result = await service.listUsers({ role: 'driver', page: 1, limit: 20 });

      expect(result.users).toHaveLength(1);
      expect(result.users[0].role).toBe('driver');
    });

    it('✅ filtre par statut', async () => {
      const inactiveUser = { ...mockUserProfile, status: 'inactive' };
      setupListMock([inactiveUser], 1);

      const result = await service.listUsers({ status: 'inactive', page: 1, limit: 20 });

      expect(result.users).toHaveLength(1);
      expect(result.users[0].status).toBe('inactive');
    });

    it('✅ recherche par email/nom', async () => {
      setupListMock([mockUserProfile], 1);

      const result = await service.listUsers({ search: 'Jean', page: 1, limit: 20 });

      expect(result.users).toHaveLength(1);
    });

    it('✅ calcule correctement le nombre de pages', async () => {
      setupListMock([mockUserProfile], 45);

      const result = await service.listUsers({ page: 1, limit: 20 });

      expect(result.total).toBe(45);
      expect(result.total_pages).toBe(3); // 45 / 20 = 2.25 → 3 pages
    });

    it('✅ utilise des valeurs par défaut pour page et limit', async () => {
      setupListMock([], 0);

      const result = await service.listUsers({});

      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
    });

    it('❌ rejette en cas d\'erreur serveur (500)', async () => {
      const chain = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        or:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockReturnThis(),
        range:  jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' }, count: null } as never),
      };
      mockFrom.mockReturnValue(chain);

      await expect(service.listUsers({ page: 1, limit: 20 }))
        .rejects.toMatchObject({ status: 500 });
    });
  });

  // ── GET USER BY ID ───────────────────────────────────────────────────────────
  describe('getUserById()', () => {

    it('✅ retourne un utilisateur par son ID', async () => {
      setupFromMock(mockDriverUser);

      const result = await service.getUserById('driver-uuid');

      expect(result.id).toBe('driver-uuid');
      expect(result.email).toBe('driver@easyvtc.com');
      expect(result.role).toBe('driver');
    });

    it('❌ lève une erreur 404 si utilisateur introuvable', async () => {
      setupFromMock(null, { message: 'Not found' });

      await expect(service.getUserById('ghost-id'))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ── CHANGE USER STATUS ───────────────────────────────────────────────────────
  describe('changeUserStatus()', () => {

    it('✅ désactive un utilisateur avec succès', async () => {
      // Mock pour vérifier que l'utilisateur cible existe
      const checkChain = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: 'driver-uuid', role: 'driver' }, error: null } as never),
      };
      
      // Mock pour la mise à jour
      const updateChain = {
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ 
          data: { ...mockDriverUser, status: 'inactive', status_reason: 'Compte suspendu pour inactivité' }, 
          error: null 
        } as never),
      };

      mockFrom
        .mockReturnValueOnce(checkChain)  // Premier appel : vérification
        .mockReturnValueOnce(updateChain); // Deuxième appel : mise à jour

      mockSignOut.mockResolvedValue({ error: null } as never);

      const result = await service.changeUserStatus(
        'driver-uuid',
        { status: 'inactive', reason: 'Compte suspendu pour inactivité' },
        'admin-uuid'
      );

      expect(result.status).toBe('inactive');
      expect(result.status_reason).toBe('Compte suspendu pour inactivité');
      expect(mockSignOut).toHaveBeenCalled(); // Sessions invalidées
    });

    it('✅ verrouille un utilisateur avec succès', async () => {
      const checkChain = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: 'uuid-123', role: 'client' }, error: null } as never),
      };
      
      const updateChain = {
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ 
          data: { ...mockUserProfile, status: 'locked', status_reason: 'Tentatives de connexion suspectes' }, 
          error: null 
        } as never),
      };

      mockFrom
        .mockReturnValueOnce(checkChain)
        .mockReturnValueOnce(updateChain);

      mockSignOut.mockResolvedValue({ error: null } as never);

      const result = await service.changeUserStatus(
        'uuid-123',
        { status: 'locked', reason: 'Tentatives de connexion suspectes' },
        'admin-uuid'
      );

      expect(result.status).toBe('locked');
    });

    it('✅ réactive un utilisateur sans invalider les sessions', async () => {
      const checkChain = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: 'uuid-123', role: 'client' }, error: null } as never),
      };
      
      const updateChain = {
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ 
          data: { ...mockUserProfile, status: 'active', status_reason: 'Compte réactivé après vérification' }, 
          error: null 
        } as never),
      };

      mockFrom
        .mockReturnValueOnce(checkChain)
        .mockReturnValueOnce(updateChain);

      const result = await service.changeUserStatus(
        'uuid-123',
        { status: 'active', reason: 'Compte réactivé après vérification' },
        'admin-uuid'
      );

      expect(result.status).toBe('active');
      expect(mockSignOut).not.toHaveBeenCalled(); // Pas d'invalidation pour réactivation
    });

    it('❌ empêche un admin de se désactiver lui-même (400)', async () => {
      await expect(
        service.changeUserStatus(
          'admin-uuid',
          { status: 'inactive', reason: 'Test auto-désactivation' },
          'admin-uuid'  // Même ID
        )
      ).rejects.toMatchObject({ status: 400, message: expect.stringContaining('propre compte') });
    });

    it('❌ empêche de modifier le statut d\'un autre admin (403)', async () => {
      const checkChain = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: 'other-admin-uuid', role: 'admin' }, error: null } as never),
      };

      mockFrom.mockReturnValue(checkChain);

      await expect(
        service.changeUserStatus(
          'other-admin-uuid',
          { status: 'inactive', reason: 'Test modification admin' },
          'admin-uuid'
        )
      ).rejects.toMatchObject({ status: 403, message: expect.stringContaining('autre administrateur') });
    });

    it('❌ rejette si l\'utilisateur cible n\'existe pas (404)', async () => {
      const checkChain = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'Not found' } } as never),
      };

      mockFrom.mockReturnValue(checkChain);

      await expect(
        service.changeUserStatus(
          'ghost-id',
          { status: 'inactive', reason: 'Test utilisateur inexistant' },
          'admin-uuid'
        )
      ).rejects.toMatchObject({ status: 404 });
    });

    it('❌ rejette en cas d\'erreur lors de la mise à jour (500)', async () => {
      const checkChain = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { id: 'uuid-123', role: 'client' }, error: null } as never),
      };
      
      const updateChain = {
        select: jest.fn().mockReturnThis(),
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: null, error: { message: 'DB error' } } as never),
      };

      mockFrom
        .mockReturnValueOnce(checkChain)
        .mockReturnValueOnce(updateChain);

      await expect(
        service.changeUserStatus(
          'uuid-123',
          { status: 'inactive', reason: 'Test erreur mise à jour' },
          'admin-uuid'
        )
      ).rejects.toMatchObject({ status: 500 });
    });
  });
});
