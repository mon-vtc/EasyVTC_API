import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ══════════════════════════════════════════════════════════════════════════════
// MOCKS — unstable_mockModule AVANT les imports (obligatoire ESM)
// ══════════════════════════════════════════════════════════════════════════════

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFrom               = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockSendMarketingEmail = jest.fn<any>();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockNotifSend          = jest.fn<any>().mockResolvedValue({ id: 'notif-mock-id' });

jest.unstable_mockModule('../../database/supabase/client.js', () => ({
  supabaseAdmin: { from: mockFrom },
}));

jest.unstable_mockModule('../../utils/email.service.js', () => ({
  sendMarketingEmail:    mockSendMarketingEmail,
  sendNotificationEmail: jest.fn(), // requis par notifications.service.ts (chargé en transitive)
}));

// notificationsService est maintenant utilisé par marketing.service pour les push
jest.unstable_mockModule('../notifications/notifications.service.js', () => ({
  notificationsService: { send: mockNotifSend },
}));

const { MarketingService } = await import('./marketing.service.js');

// ══════════════════════════════════════════════════════════════════════════════
// DONNÉES DE TEST
// ══════════════════════════════════════════════════════════════════════════════

const CAMPAIGN_ID  = 'campaign-uuid-001';
const ADMIN_ID     = 'admin-uuid-001';

const mockDraftCampaign = {
  id:          CAMPAIGN_ID,
  name:        'Offre Nouvel An',
  type:        'email',
  status:      'draft',
  subject:     'Bonne année avec EasyVTC !',
  body:        'Profitez de 20% de réduction ce mois-ci.',
  sent_at:     null,
  sent_count:  0,
  open_rate:   0,
  click_rate:  0,
  created_by:  ADMIN_ID,
  created_at:  '2026-06-01T00:00:00.000Z',
  updated_at:  '2026-06-01T00:00:00.000Z',
};

const mockSentCampaign = {
  ...mockDraftCampaign,
  id:         'campaign-uuid-002',
  status:     'sent',
  sent_at:    '2026-06-02T10:00:00.000Z',
  sent_count: 245,
};

const mockPushCampaign = {
  ...mockDraftCampaign,
  id:      'campaign-uuid-003',
  name:    'Fidélité VIP',
  type:    'push',
  subject: null,
  body:    'Votre avantage VIP est disponible !',
};

// ── Clients simulés ───────────────────────────────────────────────────────────
const mockClientEmailOptIn = {
  id:                     'client-uuid-001',
  email:                  'marie.dubois@email.com',
  first_name:             'Marie',
  device_token:           null,
  marketing_email_opt_in: true,
  marketing_sms_opt_in:   false,
  marketing_push_opt_in:  false,
};

