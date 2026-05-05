// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Documents Chauffeur
// Sprint 2 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import multer from 'multer';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireRole, requireAdmin, requireStaff, requirePermission } from '../../middlewares/role.middleware.js';
import * as controller from './driver-documents.controller.js';

// ── Configuration Multer (stockage mémoire) ──────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 Mo max
  },
  fileFilter: (_req: any, file: any, cb: any) => {
    const allowedMimes = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Format non supporté. Formats acceptés: PDF, JPG, PNG, WebP'));
    }
  },
});

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES CHAUFFEUR — /drivers/documents
// ══════════════════════════════════════════════════════════════════════════════

export const driverDocumentsRoutes = Router();

// Toutes les routes nécessitent l'authentification
driverDocumentsRoutes.use(authMiddleware);

// Routes chauffeur (role: driver)
driverDocumentsRoutes.post(
  '/',
  requireRole('driver'),
  upload.single('file'),
  (req, res) => controller.uploadDocument(req, res)
);

driverDocumentsRoutes.get(
  '/',
  requireRole('driver'),
  (req, res) => controller.getMyDocuments(req, res)
);

driverDocumentsRoutes.get(
  '/:id',
  requireRole('driver'),
  (req, res) => controller.getMyDocument(req, res)
);

driverDocumentsRoutes.delete(
  '/:id',
  requireRole('driver'),
  (req, res) => controller.deleteMyDocument(req, res)
);

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES ADMIN — /admin/documents
// ══════════════════════════════════════════════════════════════════════════════

export const adminDocumentsRoutes = Router();

// Toutes les routes admin nécessitent authentification
adminDocumentsRoutes.use(authMiddleware);

// Liste tous les documents — lecture : admin + manager avec view_documents
adminDocumentsRoutes.get(
  '/',
  requireStaff, requirePermission('view_documents'),
  (req, res) => controller.listAllDocuments(req, res)
);

// Statistiques des documents — lecture : admin + manager avec view_documents
adminDocumentsRoutes.get(
  '/stats',
  requireStaff, requirePermission('view_documents'),
  (req, res) => controller.getDocumentStats(req, res)
);

// Détail d'un document — lecture : admin + manager avec view_documents
adminDocumentsRoutes.get(
  '/:id',
  requireStaff, requirePermission('view_documents'),
  (req, res) => controller.getDocumentById(req, res)
);

// Valider un document — écriture : admin uniquement
adminDocumentsRoutes.patch(
  '/:id/validate',
  requireAdmin,
  (req, res) => controller.validateDocument(req, res)
);

// Rejeter un document — écriture : admin uniquement
adminDocumentsRoutes.patch(
  '/:id/reject',
  requireAdmin,
  (req, res) => controller.rejectDocument(req, res)
);

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES CRON — /cron/documents
// ══════════════════════════════════════════════════════════════════════════════

export const cronDocumentsRoutes = Router();

// Endpoint appelé par le job cron (protégé par header secret)
cronDocumentsRoutes.post(
  '/check-expiry',
  (req, res) => controller.checkDocumentExpiry(req, res)
);
