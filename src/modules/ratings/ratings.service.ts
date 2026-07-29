// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Évaluations (Ratings)
// Sprint 6 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../../database/supabase/client.js';
import { notificationsService } from '../notifications/notifications.service.js';
import type { UserRole } from '../auth/auth.types.js';
import type {
  Rating,
  RatingWithClient,
  RatingAdmin,
  SubmitRatingDto,
  RatingListFilters,
  DriverRatingsResult,
  AdminRatingsResult,
} from './ratings.types.js';

export class RatingsService {

  // ── POST /reservations/:id/rating ─────────────────────────────────────────
  async submitRating(reservationId: string, clientId: string, dto: SubmitRatingDto): Promise<Rating> {
    const { data: reservation, error: resErr } = await supabaseAdmin
      .from('reservations')
      .select('id, client_id, driver_id, status')
      .eq('id', reservationId)
      .single();

    if (resErr || !reservation) {
      throw { status: 404, message: 'Réservation introuvable' };
    }

    if (reservation.client_id !== clientId) {
      throw { status: 403, message: 'Accès refusé' };
    }

    if (reservation.status !== 'completed') {
      throw { status: 422, message: 'La course doit être terminée pour soumettre une évaluation' };
    }

    if (!reservation.driver_id) {
      throw { status: 422, message: 'Aucun chauffeur assigné à cette course' };
    }

    const { data: existing } = await supabaseAdmin
      .from('ratings')
      .select('id')
      .eq('reservation_id', reservationId)
      .maybeSingle();

    if (existing) {
      throw { status: 409, message: 'Cette course a déjà été évaluée' };
    }

    const { data: rating, error: insertErr } = await supabaseAdmin
      .from('ratings')
      .insert({
        reservation_id: reservationId,
        client_id:      clientId,
        driver_id:      reservation.driver_id,
        note:           dto.note,
        comment:        dto.comment ?? null,
      })
      .select()
      .single();

    if (insertErr || !rating) {
      throw { status: 500, message: "Erreur lors de la création de l'évaluation" };
    }

    // Alerte aux admins si note mauvaise (≤ 2 étoiles) — fire-and-forget
    if (dto.note <= 2) {
      notificationsService.sendToAdmins(
        'low_rating_admin',
        `Note basse — ${dto.note}/5`,
        `Un chauffeur a reçu une note de ${dto.note}/5${dto.comment ? ` : "${dto.comment}"` : ''}.`,
        {
          reservation_id: reservationId,
          driver_id:      reservation.driver_id,
          note:           String(dto.note),
        },
      );
    }

    return rating as Rating;
  }

  // ── GET /admin/drivers/:id/ratings + /drivers/me/ratings ──────────────────
  async getDriverRatings(
    driverId: string,
    requesterId: string,
    requesterRole: UserRole,
    filters: RatingListFilters,
  ): Promise<DriverRatingsResult> {
    if (requesterRole === 'client') {
      throw { status: 403, message: 'Accès refusé' };
    }
    if (requesterRole === 'driver' && requesterId !== driverId) {
      throw { status: 403, message: 'Accès refusé' };
    }

    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 20;
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    const { data, error, count } = await supabaseAdmin
      .from('ratings')
      .select(
        `id, reservation_id, client_id, driver_id, note, comment, created_at,
         client:users!fk_ratings_client(first_name, last_name),
         reservation:reservations!fk_ratings_reservation(scheduled_at)`,
        { count: 'exact' },
      )
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw { status: 500, message: 'Erreur lors de la récupération des évaluations' };
    }

    const ratings: RatingWithClient[] = (data ?? []).map((r: any) => ({
      id:                       r.id,
      reservation_id:           r.reservation_id,
      client_id:                r.client_id,
      driver_id:                r.driver_id,
      note:                     r.note,
      comment:                  r.comment ?? null,
      created_at:               r.created_at,
      client_first_name:        r.client?.first_name  ?? null,
      client_last_name:         r.client?.last_name   ?? null,
      reservation_scheduled_at: r.reservation?.scheduled_at ?? null,
    }));

