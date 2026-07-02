// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module Documents Chauffeur
// Sprint 2 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { Request, Response } from 'express';
import { DriverDocumentsService } from './driver-documents.service.js';
import {
  uploadDocumentSchema,
  rejectDocumentSchema,
  documentListFiltersSchema,
  documentIdParamSchema,
  driverIdParamSchema,
} from './driver-documents.validator.js';
import { DOCUMENT_TYPE_LABELS, DOCUMENT_STATUS_LABELS } from './driver-documents.types.js';
import { auditLog } from '../../utils/audit.service.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { sendDocumentExpiryAlert } from '../../utils/email.service.js';

const service = new DriverDocumentsService();

// ══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS CHAUFFEUR
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /drivers/documents
 * Upload un document (permis, assurance, carte VTC, Kbis)
 */
export async function uploadDocument(req: Request, res: Response) {
  try {
    const userId = req.user!.id;

    // Vérifier qu'un fichier a été uploadé
    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: 'Aucun fichier fourni. Utilisez le champ "file" en multipart/form-data.',
      });
    }

    // Valider les métadonnées
    const validation = uploadDocumentSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const result = await service.uploadDocument(
      userId,
      req.file.buffer,
      req.file.mimetype,
      validation.data
    );

    return res.status(201).json({
      ok: true,
      message: `Document "${DOCUMENT_TYPE_LABELS[result.doc_type]}" uploadé avec succès. En attente de validation.`,
      data: result,
    });
  } catch (err: any) {
    console.error('[DriverDocuments] Upload error:', err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * GET /drivers/documents
 * Liste les documents du chauffeur connecté
 */
export async function getMyDocuments(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const documents = await service.getMyDocuments(userId);

    return res.json({
      ok: true,
      data: documents,
      meta: {
        total: documents.length,
        labels: {
          types: DOCUMENT_TYPE_LABELS,
          statuses: DOCUMENT_STATUS_LABELS,
        },
      },
    });
  } catch (err: any) {
    console.error('[DriverDocuments] Get my docs error:', err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * GET /drivers/documents/:id
 * Récupère un document spécifique du chauffeur
 */
export async function getMyDocument(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    
    const paramValidation = documentIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'ID document invalide',
      });
    }

    const document = await service.getMyDocument(userId, paramValidation.data.id);

    return res.json({
      ok: true,
      data: document,
    });
  } catch (err: any) {
    console.error('[DriverDocuments] Get my doc error:', err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * DELETE /drivers/documents/:id
 * Supprime un document (seulement si pending ou rejected)
 */
export async function deleteMyDocument(req: Request, res: Response) {
  try {
    const userId = req.user!.id;

    const paramValidation = documentIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'ID document invalide',
      });
    }

    await service.deleteMyDocument(userId, paramValidation.data.id);

    void auditLog(req, {
      action:     'DOCUMENT_DELETED',
      entityType: 'driver_document',
      entityId:   paramValidation.data.id,
    });

    return res.json({
      ok: true,
      message: 'Document supprimé avec succès',
    });
  } catch (err: any) {
    console.error('[DriverDocuments] Delete error:', err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS ADMIN
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/documents
 * Liste tous les documents avec filtres et pagination
 */
export async function listAllDocuments(req: Request, res: Response) {
  try {
    const validation = documentListFiltersSchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Paramètres invalides',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const result = await service.listAllDocuments(validation.data);

    return res.json({
      ok: true,
      data: result,
      meta: {
        labels: {
          types: DOCUMENT_TYPE_LABELS,
          statuses: DOCUMENT_STATUS_LABELS,
        },
      },
    });
  } catch (err: any) {
    console.error('[DriverDocuments] List all error:', err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * GET /admin/documents/driver/:driverId
 * Récupère tous les documents d'un chauffeur spécifique
 */
export async function getDriverDocuments(req: Request, res: Response) {
  try {
    const paramParsed = driverIdParamSchema.safeParse(req.params);
    if (!paramParsed.success) {
      return res.status(400).json({ ok: false, message: 'ID chauffeur invalide' });
    }
    const { driverId } = paramParsed.data;

    const result = await service.listAllDocuments({ driver_id: driverId });

    return res.json({
      ok: true,
      data: result.documents,
      meta: {
        total: result.total,
        labels: {
          types: DOCUMENT_TYPE_LABELS,
          statuses: DOCUMENT_STATUS_LABELS,
        },
      },
    });
  } catch (err: any) {
    console.error('[DriverDocuments] Get driver documents error:', err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * GET /admin/documents/stats
 * Statistiques des documents
 */
export async function getDocumentStats(req: Request, res: Response) {
  try {
    const stats = await service.getDocumentStats();

    return res.json({
      ok: true,
      data: stats,
    });
  } catch (err: any) {
    console.error('[DriverDocuments] Stats error:', err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * GET /admin/documents/:id
 * Récupère un document par ID avec infos chauffeur
 */
export async function getDocumentById(req: Request, res: Response) {
  try {
    const paramValidation = documentIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'ID document invalide',
      });
    }

    const document = await service.getDocumentById(paramValidation.data.id);

    return res.json({
      ok: true,
      data: document,
    });
  } catch (err: any) {
    console.error('[DriverDocuments] Get by ID error:', err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * PATCH /admin/documents/:id/validate
 * Valide un document
 */
export async function validateDocument(req: Request, res: Response) {
  try {
    const adminId = req.user!.id;

    const paramValidation = documentIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'ID document invalide',
      });
    }

    const document = await service.validateDocument(paramValidation.data.id, adminId);

    void auditLog(req, {
      action:     'DOCUMENT_VALIDATED',
      entityType: 'driver_document',
      entityId:   document.id,
      oldValue:   { status: 'pending' },
      newValue:   { status: 'validated', doc_type: document.doc_type },
    });

    return res.json({
      ok: true,
      message: `Document "${DOCUMENT_TYPE_LABELS[document.doc_type]}" validé avec succès`,
      data: document,
    });
  } catch (err: any) {
    console.error('[DriverDocuments] Validate error:', err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * PATCH /admin/documents/:id/reject
 * Rejette un document avec motif obligatoire
 */
export async function rejectDocument(req: Request, res: Response) {
  try {
    const adminId = req.user!.id;

    const paramValidation = documentIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'ID document invalide',
      });
    }

    const bodyValidation = rejectDocumentSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: bodyValidation.error.flatten().fieldErrors,
      });
    }

    const document = await service.rejectDocument(
      paramValidation.data.id,
      adminId,
      bodyValidation.data,
    );

    void auditLog(req, {
      action:     'DOCUMENT_REJECTED',
      entityType: 'driver_document',
      entityId:   document.id,
      oldValue:   { status: 'pending' },
      newValue:   { status: 'rejected', doc_type: document.doc_type, reason: bodyValidation.data.reason },
    });

    return res.json({
      ok: true,
      message: `Document "${DOCUMENT_TYPE_LABELS[document.doc_type]}" rejeté`,
      data: document,
    });
  } catch (err: any) {
    console.error('[DriverDocuments] Reject error:', err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ENDPOINT CRON (appelé par un job externe ou Railway cron)
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /cron/documents/check-expiry
 * Vérifie les documents expirés et envoie les alertes
 * Sécurisé par un header secret (CRON_SECRET)
 */
export async function checkDocumentExpiry(req: Request, res: Response) {
  try {
    // Vérifier le secret cron
    const cronSecret = req.headers['x-cron-secret'];
    if (cronSecret !== process.env.CRON_SECRET) {
      return res.status(401).json({
        ok: false,
        message: 'Unauthorized',
      });
    }

    // 1. Marquer les documents expirés
    const expiredCount = await service.markExpiredDocuments();

    // 2. Récupérer les documents à alerter
    const { alert30d, alert7d } = await service.getDocumentsToAlert();

    const results = {
      expired_marked: expiredCount,
      alerts_30d: alert30d.length,
      alerts_7d: alert7d.length,
      alerts_sent: [] as string[],
    };

    for (const doc of alert30d) {
      const docLabel = DOCUMENT_TYPE_LABELS[doc.doc_type];
      const title = 'Document bientôt expiré';
      const body = `Votre ${docLabel} expire dans 30 jours (${doc.expiry_date}). Pensez à le renouveler.`;
      const data = { document_id: doc.document_id, doc_type: doc.doc_type };

      notificationsService.sendToUser(doc.driver.user_id, 'document_expiry', title, body, data);
      sendDocumentExpiryAlert(doc.driver.email, doc.driver.first_name, docLabel, doc.days_until_expiry)
        .catch((err) => console.error('[CRON] Erreur envoi email alerte 30j:', err));

      await service.markAlertSent(doc.document_id, '30d');
      results.alerts_sent.push(`30d:${doc.document_id}`);
    }

    for (const doc of alert7d) {
      const docLabel = DOCUMENT_TYPE_LABELS[doc.doc_type];
      const title = 'Document expirant très bientôt';
      const body = `Votre ${docLabel} expire dans 7 jours (${doc.expiry_date}). Renouvelez-le immédiatement.`;
      const data = { document_id: doc.document_id, doc_type: doc.doc_type };

      notificationsService.sendToUser(doc.driver.user_id, 'document_expiry', title, body, data);
      sendDocumentExpiryAlert(doc.driver.email, doc.driver.first_name, docLabel, doc.days_until_expiry)
        .catch((err) => console.error('[CRON] Erreur envoi email alerte 7j:', err));

      await service.markAlertSent(doc.document_id, '7d');
      results.alerts_sent.push(`7d:${doc.document_id}`);
    }

    return res.json({
      ok: true,
      message: 'Vérification des documents terminée',
      data: results,
    });
  } catch (err: any) {
    console.error('[DriverDocuments] Cron error:', err);
    return res.status(500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}
