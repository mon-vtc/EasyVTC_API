import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (obligatoire ESM)
// ══════════════════════════════════════════════════════════════════════════════

const mockFrom = jest.fn();

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: { from: mockFrom },
}));

// Mock env : FCM_SERVER_KEY absent en tests
jest.unstable_mockModule('../../config/env.js', () => ({
  env: {
    PORT:              4000,
    NODE_ENV:          'test',
    FCM_SERVER_KEY:    undefined,
    SUPABASE_URL:      'https://test.supabase.co',
    SUPABASE_SECRET_KEY: 'test-key',
  },
}));

const { NotificationsService } = await import('./notifications.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const USER_ID   = 'user-uuid-111';
const NOTIF_ID  = 'notif-uuid-222';

const mockNotif = {
  id:         NOTIF_ID,
  user_id:    USER_ID,
  type:       'reservation_confirmed',
  channel:    'push',
  status:     'pending',
  title:      'Réservation confirmée',
  body:       'Votre réservation a été prise en compte.',
  data:       { reservation_id: 'resa-123' },
  read_at:    null,
  sent_at:    null,
  error_log:  null,
  created_at: '2026-04-09T10:00:00Z',
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
    is:          jest.fn().mockReturnThis(),
    order:       jest.fn().mockReturnThis(),
    range:       jest.fn().mockReturnThis(),
    head:        jest.fn().mockReturnThis(),
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

describe('NotificationsService', () => {
  let service: InstanceType<typeof NotificationsService>;

  beforeEach(() => {
    service = new NotificationsService();
    jest.resetAllMocks();
  });

  // ────────────────────────────────────────────────────────────────────────────
  // send()
  // ────────────────────────────────────────────────────────────────────────────
  describe('send()', () => {
    it(' insère la notification en BDD et la retourne', async () => {
      mockFrom.mockReturnValueOnce(chain(mockNotif));

      const result = await service.send({
        user_id: USER_ID,
        type:    'reservation_confirmed',
        channel: 'push',
        title:   'Réservation confirmée',
        body:    'Votre réservation a été prise en compte.',
      });

      expect(result.id).toBe(NOTIF_ID);
      expect(result.status).toBe('pending');
    });

    it(' lève 500 si l\'insertion BDD échoue', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'db error' }));

      await expect(service.send({
        user_id: USER_ID,
        type:    'trip_assigned',
        channel: 'push',
        title:   'Course assignée',
        body:    'Une course vous a été attribuée.',
      })).rejects.toMatchObject({ status: 500 });
    });

    it(' canal push sans FCM_SERVER_KEY — notification insérée, pas de dispatch', async () => {
      // Sans FCM_SERVER_KEY, le dispatch ne se fait pas mais pas d'erreur propagée
      mockFrom.mockReturnValueOnce(chain(mockNotif));

      const result = await service.send({
        user_id: USER_ID,
        type:    'reservation_confirmed',
        channel: 'push',
        title:   'Test',
        body:    'Test body',
      });

      expect(result.id).toBe(NOTIF_ID);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // sendToUser()
  // ────────────────────────────────────────────────────────────────────────────
  describe('sendToUser()', () => {
    it(' fire-and-forget — ne lève jamais d\'erreur', () => {
      // Même si la BDD échoue, sendToUser ne propage pas
      mockFrom.mockReturnValueOnce(chain(null, { message: 'db error' }));

      expect(() => service.sendToUser(
        USER_ID,
        'trip_reminder',
        'Rappel',
        'Votre course est dans 1h',
      )).not.toThrow();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // getForUser()
  // ────────────────────────────────────────────────────────────────────────────
  describe('getForUser()', () => {
    it(' retourne les notifications paginées avec unread_count', async () => {
      const listChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        order:   jest.fn().mockReturnThis(),
        range:   jest.fn().mockResolvedValue({ data: [mockNotif], error: null, count: 1 } as never),
      };
      const unreadChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        is:      jest.fn().mockResolvedValue({ data: null, error: null, count: 1 } as never),
      };

      mockFrom
        .mockReturnValueOnce(listChain)
        .mockReturnValueOnce(unreadChain);

      const result = await service.getForUser(USER_ID, { page: 1, limit: 20 });

      expect(result.notifications).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.unread_count).toBe(1);
      expect(result.page).toBe(1);
    });

    it(' filtre les non-lues avec unread_only = true', async () => {
      const listData = { data: [mockNotif], error: null, count: 1 };
      const listChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        is:      jest.fn().mockReturnThis(),
        order:   jest.fn().mockReturnThis(),
        range:   jest.fn().mockReturnThis(),
        then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
          Promise.resolve(listData).then(resolve, reject),
      };
      const unreadChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        is:      jest.fn().mockResolvedValue({ data: null, error: null, count: 1 } as never),
      };

      mockFrom
        .mockReturnValueOnce(listChain)
        .mockReturnValueOnce(unreadChain);

      const result = await service.getForUser(USER_ID, { page: 1, limit: 20, unread_only: true });
      expect(result.notifications).toHaveLength(1);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // markAsRead()
  // ────────────────────────────────────────────────────────────────────────────
  describe('markAsRead()', () => {
    it(' marque la notification comme lue', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockNotif))   // fetch existing
        .mockReturnValueOnce({                    // update
          update: jest.fn().mockReturnThis(),
          eq:     jest.fn().mockResolvedValue({ error: null } as never),
        });

      await expect(service.markAsRead(NOTIF_ID, USER_ID)).resolves.toBeUndefined();
    });

    it(' idempotent — ne fait rien si déjà lue', async () => {
      const readNotif = { ...mockNotif, read_at: '2026-04-09T11:00:00Z' };
      mockFrom.mockReturnValueOnce(chain(readNotif));

      await expect(service.markAsRead(NOTIF_ID, USER_ID)).resolves.toBeUndefined();
      // update ne doit pas être appelé
    });

    it(' lève 404 si la notification est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null));
      await expect(service.markAsRead('unknown-id', USER_ID))
        .rejects.toMatchObject({ status: 404 });
    });

    it(' lève 403 si la notification appartient à un autre utilisateur', async () => {
      const otherUserNotif = { ...mockNotif, user_id: 'other-user-uuid' };
      mockFrom.mockReturnValueOnce(chain(otherUserNotif));

      await expect(service.markAsRead(NOTIF_ID, USER_ID))
        .rejects.toMatchObject({ status: 403 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // markAllAsRead()
  // ────────────────────────────────────────────────────────────────────────────
  describe('markAllAsRead()', () => {
    it(' marque toutes les notifications comme lues et retourne le count', async () => {
      mockFrom.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        is:     jest.fn().mockResolvedValue({ error: null, count: 3 } as never),
      });

      const result = await service.markAllAsRead(USER_ID);
      expect(result.updated).toBe(3);
    });

    it(' lève 500 si la mise à jour BDD échoue', async () => {
      mockFrom.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        is:     jest.fn().mockResolvedValue({ error: { message: 'db error' }, count: null } as never),
      });

      await expect(service.markAllAsRead(USER_ID))
        .rejects.toMatchObject({ status: 500 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // registerToken()
  // ────────────────────────────────────────────────────────────────────────────
  describe('registerToken()', () => {
    it(' enregistre le device_token FCM', async () => {
      mockFrom.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockResolvedValue({ error: null } as never),
      });

      await expect(service.registerToken(USER_ID, 'fcm-token-abc123'))
        .resolves.toBeUndefined();
    });

    it(' lève 500 si la mise à jour échoue', async () => {
      mockFrom.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockResolvedValue({ error: { message: 'db error' } } as never),
      });

      await expect(service.registerToken(USER_ID, 'bad-token'))
        .rejects.toMatchObject({ status: 500 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // removeToken()
  // ────────────────────────────────────────────────────────────────────────────
  describe('removeToken()', () => {
    it(' supprime le device_token', async () => {
      mockFrom.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockResolvedValue({ error: null } as never),
      });

      await expect(service.removeToken(USER_ID)).resolves.toBeUndefined();
    });
  });
});
