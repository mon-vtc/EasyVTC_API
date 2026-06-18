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

// ══════════════════════════════════════════════════════════════════════════════
// TESTS — ChatService.listConversations()
// ══════════════════════════════════════════════════════════════════════════════

const RESA_ID_2    = 'resa-uuid-B';
const DRIVER_USER_2 = 'driver-user-uuid-999';

const mockMsgA = {
  reservation_id: RESA_ID,
  content:        'Bonjour, je serai en bas.',
  created_at:     '2026-05-21T10:00:00Z',
  sender_role:    'client',
  sender_id:      CLIENT_ID,
};
const mockMsgB = {
  reservation_id: RESA_ID_2,
  content:        'En route !',
  created_at:     '2026-05-21T11:00:00Z', // plus récent → doit apparaître en tête
  sender_role:    'driver',
  sender_id:      DRIVER_USER_ID,
};

const mockResaA = {
  id:             RESA_ID,
  scheduled_at:   '2026-05-22T09:00:00Z',
  status:         'assigned',
  pickup_address: '1 rue de la Paix, Paris',
  dest_address:   'CDG Terminal 2E',
  client:  { id: CLIENT_ID,      first_name: 'Alice', last_name: 'Dupont',  profile_photo_url: null },
  driver:  { user: { id: DRIVER_USER_ID, first_name: 'Bob',   last_name: 'Martin', profile_photo_url: null } },
};
const mockResaB = {
  id:             RESA_ID_2,
  scheduled_at:   '2026-05-23T10:00:00Z',
  status:         'in_progress',
  pickup_address: 'Gare du Nord',
  dest_address:   'Orly Sud',
  client:  { id: CLIENT_ID,       first_name: 'Alice', last_name: 'Dupont',  profile_photo_url: null },
  driver:  { user: { id: DRIVER_USER_2, first_name: 'Luc',   last_name: 'Bernard', profile_photo_url: null } },
};

