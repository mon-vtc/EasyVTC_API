// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Factures (Invoices)
// Sprint 4 — EazyVTC
//
// Flux :
//   [Auto] reservationsService.completeTrip() → invoicesService.createFromTrip(tripId)
//          → construit les snapshots → génère le PDF (PDFKit)
//          → upload Supabase Storage → stocke la facture en BDD
//
// Règle CDC absolue :
//   Les formules de calcul ne doivent JAMAIS apparaître sur la facture.
//   Seuls les montants HT, TVA et TTC sont affichés.
//   Modalité fixe : "Réglé hors application (espèces / CB fin de course)"
// ══════════════════════════════════════════════════════════════════════════════

import PDFDocument from 'pdfkit';
import { supabaseAdmin } from '../../database/supabase/client.js';
import type {
  Invoice,
  InvoiceWithTrip,
  InvoiceListFilters,
  InvoiceListResult,
  AdjustInvoicePriceDto,
  DriverBillingSnapshot,
  ClientInvoiceSnapshot,
  TripInvoiceSnapshot,
  InvoiceAdjustment,
} from './invoices.types.js';
import type { UserRole } from '../auth/auth.types.js';

// ── Constantes ────────────────────────────────────────────────────────────────

const BUCKET_NAME       = 'invoices-pdfs';
const SIGNED_URL_EXPIRY = 3600; // 1 heure

const COMPANY = {
  name:    'EazyVTC',
  address: '1 rue de la Paix, 75001 Paris, France',
  phone:   '+33 1 00 00 00 00',
};

const PAYMENT_MENTION = 'Réglé hors application (espèces / CB fin de course)';

// ── Sélect enrichi ────────────────────────────────────────────────────────────

const INVOICE_WITH_TRIP_SELECT = `
  *,
  trip:trips!trip_id(id, reservation_id, started_at, ended_at, actual_distance_km, actual_duration_min)
` as const;

// ══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ══════════════════════════════════════════════════════════════════════════════

export class InvoicesService {

  // ──────────────────────────────────────────────────────────────────────────
  // 1. CRÉATION AUTOMATIQUE depuis un trip complété
  // ──────────────────────────────────────────────────────────────────────────

