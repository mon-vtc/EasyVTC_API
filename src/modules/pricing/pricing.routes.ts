// ══════════════════════════════════════════════════════════════════════════════
// ROUTES — Module Tarification
// Sprint 3 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.middleware.js';
import { requireStaff, requirePermission } from '../../middlewares/role.middleware.js';
import { pricingController } from './pricing.controller.js';

const router = Router();

// ══════════════════════════════════════════════════════════════════════════════
// ROUTES PUBLIQUES (lecture) — Accessibles sans authentification
// ══════════════════════════════════════════════════════════════════════════════

// Grille tarifaire active (pour affichage tarifaire public)
router.get('/grids/active', (req, res) => pricingController.getActiveGrid(req, res));

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

// Config unifiée — mise à jour : admin + manager avec manage_pricing
router.patch('/config', authMiddleware, requireStaff, requirePermission('manage_pricing'), (req, res) => pricingController.updateConfig(req, res));

// Grilles tarifaires — lecture (toutes, avec historique) : admin + manager avec view_pricing
router.get('/grids', authMiddleware, requireStaff, requirePermission('view_pricing'), (req, res) => pricingController.getAllGrids(req, res));

// Grilles tarifaires — écriture : admin + manager avec manage_pricing
router.post('/grids',      authMiddleware, requireStaff, requirePermission('manage_pricing'), (req, res) => pricingController.createGrid(req, res));
router.patch('/grids/:id', authMiddleware, requireStaff, requirePermission('manage_pricing'), (req, res) => pricingController.updateGrid(req, res));

// Forfaits — écriture : admin + manager avec manage_pricing
router.post('/flat-rates',        authMiddleware, requireStaff, requirePermission('manage_pricing'), (req, res) => pricingController.createFlatRate(req, res));
router.patch('/flat-rates/:id',   authMiddleware, requireStaff, requirePermission('manage_pricing'), (req, res) => pricingController.updateFlatRate(req, res));
router.delete('/flat-rates/:id',  authMiddleware, requireStaff, requirePermission('manage_pricing'), (req, res) => pricingController.deactivateFlatRate(req, res));

export default router;