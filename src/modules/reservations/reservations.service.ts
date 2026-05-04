// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Réservations
// Sprint 3 — EazyVTC
//
// Circuit complet VTC :
//   [Client]  POST   /reservations             → crée (pending)
//   [Admin]   POST   /reservations/:id/assign  → affecte chauffeur (assigned)
//   [Driver]  PATCH  /reservations/:id/arrive  → signale arrivée (notification)
//   [Driver]  PATCH  /reservations/:id/start   → démarre la course (in_progress)
//   [Driver]  PATCH  /reservations/:id/complete → termine la course (completed)
//   [Client/Admin] PATCH /reservations/:id/cancel → annule (cancelled)
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../../database/supabase/client.js';
import { vehicleTypesService } from '../vehicle-types/vehicle-types.service.js';
import { pricingService } from '../pricing/pricing.service.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { driversService } from '../drivers/drivers.service.js';
import { ordersService } from '../orders/orders.service.js';
import { invoicesService } from '../invoices/invoices.service.js';
import type {
  Reservation,
  ReservationWithRelations,
  CreateReservationDto,
  AssignDriverDto,
  CompleteReservationDto,
  ReservationListFilters,
  ReservationListResult,
  AvailableDriverDto,
} from './reservations.types.js';
import type { UserRole } from '../auth/auth.types.js';

// Buffer ajouté de chaque côté autour d'une course pour la détection de conflits.
// Exemple : une course estimée à 45 min bloque le chauffeur de T-30min à T+75min.
const TRIP_BUFFER_MIN = 30;

// Durée de fallback si la réservation n'a pas de duration_min (ex: forfait sans métriques).
const TRIP_CONFLICT_FALLBACK_MIN = 180; // 3 heures

// ── Sélect enrichi (jointures client + chauffeur) ────────────────────────────
const RESERVATION_SELECT = `
  *,
  client:users!client_id(id, email, first_name, last_name, phone, profile_photo_url),
  driver:drivers!driver_id(
    id,
    is_online,
    status,
    vehicle_type,
    zone,
    user:users!user_id(id, email, first_name, last_name, phone, profile_photo_url),
    vehicles:vehicles!driver_id(id, model, plate_number, brand, color, type, photo_url, is_active)
  )
` as const;

// ══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ══════════════════════════════════════════════════════════════════════════════

export class ReservationsService {

