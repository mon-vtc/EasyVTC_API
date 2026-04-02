// ══════════════════════════════════════════════════════════════════════════════
// SERVICE — Module Documents Chauffeur
// Sprint 2 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { supabaseAdmin } from '../../database/supabase/client.js';
import {
  DriverDocument,
  DriverDocumentWithSignedUrl,
  DriverDocumentWithDriver,
  UploadDocumentDto,
  RejectDocumentDto,
  DocumentListFilters,
  DocumentListResult,
  DocumentStats,
  DocumentToAlert,
  DocumentType,
  DOCUMENT_TYPE_LABELS,
} from './driver-documents.types.js';

// ══════════════════════════════════════════════════════════════════════════════
// CONSTANTES
// ══════════════════════════════════════════════════════════════════════════════

const BUCKET_NAME = 'driver-documents';
const SIGNED_URL_EXPIRY = 3600; // 1 heure

// Documents obligatoires pour activer un chauffeur.
// Tous ces types doivent être au statut 'validated' pour que le dossier soit complet.
const REQUIRED_DOCUMENT_TYPES: DocumentType[] = [
  'license',          // Permis de conduire
  'vtc_card',         // Carte professionnelle VTC
  'rc_pro',           // Assurance RC Pro
  'vehicle_insurance', // Attestation d'assurance véhicule
];
const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 Mo

// ══════════════════════════════════════════════════════════════════════════════
// SERVICE
// ══════════════════════════════════════════════════════════════════════════════

export class DriverDocumentsService {