describe('ChatService — listConversations()', () => {
  let service: InstanceType<typeof ChatService>;

  beforeEach(() => {
    service = new ChatService();
    jest.resetAllMocks();
  });

  it('client — retourne les conversations triées par dernier message DESC', async () => {
    // Requête 1 : reservation IDs du client
    const resIdsChain = {
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockResolvedValue({ data: [{ id: RESA_ID }, { id: RESA_ID_2 }], error: null } as never),
    };
    // Requête 2 : messages triés DESC (RESA_ID_2 plus récent → en tête)
    const msgChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      order:  jest.fn().mockResolvedValue({ data: [mockMsgB, mockMsgA], error: null } as never),
    };
    // Requêtes 3+4 parallèles
    const resaChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockResolvedValue({ data: [mockResaA, mockResaB], error: null } as never),
    };
    const unreadChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      neq:    jest.fn().mockReturnThis(),
      is:     jest.fn().mockResolvedValue({ data: [{ reservation_id: RESA_ID }], error: null } as never),
    };

    mockFrom
      .mockReturnValueOnce(resIdsChain)
      .mockReturnValueOnce(msgChain)
      .mockReturnValueOnce(resaChain)
      .mockReturnValueOnce(unreadChain);

    const result = await service.listConversations(CLIENT_ID, 'client', 1, 20);

    expect(result.conversations).toHaveLength(2);
    expect(result.total).toBe(2);
    // RESA_ID_2 (message à 11h) doit être en tête
    expect(result.conversations[0].reservation_id).toBe(RESA_ID_2);
    expect(result.conversations[1].reservation_id).toBe(RESA_ID);
  });

  it('unread_count correct : 1 non-lu sur RESA_ID', async () => {
    const resIdsChain = {
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockResolvedValue({ data: [{ id: RESA_ID }], error: null } as never),
    };
    const msgChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      order:  jest.fn().mockResolvedValue({ data: [mockMsgA], error: null } as never),
    };
    const resaChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockResolvedValue({ data: [mockResaA], error: null } as never),
    };
    const unreadChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      neq:    jest.fn().mockReturnThis(),
      is:     jest.fn().mockResolvedValue({ data: [{ reservation_id: RESA_ID }], error: null } as never),
    };

    mockFrom
      .mockReturnValueOnce(resIdsChain)
      .mockReturnValueOnce(msgChain)
      .mockReturnValueOnce(resaChain)
      .mockReturnValueOnce(unreadChain);

    const result = await service.listConversations(CLIENT_ID, 'client', 1, 20);

    expect(result.conversations[0].unread_count).toBe(1);
  });

  it('is_mine = true quand le dernier message vient du user courant', async () => {
    const resIdsChain = {
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockResolvedValue({ data: [{ id: RESA_ID }], error: null } as never),
    };
    const msgChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      order:  jest.fn().mockResolvedValue({ data: [mockMsgA], error: null } as never), // sender = CLIENT_ID
    };
    const resaChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockResolvedValue({ data: [mockResaA], error: null } as never),
    };
    const unreadChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      neq:    jest.fn().mockReturnThis(),
      is:     jest.fn().mockResolvedValue({ data: [], error: null } as never),
    };

    mockFrom
      .mockReturnValueOnce(resIdsChain)
      .mockReturnValueOnce(msgChain)
      .mockReturnValueOnce(resaChain)
      .mockReturnValueOnce(unreadChain);

    const result = await service.listConversations(CLIENT_ID, 'client', 1, 20);

    expect(result.conversations[0].last_message?.is_mine).toBe(true);
  });

  it('other_party = driver pour un client, avec role = "driver"', async () => {
    const resIdsChain = {
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockResolvedValue({ data: [{ id: RESA_ID }], error: null } as never),
    };
    const msgChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      order:  jest.fn().mockResolvedValue({ data: [mockMsgA], error: null } as never),
    };
    const resaChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockResolvedValue({ data: [mockResaA], error: null } as never),
    };
    const unreadChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      neq:    jest.fn().mockReturnThis(),
      is:     jest.fn().mockResolvedValue({ data: [], error: null } as never),
    };

    mockFrom
      .mockReturnValueOnce(resIdsChain)
      .mockReturnValueOnce(msgChain)
      .mockReturnValueOnce(resaChain)
      .mockReturnValueOnce(unreadChain);

    const result = await service.listConversations(CLIENT_ID, 'client', 1, 20);

    expect(result.conversations[0].other_party?.role).toBe('driver');
    expect(result.conversations[0].other_party?.first_name).toBe('Bob');
  });

  it('preview tronquée à 80 chars + "…" si le message est long', async () => {
    const longContent = 'X'.repeat(100);
    const resIdsChain = {
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockResolvedValue({ data: [{ id: RESA_ID }], error: null } as never),
    };
    const msgChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      order:  jest.fn().mockResolvedValue({
        data: [{ ...mockMsgA, content: longContent }], error: null,
      } as never),
    };
    const resaChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockResolvedValue({ data: [mockResaA], error: null } as never),
    };
    const unreadChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      neq:    jest.fn().mockReturnThis(),
      is:     jest.fn().mockResolvedValue({ data: [], error: null } as never),
    };

    mockFrom
      .mockReturnValueOnce(resIdsChain)
      .mockReturnValueOnce(msgChain)
      .mockReturnValueOnce(resaChain)
      .mockReturnValueOnce(unreadChain);

    const result = await service.listConversations(CLIENT_ID, 'client', 1, 20);
    const preview = result.conversations[0].last_message?.content ?? '';

    expect(preview).toHaveLength(81); // 80 + '…'
    expect(preview).toMatch(/…$/);
  });

  it('retourne liste vide si aucune réservation pour le client', async () => {
    const resIdsChain = {
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockResolvedValue({ data: [], error: null } as never),
    };
    mockFrom.mockReturnValueOnce(resIdsChain);

    const result = await service.listConversations(CLIENT_ID, 'client', 1, 20);

    expect(result.conversations).toHaveLength(0);
    expect(result.total).toBe(0);
    expect(mockFrom).toHaveBeenCalledTimes(1); // s'arrête tôt
  });

  it('retourne liste vide si aucun message dans les réservations', async () => {
    const resIdsChain = {
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockResolvedValue({ data: [{ id: RESA_ID }], error: null } as never),
    };
    const msgChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      order:  jest.fn().mockResolvedValue({ data: [], error: null } as never),
    };
    mockFrom
      .mockReturnValueOnce(resIdsChain)
      .mockReturnValueOnce(msgChain);

    const result = await service.listConversations(CLIENT_ID, 'client', 1, 20);

    expect(result.conversations).toHaveLength(0);
    expect(result.total).toBe(0);
  });

  it('driver — résout driverId avant de requêter les réservations', async () => {
    const driverRecordChain = {
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: { id: DRIVER_ID }, error: null } as never),
    };
    const resIdsChain = {
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockResolvedValue({ data: [], error: null } as never),
    };
    mockFrom
      .mockReturnValueOnce(driverRecordChain)
      .mockReturnValueOnce(resIdsChain);

    const result = await service.listConversations(DRIVER_USER_ID, 'driver', 1, 20);

    expect(result.conversations).toHaveLength(0);
    // Le premier appel doit être pour résoudre le driverId
    expect(driverRecordChain.eq).toHaveBeenCalledWith('user_id', DRIVER_USER_ID);
    // Le deuxième filtre sur driver_id (le record id, pas user_id)
    expect(resIdsChain.eq).toHaveBeenCalledWith('driver_id', DRIVER_ID);
  });

  it('driver introuvable — retourne liste vide sans requêtes supplémentaires', async () => {
    const driverRecordChain = {
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockReturnThis(),
      single: jest.fn().mockResolvedValue({ data: null, error: null } as never),
    };
    mockFrom.mockReturnValueOnce(driverRecordChain);

    const result = await service.listConversations(DRIVER_USER_ID, 'driver', 1, 20);

    expect(result.conversations).toHaveLength(0);
    expect(mockFrom).toHaveBeenCalledTimes(1); // s'arrête tôt
  });

  it('pagination : page 2 retourne les bons IDs', async () => {
    const ids = ['r1', 'r2', 'r3', 'r4', 'r5'];
    const msgs = ids.map((id, i) => ({
      reservation_id: id,
      content: `msg ${i}`,
      created_at: `2026-05-21T${String(10 + i).padStart(2, '0')}:00:00Z`,
      sender_role: 'client',
      sender_id: CLIENT_ID,
    })).reverse(); // DESC order (le plus récent en tête)

    const resIdsChain = {
      select: jest.fn().mockReturnThis(),
      eq:     jest.fn().mockResolvedValue({ data: ids.map(id => ({ id })), error: null } as never),
    };
    const msgChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      order:  jest.fn().mockResolvedValue({ data: msgs, error: null } as never),
    };
    // Page 2, limit 2 → slice(2, 4) = ['r3', 'r2'] (ids reversées dans msgs)
    const resaChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockResolvedValue({ data: [], error: null } as never),
    };
    const unreadChain = {
      select: jest.fn().mockReturnThis(),
      in:     jest.fn().mockReturnThis(),
      neq:    jest.fn().mockReturnThis(),
      is:     jest.fn().mockResolvedValue({ data: [], error: null } as never),
    };

    mockFrom
      .mockReturnValueOnce(resIdsChain)
      .mockReturnValueOnce(msgChain)
      .mockReturnValueOnce(resaChain)
      .mockReturnValueOnce(unreadChain);

    const result = await service.listConversations(CLIENT_ID, 'client', 2, 2);

    expect(result.total).toBe(5);
    expect(result.total_pages).toBe(3);
    expect(result.page).toBe(2);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TESTS — ChatService (canal support)
