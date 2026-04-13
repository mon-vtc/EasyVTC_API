// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Bons de commande (Orders)
// Sprint 4 — EazyVTC
//
// Flux :
//   [Auto] reservationsService.assignDriver() → ordersService.createFromReservation()
//          → génère le PDF (PDFKit) → upload Supabase Storage → stocke l'order
//
// Règle CDC absolue (p.26) :
//   Les formules de calcul ne doivent JAMAIS apparaître sur le bon.
//   Seul le montant final est affiché, et uniquement pour les forfaits.
// ══════════════════════════════════════════════════════════════════════════════

import PDFDocument from 'pdfkit';
import { supabaseAdmin } from '../../database/supabase/client.js';
import type {
  Order,
  OrderWithReservation,
  OrderListFilters,
  OrderListResult,
  DriverSnapshot,
  PassengerSnapshot,
  TripSnapshot,
} from './orders.types.js';
import type { UserRole } from '../auth/auth.types.js';

// ── Constantes ────────────────────────────────────────────────────────────────

const BUCKET_NAME       = 'orders-pdfs';
const SIGNED_URL_EXPIRY = 3600; // 1 heure

// En-tête société affiché sur le PDF
const COMPANY = {
  name:    'EazyVTC',
  address: '1 rue de la Paix, 75001 Paris, France',
  phone:   '+33 1 00 00 00 00',
  via:     'EazyVTC',
};

// ── Sélect enrichi ────────────────────────────────────────────────────────────

const ORDER_WITH_RESERVATION_SELECT = `
  *,
  reservation:reservations!reservation_id(id, status, client_id, driver_id)
` as const;

// ══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ══════════════════════════════════════════════════════════════════════════════

export class OrdersService {

