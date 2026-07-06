// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Factures (Invoices)
// Sprint 4 — EasyVTC
//
// GET  /invoices            → Liste (filtrée par rôle : admin/client/driver)
// GET  /invoices/:id        → Détail (accès restreint)
// GET  /invoices/:id/pdf    → URL signée du PDF (1h)
// PUT  /invoices/:id/price  → Ajuster le prix (admin uniquement)
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireAdmin } from '../../middlewares/role.middleware.js';
import * as controller from './invoices.controller.js';

const router = Router();

// Toutes les routes nécessitent une authentification
router.use(authMiddleware);

// Lecture — accessibles à tous les rôles (accès filtré par service)
router.get('/',                                    (req, res) => controller.listInvoices(req, res));
// Par réservation — avant /:id pour éviter le conflit de paramètre
router.get('/by-reservation/:reservationId',       (req, res) => controller.getInvoiceByReservation(req, res));
router.get('/:id/pdf',                             (req, res) => controller.getInvoicePdf(req, res));
router.get('/:id',                                 (req, res) => controller.getInvoice(req, res));

// Écriture — admin uniquement
router.put('/:id/price', requireAdmin, (req, res) => controller.adjustInvoicePrice(req, res));

export default router;