    const avg_note = await this.computeAvgForDriver(driverId);
    const total    = count ?? 0;

    return { ratings, avg_note, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  // ── GET /admin/ratings — Liste globale ────────────────────────────────────
  async listAll(filters: RatingListFilters): Promise<AdminRatingsResult> {
    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 20;
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    const { data, error, count } = await supabaseAdmin
      .from('ratings')
      .select(
        `id, reservation_id, client_id, driver_id, note, comment, created_at,
         client:users!fk_ratings_client(first_name, last_name),
         reservation:reservations!fk_ratings_reservation(scheduled_at)`,
        { count: 'exact' },
      )
      .order('created_at', { ascending: false })
      .range(from, to);

    if (error) {
      throw { status: 500, message: 'Erreur lors de la récupération des évaluations' };
    }

    // Résoudre les noms des chauffeurs via drivers → users (FK driver_id → drivers.id)
    const driverIds = [...new Set((data ?? []).map((r: any) => r.driver_id as string))];
    const driverNameMap = new Map<string, { first_name: string | null; last_name: string | null }>();

    if (driverIds.length > 0) {
      const { data: driversData } = await supabaseAdmin
        .from('drivers')
        .select('id, users!user_id(first_name, last_name)')
        .in('id', driverIds);

      for (const d of driversData ?? []) {
        const u = (d as any).users;
        driverNameMap.set(d.id, { first_name: u?.first_name ?? null, last_name: u?.last_name ?? null });
      }
    }

    const ratings: RatingAdmin[] = (data ?? []).map((r: any) => {
      const driverName = driverNameMap.get(r.driver_id);
      return {
        id:                       r.id,
        reservation_id:           r.reservation_id,
        client_id:                r.client_id,
        driver_id:                r.driver_id,
        note:                     r.note,
        comment:                  r.comment ?? null,
        created_at:               r.created_at,
        client_first_name:        r.client?.first_name  ?? null,
        client_last_name:         r.client?.last_name   ?? null,
        driver_first_name:        driverName?.first_name ?? null,
        driver_last_name:         driverName?.last_name  ?? null,
        reservation_scheduled_at: r.reservation?.scheduled_at ?? null,
      };
    });

    const total = count ?? 0;
    return { ratings, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  // ── DELETE /admin/ratings/:id ─────────────────────────────────────────────
  async deleteRating(ratingId: string): Promise<void> {
    const { data: existing } = await supabaseAdmin
      .from('ratings')
      .select('id')
      .eq('id', ratingId)
      .maybeSingle();

    if (!existing) {
      throw { status: 404, message: 'Évaluation introuvable' };
    }

    const { error } = await supabaseAdmin
      .from('ratings')
      .delete()
      .eq('id', ratingId);

    if (error) {
      throw { status: 500, message: "Erreur lors de la suppression de l'évaluation" };
    }
  }

  // ── Helpers utilisés par les modules tiers (admin.service, reservations.service) ──

  /** Moyenne arrondie à 1 décimale pour un chauffeur, null si aucune note. */
  async computeAvgForDriver(driverId: string): Promise<number | null> {
    const { data } = await supabaseAdmin
      .from('ratings')
      .select('note')
      .eq('driver_id', driverId);

    if (!data || data.length === 0) return null;
    const avg = data.reduce((sum, r: any) => sum + r.note, 0) / data.length;
    return Math.round(avg * 10) / 10;
  }

  /** Moyenne + nombre total d'évaluations pour un chauffeur (réputation globale, toutes courses confondues). */
  async getDriverRatingStats(driverId: string): Promise<{ avg: number | null; count: number }> {
    const { data, count } = await supabaseAdmin
      .from('ratings')
      .select('note', { count: 'exact' })
      .eq('driver_id', driverId);

    const total = count ?? 0;
    if (!data || data.length === 0) return { avg: null, count: total };
    const avg = data.reduce((sum, r: any) => sum + r.note, 0) / data.length;
    return { avg: Math.round(avg * 10) / 10, count: total };
  }

  /** Note soumise par un client pour une réservation donnée, null si aucune. */
  async getRatingForReservation(reservationId: string): Promise<number | null> {
    const { data } = await supabaseAdmin
      .from('ratings')
      .select('note')
      .eq('reservation_id', reservationId)
      .maybeSingle();

    return (data as any)?.note ?? null;
  }

  /**
   * Version batchée de getDriverRatingStats — une seule requête pour N chauffeurs,
   * au lieu d'une requête par chauffeur. Utilisé par listReservations pour éviter
   * un N+1 (jusqu'à 2 requêtes par ligne de la page) sur les listes de réservations.
   */
  async getDriverRatingStatsBatch(driverIds: string[]): Promise<Map<string, { avg: number | null; count: number }>> {
    const map = new Map<string, { avg: number | null; count: number }>();
    const uniqueIds = [...new Set(driverIds)];
    if (uniqueIds.length === 0) return map;

    const { data } = await supabaseAdmin
      .from('ratings')
      .select('driver_id, note')
      .in('driver_id', uniqueIds);

    const byDriver = new Map<string, number[]>();
    for (const r of (data ?? []) as any[]) {
      const notes = byDriver.get(r.driver_id) ?? [];
      notes.push(r.note);
      byDriver.set(r.driver_id, notes);
    }

    for (const driverId of uniqueIds) {
      const notes = byDriver.get(driverId) ?? [];
      const avg = notes.length > 0
        ? Math.round((notes.reduce((sum, n) => sum + n, 0) / notes.length) * 10) / 10
        : null;
      map.set(driverId, { avg, count: notes.length });
    }
    return map;
  }

  /**
   * Version batchée de getRatingForReservation — une seule requête pour N réservations.
   */
  async getRatingsForReservationsBatch(reservationIds: string[]): Promise<Map<string, number>> {
    const map = new Map<string, number>();
    const uniqueIds = [...new Set(reservationIds)];
    if (uniqueIds.length === 0) return map;

    const { data } = await supabaseAdmin
      .from('ratings')
      .select('reservation_id, note')
      .in('reservation_id', uniqueIds);

    for (const r of (data ?? []) as any[]) {
      map.set(r.reservation_id, r.note);
    }
    return map;
  }

  /** Moyenne des notes soumises par un client (comportement de notation). */
  async computeAvgSubmittedByClient(clientId: string): Promise<number | null> {
    const { data } = await supabaseAdmin
      .from('ratings')
      .select('note')
      .eq('client_id', clientId);

    if (!data || data.length === 0) return null;
    const avg = data.reduce((sum, r: any) => sum + r.note, 0) / data.length;
    return Math.round(avg * 10) / 10;
  }

  /**
   * Version batchée de computeAvgSubmittedByClient — une seule requête pour N clients,
   * au lieu d'une requête par client. Utilisé par admin.service.ts listClients pour
   * éviter un N+1 sur la liste des clients.
   */
  async computeAvgSubmittedByClientsBatch(clientIds: string[]): Promise<Map<string, number | null>> {
    const map = new Map<string, number | null>();
    const uniqueIds = [...new Set(clientIds)];
    if (uniqueIds.length === 0) return map;

    const { data } = await supabaseAdmin
      .from('ratings')
      .select('client_id, note')
      .in('client_id', uniqueIds);

    const byClient = new Map<string, number[]>();
    for (const r of (data ?? []) as any[]) {
      const notes = byClient.get(r.client_id) ?? [];
      notes.push(r.note);
      byClient.set(r.client_id, notes);
    }

    for (const clientId of uniqueIds) {
      const notes = byClient.get(clientId);
      map.set(clientId, notes && notes.length > 0
        ? Math.round((notes.reduce((sum, n) => sum + n, 0) / notes.length) * 10) / 10
        : null);
    }
    return map;
  }
}

export const ratingsService = new RatingsService();
