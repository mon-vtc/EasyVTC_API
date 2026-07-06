// ══════════════════════════════════════════════════════════════════════════════
// CONTROLLER — Module Drivers
// Sprint 3 — EasyVTC
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
  availabilityQuerySchema,
  createUnavailabilitySchema,
  unavailabilityIdParamSchema,
  setWeeklyScheduleSchema,
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
 * GET /drivers/me/revenues?period=month&date=2026-04-09&status=completed&page=1&limit=20
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

    const { period, date, status, page = 1, limit = 20 } = validation.data;
    const revenues = await driversService.getRevenues(req.user!.id, period, date, status, page, limit);

    return res.json({ ok: true, data: revenues });
  } catch (err: any) {
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS ADMIN — Planning & Revenus par driver ID
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/drivers/:id/planning?period=week&date=2026-06-01
 * Retourne le planning d'un chauffeur spécifique (admin/manager)
 */
export async function getDriverPlanningAdmin(req: Request, res: Response) {
  try {
    const paramValidation = driverIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({ ok: false, message: 'ID chauffeur invalide' });
    }

    const queryValidation = planningQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Paramètres invalides',
        errors: queryValidation.error.flatten().fieldErrors,
      });
    }

    const { period, date } = queryValidation.data;
    const planning = await driversService.getPlanningAdmin(paramValidation.data.id, period, date);

    return res.json({ ok: true, data: planning });
  } catch (err: any) {
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * GET /admin/drivers/:id/revenues?period=month&date=2026-06-01&status=completed&page=1&limit=20
 * Retourne les revenus d'un chauffeur spécifique (admin/manager)
 */
export async function getDriverRevenuesAdmin(req: Request, res: Response) {
  try {
    const paramValidation = driverIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({ ok: false, message: 'ID chauffeur invalide' });
    }

    const queryValidation = revenuesQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Paramètres invalides',
        errors: queryValidation.error.flatten().fieldErrors,
      });
    }

    const { period, date, status, page = 1, limit = 20 } = queryValidation.data;
    const revenues = await driversService.getRevenuesAdmin(paramValidation.data.id, period, date, status, page, limit);

    return res.json({ ok: true, data: revenues });
  } catch (err: any) {
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS STATISTIQUES MENSUELLES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/drivers/:id/monthly-stats?date=2026-01
 * Retourne les statistiques mensuelles d'un chauffeur (admin/manager)
 */
export async function getDriverMonthlyStats(req: Request, res: Response) {
  try {
    const paramValidation = driverIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({ ok: false, message: 'ID chauffeur invalide' });
    }

    const { date } = req.query;

    const stats = await driversService.getMonthlyStats(
      paramValidation.data.id,
      date as string | undefined
    );

    return res.json({ ok: true, data: stats });
  } catch (err: any) {
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS HISTORIQUE DES COURSES
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/drivers/:id/trips-history?status=completed&page=1&limit=20
 * Retourne l'historique des courses d'un chauffeur (admin/manager)
 */
export async function getDriverTripsHistory(req: Request, res: Response) {
  try {
    const paramValidation = driverIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({ ok: false, message: 'ID chauffeur invalide' });
    }

    const { status, page = '1', limit = '20' } = req.query;

    const history = await driversService.getTripsHistory(
      paramValidation.data.id,
      status as string | undefined,
      parseInt(page as string, 10),
      parseInt(limit as string, 10)
    );

    return res.json({ ok: true, data: history });
  } catch (err: any) {
    return res.status(err.status || 500).json({
      ok: false,
      message: err.message || 'Erreur serveur',
    });
  }
}

/**
 * GET /drivers/me/availability?period=week&date=YYYY-MM-DD
 * Vue disponibilité complète : réservations + indisponibilités
 */
export async function getMyAvailability(req: Request, res: Response) {
  try {
    const validation = availabilityQuerySchema.safeParse(req.query);
    if (!validation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Paramètres invalides',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const { period, date } = validation.data;
    const result = await driversService.getAvailability(req.user!.id, period, date);

    return res.json({ ok: true, data: result });
  } catch (err: any) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

/**
 * GET /drivers/me/unavailability
 * Lister toutes ses indisponibilités
 */
export async function getMyUnavailability(req: Request, res: Response) {
  try {
    const list = await driversService.listUnavailability(req.user!.id);
    return res.json({ ok: true, data: list });
  } catch (err: any) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

/**
 * POST /drivers/me/unavailability
 * Créer une indisponibilité
 */
export async function createMyUnavailability(req: Request, res: Response) {
  try {
    const validation = createUnavailabilitySchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const result = await driversService.createUnavailability(req.user!.id, validation.data);
    return res.status(201).json({ ok: true, message: 'Indisponibilité créée', data: result });
  } catch (err: any) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

/**
 * DELETE /drivers/me/unavailability/:unavailId
 * Supprimer une indisponibilité (seulement si future)
 */
export async function deleteMyUnavailability(req: Request, res: Response) {
  try {
    const validation = unavailabilityIdParamSchema.safeParse(req.params);
    if (!validation.success) {
      return res.status(400).json({ ok: false, message: 'ID indisponibilité invalide' });
    }

    await driversService.deleteUnavailability(req.user!.id, validation.data.unavailId);
    return res.json({ ok: true, message: 'Indisponibilité supprimée' });
  } catch (err: any) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS DISPONIBILITÉ — Admin
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /admin/drivers/:id/availability?period=week&date=YYYY-MM-DD
 */
export async function getDriverAvailabilityAdmin(req: Request, res: Response) {
  try {
    const paramValidation = driverIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({ ok: false, message: 'ID chauffeur invalide' });
    }

    const queryValidation = availabilityQuerySchema.safeParse(req.query);
    if (!queryValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Paramètres invalides',
        errors: queryValidation.error.flatten().fieldErrors,
      });
    }

    const { period, date } = queryValidation.data;
    const result = await driversService.getAvailabilityAdmin(paramValidation.data.id, period, date);
    return res.json({ ok: true, data: result });
  } catch (err: any) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

/**
 * GET /admin/drivers/:id/unavailability
 */
export async function getDriverUnavailabilityAdmin(req: Request, res: Response) {
  try {
    const validation = driverIdParamSchema.safeParse(req.params);
    if (!validation.success) {
      return res.status(400).json({ ok: false, message: 'ID chauffeur invalide' });
    }

    const list = await driversService.listUnavailabilityAdmin(validation.data.id);
    return res.json({ ok: true, data: list });
  } catch (err: any) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

/**
 * POST /admin/drivers/:id/unavailability
 */
export async function createDriverUnavailabilityAdmin(req: Request, res: Response) {
  try {
    const paramValidation = driverIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({ ok: false, message: 'ID chauffeur invalide' });
    }

    const bodyValidation = createUnavailabilitySchema.safeParse(req.body);
    if (!bodyValidation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: bodyValidation.error.flatten().fieldErrors,
      });
    }

    const result = await driversService.createUnavailabilityAdmin(
      paramValidation.data.id,
      bodyValidation.data,
      req.user!.id,
    );
    return res.status(201).json({ ok: true, message: 'Indisponibilité créée', data: result });
  } catch (err: any) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

/**
 * DELETE /admin/drivers/:id/unavailability/:unavailId
 */
export async function deleteDriverUnavailabilityAdmin(req: Request, res: Response) {
  try {
    const paramValidation = driverIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({ ok: false, message: 'ID chauffeur invalide' });
    }

    const unavailValidation = unavailabilityIdParamSchema.safeParse(req.params);
    if (!unavailValidation.success) {
      return res.status(400).json({ ok: false, message: 'ID indisponibilité invalide' });
    }

    await driversService.deleteUnavailabilityAdmin(
      paramValidation.data.id,
      unavailValidation.data.unavailId,
    );
    return res.json({ ok: true, message: 'Indisponibilité supprimée' });
  } catch (err: any) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS PLANNING HEBDOMADAIRE — Chauffeur + Admin
// ══════════════════════════════════════════════════════════════════════════════

/**
 * GET /drivers/me/schedule
 * Retourne les 7 créneaux hebdomadaires du chauffeur connecté.
 * Si aucun planning n'a encore été enregistré, retourne 7 jours à false.
 */
export async function getMySchedule(req: Request, res: Response) {
  try {
    const result = await driversService.getSchedule(req.user!.id);
    return res.json({ ok: true, data: result });
  } catch (err: any) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

/**
 * PUT /drivers/me/schedule
 * Sauvegarde le planning hebdomadaire complet (replace).
 * Corps : { schedule: [{ day, is_available, start_time?, end_time? }] }
 */
export async function setMySchedule(req: Request, res: Response) {
  try {
    const validation = setWeeklyScheduleSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({
        ok: false,
        message: 'Données invalides',
        errors: validation.error.flatten().fieldErrors,
      });
    }

    const result = await driversService.setSchedule(req.user!.id, validation.data);
    return res.json({ ok: true, message: 'Planning enregistré', data: result });
  } catch (err: any) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

/**
 * GET /admin/drivers/:id/schedule
 * Planning hebdomadaire d'un chauffeur (admin/manager)
 */
export async function getDriverScheduleAdmin(req: Request, res: Response) {
  try {
    const paramValidation = driverIdParamSchema.safeParse(req.params);
    if (!paramValidation.success) {
      return res.status(400).json({ ok: false, message: 'ID chauffeur invalide' });
    }

    const result = await driversService.getScheduleAdmin(paramValidation.data.id);
    return res.json({ ok: true, data: result });
  } catch (err: any) {
    return res.status(err.status || 500).json({ ok: false, message: err.message || 'Erreur serveur' });
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// ENDPOINTS ADMIN — Gestion chauffeurs
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
      active:    'Chauffeur validé et activé avec succès',
      rejected:  'Chauffeur rejeté',
      suspended: 'Chauffeur suspendu',
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
