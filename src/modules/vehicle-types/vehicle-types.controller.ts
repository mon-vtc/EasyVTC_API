// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module Vehicle Types
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { Request, Response } from 'express';
import { vehicleTypesService } from './vehicle-types.service.js';
import {
  createVehicleTypeSchema,
  updateVehicleTypeSchema,
  vehicleTypeIdParamSchema,
} from './vehicle-types.validator.js';

// ── PUBLIC : Types actifs avec prix selon pays ────────────────────────────────

export async function getActiveTypes(req: Request, res: Response) {
  try {
    const country = typeof req.query.country === 'string' ? req.query.country : undefined;
    const types = await vehicleTypesService.getActiveTypes(country);

    return res.json({ ok: true, data: types });
  } catch (err: any) {
    console.error('[VehicleTypes] getActiveTypes error:', err);
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

// ── ADMIN : Liste complète ────────────────────────────────────────────────────

export async function getAllTypes(req: Request, res: Response) {
  try {
    const types = await vehicleTypesService.getAllTypes();

    return res.json({ ok: true, data: types });
  } catch (err: any) {
    console.error('[VehicleTypes] getAllTypes error:', err);
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

// ── ADMIN : Détail par ID ─────────────────────────────────────────────────────

export async function getTypeById(req: Request, res: Response) {
  try {
    const paramValidation = vehicleTypeIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({ ok: false, message: 'ID invalide' });
    }

    const type = await vehicleTypesService.getTypeById(paramValidation.data.id);

    return res.json({ ok: true, data: type });
  } catch (err: any) {
    console.error('[VehicleTypes] getTypeById error:', err);
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

// ── ADMIN : Créer ─────────────────────────────────────────────────────────────

export async function createType(req: Request, res: Response) {
  try {
    const validation = createVehicleTypeSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const type = await vehicleTypesService.createType({
      ...validation.data,
      description: validation.data.description ?? null,
      icon:        validation.data.icon ?? null,
    });

    return res.status(201).json({
      ok: true,
      message: 'Type de véhicule créé avec succès',
      data: type,
    });
  } catch (err: any) {
    console.error('[VehicleTypes] createType error:', err);
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

// ── ADMIN : Mettre à jour ─────────────────────────────────────────────────────

export async function updateType(req: Request, res: Response) {
  try {
    const paramValidation = vehicleTypeIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({ ok: false, message: 'ID invalide' });
    }

    const bodyValidation = updateVehicleTypeSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: bodyValidation.error.flatten().fieldErrors,
      });
    }

    const type = await vehicleTypesService.updateType(paramValidation.data.id, bodyValidation.data);

    return res.json({
      ok: true,
      message: 'Type de véhicule mis à jour avec succès',
      data: type,
    });
  } catch (err: any) {
    console.error('[VehicleTypes] updateType error:', err);
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

// ── ADMIN : Supprimer ─────────────────────────────────────────────────────────

export async function deleteType(req: Request, res: Response) {
  try {
    const paramValidation = vehicleTypeIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({ ok: false, message: 'ID invalide' });
    }

    await vehicleTypesService.deleteType(paramValidation.data.id);

    return res.json({ ok: true, message: 'Type de véhicule supprimé avec succès' });
  } catch (err: any) {
    console.error('[VehicleTypes] deleteType error:', err);
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}
