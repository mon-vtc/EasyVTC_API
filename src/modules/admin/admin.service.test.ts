import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (ESM obligatoire)
// ══════════════════════════════════════════════════════════════════════════════

const mockCreateUser = jest.fn();
const mockDeleteUser = jest.fn();
const mockFrom       = jest.fn();

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: {
    auth: {
      admin: {
        createUser: mockCreateUser,
        deleteUser: mockDeleteUser,
      },
    },
    from: mockFrom,
  },
}));

jest.unstable_mockModule('../../utils/email.service.js', () => ({
  sendManagerCredentialsEmail: jest.fn().mockResolvedValue(undefined as never),
}));

const mockChangeUserStatus = jest.fn();
jest.unstable_mockModule('../users/users.service.js', () => ({
  usersService: {
    changeUserStatus: mockChangeUserStatus,
  },
}));

// Import dynamique APRÈS les mocks (obligatoire ESM)
const { AdminService } = await import('./admin.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const ADMIN_ID   = 'admin-uuid-001';
const MANAGER_ID = 'manager-uuid-001';

const mockManagerProfile = {
  id:                MANAGER_ID,
  email:             'manager@easyvtc.com',
  role:              'manager',
  first_name:        'Sophie',
  last_name:         'Leclerc',
  phone:             '+33698765432',
  profile_photo_url: null,
  status:            'active',
  status_changed_by: ADMIN_ID,
  status_changed_at: '2026-04-20T10:00:00Z',
  status_reason:     'Compte créé par un administrateur',
  rgpd_consent:      false,
  rgpd_consent_at:   null,
  deleted_at:        null,
  created_at:        '2026-04-20T10:00:00Z',
  updated_at:        '2026-04-20T10:00:00Z',
};

const mockCreateManagerDto = {
  email:      'manager@easyvtc.com',
  password:   'Secret123',
  first_name: 'Sophie',
  last_name:  'Leclerc',
  phone:      '+33698765432',
};

const mockChangeStatusDto = {
  status: 'inactive' as const,
  reason: 'Compte suspendu temporairement',
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function setupFromMock(returnData: unknown, returnError: unknown = null) {
  const chain = {
    select: jest.fn().mockReturnThis(),
    insert: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    is:     jest.fn().mockReturnThis(),
    or:     jest.fn().mockReturnThis(),
    order:  jest.fn().mockReturnThis(),
    range:  jest.fn().mockReturnThis(),
    single: jest.fn().mockResolvedValue({ data: returnData, error: returnError } as never),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

function setupListMock(
  returnData: unknown[],
  count:      number,
  returnError: unknown = null,
) {
  const resolved = { data: returnData, error: returnError, count };
  // range() doit retourner `this` pour que les filtres optionnels (eq/or) enchaînent,
  // tout en étant awaitable via then/catch/finally.
  const chain: Record<string, unknown> = {
    select: jest.fn().mockReturnThis(),
    eq:     jest.fn().mockReturnThis(),
    is:     jest.fn().mockReturnThis(),
    or:     jest.fn().mockReturnThis(),
    order:  jest.fn().mockReturnThis(),
    range:  jest.fn().mockReturnThis(),
    then:   (onFulfilled: (v: unknown) => unknown) => Promise.resolve(resolved).then(onFulfilled),
    catch:  (onRejected: (e: unknown) => unknown) => Promise.resolve(resolved).catch(onRejected),
    finally:(onFinally: () => void)               => Promise.resolve(resolved).finally(onFinally),
  };
  mockFrom.mockReturnValue(chain);
  return chain;
}

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('AdminService', () => {
  let service: InstanceType<typeof AdminService>;

  beforeEach(() => {
    service = new AdminService();
    jest.clearAllMocks();
  });

  // ══════════════════════════════════════════════════════════════════════════
  // createManager()
  // ══════════════════════════════════════════════════════════════════════════

  describe('createManager()', () => {
    it(' crée un gestionnaire et retourne son profil', async () => {
      mockCreateUser.mockResolvedValue({
        data:  { user: { id: MANAGER_ID } },
        error: null,
      } as never);

      // Première requête from() : polling trigger → profil trouvé
      setupFromMock(mockManagerProfile);

      const result = await service.createManager(mockCreateManagerDto, ADMIN_ID);

      expect(mockCreateUser).toHaveBeenCalledWith(
        expect.objectContaining({
          email:         mockCreateManagerDto.email,
          password:      mockCreateManagerDto.password,
          email_confirm: true,
          user_metadata: expect.objectContaining({ role: 'manager' }),
        }),
      );
      expect(result.role).toBe('manager');
      expect(result.email).toBe(mockCreateManagerDto.email);
    });

    it(' effectue un insert manuel (fallback) si le trigger handle_new_user est lent', async () => {
      mockCreateUser.mockResolvedValue({
        data:  { user: { id: MANAGER_ID } },
        error: null,
      } as never);

      // Cinq appels polling retournent null → fallback insert → lecture profil finale
      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        const isFallbackInsert = callCount === 6;
        const isFinalSelect    = callCount === 7;

        if (isFallbackInsert) {
          return {
            insert: jest.fn().mockResolvedValue({ error: null } as never),
          };
        }

        const chain: Record<string, jest.Mock> = {
          select: jest.fn().mockReturnThis(),
          insert: jest.fn().mockReturnThis(),
          eq:     jest.fn().mockReturnThis(),
          is:     jest.fn().mockReturnThis(),
          order:  jest.fn().mockReturnThis(),
          range:  jest.fn().mockReturnThis(),
        } as unknown as Record<string, jest.Mock>;

        chain.single = jest.fn().mockResolvedValue({
          data:  isFinalSelect ? mockManagerProfile : null,
          error: null,
        } as never);

        return chain;
      });

      const result = await service.createManager(mockCreateManagerDto, ADMIN_ID);

      expect(result.role).toBe('manager');
    });

    it(' lève une erreur 409 si l\'email est déjà enregistré', async () => {
      mockCreateUser.mockResolvedValue({
        data:  { user: null },
        error: { message: 'User already registered', code: 'email_exists' },
      } as never);

      await expect(
        service.createManager(mockCreateManagerDto, ADMIN_ID),
      ).rejects.toMatchObject({ status: 409, message: 'Un compte existe déjà avec cet email' });
    });

    it(' lève une erreur 400 pour toute autre erreur Supabase Auth', async () => {
      mockCreateUser.mockResolvedValue({
        data:  { user: null },
        error: { message: 'Invalid email format' },
      } as never);

      await expect(
        service.createManager(mockCreateManagerDto, ADMIN_ID),
      ).rejects.toMatchObject({ status: 400, message: 'Invalid email format' });
    });

    it(' lève 500 et nettoie le compte auth si le fallback insert échoue', async () => {
      mockCreateUser.mockResolvedValue({
        data:  { user: { id: MANAGER_ID } },
        error: null,
      } as never);
      mockDeleteUser.mockResolvedValue({ error: null } as never);

      // Polling → toujours null, fallback insert → erreur
      let callCount = 0;
      mockFrom.mockImplementation(() => {
        callCount++;
        if (callCount === 6) {
          return {
            insert: jest.fn().mockResolvedValue({ error: { message: 'DB error' } } as never),
          };
        }
        const chain: Record<string, jest.Mock> = {
          select: jest.fn().mockReturnThis(),
          eq:     jest.fn().mockReturnThis(),
        } as unknown as Record<string, jest.Mock>;
        chain.single = jest.fn().mockResolvedValue({ data: null, error: null } as never);
        return chain;
      });

      await expect(
        service.createManager(mockCreateManagerDto, ADMIN_ID),
      ).rejects.toMatchObject({ status: 500 });

      expect(mockDeleteUser).toHaveBeenCalledWith(MANAGER_ID);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // listManagers()
  // ══════════════════════════════════════════════════════════════════════════

  describe('listManagers()', () => {
    it(' retourne une liste paginée de gestionnaires', async () => {
      setupListMock([mockManagerProfile], 1);

      const result = await service.listManagers({ page: 1, limit: 20 });

      expect(result.managers).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);
      expect(result.total_pages).toBe(1);
    });

    it(' applique le filtre statut', async () => {
      const chain = setupListMock([mockManagerProfile], 1);

      await service.listManagers({ status: 'active', page: 1, limit: 20 });

      expect(chain.eq).toHaveBeenCalledWith('status', 'active');
    });

    it(' applique le filtre recherche (search)', async () => {
      const chain = setupListMock([mockManagerProfile], 1);

      await service.listManagers({ search: 'sophie', page: 1, limit: 20 });

      expect(chain.or).toHaveBeenCalledWith(
        expect.stringContaining('%sophie%'),
      );
    });

    it(' calcule correctement la pagination page 2', async () => {
      setupListMock([], 45);

      const result = await service.listManagers({ page: 2, limit: 20 });

      expect(result.page).toBe(2);
      expect(result.total).toBe(45);
      expect(result.total_pages).toBe(3);
    });

    it(' lève une erreur 500 si la requête Supabase échoue', async () => {
      setupListMock([], 0, { message: 'DB error' });

      await expect(
        service.listManagers({ page: 1, limit: 20 }),
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // getManagerById()
  // ══════════════════════════════════════════════════════════════════════════

  describe('getManagerById()', () => {
    it(' retourne le profil du gestionnaire', async () => {
      setupFromMock(mockManagerProfile);

      const result = await service.getManagerById(MANAGER_ID);

      expect(result.id).toBe(MANAGER_ID);
      expect(result.role).toBe('manager');
    });

    it(' lève une erreur 404 si le gestionnaire est introuvable', async () => {
      setupFromMock(null, { message: 'No rows returned' });

      await expect(
        service.getManagerById('unknown-uuid'),
      ).rejects.toMatchObject({ status: 404, message: 'Gestionnaire introuvable' });
    });

    it(' lève une erreur 404 si l\'utilisateur existe mais n\'a pas le rôle manager', async () => {
      // Supabase filtre role='manager' — aucune donnée retournée
      setupFromMock(null);

      await expect(
        service.getManagerById('client-uuid'),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // changeManagerStatus()
  // ══════════════════════════════════════════════════════════════════════════

  describe('changeManagerStatus()', () => {
    it(' change le statut et délègue à usersService.changeUserStatus', async () => {
      // getManagerById réussit
      setupFromMock(mockManagerProfile);

      const updatedProfile = { ...mockManagerProfile, status: 'inactive' };
      mockChangeUserStatus.mockResolvedValue(updatedProfile as never);

      const result = await service.changeManagerStatus(MANAGER_ID, mockChangeStatusDto, ADMIN_ID);

      expect(mockChangeUserStatus).toHaveBeenCalledWith(
        MANAGER_ID,
        mockChangeStatusDto,
        ADMIN_ID,
      );
      expect(result.status).toBe('inactive');
    });

    it(' lève une erreur 404 si le gestionnaire est introuvable', async () => {
      setupFromMock(null, { message: 'Not found' });

      await expect(
        service.changeManagerStatus('unknown-uuid', mockChangeStatusDto, ADMIN_ID),
      ).rejects.toMatchObject({ status: 404 });

      expect(mockChangeUserStatus).not.toHaveBeenCalled();
    });
  });
});
