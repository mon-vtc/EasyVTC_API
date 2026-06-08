// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Évaluations (Ratings)
// Sprint 6 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../../database/supabase/client.js';
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

  /** Note soumise par un client pour une réservation donnée, null si aucune. */
  async getRatingForReservation(reservationId: string): Promise<number | null> {
    const { data } = await supabaseAdmin
      .from('ratings')
      .select('note')
      .eq('reservation_id', reservationId)
      .maybeSingle();

    return (data as any)?.note ?? null;
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
}

export const ratingsService = new RatingsService();