  // ──────────────────────────────────────────────────────────────────────────
  // 1. CRÉATION AUTOMATIQUE depuis une réservation assignée
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Appelé automatiquement par reservationsService.assignDriver().
   * Génère le bon de commande + PDF et le stocke.
   * Ne lève jamais d'erreur vers l'appelant (fire-and-forget safe).
   */
  async createFromReservation(reservationId: string): Promise<Order> {
    // Vérifier qu'un bon n'existe pas déjà pour cette réservation
    const { data: existing } = await supabaseAdmin
      .from('orders')
      .select('id')
      .eq('reservation_id', reservationId)
      .maybeSingle();

    if (existing) {
      return this._getOrderOrThrow(existing.id as string);
    }

    // Charger la réservation avec ses relations
    const { data: reservation, error: resError } = await supabaseAdmin
      .from('reservations')
      .select(`
        *,
        client:users!client_id(first_name, last_name, phone),
        driver:drivers!driver_id(
          siret,
          user:users!user_id(first_name, last_name, phone)
        )
      `)
      .eq('id', reservationId)
      .single();

    if (resError || !reservation) {
      throw { status: 404, message: 'Réservation introuvable pour la génération du bon' };
    }

    if (!reservation.driver_id) {
      throw { status: 400, message: 'Aucun chauffeur assigné à cette réservation' };
    }

    // Construire les snapshots (données figées)
    const clientData  = (reservation as any).client;
    const driverData  = (reservation as any).driver;
    const driverUser  = driverData?.user;

    const driverSnapshot: DriverSnapshot = {
      first_name: driverUser?.first_name ?? '',
      last_name:  driverUser?.last_name  ?? '',
      phone:      driverUser?.phone      ?? null,
      siret:      driverData?.siret      ?? null,
    };

    const passengerSnapshot: PassengerSnapshot = {
      first_name: clientData?.first_name ?? '',
      last_name:  clientData?.last_name  ?? '',
      phone:      clientData?.phone      ?? null,
    };

    // Détermination de la devise selon le pays
    const currency = (reservation as any).country === 'senegal' ? 'XOF' : 'EUR';

    // CDC p.26 : montant affiché UNIQUEMENT pour les forfaits
    const isFlatRate  = (reservation as any).pricing_type === 'flat_rate';
    const finalPrice  = isFlatRate ? ((reservation as any).price_estimated ?? null) : null;

    const tripSnapshot: TripSnapshot = {
      pickup_address: (reservation as any).pickup_address,
      dest_address:   (reservation as any).dest_address,
      vehicle_type:   (reservation as any).vehicle_type,
      country:        (reservation as any).country,
      scheduled_at:   (reservation as any).scheduled_at,
      comment:        (reservation as any).comment ?? null,
      via:            COMPANY.via,
      pricing_type:   (reservation as any).pricing_type ?? 'formula',
      final_price:    finalPrice,
      currency,
    };

    // Générer le numéro de bon unique
    const orderNumber = await this._generateOrderNumber();

    // Générer le PDF en mémoire
    const pdfBuffer = await this._buildPdf({
      orderNumber,
      driverSnapshot,
      passengerSnapshot,
      tripSnapshot,
      issuedAt: new Date(),
    });

    // Uploader vers Supabase Storage
    const pdfPath = await this._uploadPdf(pdfBuffer, orderNumber);

    // Insérer l'order en base
    const { data: order, error: insertError } = await supabaseAdmin
      .from('orders')
      .insert({
        reservation_id:     reservationId,
        order_number:       orderNumber,
        pdf_url:            pdfPath,
        driver_snapshot:    driverSnapshot,
        passenger_snapshot: passengerSnapshot,
        trip_snapshot:      tripSnapshot,
        issued_at:          new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !order) {
      console.error('[Orders] Erreur insertion:', insertError);
      throw { status: 500, message: 'Erreur lors de la création du bon de commande' };
    }

    return order as Order;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. RÉCUPÉRER UN BON PAR ID (avec contrôle d'accès)
  // ──────────────────────────────────────────────────────────────────────────

  async getById(
    orderId:       string,
    requesterId:   string,
    requesterRole: UserRole,
  ): Promise<OrderWithReservation> {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select(ORDER_WITH_RESERVATION_SELECT)
      .eq('id', orderId)
      .single();

    if (error || !data) throw { status: 404, message: 'Bon de commande introuvable' };

    const order = data as unknown as OrderWithReservation;
    await this._assertAccess(order, requesterId, requesterRole);

    return order;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. RÉCUPÉRER LE BON D'UNE RÉSERVATION
  // ──────────────────────────────────────────────────────────────────────────

  async getByReservationId(
    reservationId: string,
    requesterId:   string,
    requesterRole: UserRole,
  ): Promise<OrderWithReservation> {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select(ORDER_WITH_RESERVATION_SELECT)
      .eq('reservation_id', reservationId)
      .single();

    if (error || !data) throw { status: 404, message: 'Bon de commande introuvable pour cette réservation' };

    const order = data as unknown as OrderWithReservation;
    await this._assertAccess(order, requesterId, requesterRole);

    return order;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. URL SIGNÉE DU PDF (1 heure)
  // ──────────────────────────────────────────────────────────────────────────

  async getPdfSignedUrl(
    orderId:       string,
    requesterId:   string,
    requesterRole: UserRole,
  ): Promise<string> {
    const order = await this.getById(orderId, requesterId, requesterRole);

    if (!order.pdf_url) {
      throw { status: 404, message: 'Le PDF de ce bon de commande n\'est pas encore disponible' };
    }

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(order.pdf_url, SIGNED_URL_EXPIRY);

    if (error || !data?.signedUrl) {
      console.error('[Orders] Erreur génération URL signée:', error);
      throw { status: 500, message: 'Impossible de générer l\'URL du PDF' };
    }

    return data.signedUrl;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. LISTE — Admin / Manager
  // ──────────────────────────────────────────────────────────────────────────

  async listOrders(filters: OrderListFilters): Promise<OrderListResult> {
    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 20;
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    let query = supabaseAdmin
      .from('orders')
      .select('*', { count: 'exact' })
      .order('issued_at', { ascending: false })
      .range(from, to);

    if (filters.reservation_id) {
      query = query.eq('reservation_id', filters.reservation_id);
    }

    const { data, error, count } = await query;
    if (error) throw { status: 500, message: 'Erreur lors de la récupération des bons de commande' };

    const total = count ?? 0;

    return {
      orders:      (data ?? []) as Order[],
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. LISTE — Client (ses propres bons)
  // ──────────────────────────────────────────────────────────────────────────

  async listForClient(clientId: string, filters: OrderListFilters): Promise<OrderListResult> {
    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 20;
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    // Jointure via reservations pour filtrer par client_id
    let query = supabaseAdmin
      .from('orders')
      .select('*, reservation:reservations!reservation_id!inner(client_id)', { count: 'exact' })
      .eq('reservation.client_id', clientId)
      .order('issued_at', { ascending: false })
      .range(from, to);

    if (filters.reservation_id) {
      query = query.eq('reservation_id', filters.reservation_id);
    }

    const { data, error, count } = await query;
    if (error) throw { status: 500, message: 'Erreur lors de la récupération des bons de commande' };

    const total = count ?? 0;

    // Retirer le champ jointure de chaque objet
    const orders = ((data ?? []) as any[]).map(({ reservation: _r, ...o }) => o as Order);

    return { orders, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. LISTE — Chauffeur (ses propres bons)
  // ──────────────────────────────────────────────────────────────────────────

  async listForDriver(driverUserId: string, filters: OrderListFilters): Promise<OrderListResult> {
    // Résoudre driver_id depuis user_id
    const { data: driverRecord } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('user_id', driverUserId)
      .single();

    if (!driverRecord) throw { status: 404, message: 'Profil chauffeur introuvable' };

    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 20;
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    const { data, error, count } = await supabaseAdmin
      .from('orders')
      .select('*, reservation:reservations!reservation_id!inner(driver_id)', { count: 'exact' })
      .eq('reservation.driver_id', driverRecord.id as string)
      .order('issued_at', { ascending: false })
      .range(from, to);

    if (error) throw { status: 500, message: 'Erreur lors de la récupération des bons de commande' };

    const total = count ?? 0;
    const orders = ((data ?? []) as any[]).map(({ reservation: _r, ...o }) => o as Order);

    return { orders, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Contrôle d'accès
  // ──────────────────────────────────────────────────────────────────────────

  private async _assertAccess(
    order:         OrderWithReservation,
    requesterId:   string,
    requesterRole: UserRole,
  ): Promise<void> {
    if (requesterRole === 'admin' || requesterRole === 'manager') return;

    const reservation = order.reservation;
    if (!reservation) throw { status: 403, message: 'Accès refusé' };

    if (requesterRole === 'client') {
      if (reservation.client_id !== requesterId) {
        throw { status: 403, message: 'Accès refusé' };
      }
      return;
    }

    if (requesterRole === 'driver') {
      const { data: driverRecord } = await supabaseAdmin
        .from('drivers')
        .select('id')
        .eq('user_id', requesterId)
        .single();

      if (!driverRecord || reservation.driver_id !== (driverRecord as any).id) {
        throw { status: 403, message: 'Accès refusé' };
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Générer un numéro de bon unique : BC-YYYY-NNNNNN
  // ──────────────────────────────────────────────────────────────────────────

  private async _generateOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();

    // Compter les bons de l'année courante
    const { count } = await supabaseAdmin
      .from('orders')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${year}-01-01T00:00:00.000Z`)
      .lt('created_at',  `${year + 1}-01-01T00:00:00.000Z`);

    const seq    = (count ?? 0) + 1;
    const padded = String(seq).padStart(6, '0');

    return `BC-${year}-${padded}`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Construire le PDF (PDFKit)
  // ──────────────────────────────────────────────────────────────────────────

  private _buildPdf(params: {
    orderNumber:       string;
    driverSnapshot:    DriverSnapshot;
    passengerSnapshot: PassengerSnapshot;
    tripSnapshot:      TripSnapshot;
    issuedAt:          Date;
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const { orderNumber, driverSnapshot, passengerSnapshot, tripSnapshot, issuedAt } = params;

      const doc    = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data',  (chunk: Buffer) => chunks.push(chunk));
      doc.on('end',   () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const W    = doc.page.width  - 100; // largeur utile
      const GRAY = '#555555';
      const DARK = '#1a1a1a';

      // ── En-tête société ─────────────────────────────────────────────────
      doc.fontSize(20).fillColor(DARK).font('Helvetica-Bold').text(COMPANY.name, 50, 50);
      doc.fontSize(9).fillColor(GRAY).font('Helvetica')
        .text(COMPANY.address, 50, 75)
        .text(COMPANY.phone,   50, 87);

      // Date d'édition (coin droit)
      doc.fontSize(9).fillColor(GRAY).font('Helvetica')
        .text(`Édité le ${this._fmtDate(issuedAt)}`, 50, 50, { align: 'right', width: W });

      // ── Ligne de séparation ──────────────────────────────────────────────
      doc.moveTo(50, 110).lineTo(545, 110).strokeColor('#cccccc').lineWidth(0.5).stroke();

      // ── Titre principal ──────────────────────────────────────────────────
      doc.fontSize(16).fillColor(DARK).font('Helvetica-Bold')
        .text('ORDRE DE MISSION', 50, 125, { align: 'center', width: W });

      doc.fontSize(9).fillColor(GRAY).font('Helvetica')
        .text('Location de véhicule avec chauffeur', 50, 147, { align: 'center', width: W });

      // ── Bloc voyage ──────────────────────────────────────────────────────
      let y = 180;

      const row = (label: string, value: string) => {
        doc.fontSize(9).fillColor(GRAY).font('Helvetica-Bold').text(label, 50, y, { width: 140 });
        doc.fontSize(9).fillColor(DARK).font('Helvetica').text(value || '—', 195, y, { width: W - 145 });
        y += 18;
      };

      doc.fontSize(10).fillColor(DARK).font('Helvetica-Bold').text('Détails du voyage', 50, y);
      y += 16;
      doc.moveTo(50, y).lineTo(545, y).strokeColor('#eeeeee').lineWidth(0.5).stroke();
      y += 10;

      row('Conducteur',        `${driverSnapshot.first_name} ${driverSnapshot.last_name}`);
      row('Passager',          `${passengerSnapshot.first_name} ${passengerSnapshot.last_name}${passengerSnapshot.phone ? ` — ${passengerSnapshot.phone}` : ''}`);
      row('Date de commande',  this._fmtDateTime(issuedAt));
      row('Prise en charge',   this._fmtDateTime(new Date(tripSnapshot.scheduled_at)));
      row('Lieu de départ',    tripSnapshot.pickup_address);
      row('Destination',       tripSnapshot.dest_address);
      row('Type de véhicule',  this._vehicleLabel(tripSnapshot.vehicle_type));
      row('Via',               tripSnapshot.via);

      if (tripSnapshot.comment) {
        row('Informations', tripSnapshot.comment);
      }

      // CDC p.26 — montant affiché UNIQUEMENT pour les forfaits
      if (tripSnapshot.pricing_type === 'flat_rate' && tripSnapshot.final_price !== null) {
        y += 6;
        doc.moveTo(50, y).lineTo(545, y).strokeColor('#eeeeee').lineWidth(0.5).stroke();
        y += 10;
        doc.fontSize(9).fillColor(GRAY).font('Helvetica-Bold').text('Tarif forfaitaire', 50, y, { width: 140 });
        doc.fontSize(9).fillColor(DARK).font('Helvetica-Bold')
          .text(`${tripSnapshot.final_price} ${tripSnapshot.currency}`, 195, y, { width: W - 145 });
        y += 18;
      }

      // ── Pied de page ─────────────────────────────────────────────────────
      const footerY = doc.page.height - 60;

      doc.moveTo(50, footerY - 10).lineTo(545, footerY - 10)
        .strokeColor('#cccccc').lineWidth(0.5).stroke();

      doc.fontSize(8).fillColor(GRAY).font('Helvetica')
        .text(`Réf. document : ${orderNumber}`, 50, footerY, { width: W / 2 })
        .text(`Date d'édition : ${this._fmtDate(issuedAt)}`, 50, footerY, {
          align: 'right',
          width: W,
        });

      doc.end();
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Upload PDF vers Supabase Storage
  // ──────────────────────────────────────────────────────────────────────────

  private async _uploadPdf(pdfBuffer: Buffer, orderNumber: string): Promise<string> {
    const filePath = `${new Date().getFullYear()}/${orderNumber}.pdf`;

    const { error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert:      true,
      });

    if (error) {
      console.error('[Orders] Erreur upload PDF:', error);
      throw { status: 500, message: 'Erreur lors de l\'upload du bon de commande PDF' };
    }

    return filePath;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Helpers
  // ──────────────────────────────────────────────────────────────────────────

  private async _getOrderOrThrow(orderId: string): Promise<Order> {
    const { data, error } = await supabaseAdmin
      .from('orders')
      .select('*')
      .eq('id', orderId)
      .single();

    if (error || !data) throw { status: 404, message: 'Bon de commande introuvable' };
    return data as Order;
  }

  private _fmtDate(d: Date): string {
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  private _fmtDateTime(d: Date): string {
    return d.toLocaleDateString('fr-FR', {
      day:    '2-digit',
      month:  'long',
      year:   'numeric',
      hour:   '2-digit',
      minute: '2-digit',
    });
  }

  private _vehicleLabel(type: string): string {
    const labels: Record<string, string> = {
      standard: 'Standard',
      berline:  'Berline',
      van:      'Van',
    };
    return labels[type] ?? type;
  }
}

export const ordersService = new OrdersService();
