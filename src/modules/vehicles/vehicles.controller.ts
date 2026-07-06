// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module Véhicules
// Sprint 3 — EasyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { Request, Response } from 'express';
import { VehiclesService } from './vehicles.service.js';
import {
  createVehicleSchema,
  updateVehicleSchema,
  vehicleIdParamSchema,
  vehicleListFiltersSchema,
} from './vehicles.validator.js';

const service = new VehiclesService();

// ══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS CHAUFFEUR
// ══════════════════════════════════════════════════════════════════════════════

/**
 * POST /drivers/vehicles
 * Créer un véhicule pour le chauffeur connecté
 */
export async function createVehicle(req: Request, res: Response) {
  try {
    const userId = req.user!.id;

    const validation = createVehicleSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const vehicle = await service.createVehicle(userId, validation.data);

    return res.status(201).json({
      ok: true,
      message: 'Véhicule créé avec succès',
      data: vehicle,
    });
  } catch (err: any) {
    console.error('[Vehicles] Create error:', err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * POST /drivers/vehicles/:id/photo
 * Upload la photo d'un véhicule
 */
export async function uploadVehiclePhoto(req: Request, res: Response) {
  try {
    const userId = req.user!.id;

    if (!req.file) {
      return res.status(400).json({
        ok: false,
        message: 'Aucun fichier fourni. Utilisez le champ "photo" en multipart/form-data.',
      });
    }

    const paramValidation = vehicleIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'ID véhicule invalide',
      });
    }

    const vehicle = await service.uploadVehiclePhoto(
      userId,
      paramValidation.data.id,
      req.file.buffer,
      req.file.mimetype
    );

    return res.json({
      ok: true,
      message: 'Photo du véhicule mise à jour avec succès',
      data: vehicle,
    });
  } catch (err: any) {
    console.error('[Vehicles] Upload photo error:', err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * GET /drivers/vehicles
 * Liste les véhicules du chauffeur connecté
 */
export async function getMyVehicles(req: Request, res: Response) {
  try {
    const userId = req.user!.id;
    const vehicles = await service.getMyVehicles(userId);

    return res.json({
      ok: true,
      data: vehicles,
      meta: { total: vehicles.length },
    });
  } catch (err: any) {
    console.error('[Vehicles] Get my vehicles error:', err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * GET /drivers/vehicles/:id
 * Récupère un véhicule spécifique du chauffeur
 */
export async function getMyVehicle(req: Request, res: Response) {
  try {
    const userId = req.user!.id;

    const paramValidation = vehicleIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'ID véhicule invalide',
      });
    }

    const vehicle = await service.getMyVehicle(userId, paramValidation.data.id);

    return res.json({
      ok: true,
      data: vehicle,
    });
  } catch (err: any) {
    console.error('[Vehicles] Get my vehicle error:', err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * PATCH /drivers/vehicles/:id
 * Mettre à jour un véhicule
 */
export async function updateVehicle(req: Request, res: Response) {
  try {
    const userId = req.user!.id;

    const paramValidation = vehicleIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'ID véhicule invalide',
      });
    }

    const bodyValidation = updateVehicleSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: bodyValidation.error.flatten().fieldErrors,
      });
    }

    const vehicle = await service.updateVehicle(userId, paramValidation.data.id, bodyValidation.data);

    return res.json({
      ok: true,
      message: 'Véhicule mis à jour avec succès',
      data: vehicle,
    });
  } catch (err: any) {
    console.error('[Vehicles] Update error:', err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * DELETE /drivers/vehicles/:id
 * Supprimer un véhicule
 */
export async function deleteVehicle(req: Request, res: Response) {
  try {
    const userId = req.user!.id;

    const paramValidation = vehicleIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'ID véhicule invalide',
      });
    }

    await service.deleteVehicle(userId, paramValidation.data.id);

    return res.json({
      ok: true,
      message: 'Véhicule supprimé avec succès',
    });
  } catch (err: any) {
    console.error('[Vehicles] Delete error:', err);
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
 * GET /admin/vehicles
 * Liste tous les véhicules avec filtres et pagination
 */
export async function getAllVehicles(req: Request, res: Response) {
  try {
    const validation = vehicleListFiltersSchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Paramètres invalides',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const result = await service.getAllVehicles(validation.data);

    return res.json({
      ok: true,
      data: result,
    });
  } catch (err: any) {
    console.error('[Vehicles] Get all error:', err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * GET /admin/vehicles/:id
 * Récupère un véhicule par ID avec infos chauffeur
 */
export async function getVehicleById(req: Request, res: Response) {
  try {
    const paramValidation = vehicleIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'ID véhicule invalide',
      });
    }

    const vehicle = await service.getVehicleById(paramValidation.data.id);

    return res.json({
      ok: true,
      data: vehicle,
    });
  } catch (err: any) {
    console.error('[Vehicles] Get by ID error:', err);
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}