// ══════════════════════════════════════════════════════════════════════════════

const TICKET_ID = 'ticket-uuid-777';
const mockTicket = {
  id:         TICKET_ID,
  user_id:    CLIENT_ID,
  user_role:  'client',
  category:   'reservation',
  subject:    'Problème avec ma réservation',
  status:     'pending',
  priority:   'normal',
  created_at: '2026-05-21T10:00:00Z',
  updated_at: '2026-05-21T10:00:00Z',
  closed_at:  null,
};

const mockSupportMessage = {
  id:          'smsg-uuid-888',
  ticket_id:   TICKET_ID,
  sender_id:   CLIENT_ID,
  sender_role: 'client',
  content:     "Mon chauffeur n'est pas arrivé.",
  created_at:  '2026-05-21T10:00:00Z',
  read_at:     null,
};

describe('ChatService — Support', () => {
  let service: InstanceType<typeof ChatService>;

  beforeEach(() => {
    service = new ChatService();
    jest.resetAllMocks();
    mockSendToUser.mockImplementation(() => {});
  });

  // ────────────────────────────────────────────────────────────────────────────
  // createSupportTicket()
  // ────────────────────────────────────────────────────────────────────────────
  describe('createSupportTicket()', () => {

    it('crée un ticket et retourne le détail avec le message initial', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockTicket))
        .mockReturnValueOnce(chain(mockSupportMessage));

      const result = await service.createSupportTicket(CLIENT_ID, 'client', {
        category: 'reservation',
        subject:  'Problème avec ma réservation',
        message:  "Mon chauffeur n'est pas arrivé.",
      });

      expect(result.id).toBe(TICKET_ID);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe("Mon chauffeur n'est pas arrivé.");
    });

    it('lève 403 si le rôle est admin', async () => {
      await expect(
        service.createSupportTicket(ADMIN_ID, 'admin', {
          category: 'other',
          subject:  'Test',
          message:  'Test',
        }),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("lève 500 si l'INSERT ticket échoue", async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'db error' }));

      await expect(
        service.createSupportTicket(CLIENT_ID, 'client', {
          category: 'payment',
          subject:  'Sujet',
          message:  'Message',
        }),
      ).rejects.toMatchObject({ status: 500 });
    });

    it("lève 500 si l'INSERT message initial échoue", async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockTicket))
        .mockReturnValueOnce(chain(null, { message: 'db error' }));

      await expect(
        service.createSupportTicket(CLIENT_ID, 'client', {
          category: 'technical',
          subject:  'Sujet',
          message:  'Message',
        }),
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // listSupportTickets()
  // ────────────────────────────────────────────────────────────────────────────
  describe('listSupportTickets()', () => {

    it('client — liste uniquement ses propres tickets', async () => {
      const listChain = {
        select: jest.fn().mockReturnThis(),
        order:  jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        range:  jest.fn().mockResolvedValue({ data: [{ ...mockTicket, user: null }], error: null, count: 1 } as never),
      };
      mockFrom.mockReturnValueOnce(listChain);

      const result = await service.listSupportTickets(CLIENT_ID, 'client', { page: 1, limit: 20 });

      expect(result.tickets).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(listChain.eq).toHaveBeenCalledWith('user_id', CLIENT_ID);
    });

    it('admin — liste tous les tickets sans filtre user_id', async () => {
      const listChain = {
        select: jest.fn().mockReturnThis(),
        order:  jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        range:  jest.fn().mockResolvedValue({ data: [], error: null, count: 0 } as never),
      };
      mockFrom.mockReturnValueOnce(listChain);

      const result = await service.listSupportTickets(ADMIN_ID, 'admin', { page: 1, limit: 20 });

      expect(result.total).toBe(0);
      expect(listChain.eq).not.toHaveBeenCalledWith('user_id', ADMIN_ID);
    });

    it('filtre par statut si fourni', async () => {
      const listChain = {
        select: jest.fn().mockReturnThis(),
        order:  jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        range:  jest.fn().mockResolvedValue({ data: [], error: null, count: 0 } as never),
      };
      mockFrom.mockReturnValueOnce(listChain);

      await service.listSupportTickets(ADMIN_ID, 'admin', { page: 1, limit: 20, status: 'pending' });

      expect(listChain.eq).toHaveBeenCalledWith('status', 'pending');
    });

    it('lève 500 si la requête échoue', async () => {
      const errorChain = {
        select: jest.fn().mockReturnThis(),
        order:  jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        range:  jest.fn().mockResolvedValue({ data: null, error: { message: 'db error' }, count: null } as never),
      };
      mockFrom.mockReturnValueOnce(errorChain);

      await expect(
        service.listSupportTickets(CLIENT_ID, 'client', { page: 1, limit: 20 }),
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // getSupportTicketDetail()
  // ────────────────────────────────────────────────────────────────────────────
  describe('getSupportTicketDetail()', () => {

    it('retourne le ticket avec ses messages', async () => {
      const ticketChain = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { ...mockTicket, user: null }, error: null } as never),
      };
      const msgChain = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockResolvedValue({ data: [mockSupportMessage], error: null } as never),
      };
      const markReadChain = {
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        neq:    jest.fn().mockReturnThis(),
        is:     jest.fn().mockResolvedValue({ error: null } as never),
      };

      mockFrom
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(msgChain)
        .mockReturnValueOnce(markReadChain);

      const result = await service.getSupportTicketDetail(TICKET_ID, CLIENT_ID, 'client');

      expect(result.id).toBe(TICKET_ID);
      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].content).toBe("Mon chauffeur n'est pas arrivé.");
    });

    it('lève 404 si le ticket est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(
        service.getSupportTicketDetail(TICKET_ID, CLIENT_ID, 'client'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("lève 403 si le client tente d'accéder au ticket d'un autre", async () => {
      const ticketChain = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { ...mockTicket, user_id: 'other-user-id', user: null }, error: null } as never),
      };
      mockFrom.mockReturnValueOnce(ticketChain);

      await expect(
        service.getSupportTicketDetail(TICKET_ID, CLIENT_ID, 'client'),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("admin accède à n'importe quel ticket sans vérification user_id", async () => {
      const ticketChain = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: { ...mockTicket, user_id: 'other-user-id', user: null }, error: null } as never),
      };
      const msgChain = {
        select: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        order:  jest.fn().mockResolvedValue({ data: [], error: null } as never),
      };
      const markReadChain = {
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        neq:    jest.fn().mockReturnThis(),
        is:     jest.fn().mockResolvedValue({ error: null } as never),
      };

      mockFrom
        .mockReturnValueOnce(ticketChain)
        .mockReturnValueOnce(msgChain)
        .mockReturnValueOnce(markReadChain);

      const result = await service.getSupportTicketDetail(TICKET_ID, ADMIN_ID, 'admin');
      expect(result.id).toBe(TICKET_ID);
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // updateSupportTicketStatus()
  // ────────────────────────────────────────────────────────────────────────────
  describe('updateSupportTicketStatus()', () => {

    it('met à jour le statut et retourne le ticket modifié', async () => {
      const updatedTicket = { ...mockTicket, status: 'in_progress' };
      mockFrom.mockReturnValueOnce(chain(updatedTicket));

      const result = await service.updateSupportTicketStatus(TICKET_ID, 'in_progress');

      expect(result.status).toBe('in_progress');
    });

    it('met closed_at quand statut = resolved', async () => {
      const updatedTicket = { ...mockTicket, status: 'resolved', closed_at: '2026-05-21T11:00:00Z' };
      const updateChain = {
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: updatedTicket, error: null } as never),
      };
      mockFrom.mockReturnValueOnce(updateChain);

      const result = await service.updateSupportTicketStatus(TICKET_ID, 'resolved');

      expect(result.status).toBe('resolved');
      expect(result.closed_at).toBeTruthy();
    });

    it('met à jour la priorité si fournie', async () => {
      const updatedTicket = { ...mockTicket, priority: 'urgent' };
      const updateChain = {
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
        select: jest.fn().mockReturnThis(),
        single: jest.fn().mockResolvedValue({ data: updatedTicket, error: null } as never),
      };
      mockFrom.mockReturnValueOnce(updateChain);

      const result = await service.updateSupportTicketStatus(TICKET_ID, 'in_progress', 'urgent');

      expect(result.priority).toBe('urgent');
    });

    it('lève 404 si le ticket est introuvable (PGRST116)', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { code: 'PGRST116', message: 'not found' }));

      await expect(
        service.updateSupportTicketStatus(TICKET_ID, 'resolved'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('lève 500 si la requête UPDATE échoue', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { code: 'OTHER', message: 'db error' }));

      await expect(
        service.updateSupportTicketStatus(TICKET_ID, 'in_progress'),
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // sendSupportMessage()
  // ────────────────────────────────────────────────────────────────────────────
  describe('sendSupportMessage()', () => {

    it('client propriétaire — envoie un message avec succès', async () => {
      jest.spyOn(service as any, '_notifySupportRecipient').mockImplementation(() => {});
      mockFrom
        .mockReturnValueOnce(chain(mockTicket))
        .mockReturnValueOnce(chain(mockSupportMessage));

      const result = await service.sendSupportMessage(TICKET_ID, CLIENT_ID, 'client', "Mon chauffeur n'est pas arrivé.");

      expect(result.id).toBe(mockSupportMessage.id);
    });

    it("admin — peut répondre à n'importe quel ticket", async () => {
      jest.spyOn(service as any, '_notifySupportRecipient').mockImplementation(() => {});
      mockFrom
        .mockReturnValueOnce(chain(mockTicket))
        .mockReturnValueOnce(chain({ ...mockSupportMessage, sender_id: ADMIN_ID, sender_role: 'admin' }));

      const result = await service.sendSupportMessage(TICKET_ID, ADMIN_ID, 'admin', 'Nous allons vous aider.');

      expect(result.sender_role).toBe('admin');
    });

    it('lève 404 si le ticket est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(
        service.sendSupportMessage(TICKET_ID, CLIENT_ID, 'client', 'Test'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("lève 403 si le client tente d'écrire dans le ticket d'un autre", async () => {
      mockFrom.mockReturnValueOnce(chain({ ...mockTicket, user_id: 'other-user-id' }));

      await expect(
        service.sendSupportMessage(TICKET_ID, CLIENT_ID, 'client', 'Test'),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("lève 500 si l'INSERT message échoue", async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockTicket))
        .mockReturnValueOnce(chain(null, { message: 'db error' }));

      await expect(
        service.sendSupportMessage(TICKET_ID, CLIENT_ID, 'client', 'Test'),
      ).rejects.toMatchObject({ status: 500 });
    });

    it('appelle _notifySupportRecipient après insertion réussie', async () => {
      const spy = jest.spyOn(service as any, '_notifySupportRecipient').mockImplementation(() => {});
      mockFrom
        .mockReturnValueOnce(chain(mockTicket))
        .mockReturnValueOnce(chain(mockSupportMessage));

      await service.sendSupportMessage(TICKET_ID, CLIENT_ID, 'client', 'Test');

      expect(spy).toHaveBeenCalledWith(TICKET_ID, CLIENT_ID, CLIENT_ID, 'client', 'Test');
    });

    it('réouverture automatique du ticket résolu si utilisateur répond', async () => {
      const resolvedTicket = { ...mockTicket, status: 'resolved' };
      const reopenChain = {
        update: jest.fn().mockReturnThis(),
        eq:     jest.fn().mockReturnThis(),
      };
      jest.spyOn(service as any, '_notifySupportRecipient').mockImplementation(() => {});

      mockFrom
        .mockReturnValueOnce(chain(resolvedTicket))
        .mockReturnValueOnce(reopenChain)
        .mockReturnValueOnce(chain(mockSupportMessage));

      const result = await service.sendSupportMessage(TICKET_ID, CLIENT_ID, 'client', 'Toujours pas résolu.');

      expect(result).toBeDefined();
      expect(reopenChain.update).toHaveBeenCalledWith({ status: 'in_progress', closed_at: null });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // markChatMessagesAsRead()
  // ────────────────────────────────────────────────────────────────────────────
  describe('markChatMessagesAsRead()', () => {

    it('client propriétaire — marque les messages non-lus et retourne le count', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockReservation))   // _assertAccess
        .mockReturnValueOnce(chain(null, null, 3));    // UPDATE chat_messages

      const result = await service.markChatMessagesAsRead(RESA_ID, CLIENT_ID, 'client');

      expect(result).toEqual({ updated: 3 });
      expect(mockFrom).toHaveBeenCalledTimes(2);
    });

    it('admin — contourne _assertAccess (pas de requête BDD pour la vérification)', async () => {
      mockFrom.mockReturnValueOnce(chain(null, null, 1)); // UPDATE seulement

      const result = await service.markChatMessagesAsRead(RESA_ID, ADMIN_ID, 'admin');

      expect(result).toEqual({ updated: 1 });
      expect(mockFrom).toHaveBeenCalledTimes(1);
    });

    it('retourne { updated: 0 } si aucun message non-lu (idempotent)', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockReservation))
        .mockReturnValueOnce(chain(null, null, 0));

      const result = await service.markChatMessagesAsRead(RESA_ID, CLIENT_ID, 'client');

      expect(result).toEqual({ updated: 0 });
    });

    it('réservation introuvable → lève 404', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(
        service.markChatMessagesAsRead(RESA_ID, CLIENT_ID, 'client'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it('client non propriétaire → lève 403', async () => {
      mockFrom.mockReturnValueOnce(chain({ ...mockReservation, client_id: 'other-client-id' }));

      await expect(
        service.markChatMessagesAsRead(RESA_ID, CLIENT_ID, 'client'),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("lève 500 si l'UPDATE échoue", async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockReservation))
        .mockReturnValueOnce(chain(null, { message: 'db error' }));

      await expect(
        service.markChatMessagesAsRead(RESA_ID, CLIENT_ID, 'client'),
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  // ────────────────────────────────────────────────────────────────────────────
  // markSupportMessagesAsRead()
  // ────────────────────────────────────────────────────────────────────────────
  describe('markSupportMessagesAsRead()', () => {

    it('client propriétaire — marque les messages non-lus et retourne le count', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockTicket))        // SELECT ticket
        .mockReturnValueOnce(chain(null, null, 2));    // UPDATE support_messages

      const result = await service.markSupportMessagesAsRead(TICKET_ID, CLIENT_ID, 'client');

      expect(result).toEqual({ updated: 2 });
      expect(mockFrom).toHaveBeenCalledTimes(2);
    });

    it('admin — sélectionne le ticket mais ignore la vérification user_id', async () => {
      const otherUserTicket = { ...mockTicket, user_id: 'other-user-id' };
      mockFrom
        .mockReturnValueOnce(chain(otherUserTicket))   // SELECT ticket (autre user)
        .mockReturnValueOnce(chain(null, null, 1));    // UPDATE — admin y a accès quand même

      const result = await service.markSupportMessagesAsRead(TICKET_ID, ADMIN_ID, 'admin');

      expect(result).toEqual({ updated: 1 });
    });

    it('retourne { updated: 0 } si aucun message non-lu (idempotent)', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockTicket))
        .mockReturnValueOnce(chain(null, null, 0));

      const result = await service.markSupportMessagesAsRead(TICKET_ID, CLIENT_ID, 'client');

      expect(result).toEqual({ updated: 0 });
    });

    it('ticket introuvable → lève 404', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(
        service.markSupportMessagesAsRead(TICKET_ID, CLIENT_ID, 'client'),
      ).rejects.toMatchObject({ status: 404 });
    });

    it("client tentant d'accéder au ticket d'un autre → lève 403", async () => {
      mockFrom.mockReturnValueOnce(chain({ ...mockTicket, user_id: 'other-user-id' }));

      await expect(
        service.markSupportMessagesAsRead(TICKET_ID, CLIENT_ID, 'client'),
      ).rejects.toMatchObject({ status: 403 });
    });

    it("lève 500 si l'UPDATE échoue", async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockTicket))
        .mockReturnValueOnce(chain(null, { message: 'db error' }));

      await expect(
        service.markSupportMessagesAsRead(TICKET_ID, CLIENT_ID, 'client'),
      ).rejects.toMatchObject({ status: 500 });
    });
  });
});