  // ────────────────────────────────────────────────────────────────────────────
  // CHAUFFEUR : Récupérer son driver_id depuis user_id
  // ────────────────────────────────────────────────────────────────────────────
  async getDriverIdFromUserId(userId: string): Promise<string> {
    const { data, error } = await supabaseAdmin
      .from('drivers')
      .select('id')
      .eq('user_id', userId)
      .single();

    if (error || !data) {
      throw { status: 404, message: 'Profil chauffeur non trouvé. Vous devez être enregistré en tant que chauffeur.' };
    }

    return data.id;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CHAUFFEUR : Upload un document
  // ────────────────────────────────────────────────────────────────────────────
  async uploadDocument(
    userId: string,
    fileBuffer: Buffer,
    mimeType: string,
    dto: UploadDocumentDto
  ): Promise<DriverDocumentWithSignedUrl> {
    // Vérifier le format du fichier
    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
      throw {
        status: 400,
        message: `Format non supporté. Formats acceptés: PDF, JPG, PNG, WebP`,
      };
    }

    // Vérifier la taille
    if (fileBuffer.length > MAX_FILE_SIZE) {
      throw {
        status: 400,
        message: `Fichier trop volumineux. Taille max: 10 Mo`,
      };
    }

    // Récupérer le driver_id
    const driverId = await this.getDriverIdFromUserId(userId);

    // Générer le chemin du fichier
    const ext = mimeType === 'application/pdf' ? 'pdf' : mimeType.split('/')[1];
    const timestamp = Date.now();
    const filePath = `${driverId}/${dto.doc_type}_${timestamp}.${ext}`;

    // Upload vers Supabase Storage
    const { error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .upload(filePath, fileBuffer, {
        contentType: mimeType,
        upsert: false,
      });

    if (uploadError) {
      console.error('[DriverDocuments] Upload error:', uploadError);
      throw { status: 500, message: 'Erreur lors de l\'upload du fichier' };
    }

    // Vérifier si un document du même type existe déjà (non expiré/rejeté)
    const { data: existingDoc } = await supabaseAdmin
      .from('driver_documents')
      .select('id, status')
      .eq('driver_id', driverId)
      .eq('doc_type', dto.doc_type)
      .in('status', ['pending', 'validated'])
      .single();

    // Si un document existe, on le passe en "remplacé" (on garde l'historique)
    if (existingDoc) {
      await supabaseAdmin
        .from('driver_documents')
        .update({ status: 'expired', updated_at: new Date().toISOString() })
        .eq('id', existingDoc.id);
    }

    // Créer l'entrée en base
    const { data: document, error: insertError } = await supabaseAdmin
      .from('driver_documents')
      .insert({
        driver_id: driverId,
        doc_type: dto.doc_type,
        status: 'pending',
        file_url: filePath,
        expiry_date: dto.expiry_date || null,
        alert_30d_sent: false,
        alert_7d_sent: false,
      })
      .select()
      .single();

    if (insertError || !document) {
      console.error('[DriverDocuments] Insert error:', insertError);
      // Supprimer le fichier uploadé si l'insert échoue
      await supabaseAdmin.storage.from(BUCKET_NAME).remove([filePath]);
      throw { status: 500, message: 'Erreur lors de l\'enregistrement du document' };
    }

    // Générer l'URL signée
    const signedUrl = await this.generateSignedUrl(filePath);

    return {
      ...document,
      signed_url: signedUrl,
      signed_url_expires_at: new Date(Date.now() + SIGNED_URL_EXPIRY * 1000).toISOString(),
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CHAUFFEUR : Lister ses documents
  // ────────────────────────────────────────────────────────────────────────────
  async getMyDocuments(userId: string): Promise<DriverDocumentWithSignedUrl[]> {
    const driverId = await this.getDriverIdFromUserId(userId);

    const { data: documents, error } = await supabaseAdmin
      .from('driver_documents')
      .select('*')
      .eq('driver_id', driverId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[DriverDocuments] List error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des documents' };
    }

    // Ajouter les URLs signées
    const docsWithUrls = await Promise.all(
      (documents || []).map(async (doc) => ({
        ...doc,
        signed_url: await this.generateSignedUrl(doc.file_url),
        signed_url_expires_at: new Date(Date.now() + SIGNED_URL_EXPIRY * 1000).toISOString(),
      }))
    );

    return docsWithUrls;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CHAUFFEUR : Récupérer un document spécifique
  // ────────────────────────────────────────────────────────────────────────────
  async getMyDocument(userId: string, documentId: string): Promise<DriverDocumentWithSignedUrl> {
    const driverId = await this.getDriverIdFromUserId(userId);

    const { data: document, error } = await supabaseAdmin
      .from('driver_documents')
      .select('*')
      .eq('id', documentId)
      .eq('driver_id', driverId)
      .single();

    if (error || !document) {
      throw { status: 404, message: 'Document non trouvé' };
    }

    return {
      ...document,
      signed_url: await this.generateSignedUrl(document.file_url),
      signed_url_expires_at: new Date(Date.now() + SIGNED_URL_EXPIRY * 1000).toISOString(),
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CHAUFFEUR : Supprimer un document (seulement si pending ou rejected)
  // ────────────────────────────────────────────────────────────────────────────
  async deleteMyDocument(userId: string, documentId: string): Promise<void> {
    const driverId = await this.getDriverIdFromUserId(userId);

    const { data: document, error } = await supabaseAdmin
      .from('driver_documents')
      .select('*')
      .eq('id', documentId)
      .eq('driver_id', driverId)
      .single();

    if (error || !document) {
      throw { status: 404, message: 'Document non trouvé' };
    }

    if (document.status === 'validated') {
      throw { status: 400, message: 'Impossible de supprimer un document validé' };
    }

    // Supprimer le fichier du storage
    await supabaseAdmin.storage.from(BUCKET_NAME).remove([document.file_url]);

    // Supprimer l'entrée en base
    const { error: deleteError } = await supabaseAdmin
      .from('driver_documents')
      .delete()
      .eq('id', documentId);

    if (deleteError) {
      console.error('[DriverDocuments] Delete error:', deleteError);
      throw { status: 500, message: 'Erreur lors de la suppression du document' };
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // ADMIN : Lister tous les documents (avec filtres et pagination)
  // ══════════════════════════════════════════════════════════════════════════
  async listAllDocuments(filters: DocumentListFilters): Promise<DocumentListResult> {
    const page = filters.page || 1;
    const limit = filters.limit || 20;
    const offset = (page - 1) * limit;

    let query = supabaseAdmin
      .from('driver_documents')
      .select(`
        *,
        driver:drivers!inner (
          id,
          user_id,
          status,
          user:users!inner (
            id,
            email,
            first_name,
            last_name,
            phone
          )
        )
      `, { count: 'exact' });

    // Appliquer les filtres
    if (filters.status) {
      query = query.eq('status', filters.status);
    }
    if (filters.doc_type) {
      query = query.eq('doc_type', filters.doc_type);
    }
    if (filters.driver_id) {
      query = query.eq('driver_id', filters.driver_id);
    }
    if (filters.expiring_soon) {
      const in30Days = new Date();
      in30Days.setDate(in30Days.getDate() + 30);
      query = query
        .eq('status', 'validated')
        .lte('expiry_date', in30Days.toISOString().split('T')[0])
        .gte('expiry_date', new Date().toISOString().split('T')[0]);
    }

    // Pagination et tri
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[DriverDocuments] List all error:', error);
      throw { status: 500, message: 'Erreur lors de la récupération des documents' };
    }

    const total = count || 0;

    return {
      documents: (data || []) as DriverDocumentWithDriver[],
      total,
      page,
      limit,
      total_pages: Math.ceil(total / limit),
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ADMIN : Récupérer un document par ID
  // ────────────────────────────────────────────────────────────────────────────
  async getDocumentById(documentId: string): Promise<DriverDocumentWithDriver & { signed_url: string }> {
    const { data: document, error } = await supabaseAdmin
      .from('driver_documents')
      .select(`
        *,
        driver:drivers!inner (
          id,
          user_id,
          status,
          user:users!inner (
            id,
            email,
            first_name,
            last_name,
            phone
          )
        )
      `)
      .eq('id', documentId)
      .single();

    if (error || !document) {
      throw { status: 404, message: 'Document non trouvé' };
    }

    const signedUrl = await this.generateSignedUrl(document.file_url);

    return {
      ...(document as DriverDocumentWithDriver),
      signed_url: signedUrl,
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ADMIN : Valider un document
  // ────────────────────────────────────────────────────────────────────────────
  async validateDocument(documentId: string, adminId: string): Promise<DriverDocument> {
    // Vérifier que le document existe et est en attente
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('driver_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (fetchError || !existing) {
      throw { status: 404, message: 'Document non trouvé' };
    }

    if (existing.status !== 'pending') {
      throw { status: 400, message: `Impossible de valider un document avec le statut "${existing.status}"` };
    }

    // Mettre à jour le statut
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('driver_documents')
      .update({
        status: 'validated',
        validated_at: new Date().toISOString(),
        validated_by: adminId,
        rejection_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('[DriverDocuments] Validate error:', updateError);
      throw { status: 500, message: 'Erreur lors de la validation du document' };
    }

    // Vérifier si le dossier complet est validé → activer le chauffeur automatiquement
    await this.checkAndActivateDriver(existing.driver_id);

    // TODO: Envoyer notification au chauffeur (push + email)
    // await this.notifyDriver(existing.driver_id, 'validated', existing.doc_type);

    return updated;
  }

  // ────────────────────────────────────────────────────────────────────────────
  // ADMIN : Rejeter un document
  // ────────────────────────────────────────────────────────────────────────────
  async rejectDocument(documentId: string, adminId: string, dto: RejectDocumentDto): Promise<DriverDocument> {
    // Vérifier que le document existe et est en attente
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('driver_documents')
      .select('*')
      .eq('id', documentId)
      .single();

    if (fetchError || !existing) {
      throw { status: 404, message: 'Document non trouvé' };
    }

    if (existing.status !== 'pending') {
      throw { status: 400, message: `Impossible de rejeter un document avec le statut "${existing.status}"` };
    }

    // Mettre à jour le statut
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('driver_documents')
      .update({
        status: 'rejected',
        rejection_reason: dto.reason,
        validated_by: adminId,
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
      .select()
      .single();

    if (updateError || !updated) {
      console.error('[DriverDocuments] Reject error:', updateError);
      throw { status: 500, message: 'Erreur lors du rejet du document' };
    }

    // TODO: Envoyer notification au chauffeur (push + email)
    // await this.notifyDriver(existing.driver_id, 'rejected', existing.doc_type, dto.reason);

    return updated;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // ADMIN : Statistiques des documents
  // ════════════════════════════════════════════════════════════════════════════
  async getDocumentStats(): Promise<DocumentStats> {
    const today = new Date().toISOString().split('T')[0];
    const in7Days = new Date();
    in7Days.setDate(in7Days.getDate() + 7);
    const in30Days = new Date();
    in30Days.setDate(in30Days.getDate() + 30);

    // Total par statut
    const { data: statusCounts } = await supabaseAdmin
      .from('driver_documents')
      .select('status')
      .then(({ data }) => {
        const counts = { pending: 0, validated: 0, rejected: 0, expired: 0 };
        (data || []).forEach((d: { status: string }) => {
          if (d.status in counts) counts[d.status as keyof typeof counts]++;
        });
        return { data: counts };
      });

    // Documents expirant dans 7 jours
    const { count: expiring7d } = await supabaseAdmin
      .from('driver_documents')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'validated')
      .lte('expiry_date', in7Days.toISOString().split('T')[0])
      .gte('expiry_date', today);

    // Documents expirant dans 30 jours
    const { count: expiring30d } = await supabaseAdmin
      .from('driver_documents')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'validated')
      .lte('expiry_date', in30Days.toISOString().split('T')[0])
      .gte('expiry_date', today);

    const total = Object.values(statusCounts || {}).reduce((a, b) => a + b, 0);

    return {
      total,
      pending: statusCounts?.pending || 0,
      validated: statusCounts?.validated || 0,
      rejected: statusCounts?.rejected || 0,
      expired: statusCounts?.expired || 0,
      expiring_7d: expiring7d || 0,
      expiring_30d: expiring30d || 0,
    };
  }

  // ════════════════════════════════════════════════════════════════════════════
  // CRON : Récupérer les documents à alerter (expiration J-30 et J-7)
  // ════════════════════════════════════════════════════════════════════════════
  async getDocumentsToAlert(): Promise<{ alert30d: DocumentToAlert[]; alert7d: DocumentToAlert[] }> {
    const today = new Date();
    const in7Days = new Date(today);
    in7Days.setDate(in7Days.getDate() + 7);
    const in30Days = new Date(today);
    in30Days.setDate(in30Days.getDate() + 30);

    // Documents expirant dans exactement ~30 jours (non encore alertés)
    const { data: docs30d } = await supabaseAdmin
      .from('driver_documents')
      .select(`
        id,
        doc_type,
        expiry_date,
        driver:drivers!inner (
          user_id,
          user:users!inner (
            email,
            first_name,
            last_name,
            device_token
          )
        )
      `)
      .eq('status', 'validated')
      .eq('alert_30d_sent', false)
      .lte('expiry_date', in30Days.toISOString().split('T')[0])
      .gte('expiry_date', in7Days.toISOString().split('T')[0]);

    // Documents expirant dans exactement ~7 jours (non encore alertés)
    const { data: docs7d } = await supabaseAdmin
      .from('driver_documents')
      .select(`
        id,
        doc_type,
        expiry_date,
        driver:drivers!inner (
          user_id,
          user:users!inner (
            email,
            first_name,
            last_name,
            device_token
          )
        )
      `)
      .eq('status', 'validated')
      .eq('alert_7d_sent', false)
      .lte('expiry_date', in7Days.toISOString().split('T')[0])
      .gte('expiry_date', today.toISOString().split('T')[0]);

    const mapToAlert = (doc: any): DocumentToAlert => ({
      document_id: doc.id,
      doc_type: doc.doc_type,
      expiry_date: doc.expiry_date,
      days_until_expiry: Math.ceil(
        (new Date(doc.expiry_date).getTime() - today.getTime()) / (1000 * 60 * 60 * 24)
      ),
      driver: {
        user_id: doc.driver.user_id,
        email: doc.driver.user.email,
        first_name: doc.driver.user.first_name,
        last_name: doc.driver.user.last_name,
        device_token: doc.driver.user.device_token,
      },
    });

    return {
      alert30d: (docs30d || []).map(mapToAlert),
      alert7d: (docs7d || []).map(mapToAlert),
    };
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CRON : Marquer les alertes comme envoyées
  // ────────────────────────────────────────────────────────────────────────────
  async markAlertSent(documentId: string, alertType: '30d' | '7d'): Promise<void> {
    const field = alertType === '30d' ? 'alert_30d_sent' : 'alert_7d_sent';

    await supabaseAdmin
      .from('driver_documents')
      .update({ [field]: true, updated_at: new Date().toISOString() })
      .eq('id', documentId);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // CRON : Marquer les documents expirés
  // ────────────────────────────────────────────────────────────────────────────
  async markExpiredDocuments(): Promise<number> {
    const today = new Date().toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('driver_documents')
      .update({ status: 'expired', updated_at: new Date().toISOString() })
      .eq('status', 'validated')
      .lt('expiry_date', today)
      .select('id');

    if (error) {
      console.error('[DriverDocuments] Mark expired error:', error);
      return 0;
    }

    return data?.length || 0;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // UTILITAIRES
  // ════════════════════════════════════════════════════════════════════════════

  // ────────────────────────────────────────────────────────────────────────────
  // Active automatiquement le chauffeur si tous les documents requis sont validés.
  // Appelé après chaque validation de document (admin).
  // N'agit que si le chauffeur est encore en statut 'pending'.
  // ────────────────────────────────────────────────────────────────────────────
  private async checkAndActivateDriver(driverId: string): Promise<void> {
    // 1. Vérifier que le chauffeur est encore en attente
    const { data: driver } = await supabaseAdmin
      .from('drivers')
      .select('id, status')
      .eq('id', driverId)
      .single();

    if (!driver || driver.status !== 'pending') {
      return; // Déjà actif, rejeté ou suspendu — rien à faire
    }

    // 2. Récupérer les types de documents validés pour ce chauffeur
    const { data: validatedDocs } = await supabaseAdmin
      .from('driver_documents')
      .select('doc_type')
      .eq('driver_id', driverId)
      .eq('status', 'validated');

    const validatedTypes = new Set((validatedDocs || []).map((d: { doc_type: string }) => d.doc_type));

    // 3. Vérifier que tous les documents obligatoires sont présents
    const allPresent = REQUIRED_DOCUMENT_TYPES.every((type) => validatedTypes.has(type));
    if (!allPresent) {
      return;
    }

    // 4. Activer le chauffeur
    const { error } = await supabaseAdmin
      .from('drivers')
      .update({ status: 'active', updated_at: new Date().toISOString() })
      .eq('id', driverId);

    if (error) {
      console.error('[DriverDocuments] Auto-activation error:', error);
      // On ne lève pas d'exception : la validation du document est déjà enregistrée
    } else {
      console.info(`[DriverDocuments] Chauffeur ${driverId} activé automatiquement après validation du dossier`);
    }
  }

  private async generateSignedUrl(filePath: string): Promise<string> {
    const { data, error } = await supabaseAdmin.storage
      .from(BUCKET_NAME)
      .createSignedUrl(filePath, SIGNED_URL_EXPIRY);

    if (error || !data?.signedUrl) {
      console.error('[DriverDocuments] Signed URL error:', error);
      return '';
    }

    return data.signedUrl;
  }
}