  /**
   * Appelé automatiquement par reservationsService.completeTrip().
   * Génère la facture + PDF et les stocke.
   * Idempotent : ne crée pas de doublon si appelé plusieurs fois pour le même trip.
   */
  async createFromTrip(tripId: string): Promise<Invoice> {
    // Idempotence — vérifier qu'une facture n'existe pas déjà
    const { data: existing } = await supabaseAdmin
      .from('invoices')
      .select('id')
      .eq('trip_id', tripId)
      .maybeSingle();

    if (existing) {
      return this._getInvoiceOrThrow(existing.id as string);
    }

    // Charger le trip avec ses relations (réservation, chauffeur, client)
    const { data: trip, error: tripError } = await supabaseAdmin
      .from('trips')
      .select(`
        id, reservation_id, started_at, ended_at,
        actual_distance_km, actual_duration_min,
        reservation:reservations!reservation_id(
          id, pickup_address, dest_address, vehicle_type,
          scheduled_at, price_final, price_estimated, country,
          client:users!client_id(first_name, last_name, phone, email),
          driver:drivers!driver_id(
            id, siret, tva_rate, zone,
            user:users!user_id(first_name, last_name, phone, email)
          )
        )
      `)
      .eq('id', tripId)
      .single();

    if (tripError || !trip) {
      throw { status: 404, message: 'Trip introuvable pour la génération de la facture' };
    }

    const reservation = (trip as any).reservation;
    if (!reservation) {
      throw { status: 400, message: 'Réservation introuvable pour ce trip' };
    }

    const driverData = reservation.driver;
    const driverUser = driverData?.user;
    const clientData = reservation.client;

    const driverBilling: DriverBillingSnapshot = {
      first_name: driverUser?.first_name ?? '',
      last_name:  driverUser?.last_name  ?? '',
      phone:      driverUser?.phone      ?? null,
      email:      driverUser?.email      ?? null,
      siret:      driverData?.siret      ?? null,
      tva_rate:   Number(driverData?.tva_rate ?? 0),
      zone:       driverData?.zone ?? 'france',
    };

    const clientSnapshot: ClientInvoiceSnapshot = {
      first_name: clientData?.first_name ?? '',
      last_name:  clientData?.last_name  ?? '',
      phone:      clientData?.phone      ?? null,
      email:      clientData?.email      ?? null,
    };

    const tripSnapshot: TripInvoiceSnapshot = {
      pickup_address:      reservation.pickup_address,
      dest_address:        reservation.dest_address,
      vehicle_type:        reservation.vehicle_type,
      country:             reservation.country,
      scheduled_at:        reservation.scheduled_at,
      started_at:          (trip as any).started_at   ?? null,
      ended_at:            (trip as any).ended_at     ?? null,
      actual_distance_km:  (trip as any).actual_distance_km  ? Number((trip as any).actual_distance_km)  : null,
      actual_duration_min: (trip as any).actual_duration_min ?? null,
    };

    // Calcul HT / TVA / TTC
    const amountTtc = Number(reservation.price_final ?? reservation.price_estimated ?? 0);
    const tvaRate   = driverBilling.tva_rate;
    const amountHt  = tvaRate > 0
      ? Math.round((amountTtc / (1 + tvaRate / 100)) * 100) / 100
      : amountTtc;

    // Générer le numéro de facture unique
    const invoiceNumber = await this._generateInvoiceNumber();

    // Générer le PDF en mémoire
    const pdfBuffer = await this._buildPdf({
      invoiceNumber,
      driverBilling,
      clientSnapshot,
      tripSnapshot,
      amountHt,
      tvaRate,
      amountTtc,
      issuedAt: new Date(),
    });

    // Uploader vers Supabase Storage
    const pdfPath = await this._uploadPdf(pdfBuffer, invoiceNumber);

    // Insérer la facture en BDD
    const { data: invoice, error: insertError } = await supabaseAdmin
      .from('invoices')
      .insert({
        trip_id:         tripId,
        invoice_number:  invoiceNumber,
        pdf_url:         pdfPath,
        driver_billing:  driverBilling,
        client_snapshot: clientSnapshot,
        trip_snapshot:   tripSnapshot,
        amount_ht:       amountHt,
        tva_rate:        tvaRate,
        amount_ttc:      amountTtc,
        adjustments:     [],
        issued_at:       new Date().toISOString(),
      })
      .select()
      .single();

    if (insertError || !invoice) {
      console.error('[Invoices] Erreur insertion:', insertError);
      throw { status: 500, message: 'Erreur lors de la création de la facture' };
    }

    return invoice as Invoice;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 2. RÉCUPÉRER LA FACTURE D'UNE RÉSERVATION
  // ──────────────────────────────────────────────────────────────────────────

  async getByReservationId(
    reservationId: string,
    requesterId:   string,
    requesterRole: UserRole,
  ): Promise<InvoiceWithTrip> {
    // Trouver le trip lié à cette réservation
    const { data: tripRow } = await supabaseAdmin
      .from('trips')
      .select('id')
      .eq('reservation_id', reservationId)
      .maybeSingle();

    if (!tripRow) {
      throw { status: 404, message: 'Aucune facture disponible pour cette réservation (course non clôturée via l\'application)' };
    }

    const { data, error } = await supabaseAdmin
      .from('invoices')
      .select(INVOICE_WITH_TRIP_SELECT)
      .eq('trip_id', tripRow.id as string)
      .maybeSingle();

    if (error || !data) {
      throw { status: 404, message: 'Facture introuvable pour cette réservation' };
    }

    const invoice = data as unknown as InvoiceWithTrip;
    await this._assertAccess(invoice, requesterId, requesterRole);

    return invoice;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. RÉCUPÉRER UNE FACTURE PAR ID (avec contrôle d'accès)
  // ──────────────────────────────────────────────────────────────────────────

  async getById(
    invoiceId:     string,
    requesterId:   string,
    requesterRole: UserRole,
  ): Promise<InvoiceWithTrip> {
    const { data, error } = await supabaseAdmin
      .from('invoices')
      .select(INVOICE_WITH_TRIP_SELECT)
      .eq('id', invoiceId)
      .single();

    if (error || !data) throw { status: 404, message: 'Facture introuvable' };

    const invoice = data as unknown as InvoiceWithTrip;
    await this._assertAccess(invoice, requesterId, requesterRole);

    return invoice;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 3. URL SIGNÉE DU PDF (1 heure)
  // ──────────────────────────────────────────────────────────────────────────

  async getPdfSignedUrl(
    invoiceId:     string,
    requesterId:   string,
    requesterRole: UserRole,
  ): Promise<string> {
    let invoice = await this.getById(invoiceId, requesterId, requesterRole);

    if (!invoice.pdf_url) {
      const pdfBuffer = await this._buildPdf({
        invoiceNumber:  invoice.invoice_number,
        driverBilling:  invoice.driver_billing,
        clientSnapshot: invoice.client_snapshot,
        tripSnapshot:   invoice.trip_snapshot as TripInvoiceSnapshot,
        amountHt:       invoice.amount_ht,
        tvaRate:        invoice.tva_rate,
        amountTtc:      invoice.amount_ttc,
        issuedAt:       new Date(invoice.issued_at),
        adjustments:    invoice.adjustments ?? [],
      });

      const pdfPath = await this._uploadPdf(pdfBuffer, invoice.invoice_number);

      const { data: updated } = await supabaseAdmin
        .from('invoices')
        .update({ pdf_url: pdfPath })
        .eq('id', invoiceId)
        .select()
        .single();

      if (updated) invoice = updated as typeof invoice;
      invoice.pdf_url = pdfPath;
    }

    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(invoice.pdf_url!, SIGNED_URL_EXPIRY);

    if (error || !data?.signedUrl) {
      console.error('[Invoices] Erreur génération URL signée:', error);
      throw { status: 500, message: 'Impossible de générer l\'URL du PDF' };
    }

    return data.signedUrl;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 4. LISTE — Admin / Manager (toutes les factures)
  // ──────────────────────────────────────────────────────────────────────────

  async listAll(filters: InvoiceListFilters): Promise<InvoiceListResult> {
    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 20;
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    const { data, error, count } = await supabaseAdmin
      .from('invoices')
      .select('*', { count: 'exact' })
      .order('issued_at', { ascending: false })
      .range(from, to);

    if (error) throw { status: 500, message: 'Erreur lors de la récupération des factures' };

    const total = count ?? 0;
    return {
      invoices:    (data ?? []) as Invoice[],
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 5. LISTE — Client (ses propres factures)
  // ──────────────────────────────────────────────────────────────────────────

  async listForClient(clientId: string, filters: InvoiceListFilters): Promise<InvoiceListResult> {
    const page  = filters.page  ?? 1;
    const limit = filters.limit ?? 20;
    const from  = (page - 1) * limit;
    const to    = from + limit - 1;

    // Jointure : invoices → trips → reservations → client_id
    const { data, error, count } = await supabaseAdmin
      .from('invoices')
      .select(
        `*, trip:trips!trip_id!inner(
          reservation:reservations!reservation_id!inner(client_id)
        )`,
        { count: 'exact' },
      )
      .eq('trip.reservation.client_id', clientId)
      .order('issued_at', { ascending: false })
      .range(from, to);

    if (error) throw { status: 500, message: 'Erreur lors de la récupération des factures' };

    const total    = count ?? 0;
    const invoices = ((data ?? []) as any[]).map(({ trip: _t, ...inv }) => inv as Invoice);

    return { invoices, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 6. LISTE — Chauffeur (ses propres factures)
  // ──────────────────────────────────────────────────────────────────────────

  async listForDriver(driverUserId: string, filters: InvoiceListFilters): Promise<InvoiceListResult> {
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
      .from('invoices')
      .select(
        `*, trip:trips!trip_id!inner(
          reservation:reservations!reservation_id!inner(driver_id)
        )`,
        { count: 'exact' },
      )
      .eq('trip.reservation.driver_id', (driverRecord as any).id)
      .order('issued_at', { ascending: false })
      .range(from, to);

    if (error) throw { status: 500, message: 'Erreur lors de la récupération des factures' };

    const total    = count ?? 0;
    const invoices = ((data ?? []) as any[]).map(({ trip: _t, ...inv }) => inv as Invoice);

    return { invoices, total, page, limit, total_pages: Math.ceil(total / limit) };
  }

  // ──────────────────────────────────────────────────────────────────────────
  // 7. AJUSTEMENT DE PRIX (admin) — avec traçabilité complète
  // ──────────────────────────────────────────────────────────────────────────

  async adjustPrice(
    invoiceId:   string,
    adminId:     string,
    dto:         AdjustInvoicePriceDto,
  ): Promise<Invoice> {
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (fetchError || !existing) throw { status: 404, message: 'Facture introuvable' };

    const invoice = existing as Invoice;

    if (Math.abs(dto.new_amount_ttc - invoice.amount_ttc) < 0.01) {
      throw { status: 400, message: 'Le nouveau montant est identique au montant actuel' };
    }

    // Récupérer le nom de l'admin pour la traçabilité lisible
    const { data: adminUser } = await supabaseAdmin
      .from('users')
      .select('first_name, last_name')
      .eq('id', adminId)
      .single();

    const adminName = adminUser
      ? `${(adminUser as any).first_name} ${(adminUser as any).last_name}`.trim()
      : 'Admin';

    const adjustment: InvoiceAdjustment = {
      adjusted_at:     new Date().toISOString(),
      adjusted_by:     adminId,
      adjusted_by_name: adminName,
      old_amount_ttc:  invoice.amount_ttc,
      new_amount_ttc:  dto.new_amount_ttc,
      reason:          dto.reason,
    };

    const updatedAdjustments = [...(invoice.adjustments ?? []), adjustment];

    // Recalculer HT avec le même taux de TVA
    const newAmountHt = invoice.tva_rate > 0
      ? Math.round((dto.new_amount_ttc / (1 + invoice.tva_rate / 100)) * 100) / 100
      : dto.new_amount_ttc;

    // Régénérer le PDF avec les nouvelles valeurs
    const pdfBuffer = await this._buildPdf({
      invoiceNumber:  invoice.invoice_number,
      driverBilling:  invoice.driver_billing,
      clientSnapshot: invoice.client_snapshot,
      tripSnapshot:   invoice.trip_snapshot as TripInvoiceSnapshot,
      amountHt:       newAmountHt,
      tvaRate:        invoice.tva_rate,
      amountTtc:      dto.new_amount_ttc,
      issuedAt:       new Date(invoice.issued_at),
      adjustments:    updatedAdjustments,
    });

    await this._uploadPdf(pdfBuffer, invoice.invoice_number);

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('invoices')
      .update({
        amount_ht:   newAmountHt,
        amount_ttc:  dto.new_amount_ttc,
        adjustments: updatedAdjustments,
      })
      .eq('id', invoiceId)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('[Invoices] Erreur ajustement prix:', updateError);
      throw { status: 500, message: 'Erreur lors de l\'ajustement du prix' };
    }

    return updated as Invoice;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Contrôle d'accès
  // ──────────────────────────────────────────────────────────────────────────

  private async _assertAccess(
    invoice:       InvoiceWithTrip,
    requesterId:   string,
    requesterRole: UserRole,
  ): Promise<void> {
    if (requesterRole === 'admin' || requesterRole === 'manager') return;

    const trip = invoice.trip;
    if (!trip) throw { status: 403, message: 'Accès refusé' };

    // Charger la réservation pour vérifier client_id et driver_id
    const { data: reservation } = await supabaseAdmin
      .from('reservations')
      .select('client_id, driver_id')
      .eq('id', trip.reservation_id)
      .single();

    if (!reservation) throw { status: 403, message: 'Accès refusé' };

    if (requesterRole === 'client') {
      if ((reservation as any).client_id !== requesterId) {
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

      if (!driverRecord || (reservation as any).driver_id !== (driverRecord as any).id) {
        throw { status: 403, message: 'Accès refusé' };
      }
    }
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Générer un numéro de facture unique : FA-YYYY-NNNNNN
  // ──────────────────────────────────────────────────────────────────────────

  private async _generateInvoiceNumber(): Promise<string> {
    const year = new Date().getFullYear();

    const { count } = await supabaseAdmin
      .from('invoices')
      .select('id', { count: 'exact', head: true })
      .gte('created_at', `${year}-01-01T00:00:00.000Z`)
      .lt('created_at',  `${year + 1}-01-01T00:00:00.000Z`);

    const seq    = (count ?? 0) + 1;
    const padded = String(seq).padStart(6, '0');

    return `FA-${year}-${padded}`;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Construire le PDF (PDFKit)
  // ──────────────────────────────────────────────────────────────────────────

  private _buildPdf(params: {
    invoiceNumber:  string;
    driverBilling:  DriverBillingSnapshot;
    clientSnapshot: ClientInvoiceSnapshot;
    tripSnapshot:   TripInvoiceSnapshot;
    amountHt:       number;
    tvaRate:        number;
    amountTtc:      number;
    issuedAt:       Date;
    adjustments?:   InvoiceAdjustment[];
  }): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const {
        invoiceNumber, driverBilling, clientSnapshot, tripSnapshot,
        amountHt, tvaRate, amountTtc, issuedAt, adjustments = [],
      } = params;

      const doc    = new PDFDocument({ size: 'A4', margin: 50 });
      const chunks: Buffer[] = [];

      doc.on('data',  (chunk: Buffer) => chunks.push(chunk));
      doc.on('end',   () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);

      const PW        = doc.page.width;   // 595
      const M         = 50;
      const CW        = PW - M * 2;       // 495
      const BORDEAUX  = '#3D1515';
      const DARK      = '#1A1A1A';
      const GRAY      = '#666666';
      const LGRAY     = '#F2F2F2';
      const WHITE     = '#FFFFFF';
      const DIVIDER   = '#CCCCCC';
      const currency  = tripSnapshot.country === 'senegal' ? 'XOF' : 'EUR';

      // ── 1. EN-TÊTE (fond bordeaux) ─────────────────────────────────────
      doc.rect(0, 0, PW, 118).fill(BORDEAUX);

      doc.fontSize(26).fillColor(WHITE).font('Helvetica-Bold')
        .text('FACTURE', M, 28, { lineBreak: false });
      doc.fontSize(10).fillColor('rgba(255,255,255,0.85)').font('Helvetica')
        .text(`n°  ${invoiceNumber}`, M, 66, { lineBreak: false });
      doc.fontSize(9).fillColor('rgba(255,255,255,0.70)')
        .text(`Date :  ${this._fmtDate(issuedAt)}`, M, 82, { lineBreak: false });

      // Cercle logo droit
      doc.circle(PW - 72, 59, 33).fill(WHITE);
      doc.fontSize(18).fillColor(BORDEAUX).font('Helvetica-Bold')
        .text('V', PW - 90, 43, { width: 36, align: 'center', lineBreak: false });
      doc.fontSize(6).fillColor(BORDEAUX).font('Helvetica')
        .text('EazyVTC', PW - 97, 66, { width: 50, align: 'center', lineBreak: false });

      // ── 2. IDENTITÉS (À l'attention de | Chauffeur) ────────────────────
      let y  = 138;
      const COL2 = M + CW / 2 + 8;

      // Colonne gauche : CLIENT
      doc.fontSize(8).fillColor(BORDEAUX).font('Helvetica-Bold')
        .text('À l\'attention de', M, y, { lineBreak: false });
      doc.fontSize(10).fillColor(DARK).font('Helvetica-Bold')
        .text(`${clientSnapshot.first_name} ${clientSnapshot.last_name}`, M, y + 15, { lineBreak: false });
      let yL = y + 32;
      if (clientSnapshot.phone) {
        doc.fontSize(8.5).fillColor(GRAY).font('Helvetica')
          .text(`Téléphone : ${clientSnapshot.phone}`, M, yL, { lineBreak: false });
        yL += 13;
      }
      if (clientSnapshot.email) {
        doc.fontSize(8.5).fillColor(GRAY)
          .text(`Email : ${clientSnapshot.email}`, M, yL, { lineBreak: false });
        yL += 13;
      }

      // Colonne droite : CHAUFFEUR
      doc.fontSize(8).fillColor(BORDEAUX).font('Helvetica-Bold')
        .text('Chauffeur', COL2, y, { lineBreak: false });
      doc.fontSize(10).fillColor(DARK).font('Helvetica-Bold')
        .text(`${driverBilling.first_name} ${driverBilling.last_name}`, COL2, y + 15, { lineBreak: false });
      let yR = y + 32;
      if (driverBilling.phone) {
        doc.fontSize(8.5).fillColor(GRAY).font('Helvetica')
          .text(`Téléphone : ${driverBilling.phone}`, COL2, yR, { lineBreak: false });
        yR += 13;
      }
      if (driverBilling.email) {
        doc.fontSize(8.5).fillColor(GRAY)
          .text(`Email : ${driverBilling.email}`, COL2, yR, { lineBreak: false });
        yR += 13;
      }
      if (driverBilling.siret) {
        doc.fontSize(8.5).fillColor(GRAY)
          .text(`SIRET : ${driverBilling.siret}`, COL2, yR, { lineBreak: false });
        yR += 13;
      }

      y = Math.max(yL, yR) + 18;

      // ── 3. SÉPARATEUR + OBJET ──────────────────────────────────────────
      doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(DIVIDER).lineWidth(0.5).stroke();
      y += 15;

      doc.fontSize(10).fillColor(BORDEAUX).font('Helvetica-Bold')
        .text('Objet : Transport avec chauffeur', M, y, { lineBreak: false });
      y += 22;

      // ── 4. TRAJET ──────────────────────────────────────────────────────
      // Prise en charge
      doc.circle(M + 5, y + 7, 5).fill(BORDEAUX);
      doc.fontSize(8).fillColor(GRAY).font('Helvetica')
        .text('Lieu de prise en charge', M + 16, y, { lineBreak: false });
      y += 13;
      doc.fontSize(10).fillColor(DARK).font('Helvetica-Bold')
        .text(tripSnapshot.pickup_address, M + 16, y, { width: CW - 18 });
      y = doc.y + 8;

      // Destination
      doc.circle(M + 5, y + 7, 5).fill(GRAY);
      doc.fontSize(8).fillColor(GRAY).font('Helvetica')
        .text('Destination', M + 16, y, { lineBreak: false });
      y += 13;
      doc.fontSize(10).fillColor(DARK).font('Helvetica-Bold')
        .text(tripSnapshot.dest_address, M + 16, y, { width: CW - 18 });
      y = doc.y + 12;

      // Date + Heure sur la même ligne
      const tripDt  = new Date(tripSnapshot.scheduled_at);
      const dateStr = this._fmtDate(tripDt);
      const timeStr = tripDt.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      doc.fontSize(9).fillColor(DARK).font('Helvetica')
        .text(dateStr, M, y, { lineBreak: false });
      doc.fontSize(9).fillColor(DARK)
        .text(`  •  ${timeStr}`, M + 175, y, { lineBreak: false });
      y += 15;

      // Véhicule + Chauffeur
      doc.fontSize(9).fillColor(DARK).font('Helvetica')
        .text(
          `Votre chauffeur était :  ${this._vehicleLabel(tripSnapshot.vehicle_type)} - ${driverBilling.first_name} ${driverBilling.last_name}`,
          M, y, { lineBreak: false },
        );
      y += 22;

      // ── 5. TABLEAU DES PRESTATIONS ─────────────────────────────────────
      const DESIG_W  = 285;
      const QTY_W    = 85;
      const AMT_W    = CW - DESIG_W - QTY_W;
      const ROW_H    = 28;

      // En-tête tableau
      doc.rect(M, y, CW, ROW_H).fill(BORDEAUX);
      doc.fontSize(9).fillColor(WHITE).font('Helvetica-Bold')
        .text('Désignation', M + 8, y + 10, { width: DESIG_W - 8, lineBreak: false });
      doc.fontSize(9).fillColor(WHITE).font('Helvetica-Bold')
        .text('Quantité', M + DESIG_W, y + 10, { width: QTY_W, align: 'center', lineBreak: false });
      doc.fontSize(9).fillColor(WHITE).font('Helvetica-Bold')
        .text('Montant HT', M + DESIG_W + QTY_W, y + 10, { width: AMT_W - 8, align: 'right', lineBreak: false });
      y += ROW_H;

      // Ligne transport
      doc.rect(M, y, CW, ROW_H).fill(WHITE);
      doc.rect(M, y, CW, ROW_H).stroke(DIVIDER);
      doc.fontSize(8.5).fillColor(DARK).font('Helvetica')
        .text('Transport de voyage (Course VTC)', M + 8, y + 10, { width: DESIG_W - 8, lineBreak: false });
      doc.fontSize(8.5).fillColor(DARK)
        .text('1', M + DESIG_W, y + 10, { width: QTY_W, align: 'center', lineBreak: false });
      doc.fontSize(8.5).fillColor(DARK)
        .text(`${this._fmtAmount(amountHt)} ${currency}`, M + DESIG_W + QTY_W, y + 10, { width: AMT_W - 8, align: 'right', lineBreak: false });
      y += ROW_H + 10;

      // ── 6. TOTAUX ──────────────────────────────────────────────────────
      const totRow = (label: string, value: string, bold = false) => {
        const font = bold ? 'Helvetica-Bold' : 'Helvetica';
        doc.fontSize(9).fillColor(bold ? DARK : GRAY).font(font)
          .text(label, M, y, { width: CW / 2, lineBreak: false });
        doc.fontSize(9).fillColor(DARK).font(font)
          .text(value, M, y, { align: 'right', width: CW, lineBreak: false });
        y += 18;
      };

      // CDC : jamais les formules, uniquement les montants finaux
      totRow('Total HT', `${this._fmtAmount(amountHt)} ${currency}`, true);

      if (tvaRate > 0) {
        const tvaAmt = Math.round((amountTtc - amountHt) * 100) / 100;
        totRow(`TVA (${tvaRate} %)`, `${this._fmtAmount(tvaAmt)} ${currency}`);
      }

      y += 3;

      // Box Total TTC (fond bordeaux)
      doc.rect(M, y, CW, 36).fill(BORDEAUX);
      doc.fontSize(11).fillColor(WHITE).font('Helvetica-Bold')
        .text('Total TTC', M + 12, y + 12, { width: CW / 2, lineBreak: false });
      doc.fontSize(13).fillColor(WHITE).font('Helvetica-Bold')
        .text(`${this._fmtAmount(amountTtc)} ${currency}`, M + 12, y + 11, { align: 'right', width: CW - 12, lineBreak: false });
      y += 48;

      // ── 7. SECTION PAIEMENT (fond gris) ───────────────────────────────
      doc.rect(M, y, CW, 48).fill(LGRAY);
      doc.fontSize(8.5).fillColor(GRAY).font('Helvetica-Oblique')
        .text('Réglé hors application', M + 12, y + 10, { lineBreak: false });
      doc.fontSize(8.5).fillColor(DARK).font('Helvetica')
        .text('Mode de paiement : Espèces / CB fin de course', M + 12, y + 27, { lineBreak: false });
      y += 60;

      // ── 8. TRAÇABILITÉ AJUSTEMENTS (si applicable) ────────────────────
      if (adjustments.length > 0) {
        doc.moveTo(M, y).lineTo(PW - M, y).strokeColor(DIVIDER).lineWidth(0.3).stroke();
        y += 12;
        doc.fontSize(9).fillColor(BORDEAUX).font('Helvetica-Bold')
          .text('Historique des modifications de prix', M, y, { lineBreak: false });
        y += 14;
        for (const adj of adjustments) {
          doc.fontSize(8).fillColor(GRAY).font('Helvetica')
            .text(
              `${this._fmtDate(new Date(adj.adjusted_at))} — ${adj.adjusted_by_name} : ` +
              `${this._fmtAmount(adj.old_amount_ttc)} ${currency} → ` +
              `${this._fmtAmount(adj.new_amount_ttc)} ${currency} — Motif : ${adj.reason}`,
              M, y, { width: CW },
            );
          y = doc.y + 4;
        }
        y += 8;
      }

      // ── 9. PIED DE PAGE LÉGAL ─────────────────────────────────────────
      const footerY = doc.page.height - 65;

      doc.moveTo(M, footerY - 8).lineTo(PW - M, footerY - 8)
        .strokeColor(DIVIDER).lineWidth(0.3).stroke();

      if (driverBilling.siret) {
        let legalLine = `SIRET : ${driverBilling.siret}`;
        if (driverBilling.tva_rate === 0) {
          legalLine += ' — Auto-entrepreneur/Micro-entrepreneur, exonéré d\'immatriculation au RCS et au RM';
        }
        doc.fontSize(7).fillColor(GRAY).font('Helvetica')
          .text(legalLine, M, footerY, { width: CW });
      } else {
        doc.fontSize(7).fillColor(GRAY).font('Helvetica')
          .text(`Réf. : ${invoiceNumber}  —  Date d'émission : ${this._fmtDate(issuedAt)}`, M, footerY, { align: 'center', width: CW });
      }

      doc.end();
    });
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Upload PDF vers Supabase Storage
  // ──────────────────────────────────────────────────────────────────────────

  private async _uploadPdf(pdfBuffer: Buffer, invoiceNumber: string): Promise<string> {
    const filePath = `${new Date().getFullYear()}/${invoiceNumber}.pdf`;

    const { error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(filePath, pdfBuffer, {
        contentType: 'application/pdf',
        upsert:      true,
      });

    if (error) {
      console.error('[Invoices] Erreur upload PDF:', error);
      throw { status: 500, message: 'Erreur lors de l\'upload de la facture PDF' };
    }

    return filePath;
  }

  // ──────────────────────────────────────────────────────────────────────────
  // PRIVÉ — Helpers
  // ──────────────────────────────────────────────────────────────────────────

  private async _getInvoiceOrThrow(invoiceId: string): Promise<Invoice> {
    const { data, error } = await supabaseAdmin
      .from('invoices')
      .select('*')
      .eq('id', invoiceId)
      .single();

    if (error || !data) throw { status: 404, message: 'Facture introuvable' };
    return data as Invoice;
  }

  private _fmtDate(d: Date): string {
    return d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  }

  private _fmtDateTime(d: Date): string {
    return d.toLocaleDateString('fr-FR', {
      day: '2-digit', month: 'long', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  }

  private _fmtAmount(n: number): string {
    return n.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  private _vehicleLabel(type: string): string {
    return ({ standard: 'Standard', berline: 'Berline', van: 'Van' })[type] ?? type;
  }
}

export const invoicesService = new InvoicesService();