  // ──────────────────────────────────────────────────────────────────────────
  // 1. CRÉATION — Client
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Crée une réservation depuis l'application mobile du client.
   * Calcule automatiquement le prix estimé via le moteur tarifaire.
   */
  async createReservation(clientId: string, dto: CreateReservationDto): Promise<ReservationWithRelations> {
    await vehicleTypesService.validateCode(dto.vehicle_type);

    // Calculer le prix estimé — vehicle_type transmis pour moduler le base_price
    const { final_price, currency, breakdown } = await pricingService.computePrice({
      country:      dto.country,
      distance_km:  dto.distance_km,
      duration_min: dto.duration_min,
      flat_rate_id: dto.flat_rate_id,
      vehicle_type: dto.vehicle_type,
    });

    const pricing_type = dto.flat_rate_id ? 'flat_rate' : 'formula';

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .insert({
        client_id:       clientId,
        status:          'pending',
        pickup_address:  dto.pickup_address,
        pickup_lat:      dto.pickup_lat ?? null,
        pickup_lng:      dto.pickup_lng ?? null,
        dest_address:    dto.dest_address,
        dest_lat:        dto.dest_lat ?? null,
        dest_lng:        dto.dest_lng ?? null,
        vehicle_type:    dto.vehicle_type,
        country:         dto.country,
        scheduled_at:    dto.scheduled_at,
        nb_passengers:   dto.nb_passengers ?? 1,
        comment:         dto.comment ?? null,
        pricing_type,
        flat_rate_id:    dto.flat_rate_id ?? null,
        price_estimated: final_price,
        price_breakdown: breakdown,
        distance_km:     dto.distance_km ?? null,
        duration_min:    dto.duration_min ?? null,
      })
      .select(RESERVATION_SELECT)
      .single();

    if (error || !data) {
      console.error('[Reservations] Erreur création:', error);
      throw { status: 500, message: 'Erreur lors de la création de la réservation' };
    }

    const reservation = this._mapReservation(data);

    // Notification de confirmation au client (fire-and-forget)
    notificationsService.sendToUser(
      clientId,
      'reservation_confirmed',
      'Réservation confirmée',
      `Votre course du ${this._formatDate(dto.scheduled_at)} est enregistrée. Prix estimé : ${final_price} ${currency}.`,
      { reservation_id: reservation.id, status: 'pending' },
    );

    return reservation;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. LISTE — Admin / Manager
  // ──────────────────────────────────────────────────────────────────────────

  async listReservations(filters: ReservationListFilters): Promise<ReservationListResult> {
    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 20;
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    let query = supabaseAdmin
      .from('reservations')
      .select(RESERVATION_SELECT, { count: 'exact' })
      .order('scheduled_at', { ascending: false })
      .range(from, to);

    if (filters.status)    query = query.eq('status', filters.status);
    if (filters.country)   query = query.eq('country', filters.country);
    if (filters.driver_id) query = query.eq('driver_id', filters.driver_id);
    if (filters.client_id) query = query.eq('client_id', filters.client_id);
    if (filters.date_from) query = query.gte('scheduled_at', filters.date_from);
    if (filters.date_to)   query = query.lte('scheduled_at', filters.date_to);

    const { data, error, count } = await query;
    if (error) throw { status: 500, message: 'Erreur lors de la récupération des réservations' };

    const total = count ?? 0;

    return {
      reservations: (data ?? []).map((r: any) => this._mapReservation(r)),
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. MES RÉSERVATIONS — Client
  // ──────────────────────────────────────────────────────────────────────────

  async listMyReservations(clientId: string, filters: ReservationListFilters): Promise<ReservationListResult> {
    return this.listReservations({ ...filters, client_id: clientId });
  }

  async listDriverReservations(driverId: string, filters: ReservationListFilters): Promise<ReservationListResult> {
    return this.listReservations({ ...filters, driver_id: driverId });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. RÉSERVATION DU CHAUFFEUR — Course active
  // ──────────────────────────────────────────────────────────────────────────

  async getDriverActiveReservation(driverId: string): Promise<ReservationWithRelations | null> {
    const { data } = await supabaseAdmin
      .from('reservations')
      .select(RESERVATION_SELECT)
      .eq('driver_id', driverId)
      .in('status', ['assigned', 'driver_arrived', 'in_progress'])
      .order('scheduled_at', { ascending: true })
      .limit(1)
      .maybeSingle();

    return data ? this._mapReservation(data) : null;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. DÉTAIL — Contrôle d'accès par rôle
  // ──────────────────────────────────────────────────────────────────────────

  async getById(
    reservationId: string,
    requesterId:   string,
    requesterRole: UserRole,
  ): Promise<ReservationWithRelations> {
    const { data, error } = await supabaseAdmin
      .from('reservations')
      .select(RESERVATION_SELECT)
      .eq('id', reservationId)
      .single();

    if (error || !data) throw { status: 404, message: 'Réservation introuvable' };

    const r = this._mapReservation(data);

    // Un client ne peut voir que ses propres réservations
    if (requesterRole === 'client' && r.client_id !== requesterId) {
      throw { status: 403, message: 'Accès refusé' };
    }

    // Un chauffeur ne peut voir que ses courses assignées
    if (requesterRole === 'driver') {
      const { data: driverRecord } = await supabaseAdmin
        .from('drivers')
        .select('id')
        .eq('user_id', requesterId)
        .single();

      if (!driverRecord || r.driver_id !== driverRecord.id) {
        throw { status: 403, message: 'Accès refusé' };
      }
    }

    return r;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. ASSIGNATION CHAUFFEUR — Admin / Manager
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Affecte un chauffeur à une réservation en attente.
   * Vérifie que le chauffeur est actif et disponible.
   */
  async assignDriver(
    reservationId: string,
    dto:           AssignDriverDto,
    adminId:       string,
  ): Promise<ReservationWithRelations> {
    // Vérifier que la réservation est en pending
    const reservation = await this._getReservationOrThrow(reservationId);
    if (reservation.status !== 'pending') {
      throw {
        status: 400,
        message: `Impossible d'assigner : la réservation est en statut "${reservation.status}"`,
      };
    }

    // Vérifier que le chauffeur existe et est actif (status 'on_trip' est refusé ici)
    const { data: driver } = await supabaseAdmin
      .from('drivers')
      .select('id, status, user_id, users!user_id(first_name, last_name)')
      .eq('id', dto.driver_id)
      .single();

    if (!driver) throw { status: 404, message: 'Chauffeur introuvable' };
    if (driver.status !== 'active') {
      const statusLabels: Record<string, string> = {
        pending:   'dossier en attente de validation',
        on_trip:   'en cours de mission',
        rejected:  'dossier rejeté',
        suspended: 'suspendu',
      };
      const label = statusLabels[driver.status] ?? driver.status;
      throw { status: 400, message: `Ce chauffeur ne peut pas être assigné (${label})` };
    }

    // Vérifier l'absence de conflit horaire avec les courses déjà assignées
    await this._checkSchedulingConflict(dto.driver_id, reservation.scheduled_at, reservation.duration_min);

    // Mettre à jour la réservation
    const { data, error } = await supabaseAdmin
      .from('reservations')
      .update({
        driver_id:   dto.driver_id,
        assigned_by: adminId,
        status:      'assigned',
      })
      .eq('id', reservationId)
      .select(RESERVATION_SELECT)
      .single();

    if (error || !data) throw { status: 500, message: "Erreur lors de l'assignation du chauffeur" };

    // Générer automatiquement le bon de commande (fire-and-forget)
    ordersService.createFromReservation(reservationId).catch((err) => {
      console.error('[Reservations] Erreur génération bon de commande pour réservation', reservationId, err);
    });

    const updated = this._mapReservation(data);
    const driverUserData = (driver as any).users;
    const driverName = driverUserData
      ? `${driverUserData.first_name} ${driverUserData.last_name}`
      : 'Votre chauffeur';

    // Notification au chauffeur
    notificationsService.sendToUser(
      driver.user_id as string,
      'trip_assigned',
      'Nouvelle course assignée',
      `Une course vous a été assignée pour le ${this._formatDate(reservation.scheduled_at)}.`,
      {
        reservation_id:  reservationId,
        scheduled_at:    reservation.scheduled_at,
        pickup_address:  reservation.pickup_address,
        dest_address:    reservation.dest_address,
      },
    );

    // Notification au client
    notificationsService.sendToUser(
      reservation.client_id,
      'trip_assigned',
      'Chauffeur assigné',
      `${driverName} prendra en charge votre course du ${this._formatDate(reservation.scheduled_at)}.`,
      { reservation_id: reservationId, driver_id: dto.driver_id },
    );

    return updated;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. ARRIVÉE CHAUFFEUR — Notification au client
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Le chauffeur signale son arrivée au point de pickup.
   * Passe le statut à `driver_arrived` et enregistre l'horodatage.
   */
  async markDriverArrived(reservationId: string, driverUserId: string): Promise<void> {
    const reservation = await this._getReservationOrThrow(reservationId);

    // Vérifier que c'est bien ce chauffeur
    await this._assertDriverOwnsReservation(reservation, driverUserId);

    if (reservation.status !== 'assigned') {
      throw {
        status: 400,
        message: `Action invalide : la course est en statut "${reservation.status}"`,
      };
    }

    // Passer en driver_arrived et enregistrer l'horodatage
    await supabaseAdmin
      .from('reservations')
      .update({ status: 'driver_arrived', driver_arrived_at: new Date().toISOString() })
      .eq('id', reservationId);

    // Notifier le client
    notificationsService.sendToUser(
      reservation.client_id,
      'driver_arrived',
      'Votre chauffeur est arrivé',
      'Votre chauffeur vous attend au point de prise en charge.',
      { reservation_id: reservationId },
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 8. DÉMARRAGE COURSE — Chauffeur
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Le chauffeur démarre la course (client à bord).
   * Crée l'enregistrement dans public.trips.
   */
  async startTrip(reservationId: string, driverUserId: string): Promise<ReservationWithRelations> {
    const reservation = await this._getReservationOrThrow(reservationId);
    await this._assertDriverOwnsReservation(reservation, driverUserId);

    if (reservation.status !== 'assigned' && reservation.status !== 'driver_arrived') {
      throw {
        status: 400,
        message: `Impossible de démarrer : la course est en statut "${reservation.status}"`,
      };
    }

    const now = new Date().toISOString();

    // Passer en in_progress
    const { data, error } = await supabaseAdmin
      .from('reservations')
      .update({ status: 'in_progress' })
      .eq('id', reservationId)
      .select(RESERVATION_SELECT)
      .single();

    if (error || !data) throw { status: 500, message: 'Erreur lors du démarrage de la course' };

    // Passer le chauffeur en on_trip — il est maintenant physiquement en route
    driversService.setOnTripStatus(reservation.driver_id!, true).catch((err) => {
      console.error('[Reservations] Erreur setOnTripStatus(true) au démarrage pour driver', reservation.driver_id, err);
    });

    // Créer le trip
    await supabaseAdmin
      .from('trips')
      .insert({
        reservation_id: reservationId,
        started_at:     now,
      });

    // Notification au client — course démarrée
    notificationsService.sendToUser(
      reservation.client_id,
      'trip_reminder',
      'Course démarrée',
      'Votre course est en cours. Bon voyage !',
      { reservation_id: reservationId },
    );

    return this._mapReservation(data);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 9. FIN DE COURSE — Chauffeur
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Le chauffeur termine la course.
   * Met à jour le trip, recalcule le prix final si des métriques réelles sont fournies.
   */
  async completeTrip(
    reservationId: string,
    driverUserId:  string,
    dto:           CompleteReservationDto,
  ): Promise<ReservationWithRelations> {
    const reservation = await this._getReservationOrThrow(reservationId);
    await this._assertDriverOwnsReservation(reservation, driverUserId);

    if (reservation.status !== 'in_progress') {
      throw {
        status: 400,
        message: `Impossible de terminer : la course est en statut "${reservation.status}"`,
      };
    }

    const now = new Date().toISOString();

    // Recalculer le prix final si les métriques réelles sont fournies (mode formule uniquement)
    let price_final = reservation.price_estimated;
    if (
      dto.actual_distance_km &&
      dto.actual_duration_min &&
      reservation.pricing_type === 'formula'
    ) {
      try {
        const recalc = await pricingService.computePrice({
          country:      reservation.country as 'france' | 'senegal',
          distance_km:  dto.actual_distance_km,
          duration_min: dto.actual_duration_min,
        });
        price_final = recalc.final_price;
      } catch {
        // Si le recalcul échoue, conserver le prix estimé
        price_final = reservation.price_estimated;
      }
    }

    // Mettre à jour la réservation
    const { data, error } = await supabaseAdmin
      .from('reservations')
      .update({
        status:        'completed',
        price_final:   dto.price_adjusted ?? price_final,
        price_adjusted: dto.price_adjusted ?? null,
        distance_km:   dto.actual_distance_km ?? reservation.distance_km,
        duration_min:  dto.actual_duration_min ?? reservation.duration_min,
      })
      .eq('id', reservationId)
      .select(RESERVATION_SELECT)
      .single();

    if (error || !data) throw { status: 500, message: 'Erreur lors de la finalisation de la course' };

    // Remettre le chauffeur en statut 'active' — il redevient disponible
    driversService.setOnTripStatus(reservation.driver_id!, false).catch((err) => {
      console.error('[Reservations] Erreur setOnTripStatus(false) après completeTrip pour driver', reservation.driver_id, err);
    });

    // Mettre à jour le trip
    await supabaseAdmin
      .from('trips')
      .update({
        ended_at:            now,
        actual_distance_km:  dto.actual_distance_km ?? null,
        actual_duration_min: dto.actual_duration_min ?? null,
        driver_notes:        dto.driver_notes ?? null,
      })
      .eq('reservation_id', reservationId);

    // Générer la facture automatiquement (fire-and-forget)
    void (async () => {
      try {
        const { data: tripRow } = await supabaseAdmin
          .from('trips')
          .select('id')
          .eq('reservation_id', reservationId)
          .single();

        if (tripRow?.id) {
          await invoicesService.createFromTrip(tripRow.id as string);
        }
      } catch (err) {
        console.error('[Reservations] Erreur génération facture pour reservation', reservationId, err);
      }
    })();

    // Notification au client — facture disponible
    notificationsService.sendToUser(
      reservation.client_id,
      'invoice_available',
      'Course terminée',
      `Merci pour votre course ! Montant : ${dto.price_adjusted ?? price_final} ${reservation.country === 'senegal' ? 'XOF' : 'EUR'}.`,
      { reservation_id: reservationId },
    );

    return this._mapReservation(data);
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 10. ANNULATION — Client ou Admin
  // ──────────────────────────────────────────────────────────────────────────

  async cancelReservation(
    reservationId: string,
    requesterId:   string,
    requesterRole: UserRole,
    reason?:       string,
  ): Promise<ReservationWithRelations> {
    const reservation = await this._getReservationOrThrow(reservationId);

    // Un client ne peut annuler que ses propres réservations
    if (requesterRole === 'client' && reservation.client_id !== requesterId) {
      throw { status: 403, message: 'Accès refusé' };
    }

    // Statuts non annulables
    if (reservation.status === 'completed') {
      throw { status: 400, message: 'Une course terminée ne peut pas être annulée' };
    }
    if (reservation.status === 'cancelled') {
      throw { status: 400, message: 'Cette réservation est déjà annulée' };
    }
    // Un client ne peut pas annuler une course en cours
    if (requesterRole === 'client' && reservation.status === 'in_progress') {
      throw { status: 400, message: 'Impossible d\'annuler une course en cours. Contactez le support.' };
    }

    const { data, error } = await supabaseAdmin
      .from('reservations')
      .update({ status: 'cancelled' })
      .eq('id', reservationId)
      .select(RESERVATION_SELECT)
      .single();

    if (error || !data) throw { status: 500, message: "Erreur lors de l'annulation" };

    const updated = this._mapReservation(data);

    // Remettre le chauffeur en 'active' seulement s'il était physiquement en route.
    // Pour 'assigned' et 'driver_arrived', driver.status est encore 'active' — rien à faire.
    if (reservation.driver_id && reservation.status === 'in_progress') {
      driversService.setOnTripStatus(reservation.driver_id, false).catch((err) => {
        console.error('[Reservations] Erreur setOnTripStatus(false) après annulation pour driver', reservation.driver_id, err);
      });
    }

    // Notifier le chauffeur si une course lui était assignée
    if (reservation.driver_id) {
      const { data: driverRecord } = await supabaseAdmin
        .from('drivers')
        .select('user_id')
        .eq('id', reservation.driver_id)
        .single();

      if (driverRecord) {
        notificationsService.sendToUser(
          driverRecord.user_id as string,
          'reservation_cancelled',
          'Course annulée',
          `La course du ${this._formatDate(reservation.scheduled_at)} a été annulée.${reason ? ` Motif : ${reason}` : ''}`,
          { reservation_id: reservationId },
        );
      }
    }

    // Notifier le client si l'annulation vient d'un admin
    if (requesterRole !== 'client') {
      notificationsService.sendToUser(
        reservation.client_id,
        'reservation_cancelled',
        'Réservation annulée',
        `Votre course du ${this._formatDate(reservation.scheduled_at)} a été annulée par l'équipe.${reason ? ` Motif : ${reason}` : ''}`,
        { reservation_id: reservationId },
      );
    }

    return updated;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 11. CHAUFFEURS DISPONIBLES — Admin / Manager
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Retourne les chauffeurs actifs et en ligne, sans conflit horaire
   * sur la plage demandée si `scheduledAt` est fourni.
   * Si `vehicleType` est fourni, seuls les chauffeurs dont le vehicle_type correspond sont retournés.
   * Utilisé par le DriverPickerModal pour l'assignation manuelle.
   */
  async getAvailableDrivers(scheduledAt?: string, durationMin?: number, vehicleType?: string): Promise<AvailableDriverDto[]> {
    let query = supabaseAdmin
      .from('drivers')
      .select(`
        id, is_online, status, vehicle_type, zone,
        user:users!user_id(id, email, first_name, last_name, phone, profile_photo_url),
        vehicles:vehicles!driver_id(id, model, plate_number, brand, color, type, photo_url, is_active)
      `)
      .eq('status', 'active')
      .eq('is_online', true);

    if (vehicleType) {
      query = query.eq('vehicle_type', vehicleType);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Reservations] getAvailableDrivers error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des chauffeurs disponibles' };
    }

    const rows = (data ?? []) as any[];

    // Si une date est fournie, exclure les chauffeurs avec un conflit horaire
    let conflictingDriverIds = new Set<string>();
    if (scheduledAt) {
      const newTime     = new Date(scheduledAt).getTime();
      const effectiveDuration = durationMin ?? TRIP_CONFLICT_FALLBACK_MIN;
      const windowStart = new Date(newTime - TRIP_BUFFER_MIN * 60 * 1000).toISOString();
      const windowEnd   = new Date(newTime + (effectiveDuration + TRIP_BUFFER_MIN) * 60 * 1000).toISOString();

      const { data: conflicts } = await supabaseAdmin
        .from('reservations')
        .select('driver_id')
        .in('status', ['assigned', 'driver_arrived', 'in_progress'])
        .gte('scheduled_at', windowStart)
        .lte('scheduled_at', windowEnd);

      conflictingDriverIds = new Set((conflicts ?? []).map((c: any) => c.driver_id));
    }

    return rows
      .filter(d => !conflictingDriverIds.has(d.id))
      .map(d => {
        const activeVehicle = Array.isArray(d.vehicles)
          ? (d.vehicles.find((v: any) => v.is_active) ?? null)
          : null;

        return {
          id:           d.id,
          rating:       null,
          is_online:    d.is_online,
          status:       d.status,
          vehicle_type: d.vehicle_type,
          zone:         d.zone,
          user:         d.user,
          vehicle:      activeVehicle
            ? {
                id:           activeVehicle.id,
                model:        activeVehicle.model,
                plate_number: activeVehicle.plate_number,
                brand:        activeVehicle.brand,
                color:        activeVehicle.color,
                type:         activeVehicle.type,
                photo_url:    activeVehicle.photo_url,
              }
            : null,
        } satisfies AvailableDriverDto;
      });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVÉS — Helpers internes
  // ──────────────────────────────────────────────────────────────────────────

  private _mapDriver(raw: any): AvailableDriverDto | null {
    if (!raw) return null;
    const activeVehicle = Array.isArray(raw.vehicles)
      ? (raw.vehicles.find((v: any) => v.is_active) ?? null)
      : null;
    return {
      id:           raw.id,
      rating:       null,
      is_online:    raw.is_online,
      status:       raw.status,
      vehicle_type: raw.vehicle_type,
      zone:         raw.zone,
      user:         raw.user,
      vehicle:      activeVehicle
        ? {
            id:           activeVehicle.id,
            model:        activeVehicle.model,
            plate_number: activeVehicle.plate_number,
            brand:        activeVehicle.brand,
            color:        activeVehicle.color,
            type:         activeVehicle.type,
            photo_url:    activeVehicle.photo_url,
          }
        : null,
    };
  }

  private _mapReservation(raw: any): ReservationWithRelations {
    return {
      ...raw,
      driver: raw.driver !== undefined ? this._mapDriver(raw.driver) : undefined,
    } as ReservationWithRelations;
  }

  /**
   * Vérifie qu'un chauffeur n'a pas de course en conflit avec `scheduledAt`.
   *
   * Fenêtre de blocage :
   *   - Début : scheduled_at - TRIP_BUFFER_MIN
   *   - Fin   : scheduled_at + durationMin + TRIP_BUFFER_MIN
   *   - Si durationMin est nul (ex. forfait sans métriques), fallback à TRIP_CONFLICT_FALLBACK_MIN.
   *
   * Lève une erreur 409 si un conflit est détecté.
   */
  private async _checkSchedulingConflict(
    driverId: string,
    scheduledAt: string,
    durationMin?: number | null,
  ): Promise<void> {
    const newTime = new Date(scheduledAt).getTime();
    const effectiveDuration = durationMin ?? TRIP_CONFLICT_FALLBACK_MIN;
    const windowStart = new Date(newTime - TRIP_BUFFER_MIN * 60 * 1000).toISOString();
    const windowEnd   = new Date(newTime + (effectiveDuration + TRIP_BUFFER_MIN) * 60 * 1000).toISOString();

    const { data: conflicts } = await supabaseAdmin
      .from('reservations')
      .select('id, scheduled_at')
      .eq('driver_id', driverId)
      .in('status', ['assigned', 'driver_arrived', 'in_progress'])
      .gte('scheduled_at', windowStart)
      .lte('scheduled_at', windowEnd)
      .limit(1);

    if (conflicts && conflicts.length > 0) {
      const conflicting = conflicts[0] as { id: string; scheduled_at: string };
      throw {
        status: 409,
        message: `Ce chauffeur a déjà une course assignée le ${this._formatDate(conflicting.scheduled_at)}, trop proche de l'horaire demandé`,
      };
    }
  }

  private async _getReservationOrThrow(reservationId: string): Promise<Reservation> {
    const { data, error } = await supabaseAdmin
      .from('reservations')
      .select('*')
      .eq('id', reservationId)
      .single();

    if (error || !data) throw { status: 404, message: 'Réservation introuvable' };
    return data as Reservation;
  }

  /**
   * Vérifie que le chauffeur connecté (via son user_id) possède bien cette réservation.
   */
  private async _assertDriverOwnsReservation(
    reservation: Reservation,
    driverUserId: string,
  ): Promise<void> {
    const { data: driverRecord } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('user_id', driverUserId)
      .single();

    if (!driverRecord || reservation.driver_id !== driverRecord.id) {
      throw { status: 403, message: "Cette course ne vous est pas assignée" };
    }
  }

  private _formatDate(isoDate: string): string {
    return new Date(isoDate).toLocaleDateString('fr-FR', {
      day:    '2-digit',
      month:  'long',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit',
    });
  }
}

export const reservationsService = new ReservationsService();

// Re-export du type pour le controller
export type { CompleteReservationDto };
