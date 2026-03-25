// ══════════════════════════════════════════════════════════════════════════════
// TYPES — Module Documents Chauffeur
// Sprint 2 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

// ── Enums (correspondant à la BDD) ───────────────────────────────────────────
export type DocumentType = 'license' | 'insurance' | 'vtc_card' | 'kbis' | 'company_doc';
export type DocumentStatus = 'pending' | 'validated' | 'rejected' | 'expired';

// ── Labels pour affichage ────────────────────────────────────────────────────
export const DOCUMENT_TYPE_LABELS: Record<DocumentType, string> = {
  license: 'Permis de conduire',
  insurance: 'Attestation d\'assurance',
  vtc_card: 'Carte professionnelle VTC',
  kbis: 'Extrait Kbis',
  company_doc: 'Document entreprise',
};

export const DOCUMENT_STATUS_LABELS: Record<DocumentStatus, string> = {
  pending: 'En attente de validation',
  validated: 'Validé',
  rejected: 'Rejeté',
  expired: 'Expiré',
};

// ── Document chauffeur (entité BDD) ──────────────────────────────────────────
export interface DriverDocument {
  id: string;
  driver_id: string;
  doc_type: DocumentType;
  status: DocumentStatus;
  file_url: string;
  expiry_date: string | null; // format YYYY-MM-DD
  alert_30d_sent: boolean;
  alert_7d_sent: boolean;
  rejection_reason: string | null;
  validated_at: string | null;
  validated_by?: string | null; // ID de l'admin qui a validé
  created_at: string;
  updated_at: string;
}

// ── Document avec URL signée (pour les réponses API) ─────────────────────────
export interface DriverDocumentWithSignedUrl extends DriverDocument {
  signed_url: string; // URL temporaire valide 1h
  signed_url_expires_at: string;
}

// ── Document avec infos chauffeur (pour admin) ───────────────────────────────
export interface DriverDocumentWithDriver extends DriverDocument {
  driver: {
    id: string;
    user_id: string;
    status: string;
    user: {
      id: string;
      email: string;
      first_name: string;
      last_name: string;
      phone: string | null;
    };
  };
}

// ── DTO pour upload de document ──────────────────────────────────────────────
export interface UploadDocumentDto {
  doc_type: DocumentType;
  expiry_date?: string; // format YYYY-MM-DD (optionnel pour certains docs)
}

// ── DTO pour validation admin ────────────────────────────────────────────────
export interface ValidateDocumentDto {
  // Pas de champs supplémentaires, juste l'action
}

// ── DTO pour rejet admin ─────────────────────────────────────────────────────
export interface RejectDocumentDto {
  reason: string; // Motif obligatoire
}

// ── Résultat de l'upload ─────────────────────────────────────────────────────
export interface UploadDocumentResult {
  document: DriverDocument;
  signed_url: string;
}

// ── Filtres pour liste des documents (admin) ─────────────────────────────────
export interface DocumentListFilters {
  status?: DocumentStatus;
  doc_type?: DocumentType;
  driver_id?: string;
  expiring_soon?: boolean; // Documents expirant dans les 30 jours
  page?: number;
  limit?: number;
}

// ── Résultat paginé ──────────────────────────────────────────────────────────
export interface DocumentListResult {
  documents: DriverDocumentWithDriver[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// ── Stats documents pour dashboard admin ─────────────────────────────────────
export interface DocumentStats {
  total: number;
  pending: number;
  validated: number;
  rejected: number;
  expired: number;
  expiring_30d: number; // Expirent dans 30 jours
  expiring_7d: number;  // Expirent dans 7 jours
}

// ── Document à alerter (pour le cron) ────────────────────────────────────────
export interface DocumentToAlert {
  document_id: string;
  doc_type: DocumentType;
  expiry_date: string;
  days_until_expiry: number;
  driver: {
    user_id: string;
    email: string;
    first_name: string;
    last_name: string;
    device_token: string | null;
  };
}
