// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Marketing
// Sprint 6 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../../database/supabase/client.js';
import { sendMarketingEmail } from '../../utils/email.service.js';
import { notificationsService } from '../notifications/notifications.service.js';
import type {
  MarketingCampaign,
  MarketingConsents,
  CreateCampaignDto,
  UpdateCampaignDto,
  ClientBaseFilters,
  ClientBaseResult,
  ClientBaseStats,
  ClientSummary,
  CampaignListResult,
} from './marketing.types.js';

export class MarketingService {

  // ══════════════════════════════════════════════════════════════════════════
  // BASE CLIENTS
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /admin/marketing/clients ──────────────────────────────────────────
  async listClients(filters: ClientBaseFilters): Promise<ClientBaseResult> {
    const offset = (filters.page - 1) * filters.limit;

    // Stats globales (en parallèle avec la liste)
    const [statsResult, listResult] = await Promise.all([
      this._getClientStats(),
      this._fetchClients(filters, offset),
    ]);

    return {
      stats:       statsResult,
      clients:     listResult.clients,
      total:       listResult.total,
      page:        filters.page,
      limit:       filters.limit,
      total_pages: Math.ceil(listResult.total / filters.limit),
    };
  }

  private async _getClientStats(): Promise<ClientBaseStats> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('marketing_email_opt_in, marketing_push_opt_in') // marketing_sms_opt_in exclu (SMS non intégré)
      .eq('role', 'client')
      .is('deleted_at', null);

    if (error) {
      console.error('[Marketing] stats error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des statistiques clients' };
    }

    const rows = (data ?? []) as Array<{
      marketing_email_opt_in: boolean;
      // marketing_sms_opt_in: boolean; // SMS non intégré
      marketing_push_opt_in: boolean;
    }>;

