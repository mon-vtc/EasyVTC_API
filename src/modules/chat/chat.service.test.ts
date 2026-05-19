import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (obligatoire ESM)
// ══════════════════════════════════════════════════════════════════════════════

const mockFrom        = jest.fn();
const mockSendToUser  = jest.fn();

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: { from: mockFrom },
}));

jest.unstable_mockModule('../notifications/notifications.service.js', () => ({
  notificationsService: { sendToUser: mockSendToUser },
}));

const { ChatService } = await import('./chat.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const CLIENT_ID       = 'client-uuid-111';
const DRIVER_USER_ID  = 'driver-user-uuid-222';
const DRIVER_ID       = 'driver-uuid-333';
const ADMIN_ID        = 'admin-uuid-444';
const RESA_ID         = 'resa-uuid-555';
const MSG_ID          = 'msg-uuid-666';

const mockMessage = {
  id:             MSG_ID,
  reservation_id: RESA_ID,
  sender_id:      CLIENT_ID,
  sender_role:    'client',
  content:        'Bonjour, je serai en bas.',
  read_at:        null,
  created_at:     '2026-05-19T10:00:00Z',
};

const mockReservation = {
  id:        RESA_ID,
  client_id: CLIENT_ID,
  driver_id: DRIVER_ID,
};

// ══════════════════════════════════════════════════════════════════════════════
// HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function chain(data: unknown, error: unknown = null, count: number | null = null) {
  const resolved = { data, error, count } as never;
  const c: Record<string, unknown> = {
    select:  jest.fn().mockReturnThis(),
    insert:  jest.fn().mockReturnThis(),
    update:  jest.fn().mockReturnThis(),
    eq:      jest.fn().mockReturnThis(),
    neq:     jest.fn().mockReturnThis(),
    is:      jest.fn().mockReturnThis(),
    in:      jest.fn().mockReturnThis(),
    order:   jest.fn().mockReturnThis(),
    range:   jest.fn().mockReturnThis(),
    single:  jest.fn().mockResolvedValue(resolved),
    then: (resolve: (v: unknown) => void, reject?: (e: unknown) => void) =>
      Promise.resolve(resolved).then(resolve, reject),
  };
  return c;
}

// Vide la file de micro-tâches pour laisser les void async s'exécuter
const flushPromises = () => new Promise<void>(resolve => process.nextTick(resolve));

// ══════════════════════════════════════════════════════════════════════════════
// TESTS
// ══════════════════════════════════════════════════════════════════════════════

