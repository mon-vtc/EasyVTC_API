import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (obligatoire ESM)
// ══════════════════════════════════════════════════════════════════════════════

const mockFrom = jest.fn();

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: { from: mockFrom },
}));

// Firebase Admin SDK non configuré en tests (FIREBASE_PROJECT_ID absent)
jest.unstable_mockModule('../../config/env.js', () => ({
  env: {
    PORT:                  4000,
    NODE_ENV:              'test',
    FIREBASE_PROJECT_ID:   undefined,
    FIREBASE_PRIVATE_KEY:  undefined,
    FIREBASE_CLIENT_EMAIL: undefined,
    SUPABASE_URL:          'https://test.supabase.co',
    SUPABASE_SECRET_KEY:   'test-key',
  },
}));

const mockFcmSend = jest.fn();
jest.unstable_mockModule('firebase-admin', () => ({
  default: {
    initializeApp: jest.fn().mockReturnValue({}),
    credential:    { cert: jest.fn().mockReturnValue({}) },
    messaging:     jest.fn().mockReturnValue({ send: mockFcmSend }),
    app:           {},
  },
}));

const { NotificationsService } = await import('./notifications.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const USER_ID  = 'user-uuid-111';
const NOTIF_ID = 'notif-uuid-222';

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

const mockReservation = {
  id:             'resa-abc',
  client_id:      USER_ID,
  scheduled_at:   new Date(Date.now() + 60 * 60 * 1000).toISOString(),
  pickup_address: '10 rue de la Paix, Paris',
  dest_address:   'Aéroport CDG Terminal 2E',
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
    in:          jest.fn().mockReturnThis(),
    gte:         jest.fn().mockReturnThis(),
    lte:         jest.fn().mockReturnThis(),
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
    it('insère la notification en BDD et la retourne', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      jest.spyOn(service as any, '_dispatchPush').mockResolvedValue(undefined);
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

    it('lève 500 si l\'insertion BDD échoue', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'db error' }));

      await expect(service.send({
        user_id: USER_ID,
        type:    'trip_assigned',
        channel: 'push',
        title:   'Course assignée',
        body:    'Une course vous a été attribuée.',
      })).rejects.toMatchObject({ status: 500 });
    });

    it('canal push — appelle _dispatchPush avec les bons arguments', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dispatch = jest.spyOn(service as any, '_dispatchPush').mockResolvedValue(undefined);
      mockFrom.mockReturnValueOnce(chain(mockNotif));

      await service.send({
        user_id: USER_ID,
        type:    'reservation_confirmed',
        channel: 'push',
        title:   'Test',
        body:    'Test body',
        data:    { reservation_id: 'resa-123' },
      });

      // fire-and-forget : on attend la micro-tâche suivante
      await Promise.resolve();
      expect(dispatch).toHaveBeenCalledWith(
        NOTIF_ID, USER_ID, 'Test', 'Test body', { reservation_id: 'resa-123' },
      );
    });

    it('canal email — n\'appelle pas _dispatchPush', async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const dispatch = jest.spyOn(service as any, '_dispatchPush').mockResolvedValue(undefined);
      mockFrom.mockReturnValueOnce(chain({ ...mockNotif, channel: 'email' }));

      await service.send({
        user_id: USER_ID,
        type:    'reservation_confirmed',
        channel: 'email',
        title:   'Réservation confirmée',
        body:    'Votre réservation a été prise en compte.',
      });

      expect(dispatch).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // sendToUser()
  // ────────────────────────────────────────────────────────────────────────────
  describe('sendToUser()', () => {
    it('fire-and-forget — ne lève jamais d\'erreur même si send() échoue', () => {
      jest.spyOn(service, 'send').mockRejectedValue({ status: 500, message: 'db error' });
      jest.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => service.sendToUser(
        USER_ID,
        'trip_reminder',
        'Rappel',
        'Votre course est dans 1h',
      )).not.toThrow();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // sendToMany()
  // ────────────────────────────────────────────────────────────────────────────
  describe('sendToMany()', () => {
    it('appelle sendToUser pour chaque userId', () => {
      const spy = jest.spyOn(service, 'sendToUser').mockImplementation(() => {});
      const ids = ['user-1', 'user-2', 'user-3'];

      service.sendToMany(ids, 'trip_assigned', 'Course', 'Assignée');

      expect(spy).toHaveBeenCalledTimes(3);
      expect(spy).toHaveBeenCalledWith('user-1', 'trip_assigned', 'Course', 'Assignée', undefined);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // getForUser()
  // ────────────────────────────────────────────────────────────────────────────
  describe('getForUser()', () => {
    it('retourne les notifications paginées avec unread_count', async () => {
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
      expect(result.limit).toBe(20);
    });

    it('filtre les non-lues avec unread_only = true', async () => {
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

    it('lève 500 si la requête BDD échoue', async () => {
      const listChain = {
        select:  jest.fn().mockReturnThis(),
        eq:      jest.fn().mockReturnThis(),
        order:   jest.fn().mockReturnThis(),
        range:   jest.fn().mockResolvedValue({ data: null, error: { message: 'db error' }, count: null } as never),
      };

      mockFrom.mockReturnValueOnce(listChain);

      await expect(service.getForUser(USER_ID, {}))
        .rejects.toMatchObject({ status: 500 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // markAsRead()
  // ────────────────────────────────────────────────────────────────────────────
  describe('markAsRead()', () => {
    it('marque la notification comme lue', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockNotif))
        .mockReturnValueOnce({
          update: jest.fn().mockReturnThis(),
          eq:     jest.fn().mockResolvedValue({ error: null } as never),
        });

      await expect(service.markAsRead(NOTIF_ID, USER_ID)).resolves.toBeUndefined();
    });

    it('idempotent — ne fait rien si déjà lue', async () => {
      const readNotif = { ...mockNotif, read_at: '2026-04-09T11:00:00Z' };
      mockFrom.mockReturnValueOnce(chain(readNotif));

      await expect(service.markAsRead(NOTIF_ID, USER_ID)).resolves.toBeUndefined();
      expect(mockFrom).toHaveBeenCalledTimes(1);
    });

    it('lève 404 si la notification est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null));
      await expect(service.markAsRead('unknown-id', USER_ID))
        .rejects.toMatchObject({ status: 404 });
    });

    it('lève 403 si la notification appartient à un autre utilisateur', async () => {
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
    it('marque toutes les notifications comme lues et retourne le count', async () => {
      mockFrom.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        is:     jest.fn().mockResolvedValue({ error: null, count: 3 } as never),
      });

      const result = await service.markAllAsRead(USER_ID);
      expect(result.updated).toBe(3);
    });

    it('retourne 0 si aucune notification non-lue', async () => {
      mockFrom.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        is:     jest.fn().mockResolvedValue({ error: null, count: 0 } as never),
      });

      const result = await service.markAllAsRead(USER_ID);
      expect(result.updated).toBe(0);
    });

    it('lève 500 si la mise à jour BDD échoue', async () => {
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
    it('enregistre le device_token FCM', async () => {
      mockFrom.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockResolvedValue({ error: null } as never),
      });

      await expect(service.registerToken(USER_ID, 'fcm-token-abc123'))
        .resolves.toBeUndefined();
    });

    it('lève 500 si la mise à jour échoue', async () => {
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
    it('supprime le device_token', async () => {
      mockFrom.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockResolvedValue({ error: null } as never),
      });

      await expect(service.removeToken(USER_ID)).resolves.toBeUndefined();
    });

    it('lève 500 si la suppression échoue', async () => {
      mockFrom.mockReturnValueOnce({
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockResolvedValue({ error: { message: 'db error' } } as never),
      });

      await expect(service.removeToken(USER_ID))
        .rejects.toMatchObject({ status: 500 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // sendUpcomingTripReminders()
  // ────────────────────────────────────────────────────────────────────────────
  describe('sendUpcomingTripReminders()', () => {
    it('retourne { sent: 0 } si aucune réservation dans la fenêtre', async () => {
      mockFrom.mockReturnValueOnce(chain([]));

      const result = await service.sendUpcomingTripReminders();
      expect(result.sent).toBe(0);
    });

    it('envoie un rappel pour chaque réservation non encore rappelée', async () => {
      mockFrom
        .mockReturnValueOnce(chain([mockReservation]))
        .mockReturnValueOnce(chain([]));

      const spy = jest.spyOn(service, 'sendToUser').mockImplementation(() => {});

      const result = await service.sendUpcomingTripReminders();

      expect(result.sent).toBe(1);
      expect(spy).toHaveBeenCalledTimes(1);
      expect(spy).toHaveBeenCalledWith(
        USER_ID,
        'trip_reminder',
        expect.stringContaining('Rappel'),
        expect.stringContaining(mockReservation.pickup_address),
        { reservation_id: mockReservation.id },
      );
    });

    it('n\'envoie pas de rappel si déjà envoyé (idempotence)', async () => {
      mockFrom
        .mockReturnValueOnce(chain([mockReservation]))
        .mockReturnValueOnce(chain([{ data: { reservation_id: mockReservation.id } }]));

      const spy = jest.spyOn(service, 'sendToUser').mockImplementation(() => {});

      const result = await service.sendUpcomingTripReminders();

      expect(result.sent).toBe(0);
      expect(spy).not.toHaveBeenCalled();
    });

    it('envoie uniquement les réservations non encore rappelées parmi plusieurs', async () => {
      const resa2 = { ...mockReservation, id: 'resa-xyz', client_id: 'user-222' };
      mockFrom
        .mockReturnValueOnce(chain([mockReservation, resa2]))
        .mockReturnValueOnce(chain([{ data: { reservation_id: mockReservation.id } }]));

      const spy = jest.spyOn(service, 'sendToUser').mockImplementation(() => {});

      const result = await service.sendUpcomingTripReminders();

      expect(result.sent).toBe(1);
      expect(spy).toHaveBeenCalledWith(
        'user-222',
        'trip_reminder',
        expect.any(String),
        expect.any(String),
        { reservation_id: 'resa-xyz' },
      );
    });
  });
});