const mockClientPushOptIn = {
  id:                     'client-uuid-002',
  email:                  'paul.martin@email.com',
  first_name:             'Paul',
  device_token:           'fcm-token-abc123',
  marketing_email_opt_in: false,
  marketing_sms_opt_in:   false,
  marketing_push_opt_in:  true,
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
    is:          jest.fn().mockReturnThis(),
    in:          jest.fn().mockReturnThis(),
    or:          jest.fn().mockReturnThis(),
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

describe('MarketingService', () => {
  let service: InstanceType<typeof MarketingService>;

  beforeEach(() => {
    service = new MarketingService();
    jest.clearAllMocks();
  });

  // ──────────────────────────────────────────────────────────────────────────
  // listCampaigns
  // ──────────────────────────────────────────────────────────────────────────
  describe('listCampaigns()', () => {

    it('retourne la liste paginée des campagnes', async () => {
      mockFrom.mockReturnValueOnce(chain([mockDraftCampaign, mockSentCampaign], null, 2));

      const result = await service.listCampaigns(1, 20);

      expect(result.campaigns).toHaveLength(2);
      expect(result.total).toBe(2);
      expect(result.total_pages).toBe(1);
    });

    it('retourne une liste vide si aucune campagne', async () => {
      mockFrom.mockReturnValueOnce(chain([], null, 0));

      const result = await service.listCampaigns(1, 20);

      expect(result.campaigns).toHaveLength(0);
      expect(result.total).toBe(0);
    });

    it('calcule correctement total_pages : ceil(15 / 5) = 3', async () => {
      mockFrom.mockReturnValueOnce(chain(Array(5).fill(mockDraftCampaign), null, 15));

      const result = await service.listCampaigns(1, 5);

      expect(result.total_pages).toBe(3);
    });

    it('lève 500 en cas d\'erreur DB', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'DB error' }));

      await expect(service.listCampaigns(1, 20)).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getCampaignById
  // ──────────────────────────────────────────────────────────────────────────
  describe('getCampaignById()', () => {

    it('retourne la campagne si trouvée', async () => {
      mockFrom.mockReturnValueOnce(chain(mockDraftCampaign));

      const result = await service.getCampaignById(CAMPAIGN_ID);

      expect(result.id).toBe(CAMPAIGN_ID);
      expect(result.name).toBe('Offre Nouvel An');
    });

    it('lève 404 si la campagne est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(service.getCampaignById('inexistant')).rejects.toMatchObject({ status: 404 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // createCampaign
  // ──────────────────────────────────────────────────────────────────────────
  describe('createCampaign()', () => {

    it('crée une campagne email en statut draft', async () => {
      mockFrom.mockReturnValueOnce(chain(mockDraftCampaign));

      const result = await service.createCampaign({
        name:    'Offre Nouvel An',
        type:    'email',
        subject: 'Bonne année avec EasyVTC !',
        body:    'Profitez de 20% de réduction ce mois-ci.',
      }, ADMIN_ID);

      expect(result.status).toBe('draft');
      expect(result.type).toBe('email');
    });

    it('crée une campagne push sans subject', async () => {
      mockFrom.mockReturnValueOnce(chain(mockPushCampaign));

      const result = await service.createCampaign({
        name: 'Fidélité VIP',
        type: 'push',
        body: 'Votre avantage VIP est disponible !',
      }, ADMIN_ID);

      expect(result.type).toBe('push');
      expect(result.subject).toBeNull();
    });

    it('lève 500 en cas d\'erreur DB', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'insert failed' }));

      await expect(
        service.createCampaign({ name: 'Test', type: 'email', body: 'msg' }, ADMIN_ID),
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // updateCampaign
  // ──────────────────────────────────────────────────────────────────────────
  describe('updateCampaign()', () => {

    it('met à jour un brouillon avec succès', async () => {
      const updated = { ...mockDraftCampaign, name: 'Promo Été' };

      mockFrom
        .mockReturnValueOnce(chain(mockDraftCampaign)) // getCampaignById
        .mockReturnValueOnce(chain(updated));           // update

      const result = await service.updateCampaign(CAMPAIGN_ID, { name: 'Promo Été' });

      expect(result.name).toBe('Promo Été');
    });

    it('lève 409 si la campagne est déjà envoyée', async () => {
      mockFrom.mockReturnValueOnce(chain(mockSentCampaign)); // status = 'sent'

      await expect(
        service.updateCampaign(mockSentCampaign.id, { name: 'Tentative modif' }),
      ).rejects.toMatchObject({ status: 409 });
    });

    it('lève 404 si la campagne est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(
        service.updateCampaign('inexistant', { name: 'X' }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // deleteCampaign
  // ──────────────────────────────────────────────────────────────────────────
  describe('deleteCampaign()', () => {

    it('supprime un brouillon avec succès', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockDraftCampaign)) // getCampaignById
        .mockReturnValueOnce(chain(null));              // delete

      await expect(service.deleteCampaign(CAMPAIGN_ID)).resolves.toBeUndefined();
    });

    it('lève 409 si la campagne est déjà envoyée', async () => {
      mockFrom.mockReturnValueOnce(chain(mockSentCampaign));

      await expect(service.deleteCampaign(mockSentCampaign.id)).rejects.toMatchObject({ status: 409 });
    });

    it('lève 404 si la campagne est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(service.deleteCampaign('inexistant')).rejects.toMatchObject({ status: 404 });
    });

    it('lève 500 si la suppression DB échoue', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockDraftCampaign))
        .mockReturnValueOnce(chain(null, { message: 'FK error' }));

      await expect(service.deleteCampaign(CAMPAIGN_ID)).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // sendCampaign
  // ──────────────────────────────────────────────────────────────────────────
  describe('sendCampaign()', () => {

    it('lève 409 si la campagne est déjà envoyée', async () => {
      mockFrom.mockReturnValueOnce(chain(mockSentCampaign));

      await expect(service.sendCampaign(mockSentCampaign.id)).rejects.toMatchObject({ status: 409 });
    });

    it('envoie les emails aux clients opt-in et met à jour la campagne', async () => {
      mockSendMarketingEmail.mockResolvedValue(undefined);

      // sendCampaign email : 3 from() → getCampaignById, destinataires, update campagne
      mockFrom
        .mockReturnValueOnce(chain(mockDraftCampaign))       // getCampaignById
        .mockReturnValueOnce(chain([mockClientEmailOptIn]))  // destinataires email opt-in
        .mockReturnValueOnce(chain(null));                   // update campagne → sent

      const result = await service.sendCampaign(CAMPAIGN_ID);

      expect(result.sent_count).toBe(1);
      expect(mockSendMarketingEmail).toHaveBeenCalledWith(
        mockClientEmailOptIn.email,
        mockClientEmailOptIn.first_name,
        mockDraftCampaign.subject,
        mockDraftCampaign.body,
      );
    });

    it('envoie des push via notificationsService.send() pour les clients opt-in', async () => {
      // sendCampaign push : 3 from() → getCampaignById, destinataires, update campagne
      // notificationsService.send() est mocké — n'appelle pas from()
      mockFrom
        .mockReturnValueOnce(chain(mockPushCampaign))       // getCampaignById
        .mockReturnValueOnce(chain([mockClientPushOptIn]))  // destinataires push opt-in
        .mockReturnValueOnce(chain(null));                  // update campagne → sent

      const result = await service.sendCampaign(mockPushCampaign.id);

      expect(result.sent_count).toBe(1);
      expect(mockNotifSend).toHaveBeenCalledWith({
        user_id: mockClientPushOptIn.id,
        type:    'marketing',
        channel: 'push',
        title:   mockPushCampaign.name,
        body:    mockPushCampaign.body,
      });
    });

    it('compte 0 si aucun destinataire opt-in', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockDraftCampaign))  // getCampaignById
        .mockReturnValueOnce(chain([]))                 // aucun destinataire
        .mockReturnValueOnce(chain(null));              // update campagne → sent

      const result = await service.sendCampaign(CAMPAIGN_ID);

      expect(result.sent_count).toBe(0);
      expect(mockSendMarketingEmail).not.toHaveBeenCalled();
    });

    it('lève 500 si la récupération des destinataires échoue', async () => {
      mockFrom
        .mockReturnValueOnce(chain(mockDraftCampaign))
        .mockReturnValueOnce(chain(null, { message: 'DB error' }));

      await expect(service.sendCampaign(CAMPAIGN_ID)).rejects.toMatchObject({ status: 500 });
    });

    it('continue si l\'envoi email échoue pour un destinataire (tolérance aux erreurs)', async () => {
      mockSendMarketingEmail.mockRejectedValue(new Error('SMTP error'));

      mockFrom
        .mockReturnValueOnce(chain(mockDraftCampaign))
        .mockReturnValueOnce(chain([mockClientEmailOptIn]))
        .mockReturnValueOnce(chain(null));  // update campagne

      // Ne doit pas rejeter — les erreurs d'envoi individuelles sont loguées
      const result = await service.sendCampaign(CAMPAIGN_ID);

      expect(result.sent_count).toBe(0); // envoi raté → non compté
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // getMyMarketingConsents
  // ──────────────────────────────────────────────────────────────────────────
  describe('getMyMarketingConsents()', () => {

    it('retourne les trois consentements de l\'utilisateur', async () => {
      mockFrom.mockReturnValueOnce(chain({
        marketing_email_opt_in: true,
        marketing_sms_opt_in:   false,
        marketing_push_opt_in:  true,
      }));

      const result = await service.getMyMarketingConsents('user-uuid-001');

      expect(result.marketing_email_opt_in).toBe(true);
      // expect(result.marketing_sms_opt_in).toBe(false); // SMS non intégré
      expect(result.marketing_push_opt_in).toBe(true);
    });

    it('retourne false pour tous les consentements par défaut', async () => {
      mockFrom.mockReturnValueOnce(chain({
        marketing_email_opt_in: false,
        // marketing_sms_opt_in: false, // SMS non intégré
        marketing_push_opt_in:  false,
      }));

      const result = await service.getMyMarketingConsents('user-uuid-002');

      expect(result.marketing_email_opt_in).toBe(false);
      // expect(result.marketing_sms_opt_in).toBe(false); // SMS non intégré
      expect(result.marketing_push_opt_in).toBe(false);
    });

    it('lève 404 si l\'utilisateur est introuvable', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'not found' }));

      await expect(service.getMyMarketingConsents('inexistant')).rejects.toMatchObject({ status: 404 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // updateMarketingConsents
  // ──────────────────────────────────────────────────────────────────────────
  describe('updateMarketingConsents()', () => {

    it('met à jour les consentements email et push d\'un utilisateur', async () => {
      mockFrom.mockReturnValueOnce(chain(null));

      await expect(
        service.updateMarketingConsents('user-uuid-001', {
          marketing_email_opt_in: true,
          marketing_push_opt_in:  false,
        }),
      ).resolves.toBeUndefined();
    });

    it('lève 500 en cas d\'erreur DB', async () => {
      mockFrom.mockReturnValueOnce(chain(null, { message: 'update failed' }));

      await expect(
        service.updateMarketingConsents('user-uuid-001', { marketing_push_opt_in: true }),
      ).rejects.toMatchObject({ status: 500 });
    });
  });

  // ──────────────────────────────────────────────────────────────────────────
  // listClients — statistiques
  // ──────────────────────────────────────────────────────────────────────────
  describe('listClients() — statistiques et liste', () => {

    it('retourne les stats globales et la liste des clients', async () => {
      // _getClientStats : tous les clients
      mockFrom.mockReturnValueOnce(chain([
        { marketing_email_opt_in: true,  marketing_sms_opt_in: false, marketing_push_opt_in: true  },
        { marketing_email_opt_in: false, marketing_sms_opt_in: true,  marketing_push_opt_in: false },
        { marketing_email_opt_in: true,  marketing_sms_opt_in: false, marketing_push_opt_in: false },
      ]));

      // _fetchClients : la page courante
      mockFrom.mockReturnValueOnce(chain([
        { id: 'c1', first_name: 'Marie', last_name: 'Dubois', email: 'marie@email.com',
          marketing_email_opt_in: true, marketing_sms_opt_in: false, marketing_push_opt_in: true },
      ], null, 3));

      // _enrichClientsWithStats : requête trips
      mockFrom.mockReturnValueOnce(chain([
        { client_id: 'c1', price_final: 50, created_at: '2026-05-01T10:00:00.000Z' },
        { client_id: 'c1', price_final: 30, created_at: '2026-06-01T10:00:00.000Z' },
      ]));

      const result = await service.listClients({ page: 1, limit: 20 });

      expect(result.stats.total_clients).toBe(3);
      expect(result.stats.opt_in_email).toBe(2);
      // expect(result.stats.opt_in_sms).toBe(1); // SMS non intégré
      expect(result.stats.opt_in_push).toBe(1);
      expect(result.clients).toHaveLength(1);
      expect(result.clients[0].total_rides).toBe(2);
      expect(result.clients[0].total_spent).toBe(80);
    });

    it('retourne des stats à zéro si aucun client', async () => {
      mockFrom
        .mockReturnValueOnce(chain([]))        // _getClientStats → vide
        .mockReturnValueOnce(chain([], null, 0)) // _fetchClients → vide
        .mockReturnValueOnce(chain([]));         // _enrichClientsWithStats → vide

      const result = await service.listClients({ page: 1, limit: 20 });

      expect(result.stats.total_clients).toBe(0);
      expect(result.stats.opt_in_email).toBe(0);
      expect(result.clients).toHaveLength(0);
    });
  });
});
