// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Tarification
// Sprint 3 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireAdmin, requireStaff, requirePermission } from '../../middlewares/role.middleware.js';
import { pricingController } from './pricing.controller.js';

const router = Router();

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES PUBLIQUES (lecture) — Accessibles sans authentification
// ══════════════════════════════════════════════════════════════════════════════

// Grille tarifaire active d'un pays (pour affichage tarifaire public)
router.get('/grids/active/:country', (req, res) => pricingController.getActiveGrid(req, res));

// Liste des forfaits actifs (pour affichage côté client/chauffeur)
router.get('/flat-rates', (req, res) => pricingController.listFlatRates(req, res));

// Détail d'un forfait
router.get('/flat-rates/:id', (req, res) => pricingController.getFlatRate(req, res));

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES PROTÉGÉES — Authentification requise
// ══════════════════════════════════════════════════════════════════════════════

// Estimation de prix (client + chauffeur + admin)
router.post('/estimate', authMiddleware, (req, res) => pricingController.estimate(req, res));

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES ADMIN — Authentification + rôle admin
// ══════════════════════════════════════════════════════════════════════════════

// Config unifiée — lecture
router.get('/config', authMiddleware, requireStaff, requirePermission('view_pricing'), (req, res) => pricingController.getConfig(req, res));

// Config unifiée — mise à jour
router.patch('/config', authMiddleware, requireAdmin, (req, res) => pricingController.updateConfig(req, res));

// Grilles tarifaires — lecture (toutes, avec historique) : admin + manager avec view_pricing
router.get('/grids', authMiddleware, requireStaff, requirePermission('view_pricing'), (req, res) => pricingController.getAllGrids(req, res));

// Grilles tarifaires — écriture
router.post('/grids',      authMiddleware, requireAdmin, (req, res) => pricingController.createGrid(req, res));
router.patch('/grids/:id', authMiddleware, requireAdmin, (req, res) => pricingController.updateGrid(req, res));

// Forfaits — écriture
router.post('/flat-rates',        authMiddleware, requireAdmin, (req, res) => pricingController.createFlatRate(req, res));
router.patch('/flat-rates/:id',   authMiddleware, requireAdmin, (req, res) => pricingController.updateFlatRate(req, res));
router.delete('/flat-rates/:id',  authMiddleware, requireAdmin, (req, res) => pricingController.deactivateFlatRate(req, res));

export default router;