    return {
      total_clients: rows.length,
      opt_in_email:  rows.filter((r) => r.marketing_email_opt_in).length,
      // opt_in_sms: rows.filter((r) => r.marketing_sms_opt_in).length,
      opt_in_push:   rows.filter((r) => r.marketing_push_opt_in).length,
    };
  }

  private async _fetchClients(
    filters: ClientBaseFilters,
    offset: number,
  ): Promise<{ clients: ClientSummary[]; total: number }> {
    let query = supabaseAdmin
      .from('users')
      .select(
        `id, first_name, last_name, email,
         marketing_email_opt_in, marketing_push_opt_in`,
        // marketing_sms_opt_in exclu (SMS non intégré)
        { count: 'exact' },
      )
      .eq('role', 'client')
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (filters.search) {
      query = query.or(
        `first_name.ilike.%${filters.search}%,last_name.ilike.%${filters.search}%,email.ilike.%${filters.search}%`,
      );
    }

    if (filters.consent === 'email') query = query.eq('marketing_email_opt_in', true);
    // if (filters.consent === 'sms') query = query.eq('marketing_sms_opt_in', true); // SMS non intégré
    if (filters.consent === 'push')  query = query.eq('marketing_push_opt_in', true);

    const { data, error, count } = await query.range(offset, offset + filters.limit - 1);

    if (error) {
      console.error('[Marketing] fetchClients error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des clients' };
    }

    // Récupérer les stats de courses pour ces clients
    const clients = await this._enrichClientsWithStats((data ?? []) as Array<{
      id: string;
      first_name: string;
      last_name: string;
      email: string;
      marketing_email_opt_in: boolean;
      // marketing_sms_opt_in: boolean; // SMS non intégré
      marketing_push_opt_in: boolean;
    }>);

    return { clients, total: count ?? 0 };
  }

  private async _enrichClientsWithStats(
    users: Array<{
      id: string;
      first_name: string;
      last_name: string;
      email: string;
      marketing_email_opt_in: boolean;
      // marketing_sms_opt_in: boolean; // SMS non intégré
      marketing_push_opt_in: boolean;
    }>,
  ): Promise<ClientSummary[]> {
    if (users.length === 0) return [];

    const userIds = users.map((u) => u.id);

    // Agréger le nombre de courses terminées et le total dépensé par client
    const { data: tripData } = await supabaseAdmin
      .from('reservations')
      .select('client_id, price_final, created_at')
      .in('client_id', userIds)
      .eq('status', 'completed');

    // Construire un map par client
    type TripRow = { client_id: string; price_final: number | null; created_at: string };
    const rideMap = new Map<string, { count: number; total: number; lastDate: string | null }>();

    for (const row of (tripData ?? []) as TripRow[]) {
      const entry = rideMap.get(row.client_id) ?? { count: 0, total: 0, lastDate: null };
      entry.count += 1;
      entry.total += row.price_final ?? 0;
      if (!entry.lastDate || row.created_at > entry.lastDate) {
        entry.lastDate = row.created_at;
      }
      rideMap.set(row.client_id, entry);
    }

    return users.map((u) => {
      const stats = rideMap.get(u.id) ?? { count: 0, total: 0, lastDate: null };
      return {
        id:                     u.id,
        first_name:             u.first_name,
        last_name:              u.last_name,
        email:                  u.email,
        total_rides:            stats.count,
        total_spent:            Math.round(stats.total * 100) / 100,
        last_ride_date:         stats.lastDate,
        marketing_email_opt_in: u.marketing_email_opt_in,
        // marketing_sms_opt_in: u.marketing_sms_opt_in, // SMS non intégré
        marketing_push_opt_in:  u.marketing_push_opt_in,
      };
    });
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CAMPAGNES
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /admin/marketing/campaigns ───────────────────────────────────────
  async listCampaigns(page: number, limit: number): Promise<CampaignListResult> {
    const offset = (page - 1) * limit;

    const { data, error, count } = await supabaseAdmin
      .from('marketing_campaigns')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Marketing] listCampaigns error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des campagnes' };
    }

    const total = count ?? 0;
    return {
      campaigns:   (data ?? []) as MarketingCampaign[],
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }

  // ── GET /admin/marketing/campaigns/:id ───────────────────────────────────
  async getCampaignById(id: string): Promise<MarketingCampaign> {
    const { data, error } = await supabaseAdmin
      .from('marketing_campaigns')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) throw { status: 404, message: 'Campagne introuvable' };

    return data as MarketingCampaign;
  }

  // ── POST /admin/marketing/campaigns ──────────────────────────────────────
  async createCampaign(dto: CreateCampaignDto, createdBy: string): Promise<MarketingCampaign> {
    const { data, error } = await supabaseAdmin
      .from('marketing_campaigns')
      .insert({
        name:       dto.name,
        type:       dto.type,
        subject:    dto.subject ?? null,
        body:       dto.body,
        status:     'draft',
        created_by: createdBy,
      })
      .select('*')
      .single();

    if (error || !data) {
      console.error('[Marketing] createCampaign error:', error);
      throw { status: 500, message: 'Erreur lors de la création de la campagne' };
    }

    return data as MarketingCampaign;
  }

  // ── PATCH /admin/marketing/campaigns/:id ─────────────────────────────────
  async updateCampaign(id: string, dto: UpdateCampaignDto): Promise<MarketingCampaign> {
    const campaign = await this.getCampaignById(id);

    if (campaign.status === 'sent') {
      throw { status: 409, message: 'Une campagne déjà envoyée ne peut pas être modifiée' };
    }

    const { data, error } = await supabaseAdmin
      .from('marketing_campaigns')
      .update({ ...dto, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('*')
      .single();

    if (error || !data) {
      console.error('[Marketing] updateCampaign error:', error);
      throw { status: 500, message: 'Erreur lors de la mise à jour de la campagne' };
    }

    return data as MarketingCampaign;
  }

  // ── DELETE /admin/marketing/campaigns/:id ────────────────────────────────
  async deleteCampaign(id: string): Promise<void> {
    const campaign = await this.getCampaignById(id);

    if (campaign.status === 'sent') {
      throw { status: 409, message: 'Une campagne déjà envoyée ne peut pas être supprimée' };
    }

    const { error } = await supabaseAdmin
      .from('marketing_campaigns')
      .delete()
      .eq('id', id);

    if (error) {
      console.error('[Marketing] deleteCampaign error:', error);
      throw { status: 500, message: 'Erreur lors de la suppression de la campagne' };
    }
  }

  // ── POST /admin/marketing/campaigns/:id/send ─────────────────────────────
  async sendCampaign(id: string): Promise<{ sent_count: number }> {
    const campaign = await this.getCampaignById(id);

    if (campaign.status === 'sent') {
      throw { status: 409, message: 'Cette campagne a déjà été envoyée' };
    }

    // Récupérer les destinataires selon le type de consentement
    const optInColumn = this._optInColumn(campaign.type);

    const { data: recipients, error: recipientsError } = await supabaseAdmin
      .from('users')
      .select('id, email, first_name')
      .eq('role', 'client')
      .eq(optInColumn, true)
      .is('deleted_at', null);

    if (recipientsError) {
      console.error('[Marketing] sendCampaign recipients error:', recipientsError);
      throw { status: 500, message: 'Erreur lors de la récupération des destinataires' };
    }

    const targets = (recipients ?? []) as Array<{
      id: string;
      email: string;
      first_name: string;
    }>;

    let sentCount = 0;

    // Envoi selon le type de campagne
    for (const user of targets) {
      try {
        if (campaign.type === 'email') {
          await sendMarketingEmail(
            user.email,
            user.first_name,
            campaign.subject ?? campaign.name,
            campaign.body,
          );
          sentCount++;
        } else if (campaign.type === 'push') {
          // Délègue à notificationsService.send() qui gère :
          //   1. Insertion BDD (status: pending)
          //   2. Dispatch FCM via _dispatchPush (fire-and-forget)
          //   3. Marquage status: sent/failed selon le résultat FCM
          await notificationsService.send({
            user_id: user.id,
            type:    'marketing',
            channel: 'push',
            title:   campaign.name,
            body:    campaign.body,
          });
          sentCount++;
        }
        // else if (campaign.type === 'sms') {
        //   // SMS non intégré — Twilio ou autre prestataire à câbler en S8+
        //   sentCount++;
        // }
      } catch (sendErr) {
        console.error(`[Marketing] Erreur envoi à ${user.email}:`, sendErr);
      }
    }

    // Marquer la campagne comme envoyée
    await supabaseAdmin
      .from('marketing_campaigns')
      .update({
        status:     'sent',
        sent_at:    new Date().toISOString(),
        sent_count: sentCount,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id);

    return { sent_count: sentCount };
  }

  // ══════════════════════════════════════════════════════════════════════════
  // CONSENTEMENTS MARKETING (endpoint utilisateur)
  // ══════════════════════════════════════════════════════════════════════════

  // ── GET /users/me/marketing-consents ─────────────────────────────────────
  async getMyMarketingConsents(userId: string): Promise<MarketingConsents> {
    const { data, error } = await supabaseAdmin
      .from('users')
      .select('marketing_email_opt_in, marketing_sms_opt_in, marketing_push_opt_in')
      .eq('id', userId)
      .single();

    if (error || !data) {
      console.error('[Marketing] getMyMarketingConsents error:', error);
      throw { status: 404, message: 'Utilisateur introuvable' };
    }

    return data as MarketingConsents;
  }

  async updateMarketingConsents(
    userId: string,
    consents: Partial<{
      marketing_email_opt_in: boolean;
      // marketing_sms_opt_in: boolean; // SMS non intégré
      marketing_push_opt_in: boolean;
    }>,
  ): Promise<void> {
    const { error } = await supabaseAdmin
      .from('users')
      .update({ ...consents, updated_at: new Date().toISOString() })
      .eq('id', userId);

    if (error) {
      console.error('[Marketing] updateMarketingConsents error:', error);
      throw { status: 500, message: 'Erreur lors de la mise à jour des consentements' };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PRIVÉ
  // ══════════════════════════════════════════════════════════════════════════

  private _optInColumn(type: string): string {
    if (type === 'email') return 'marketing_email_opt_in';
    // if (type === 'sms') return 'marketing_sms_opt_in'; // SMS non intégré
    return 'marketing_push_opt_in';
  }

}

export const marketingService = new MarketingService();
