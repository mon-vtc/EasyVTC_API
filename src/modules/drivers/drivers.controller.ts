// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module Drivers
// Sprint 3 — EazyVTC
// ══════════════════════════════════════════════════════════════════════════════

import { Request, Response } from 'express';
import { driversService } from './drivers.service.js';
import {
  updateDriverSchema,
  toggleOnlineSchema,
  changeDriverStatusSchema,
  adminUpdateDriverSchema,
  driverListFiltersSchema,
  driverIdParamSchema,
  planningQuerySchema,
  revenuesQuerySchema,
} from './drivers.validator.js';

// ══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS CHAUFFEUR
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /drivers/me
 * Retourne le profil complet du chauffeur connecté
 */
export async function getMyProfile(req: Request, res: Response) {
  try {
    const profile = await driversService.getMyProfile(req.user!.id);

    return res.json({
      ok: true,
      data: profile,
    });
  } catch (err: any) {
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * PATCH /drivers/me
 * Met à jour siret, zone, vehicle_type du chauffeur connecté
 */
export async function updateMyProfile(req: Request, res: Response) {
  try {
    const validation = updateDriverSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const profile = await driversService.updateMyProfile(req.user!.id, validation.data);

    return res.json({
      ok: true,
      message: 'Profil chauffeur mis à jour',
      data: profile,
    });
  } catch (err: any) {
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * PATCH /drivers/me/online
 * Passe le chauffeur en ligne ou hors ligne
 */
export async function setOnlineStatus(req: Request, res: Response) {
  try {
    const validation = toggleOnlineSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const profile = await driversService.setOnlineStatus(req.user!.id, validation.data.is_online);

    return res.json({
      ok: true,
      message: validation.data.is_online ? 'Vous êtes maintenant en ligne' : 'Vous êtes maintenant hors ligne',
      data: profile,
    });
  } catch (err: any) {
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * GET /drivers/me/planning?period=week&date=2026-04-09
 * Retourne le planning hebdomadaire ou mensuel du chauffeur connecté
 */
export async function getMyPlanning(req: Request, res: Response) {
  try {
    const validation = planningQuerySchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Paramètres invalides',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const { period, date } = validation.data;
    const planning = await driversService.getPlanning(req.user!.id, period, date);

    return res.json({ ok: true, data: planning });
  } catch (err: any) {
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * GET /drivers/me/revenues?period=month&date=2026-04-09
 * Retourne les revenus du chauffeur connecté pour la période demandée
 */
export async function getMyRevenues(req: Request, res: Response) {
  try {
    const validation = revenuesQuerySchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Paramètres invalides',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const { period, date } = validation.data;
    const revenues = await driversService.getRevenues(req.user!.id, period, date);

    return res.json({ ok: true, data: revenues });
  } catch (err: any) {
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
 * GET /admin/drivers
 * Liste tous les chauffeurs avec filtres et pagination
 */
export async function listDrivers(req: Request, res: Response) {
  try {
    const validation = driverListFiltersSchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Paramètres invalides',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const result = await driversService.listDrivers(validation.data);

    return res.json({
      ok: true,
      data: result,
    });
  } catch (err: any) {
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * GET /admin/drivers/:id
 * Récupère un chauffeur par son driver ID
 */
export async function getDriverById(req: Request, res: Response) {
  try {
    const paramValidation = driverIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'ID chauffeur invalide',
      });
    }

    const driver = await driversService.getDriverById(paramValidation.data.id);

    return res.json({
      ok: true,
      data: driver,
    });
  } catch (err: any) {
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * PATCH /admin/drivers/:id/status
 * Change le statut d'un chauffeur (valider, rejeter, suspendre)
 */
export async function changeDriverStatus(req: Request, res: Response) {
  try {
    const paramValidation = driverIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'ID chauffeur invalide',
      });
    }

    const bodyValidation = changeDriverStatusSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: bodyValidation.error.flatten().fieldErrors,
      });
    }

    const driver = await driversService.changeDriverStatus(
      paramValidation.data.id,
      bodyValidation.data
    );

    const statusMessages: Record<string, string> = {
      active:       'Chauffeur validé et activé avec succès',
      probationary: 'Le statut du chauffeur est passé en "probationary"',
      rejected:     'Chauffeur rejeté',
      suspended:    'Chauffeur suspendu',
    };

    return res.json({
      ok: true,
      message: statusMessages[bodyValidation.data.status],
      data: driver,
    });
  } catch (err: any) {
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * PATCH /admin/drivers/:id
 * Mise à jour admin d'un chauffeur (tva_rate, siret, zone, vehicle_type)
 */
export async function adminUpdateDriver(req: Request, res: Response) {
  try {
    const paramValidation = driverIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'ID chauffeur invalide',
      });
    }

    const bodyValidation = adminUpdateDriverSchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: bodyValidation.error.flatten().fieldErrors,
      });
    }

    const driver = await driversService.adminUpdateDriver(
      paramValidation.data.id,
      bodyValidation.data
    );

    return res.json({
      ok: true,
      message: 'Profil chauffeur mis à jour',
      data: driver,
    });
  } catch (err: any) {
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}