describe('ChatService', () => {
  let service: InstanceType<typeof ChatService>;

  beforeEach(() => {
    service = new ChatService();
    jest.resetAllMocks();
    mockSendToUser.mockImplementation(() => {});
  });

  // ────────────────────────────────────────────────────────────────────────────
  // sendMessage()
  // ────────────────────────────────────────────────────────────────────────────
  describe('sendMessage()', () => {

    it('client — envoie un message et retourne le ChatMessage', async () => {
      jest.spyOn(service as any, '_notifyRecipient').mockImplementation(() => {});
      mockFrom
        .mockReturnValueOnce(chain(mockReservation))  // _assertAccess
        .mockReturnValueOnce(chain(mockMessage));      // INSERT

      const result = await service.sendMessage(RESA_ID, CLIENT_ID, 'client', 'Bonjour, je serai en bas.');

      expect(result.id).toBe(MSG_ID);
      expect(result.content).toBe('Bonjour, je serai en bas.');
      expect(result.sender_role).toBe('client');
    });

    it('admin — envoie un message sans vérification BDD dans _assertAccess', async () => {
      jest.spyOn(service as any, '_notifyRecipient').mockImplementation(() => {});
      mockFrom.mockReturnValueOnce(chain(mockMessage)); // INSERT uniquement

      const result = await service.sendMessage(RESA_ID, ADMIN_ID, 'admin', 'Votre chauffeur arrive.');

      expect(result.id).toBe(MSG_ID);
      expect(mockFrom).toHaveBeenCalledTimes(1);
    });

    it('driver propriétaire — envoie un message avec succès', async () => {
      jest.spyOn(service as any, '_notifyRecipient').mockImplementation(() => {});
      mockFrom
        .mockReturnValueOnce(chain(mockReservation))    // _assertAccess: reservation
        .mockReturnValueOnce(chain({ id: DRIVER_ID }))  // _assertAccess: driverRecord
        .mockReturnValueOnce(chain({ ...mockMessage, sender_id: DRIVER_USER_ID, sender_role: 'driver' })); // INSERT

      const result = await service.sendMessage(RESA_ID, DRIVER_USER_ID, 'driver', 'En route.');

      expect(result.sender_role).toBe('driver');
    });

    it('lève 500 si l\'INSERT échoue', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockReservation))                    // _assertAccess
        .mockReturnValueOnce(chain(null, { message: 'db error' }));     // INSERT

      await expect(service.sendMessage(RESA_ID, CLIENT_ID, 'client', 'Test'))
        .rejects.toMatchObject({ status: 500 });
    });

    it('client non propriétaire → lève 403', async () => {
      const otherResa = { ...mockReservation, client_id: 'other-client-id' };
      mockFrom.mockReturnValueOnce(chain(otherResa));

      await expect(service.sendMessage(RESA_ID, CLIENT_ID, 'client', 'Test'))
        .rejects.toMatchObject({ status: 403 });
    });

    it('réservation introuvable → lève 404', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(service.sendMessage(RESA_ID, CLIENT_ID, 'client', 'Test'))
        .rejects.toMatchObject({ status: 404 });
    });

    it('driver non assigné à la réservation → lève 403', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ ...mockReservation, driver_id: 'other-driver-id' })) // reservation
        .mockReturnValueOnce(chain({ id: DRIVER_ID }));                                    // driverRecord

      await expect(service.sendMessage(RESA_ID, DRIVER_USER_ID, 'driver', 'Test'))
        .rejects.toMatchObject({ status: 403 });
    });

    it('appelle _notifyRecipient avec les bons arguments après INSERT réussi', async () => {
      const spy = jest.spyOn(service as any, '_notifyRecipient').mockImplementation(() => {});
      mockFrom
        .mockReturnValueOnce(chain(mockReservation))
        .mockReturnValueOnce(chain(mockMessage));

      await service.sendMessage(RESA_ID, CLIENT_ID, 'client', 'Bonjour');

      expect(spy).toHaveBeenCalledWith(RESA_ID, CLIENT_ID, 'client', 'Bonjour');
    });

    it('ne pas appeler _notifyRecipient si INSERT échoue', async () => {
      const spy = jest.spyOn(service as any, '_notifyRecipient').mockImplementation(() => {});
      mockFrom
        .mockReturnValueOnce(chain(mockReservation))
        .mockReturnValueOnce(chain(null, { message: 'db error' }));

      await expect(service.sendMessage(RESA_ID, CLIENT_ID, 'client', 'Test')).rejects.toBeDefined();
      expect(spy).not.toHaveBeenCalled();
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // getMessages()
  // ────────────────────────────────────────────────────────────────────────────
  describe('getMessages()', () => {

    it('retourne les messages paginés avec total et total_pages', async () => {
      const listChain = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockReturnThis(),
        range:  jest.fn().mockResolvedValue({ data: [mockMessage], error: null, count: 1 } as never),
      };
      const markReadChain = {
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        neq:    jest.fn().mockReturnThis(),
        is:     jest.fn().mockResolvedValue({ error: null } as never),
      };

      mockFrom
        .mockReturnValueOnce(chain(mockReservation))  // _assertAccess
        .mockReturnValueOnce(listChain)               // SELECT messages
        .mockReturnValueOnce(markReadChain);           // mark as read (fire-and-forget)

      const result = await service.getMessages(RESA_ID, CLIENT_ID, 'client', 1, 50);

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].id).toBe(MSG_ID);
      expect(result.total).toBe(1);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.total_pages).toBe(1);
    });

    it('total_pages calculé correctement (51 messages, limit 50 → 2 pages)', async () => {
      const listChain = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockReturnThis(),
        range:  jest.fn().mockResolvedValue({ data: Array(50).fill(mockMessage), error: null, count: 51 } as never),
      };
      const markReadChain = {
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        neq:    jest.fn().mockReturnThis(),
        is:     jest.fn().mockResolvedValue({ error: null } as never),
      };

      mockFrom
        .mockReturnValueOnce(chain(mockReservation))
        .mockReturnValueOnce(listChain)
        .mockReturnValueOnce(markReadChain);

      const result = await service.getMessages(RESA_ID, CLIENT_ID, 'client', 1, 50);

      expect(result.total).toBe(51);
      expect(result.total_pages).toBe(2);
    });

    it('admin accède à toute conversation sans vérification BDD', async () => {
      const listChain = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockReturnThis(),
        range:  jest.fn().mockResolvedValue({ data: [], error: null, count: 0 } as never),
      };
      const markReadChain = {
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        neq:    jest.fn().mockReturnThis(),
        is:     jest.fn().mockResolvedValue({ error: null } as never),
      };

      mockFrom
        .mockReturnValueOnce(listChain)
        .mockReturnValueOnce(markReadChain);

      const result = await service.getMessages(RESA_ID, ADMIN_ID, 'admin', 1, 50);

      expect(result.messages).toHaveLength(0);
      expect(mockFrom).toHaveBeenCalledTimes(2); // pas d'appel _assertAccess pour admin
    });

    it('lève 500 si la requête SELECT échoue', async () => {
      const errorChain = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockReturnThis(),
        range:  jest.fn().mockResolvedValue({ data: null, error: { message: 'db error' }, count: null } as never),
      };

      mockFrom
        .mockReturnValueOnce(chain(mockReservation))
        .mockReturnValueOnce(errorChain);

      await expect(service.getMessages(RESA_ID, CLIENT_ID, 'client', 1, 50))
        .rejects.toMatchObject({ status: 500 });
    });

    it('client non propriétaire → lève 403', async () => {
      mockFrom.mockReturnValueOnce(chain({ ...mockReservation, client_id: 'other-client-id' }));

      await expect(service.getMessages(RESA_ID, CLIENT_ID, 'client', 1, 50))
        .rejects.toMatchObject({ status: 403 });
    });

    it('réservation introuvable → lève 404', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(service.getMessages(RESA_ID, CLIENT_ID, 'client', 1, 50))
        .rejects.toMatchObject({ status: 404 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // listActiveConversations()
  // ────────────────────────────────────────────────────────────────────────────
  describe('listActiveConversations()', () => {

    it('retourne les conversations avec last_message, unread_count, client et driver', async () => {
      const mockResaRow = {
        id:             RESA_ID,
        scheduled_at:   '2026-05-20T09:00:00Z',
        pickup_address: '1 rue de la Paix, Paris',
        dest_address:   'CDG Terminal 2E',
        client:         { id: CLIENT_ID,      first_name: 'Alice', last_name: 'Dupont' },
        driver:         { user: { id: DRIVER_USER_ID, first_name: 'Bob',   last_name: 'Martin' } },
      };
      const resaChain = {
        select: jest.fn().mockReturnThis(),
        in:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockReturnThis(),
        range:  jest.fn().mockResolvedValue({ data: [mockResaRow], error: null, count: 1 } as never),
      };
      const lastMsgChain = {
        select: jest.fn().mockReturnThis(),
        in:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockResolvedValue({ data: [{ reservation_id: RESA_ID, content: 'Bonjour', created_at: '2026-05-19T10:00:00Z' }], error: null } as never),
      };
      const unreadChain = {
        select: jest.fn().mockReturnThis(),
        in:     jest.fn().mockReturnThis(),
        is:     jest.fn().mockResolvedValue({ data: [{ reservation_id: RESA_ID }, { reservation_id: RESA_ID }], error: null } as never),
      };

      mockFrom
        .mockReturnValueOnce(resaChain)
        .mockReturnValueOnce(lastMsgChain)
        .mockReturnValueOnce(unreadChain);

      const result = await service.listActiveConversations(1, 20);

      expect(result.conversations).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.conversations[0].last_message).toBe('Bonjour');
      expect(result.conversations[0].unread_count).toBe(2);
      expect(result.conversations[0].client?.first_name).toBe('Alice');
      expect(result.conversations[0].driver?.first_name).toBe('Bob');
    });

    it('retourne liste vide si aucune réservation active', async () => {
      const emptyChain = {
        select: jest.fn().mockReturnThis(),
        in:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockReturnThis(),
        range:  jest.fn().mockResolvedValue({ data: [], error: null, count: 0 } as never),
      };

      mockFrom.mockReturnValueOnce(emptyChain);

      const result = await service.listActiveConversations(1, 20);

      expect(result.conversations).toHaveLength(0);
      expect(result.total).toBe(0);
      expect(result.total_pages).toBe(0);
    });

    it('unread_count = 0 et last_message = null si aucun message dans la conversation', async () => {
      const mockResaRow = {
        id: RESA_ID, scheduled_at: '2026-05-20T09:00:00Z',
        pickup_address: 'Départ', dest_address: 'Arrivée',
        client: { id: CLIENT_ID, first_name: 'Alice', last_name: 'Dupont' },
        driver: null,
      };
      const resaChain = {
        select: jest.fn().mockReturnThis(),
        in:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockReturnThis(),
        range:  jest.fn().mockResolvedValue({ data: [mockResaRow], error: null, count: 1 } as never),
      };
      const lastMsgChain = {
        select: jest.fn().mockReturnThis(),
        in:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockResolvedValue({ data: [], error: null } as never),
      };
      const unreadChain = {
        select: jest.fn().mockReturnThis(),
        in:     jest.fn().mockReturnThis(),
        is:     jest.fn().mockResolvedValue({ data: [], error: null } as never),
      };

      mockFrom
        .mockReturnValueOnce(resaChain)
        .mockReturnValueOnce(lastMsgChain)
        .mockReturnValueOnce(unreadChain);

      const result = await service.listActiveConversations(1, 20);

      expect(result.conversations[0].last_message).toBeNull();
      expect(result.conversations[0].unread_count).toBe(0);
      expect(result.conversations[0].driver).toBeNull();
    });

    it('lève 500 si la requête réservations échoue', async () => {
      const errorChain = {
        select: jest.fn().mockReturnThis(),
        in:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockReturnThis(),
        range:  jest.fn().mockResolvedValue({ data: null, error: { message: 'db error' }, count: null } as never),
      };

      mockFrom.mockReturnValueOnce(errorChain);

      await expect(service.listActiveConversations(1, 20))
        .rejects.toMatchObject({ status: 500 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // _notifyRecipient() — testée via sendMessage()
  // ────────────────────────────────────────────────────────────────────────────
  describe('_notifyRecipient() — notification push', () => {

    it('client envoie → notifie le chauffeur avec reservation_id en data', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockReservation))              // _assertAccess
        .mockReturnValueOnce(chain(mockMessage))                  // INSERT
        .mockReturnValueOnce(chain(mockReservation))              // _notifyRecipient: reservation
        .mockReturnValueOnce(chain({ user_id: DRIVER_USER_ID })); // _notifyRecipient: driver

      await service.sendMessage(RESA_ID, CLIENT_ID, 'client', 'Bonjour');
      await flushPromises();

      expect(mockSendToUser).toHaveBeenCalledWith(
        DRIVER_USER_ID,
        'new_message',
        'Nouveau message',
        'Bonjour',
        { reservation_id: RESA_ID },
      );
    });

    it('driver envoie → notifie le client', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockReservation))              // _assertAccess: reservation
        .mockReturnValueOnce(chain({ id: DRIVER_ID }))            // _assertAccess: driverRecord
        .mockReturnValueOnce(chain({ ...mockMessage, sender_id: DRIVER_USER_ID, sender_role: 'driver' })) // INSERT
        .mockReturnValueOnce(chain(mockReservation));             // _notifyRecipient: reservation

      await service.sendMessage(RESA_ID, DRIVER_USER_ID, 'driver', 'Je suis en route.');
      await flushPromises();

      expect(mockSendToUser).toHaveBeenCalledWith(
        CLIENT_ID,
        'new_message',
        'Nouveau message',
        'Je suis en route.',
        { reservation_id: RESA_ID },
      );
    });

    it('admin envoie → notifie le client', async () => {
      mockFrom
        .mockReturnValueOnce(chain({ ...mockMessage, sender_id: ADMIN_ID, sender_role: 'admin' })) // INSERT
        .mockReturnValueOnce(chain(mockReservation)); // _notifyRecipient: reservation

      await service.sendMessage(RESA_ID, ADMIN_ID, 'admin', 'Votre chauffeur arrive.');
      await flushPromises();

      expect(mockSendToUser).toHaveBeenCalledWith(
        CLIENT_ID,
        'new_message',
        'Nouveau message',
        'Votre chauffeur arrive.',
        { reservation_id: RESA_ID },
      );
    });

    it('pas de notification si la réservation n\'a pas de chauffeur assigné', async () => {
      const resaWithoutDriver = { ...mockReservation, driver_id: null };

      mockFrom
        .mockReturnValueOnce(chain(resaWithoutDriver))  // _assertAccess
        .mockReturnValueOnce(chain(mockMessage))         // INSERT
        .mockReturnValueOnce(chain(resaWithoutDriver));  // _notifyRecipient: reservation

      await service.sendMessage(RESA_ID, CLIENT_ID, 'client', 'Test');
      await flushPromises();

      expect(mockSendToUser).not.toHaveBeenCalled();
    });

    it('preview tronquée à 60 chars + "…" pour les messages longs', async () => {
      const longContent = 'A'.repeat(80);

      mockFrom
        .mockReturnValueOnce(chain(mockReservation))
        .mockReturnValueOnce(chain({ ...mockMessage, content: longContent }))
        .mockReturnValueOnce(chain(mockReservation))
        .mockReturnValueOnce(chain({ user_id: DRIVER_USER_ID }));

      await service.sendMessage(RESA_ID, CLIENT_ID, 'client', longContent);
      await flushPromises();

      const preview = mockSendToUser.mock.calls[0]?.[3] as string;
      expect(preview).toHaveLength(61); // 60 + '…'
      expect(preview).toMatch(/…$/);
    });

    it('preview non tronquée si message ≤ 60 chars', async () => {
      const shortContent = 'Bonjour !';

      mockFrom
        .mockReturnValueOnce(chain(mockReservation))
        .mockReturnValueOnce(chain({ ...mockMessage, content: shortContent }))
        .mockReturnValueOnce(chain(mockReservation))
        .mockReturnValueOnce(chain({ user_id: DRIVER_USER_ID }));

      await service.sendMessage(RESA_ID, CLIENT_ID, 'client', shortContent);
      await flushPromises();

      const preview = mockSendToUser.mock.calls[0]?.[3] as string;
      expect(preview).toBe('Bonjour !');
    });

    it('erreur silencieuse si _notifyRecipient échoue — sendMessage ne rejette pas', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockReservation))
        .mockReturnValueOnce(chain(mockMessage))
        .mockReturnValueOnce(chain(null, { message: 'db error' })); // _notifyRecipient: reservation KO

      jest.spyOn(console, 'error').mockImplementation(() => {});

      await expect(service.sendMessage(RESA_ID, CLIENT_ID, 'client', 'Test'))
        .resolves.toBeDefined();
    });
  });
});
