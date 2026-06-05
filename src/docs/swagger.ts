import type { OpenAPIV3 } from 'openapi-types';

export const swaggerSpec: OpenAPIV3.Document = {
  openapi: '3.0.3',
  info: {
    title: 'EazyVTC API',
    version: '1.0.0',
    description:
      'API backend pour la plateforme VTC EazyVTC — France. ' +
      'Attribution 100% humaine, paiement hors application (espèces / CB au chauffeur).',
    contact: { name: 'InfinitiaX', url: 'https://github.com/InfinitiaX/EazyVTC_API' },
  },
  servers: [
    { url: 'http://localhost:4000', description: 'Développement local' },
    { url: 'https://api.eazyvtc.com', description: 'Production Railway' },
  ],
  tags: [
    { name: 'Health', description: 'Statut du service' },
    { name: 'Auth', description: 'Authentification et gestion des sessions' },
    { name: 'Users', description: 'Profils utilisateurs' },
    { name: 'Drivers', description: 'Profils et statut des chauffeurs' },
    { name: 'Driver Documents', description: 'Documents réglementaires conducteurs' },
    { name: 'Vehicles', description: 'Véhicules des chauffeurs' },
    { name: 'Vehicle Types', description: 'Types de véhicules disponibles' },
    { name: 'Pricing', description: 'Grilles tarifaires et forfaits' },
    { name: 'Reservations', description: 'Réservations de courses' },
    { name: 'Orders', description: 'Bons de commande (PDF)' },
    { name: 'Invoices', description: 'Factures (PDF)' },
    { name: 'Notifications', description: 'Push notifications et emails' },
    { name: 'Chat', description: 'Messagerie course et support' },
    { name: 'Ratings', description: 'Évaluations des chauffeurs' },
    { name: 'Promo Codes', description: 'Codes de réduction' },
    { name: 'Favorites', description: 'Destinations favorites' },
    { name: 'Commission Settings', description: 'Paramétrage et reporting des commissions' },
    { name: 'RGPD', description: 'Export et anonymisation des données personnelles' },
    { name: 'Admin', description: 'Administration — utilisateurs, gestionnaires, stats' },
    { name: 'Audit Logs', description: 'Traçabilité des actions sensibles admin/manager' },
    { name: 'Cron', description: 'Routes déclenchées par cron job (CRON_SECRET requis)' },
  ],
  components: {
    securitySchemes: {
      BearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        description: 'Token JWT Supabase — obtenu via /auth/login',
      },
      CronSecret: {
        type: 'apiKey',
        in: 'header',
        name: 'x-cron-secret',
        description: 'Secret CRON_SECRET pour les routes automatisées',
      },
    },
    schemas: {
      // ── Generic ──────────────────────────────────────────────────────────────
      ApiSuccess: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: true },
          message: { type: 'string' },
          data: { type: 'object' },
        },
      },
      ApiError: {
        type: 'object',
        properties: {
          ok: { type: 'boolean', example: false },
          message: { type: 'string' },
          errors: {
            type: 'object',
            additionalProperties: { type: 'array', items: { type: 'string' } },
          },
        },
      },
      PaginationMeta: {
        type: 'object',
        properties: {
          total: { type: 'integer' },
          page: { type: 'integer' },
          limit: { type: 'integer' },
          totalPages: { type: 'integer' },
        },
      },
      // ── Auth ─────────────────────────────────────────────────────────────────
      RegisterBody: {
        type: 'object',
        required: ['email', 'password', 'first_name', 'last_name', 'role'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string', minLength: 8, description: 'Min 8 chars, 1 minuscule, 1 chiffre' },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          phone: { type: 'string' },
          role: { type: 'string', enum: ['client', 'driver'] },
        },
      },
      LoginBody: {
        type: 'object',
        required: ['email', 'password'],
        properties: {
          email: { type: 'string', format: 'email' },
          password: { type: 'string' },
        },
      },
      AuthTokens: {
        type: 'object',
        properties: {
          access_token: { type: 'string' },
          refresh_token: { type: 'string' },
          expires_in: { type: 'integer' },
          token_type: { type: 'string', example: 'Bearer' },
        },
      },
      // ── User ─────────────────────────────────────────────────────────────────
      User: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          phone: { type: 'string', nullable: true },
          role: { type: 'string', enum: ['client', 'driver', 'admin', 'manager'] },
          status: { type: 'string', enum: ['active', 'suspended', 'pending'] },
          avatar_url: { type: 'string', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      UpdateUserBody: {
        type: 'object',
        properties: {
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          phone: { type: 'string' },
          email: { type: 'string', format: 'email' },
        },
      },
      // ── Driver ───────────────────────────────────────────────────────────────
      Driver: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          user_id: { type: 'string', format: 'uuid' },
          status: { type: 'string', enum: ['offline', 'online', 'on_trip', 'pending', 'suspended'] },
          zone: { type: 'string', enum: ['france', 'senegal'] },
          siret: { type: 'string', nullable: true },
          tva_rate: { type: 'number', example: 10 },
          vehicle_type: { type: 'string' },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      // ── Document ─────────────────────────────────────────────────────────────
      DriverDocument: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          driver_id: { type: 'string', format: 'uuid' },
          type: { type: 'string', enum: ['permis', 'assurance', 'carte_vtc', 'kbis', 'autre'] },
          status: { type: 'string', enum: ['pending', 'validated', 'rejected'] },
          rejection_reason: { type: 'string', nullable: true },
          expires_at: { type: 'string', format: 'date', nullable: true },
          file_url: { type: 'string', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      // ── Vehicle ──────────────────────────────────────────────────────────────
      Vehicle: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          driver_id: { type: 'string', format: 'uuid' },
          brand: { type: 'string' },
          model: { type: 'string' },
          license_plate: { type: 'string' },
          year: { type: 'integer' },
          color: { type: 'string' },
          vehicle_type_id: { type: 'string', format: 'uuid' },
          photo_url: { type: 'string', nullable: true },
          is_active: { type: 'boolean' },
        },
      },
      VehicleType: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Berline' },
          description: { type: 'string', nullable: true },
          capacity: { type: 'integer' },
          is_active: { type: 'boolean' },
        },
      },
      // ── Pricing ──────────────────────────────────────────────────────────────
      PricingGrid: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          country: { type: 'string', enum: ['france', 'senegal'] },
          vehicle_type: { type: 'string' },
          base_price: { type: 'number', example: 3.5 },
          price_per_km: { type: 'number', example: 1.8 },
          price_per_min: { type: 'number', example: 0.4 },
          pickup_supplement: { type: 'number', example: 0 },
          is_active: { type: 'boolean' },
        },
      },
      FlatRate: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          name: { type: 'string', example: 'Massy → Orly' },
          origin: { type: 'string' },
          destination: { type: 'string' },
          price: { type: 'number', example: 37 },
          country: { type: 'string', enum: ['france', 'senegal'] },
          vehicle_type: { type: 'string' },
          is_active: { type: 'boolean' },
        },
      },
      PriceEstimate: {
        type: 'object',
        properties: {
          estimated_price: { type: 'number' },
          distance_km: { type: 'number' },
          duration_min: { type: 'number' },
          flat_rate_applied: { type: 'boolean' },
          currency: { type: 'string', example: 'EUR' },
        },
      },
      // ── Reservation ──────────────────────────────────────────────────────────
      Reservation: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          client_id: { type: 'string', format: 'uuid' },
          driver_id: { type: 'string', format: 'uuid', nullable: true },
          status: {
            type: 'string',
            enum: ['pending', 'confirmed', 'assigned', 'arriving', 'in_progress', 'completed', 'cancelled'],
          },
          pickup_address: { type: 'string' },
          pickup_lat: { type: 'number' },
          pickup_lng: { type: 'number' },
          destination_address: { type: 'string' },
          destination_lat: { type: 'number' },
          destination_lng: { type: 'number' },
          vehicle_type: { type: 'string' },
          scheduled_at: { type: 'string', format: 'date-time', nullable: true },
          comment: { type: 'string', nullable: true },
          promo_code: { type: 'string', nullable: true },
          final_price: { type: 'number', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      CreateReservationBody: {
        type: 'object',
        required: ['pickup_address', 'pickup_lat', 'pickup_lng', 'destination_address', 'destination_lat', 'destination_lng', 'vehicle_type'],
        properties: {
          pickup_address: { type: 'string' },
          pickup_lat: { type: 'number' },
          pickup_lng: { type: 'number' },
          destination_address: { type: 'string' },
          destination_lat: { type: 'number' },
          destination_lng: { type: 'number' },
          vehicle_type: { type: 'string' },
          scheduled_at: { type: 'string', format: 'date-time', description: 'Null = course immédiate' },
          comment: { type: 'string' },
          promo_code: { type: 'string' },
        },
      },
      // ── Order ────────────────────────────────────────────────────────────────
      Order: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          reference: { type: 'string', example: 'BC-2026-001234' },
          reservation_id: { type: 'string', format: 'uuid' },
          client_id: { type: 'string', format: 'uuid' },
          driver_id: { type: 'string', format: 'uuid', nullable: true },
          final_amount: { type: 'number', nullable: true },
          pdf_url: { type: 'string', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      // ── Invoice ──────────────────────────────────────────────────────────────
      Invoice: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          number: { type: 'string', example: 'FAC-2026-001234' },
          reservation_id: { type: 'string', format: 'uuid' },
          client_id: { type: 'string', format: 'uuid' },
          driver_id: { type: 'string', format: 'uuid' },
          amount_ht: { type: 'number' },
          tva_rate: { type: 'number', example: 10 },
          amount_ttc: { type: 'number' },
          payment_method: { type: 'string', example: 'Réglé hors application (espèces / CB fin de course)' },
          pdf_url: { type: 'string', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      // ── Notification ─────────────────────────────────────────────────────────
      Notification: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          user_id: { type: 'string', format: 'uuid' },
          type: { type: 'string' },
          channel: { type: 'string', enum: ['push', 'email', 'both'] },
          status: { type: 'string', enum: ['sent', 'failed', 'pending'] },
          title: { type: 'string' },
          body: { type: 'string' },
          read_at: { type: 'string', format: 'date-time', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      // ── Rating ───────────────────────────────────────────────────────────────
      Rating: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          reservation_id: { type: 'string', format: 'uuid' },
          client_id: { type: 'string', format: 'uuid' },
          driver_id: { type: 'string', format: 'uuid' },
          score: { type: 'integer', minimum: 1, maximum: 5 },
          comment: { type: 'string', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
        },
      },
      // ── Promo Code ───────────────────────────────────────────────────────────
      PromoCode: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          code: { type: 'string' },
          type: { type: 'string', enum: ['percent', 'fixed'] },
          value: { type: 'number' },
          valid_from: { type: 'string', format: 'date-time' },
          valid_until: { type: 'string', format: 'date-time' },
          max_uses: { type: 'integer', nullable: true },
          uses_count: { type: 'integer' },
          is_active: { type: 'boolean' },
        },
      },
      // ── Manager ──────────────────────────────────────────────────────────────
      Manager: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          email: { type: 'string', format: 'email' },
          first_name: { type: 'string' },
          last_name: { type: 'string' },
          status: { type: 'string', enum: ['active', 'suspended'] },
          permissions: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'view_users', 'view_clients', 'view_drivers', 'view_documents',
                'view_reservations', 'assign_reservation', 'view_pricing',
              ],
            },
          },
        },
      },
      // ── Commission ───────────────────────────────────────────────────────────
      CommissionSetting: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          country: { type: 'string', enum: ['france', 'senegal'] },
          vehicle_type: { type: 'string', nullable: true },
          rate_percent: { type: 'number', example: 15 },
          is_active: { type: 'boolean' },
        },
      },
      // ── Audit Log ────────────────────────────────────────────────────────────
      AuditLog: {
        type: 'object',
        properties: {
          id:             { type: 'string', format: 'uuid' },
          action:         { type: 'string', example: 'USER_STATUS_CHANGED' },
          entity_type:    { type: 'string', example: 'user' },
          entity_id:      { type: 'string' },
          old_value:      { type: 'object', nullable: true },
          new_value:      { type: 'object', nullable: true },
          ip_address:     { type: 'string', nullable: true },
          user_agent:     { type: 'string', nullable: true },
          created_at:     { type: 'string', format: 'date-time' },
          performer: {
            type: 'object',
            nullable: true,
            properties: {
              id:         { type: 'string', format: 'uuid' },
              first_name: { type: 'string' },
              last_name:  { type: 'string' },
              email:      { type: 'string', format: 'email' },
              role:       { type: 'string', enum: ['admin', 'manager'] },
            },
          },
        },
      },
      // ── Driver Unavailability ─────────────────────────────────────────────────
      DriverUnavailability: {
        type: 'object',
        properties: {
          id:         { type: 'string', format: 'uuid' },
          driver_id:  { type: 'string', format: 'uuid' },
          reason: {
            type: 'string',
            enum: ['conge', 'visite_medicale', 'formation', 'panne_vehicule', 'autre'],
          },
          label:      { type: 'string', nullable: true, example: 'Vacances été' },
          starts_at:  { type: 'string', format: 'date-time' },
          ends_at:    { type: 'string', format: 'date-time' },
          created_by: { type: 'string', format: 'uuid', nullable: true },
          created_at: { type: 'string', format: 'date-time' },
          updated_at: { type: 'string', format: 'date-time' },
        },
      },
      DriverAvailabilityResult: {
        type: 'object',
        properties: {
          period:                 { type: 'string', enum: ['week', 'month'] },
          date_from:              { type: 'string', format: 'date-time' },
          date_to:                { type: 'string', format: 'date-time' },
          reservations:           { type: 'array', items: { $ref: '#/components/schemas/Reservation' } },
          unavailabilities:       { type: 'array', items: { $ref: '#/components/schemas/DriverUnavailability' } },
          total_reservations:     { type: 'integer' },
          total_unavailabilities: { type: 'integer' },
        },
      },
      // ── Favorite ─────────────────────────────────────────────────────────────
      Favorite: {
        type: 'object',
        properties: {
          id: { type: 'string', format: 'uuid' },
          user_id: { type: 'string', format: 'uuid' },
          label: { type: 'string', example: 'Domicile' },
          address: { type: 'string' },
          lat: { type: 'number' },
          lng: { type: 'number' },
        },
      },
    },
    responses: {
      Unauthorized: {
        description: 'Token manquant ou expiré',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
      },
      Forbidden: {
        description: 'Accès refusé — rôle insuffisant',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
      },
      NotFound: {
        description: 'Ressource introuvable',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
      },
      ValidationError: {
        description: 'Erreur de validation Zod',
        content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } },
      },
    },
  },
  security: [],
  paths: {
    // ════════════════════════════════════════════════════════════════════════════
    // HEALTH
    // ════════════════════════════════════════════════════════════════════════════
    '/health': {
      get: {
        tags: ['Health'],
        summary: 'Statut de l\'API',
        responses: {
          '200': { description: 'API opérationnelle' },
        },
      },
    },
    '/health/supabase': {
      get: {
        tags: ['Health'],
        summary: 'Statut de la connexion Supabase',
        responses: {
          '200': { description: 'Connexion Supabase OK' },
          '500': { description: 'Connexion Supabase KO' },
        },
      },
    },

    // ════════════════════════════════════════════════════════════════════════════
    // AUTH
    // ════════════════════════════════════════════════════════════════════════════
    '/auth/register': {
      post: {
        tags: ['Auth'],
        summary: 'Inscription (client ou chauffeur)',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/RegisterBody' } } },
        },
        responses: {
          '201': { description: 'Compte créé — email de bienvenue envoyé' },
          '400': { $ref: '#/components/responses/ValidationError' },
          '409': { description: 'Email déjà utilisé' },
        },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'],
        summary: 'Connexion — retourne les tokens JWT',
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/LoginBody' } } },
        },
        responses: {
          '200': {
            description: 'Connexion réussie',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiSuccess' },
                    { properties: { data: { $ref: '#/components/schemas/AuthTokens' } } },
                  ],
                },
              },
            },
          },
          '401': { description: 'Identifiants invalides' },
        },
      },
    },
    '/auth/refresh': {
      post: {
        tags: ['Auth'],
        summary: 'Rotation du token JWT',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['refresh_token'],
                properties: { refresh_token: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Nouveau access_token' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/forgot-password': {
      post: {
        tags: ['Auth'],
        summary: 'Demander un email de réinitialisation de mot de passe',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['email'], properties: { email: { type: 'string', format: 'email' } } },
            },
          },
        },
        responses: {
          '200': { description: 'Email envoyé si le compte existe' },
        },
      },
    },
    '/auth/reset-password': {
      post: {
        tags: ['Auth'],
        summary: 'Réinitialiser le mot de passe via le token email (valide 1h)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['token', 'password'],
                properties: {
                  token: { type: 'string' },
                  password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Mot de passe réinitialisé' },
          '400': { description: 'Token invalide ou expiré' },
        },
      },
    },
    '/auth/change-password': {
      post: {
        tags: ['Auth'],
        summary: 'Modifier le mot de passe (authentifié)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['current_password', 'new_password'],
                properties: {
                  current_password: { type: 'string' },
                  new_password: { type: 'string', minLength: 8 },
                },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Mot de passe modifié' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Auth'],
        summary: 'Profil de l\'utilisateur connecté',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Profil retourné' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/logout': {
      post: {
        tags: ['Auth'],
        summary: 'Déconnexion — invalide le token',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Déconnecté' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/auth/google': {
      get: {
        tags: ['Auth'],
        summary: 'Redirection OAuth2 Google',
        responses: { '302': { description: 'Redirection vers Google' } },
      },
    },
    '/auth/google/callback': {
      get: {
        tags: ['Auth'],
        summary: 'Callback OAuth2 Google',
        responses: { '200': { description: 'Tokens JWT retournés après authentification Google' } },
      },
    },
    '/auth/google/token': {
      post: {
        tags: ['Auth'],
        summary: 'Échange de token Google ID (flux mobile)',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['id_token'], properties: { id_token: { type: 'string' } } },
            },
          },
        },
        responses: { '200': { description: 'Tokens JWT retournés' } },
      },
    },

    // ════════════════════════════════════════════════════════════════════════════
    // USERS
    // ════════════════════════════════════════════════════════════════════════════
    '/users/me': {
      get: {
        tags: ['Users'],
        summary: 'Mon profil complet',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': { description: 'Profil utilisateur', content: { 'application/json': { schema: { $ref: '#/components/schemas/User' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      patch: {
        tags: ['Users'],
        summary: 'Modifier mon profil (prénom, nom, téléphone, email)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/UpdateUserBody' } } },
        },
        responses: {
          '200': { description: 'Profil mis à jour' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/users/me/avatar': {
      post: {
        tags: ['Users'],
        summary: 'Upload / remplacement photo de profil (JPG, PNG, WebP — max 5 Mo)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: { type: 'object', properties: { avatar: { type: 'string', format: 'binary' } } },
            },
          },
        },
        responses: {
          '200': { description: 'Avatar mis à jour' },
          '400': { description: 'Format non supporté' },
        },
      },
    },
    '/users': {
      get: {
        tags: ['Users'],
        summary: 'Liste des utilisateurs (admin + manager avec view_users)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          { name: 'role', in: 'query', schema: { type: 'string', enum: ['client', 'driver', 'manager'] } },
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['active', 'suspended', 'pending'] } },
        ],
        responses: {
          '200': { description: 'Liste paginée' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/users/{id}': {
      get: {
        tags: ['Users'],
        summary: 'Profil d\'un utilisateur par ID (admin + manager avec view_users)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Profil utilisateur' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/users/{id}/status': {
      patch: {
        tags: ['Users'],
        summary: 'Activer / suspendre un compte (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: { status: { type: 'string', enum: ['active', 'suspended'] }, reason: { type: 'string' } },
              },
            },
          },
        },
        responses: {
          '200': { description: 'Statut mis à jour' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/users/{id}/favorites': {
      get: {
        tags: ['Favorites'],
        summary: 'Lister les destinations favorites',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Liste des favoris' } },
      },
      post: {
        tags: ['Favorites'],
        summary: 'Ajouter une destination favorite (max 20)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['label', 'address', 'lat', 'lng'],
                properties: {
                  label: { type: 'string' },
                  address: { type: 'string' },
                  lat: { type: 'number' },
                  lng: { type: 'number' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Favori créé' } },
      },
    },
    '/users/{id}/favorites/{favId}': {
      delete: {
        tags: ['Favorites'],
        summary: 'Supprimer un favori',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'favId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: { '200': { description: 'Favori supprimé' }, '404': { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/users/{id}/data-export': {
      get: {
        tags: ['RGPD'],
        summary: 'Export RGPD — toutes les données personnelles (JSON)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Données exportées' } },
      },
    },
    '/users/{id}/anonymize': {
      delete: {
        tags: ['RGPD'],
        summary: 'Anonymisation / suppression RGPD sur demande',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Compte anonymisé' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },

    // ════════════════════════════════════════════════════════════════════════════
    // DRIVERS (self)
    // ════════════════════════════════════════════════════════════════════════════
    '/drivers/me': {
      get: {
        tags: ['Drivers'],
        summary: 'Mon profil chauffeur',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Profil chauffeur' } },
      },
      patch: {
        tags: ['Drivers'],
        summary: 'Modifier mon profil chauffeur',
        security: [{ BearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', properties: { siret: { type: 'string' }, zone: { type: 'string' } } } } },
        },
        responses: { '200': { description: 'Profil mis à jour' } },
      },
    },
    '/drivers/me/online': {
      patch: {
        tags: ['Drivers'],
        summary: 'Passer en ligne / hors ligne',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['online'], properties: { online: { type: 'boolean' } } },
            },
          },
        },
        responses: { '200': { description: 'Statut mis à jour' } },
      },
    },
    '/drivers/me/planning': {
      get: {
        tags: ['Drivers'],
        summary: 'Mon planning (hebdomadaire / mensuel)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['week', 'month'] } },
          { name: 'date', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: { '200': { description: 'Planning retourné' } },
      },
    },
    '/drivers/me/revenues': {
      get: {
        tags: ['Drivers'],
        summary: 'Mes revenus (hebdo / mensuel / total)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['week', 'month', 'total'] } },
        ],
        responses: { '200': { description: 'Revenus retournés' } },
      },
    },
    '/drivers/me/availability': {
      get: {
        tags: ['Drivers'],
        summary: 'Ma disponibilité — réservations + indisponibilités fusionnées',
        description: 'Vue planning étendue : courses planifiées et créneaux bloqués (congé, visite médicale…) sur la période.',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['week', 'month'], default: 'week' } },
          { name: 'date',   in: 'query', description: 'Date de référence (YYYY-MM-DD) — défaut : aujourd\'hui', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          '200': {
            description: 'Disponibilité retournée',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiSuccess' },
                    { properties: { data: { $ref: '#/components/schemas/DriverAvailabilityResult' } } },
                  ],
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/drivers/me/unavailability': {
      get: {
        tags: ['Drivers'],
        summary: 'Lister toutes mes indisponibilités',
        security: [{ BearerAuth: [] }],
        responses: {
          '200': {
            description: 'Liste des indisponibilités',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiSuccess' },
                    { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/DriverUnavailability' } } } },
                  ],
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
      post: {
        tags: ['Drivers'],
        summary: 'Créer une indisponibilité',
        description: 'Le créneau doit être dans le futur (tolérance 5 min). Refusé si une réservation confirmée chevauche le créneau.',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['reason', 'starts_at', 'ends_at'],
                properties: {
                  reason:    { type: 'string', enum: ['conge', 'visite_medicale', 'formation', 'panne_vehicule', 'autre'] },
                  label:     { type: 'string', maxLength: 100, example: 'Vacances été' },
                  starts_at: { type: 'string', format: 'date-time', example: '2026-08-01T00:00:00.000Z' },
                  ends_at:   { type: 'string', format: 'date-time', example: '2026-08-15T23:59:59.000Z' },
                },
              },
            },
          },
        },
        responses: {
          '201': {
            description: 'Indisponibilité créée',
            content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiSuccess' }, { properties: { data: { $ref: '#/components/schemas/DriverUnavailability' } } }] } } },
          },
          '400': { description: 'starts_at dans le passé ou ends_at ≤ starts_at', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '409': { description: 'Chevauchement avec une réservation confirmée', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/drivers/me/unavailability/{unavailId}': {
      delete: {
        tags: ['Drivers'],
        summary: 'Supprimer une indisponibilité (seulement si future)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'unavailId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Indisponibilité supprimée' },
          '400': { description: 'Indisponibilité déjà commencée ou passée', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '403': { description: 'L\'indisponibilité n\'appartient pas à ce chauffeur', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '404': { $ref: '#/components/responses/NotFound' },
          '401': { $ref: '#/components/responses/Unauthorized' },
        },
      },
    },
    '/drivers/me/ratings': {
      get: {
        tags: ['Ratings'],
        summary: 'Mes propres évaluations (chauffeur)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Liste des évaluations' } },
      },
    },

    // ════════════════════════════════════════════════════════════════════════════
    // DRIVER DOCUMENTS
    // ════════════════════════════════════════════════════════════════════════════
    '/drivers/documents': {
      get: {
        tags: ['Driver Documents'],
        summary: 'Mes documents (chauffeur)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Liste des documents' } },
      },
      post: {
        tags: ['Driver Documents'],
        summary: 'Upload d\'un document (PDF, JPG, PNG, WebP — max 10 Mo)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'multipart/form-data': {
              schema: {
                type: 'object',
                required: ['file', 'type'],
                properties: {
                  file: { type: 'string', format: 'binary' },
                  type: { type: 'string', enum: ['permis', 'assurance', 'carte_vtc', 'kbis', 'autre'] },
                  expires_at: { type: 'string', format: 'date' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Document uploadé — statut pending' },
          '400': { description: 'Format non supporté' },
        },
      },
    },
    '/drivers/documents/{id}': {
      get: {
        tags: ['Driver Documents'],
        summary: 'Télécharger / consulter un document (URL signée)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'URL signée du document' }, '404': { $ref: '#/components/responses/NotFound' } },
      },
      delete: {
        tags: ['Driver Documents'],
        summary: 'Supprimer un document',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Document supprimé' } },
      },
    },

    // ════════════════════════════════════════════════════════════════════════════
    // VEHICLES
    // ════════════════════════════════════════════════════════════════════════════
    '/drivers/vehicles': {
      get: {
        tags: ['Vehicles'],
        summary: 'Mes véhicules (chauffeur)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Liste des véhicules' } },
      },
      post: {
        tags: ['Vehicles'],
        summary: 'Ajouter un véhicule',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['brand', 'model', 'license_plate', 'year', 'vehicle_type_id'],
                properties: {
                  brand: { type: 'string' },
                  model: { type: 'string' },
                  license_plate: { type: 'string' },
                  year: { type: 'integer' },
                  color: { type: 'string' },
                  vehicle_type_id: { type: 'string', format: 'uuid' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Véhicule créé' } },
      },
    },
    '/drivers/vehicles/{id}': {
      get: {
        tags: ['Vehicles'],
        summary: 'Détail d\'un véhicule',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Véhicule retourné' } },
      },
      patch: {
        tags: ['Vehicles'],
        summary: 'Modifier un véhicule',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Vehicle' } } },
        },
        responses: { '200': { description: 'Véhicule mis à jour' } },
      },
      delete: {
        tags: ['Vehicles'],
        summary: 'Supprimer un véhicule',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Véhicule supprimé' } },
      },
    },
    '/drivers/vehicles/{id}/photo': {
      post: {
        tags: ['Vehicles'],
        summary: 'Upload photo du véhicule (JPG, PNG, WebP — max 5 Mo)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: {
            'multipart/form-data': {
              schema: { type: 'object', properties: { photo: { type: 'string', format: 'binary' } } },
            },
          },
        },
        responses: { '200': { description: 'Photo mise à jour' } },
      },
    },

    // ════════════════════════════════════════════════════════════════════════════
    // VEHICLE TYPES
    // ════════════════════════════════════════════════════════════════════════════
    '/vehicle-types': {
      get: {
        tags: ['Vehicle Types'],
        summary: 'Types de véhicules actifs (public)',
        responses: { '200': { description: 'Liste des types de véhicules actifs' } },
      },
    },

    // ════════════════════════════════════════════════════════════════════════════
    // PRICING
    // ════════════════════════════════════════════════════════════════════════════
    '/pricing/grids/active/{country}': {
      get: {
        tags: ['Pricing'],
        summary: 'Grille tarifaire active d\'un pays (public)',
        parameters: [{ name: 'country', in: 'path', required: true, schema: { type: 'string', enum: ['france', 'senegal'] } }],
        responses: { '200': { description: 'Grille active' } },
      },
    },
    '/pricing/grids': {
      get: {
        tags: ['Pricing'],
        summary: 'Toutes les grilles tarifaires (admin + manager view_pricing)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Liste des grilles' } },
      },
      post: {
        tags: ['Pricing'],
        summary: 'Créer une grille tarifaire (admin)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/PricingGrid' } } },
        },
        responses: { '201': { description: 'Grille créée' }, '403': { $ref: '#/components/responses/Forbidden' } },
      },
    },
    '/pricing/grids/{id}': {
      patch: {
        tags: ['Pricing'],
        summary: 'Modifier une grille tarifaire (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/PricingGrid' } } },
        },
        responses: { '200': { description: 'Grille mise à jour' } },
      },
    },
    '/pricing/flat-rates': {
      get: {
        tags: ['Pricing'],
        summary: 'Forfaits actifs (public)',
        responses: { '200': { description: 'Liste des forfaits actifs' } },
      },
      post: {
        tags: ['Pricing'],
        summary: 'Créer un forfait (admin)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/FlatRate' } } },
        },
        responses: { '201': { description: 'Forfait créé' } },
      },
    },
    '/pricing/flat-rates/{id}': {
      get: {
        tags: ['Pricing'],
        summary: 'Détail d\'un forfait (public)',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Forfait retourné' } },
      },
      patch: {
        tags: ['Pricing'],
        summary: 'Modifier un forfait (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/FlatRate' } } },
        },
        responses: { '200': { description: 'Forfait mis à jour' } },
      },
      delete: {
        tags: ['Pricing'],
        summary: 'Désactiver un forfait (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Forfait désactivé' } },
      },
    },
    '/pricing/estimate': {
      post: {
        tags: ['Pricing'],
        summary: 'Estimer le prix d\'une course (authentifié)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['origin_lat', 'origin_lng', 'destination_lat', 'destination_lng', 'vehicle_type', 'country'],
                properties: {
                  origin_lat: { type: 'number' },
                  origin_lng: { type: 'number' },
                  destination_lat: { type: 'number' },
                  destination_lng: { type: 'number' },
                  vehicle_type: { type: 'string' },
                  country: { type: 'string', enum: ['france', 'senegal'] },
                },
              },
            },
          },
        },
        responses: {
          '200': {
            description: 'Estimation calculée',
            content: { 'application/json': { schema: { $ref: '#/components/schemas/PriceEstimate' } } },
          },
        },
      },
    },

    // ════════════════════════════════════════════════════════════════════════════
    // RESERVATIONS
    // ════════════════════════════════════════════════════════════════════════════
    '/reservations': {
      post: {
        tags: ['Reservations'],
        summary: 'Créer une réservation (client)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CreateReservationBody' } } },
        },
        responses: {
          '201': { description: 'Réservation créée' },
          '400': { $ref: '#/components/responses/ValidationError' },
        },
      },
      get: {
        tags: ['Reservations'],
        summary: 'Toutes les réservations (admin + manager avec view_reservations)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
        ],
        responses: { '200': { description: 'Liste paginée' } },
      },
    },
    '/reservations/mine': {
      get: {
        tags: ['Reservations'],
        summary: 'Mes réservations (client)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Réservations du client connecté' } },
      },
    },
    '/reservations/driver': {
      get: {
        tags: ['Reservations'],
        summary: 'Historique des courses (chauffeur)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Courses du chauffeur connecté' } },
      },
    },
    '/reservations/driver/active': {
      get: {
        tags: ['Reservations'],
        summary: 'Course active du chauffeur connecté',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Réservation active ou null' } },
      },
    },
    '/reservations/drivers/available': {
      get: {
        tags: ['Reservations'],
        summary: 'Chauffeurs disponibles pour assignation (admin + manager)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Liste des chauffeurs en ligne' } },
      },
    },
    '/reservations/{id}': {
      get: {
        tags: ['Reservations'],
        summary: 'Détail d\'une réservation (accès contrôlé par rôle)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: {
          '200': { description: 'Réservation retournée' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/reservations/{id}/cancel': {
      patch: {
        tags: ['Reservations'],
        summary: 'Annuler une réservation (client sur ses courses, admin sur toutes)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: {
            'application/json': {
              schema: { type: 'object', properties: { reason: { type: 'string' } } },
            },
          },
        },
        responses: { '200': { description: 'Réservation annulée' } },
      },
    },
    '/reservations/{id}/arrive': {
      patch: {
        tags: ['Reservations'],
        summary: 'Chauffeur : signaler l\'arrivée au point de pickup',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Statut → arriving' } },
      },
    },
    '/reservations/{id}/start': {
      patch: {
        tags: ['Reservations'],
        summary: 'Chauffeur : démarrer la course (client à bord)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Statut → in_progress' } },
      },
    },
    '/reservations/{id}/complete': {
      patch: {
        tags: ['Reservations'],
        summary: 'Chauffeur : terminer la course',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Statut → completed — facture générée automatiquement' } },
      },
    },
    '/reservations/{id}/assign': {
      post: {
        tags: ['Reservations'],
        summary: 'Affecter manuellement un chauffeur (admin + manager avec assign_reservation)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['driver_id'], properties: { driver_id: { type: 'string', format: 'uuid' } } },
            },
          },
        },
        responses: { '200': { description: 'Chauffeur affecté' } },
      },
    },
    '/reservations/{id}/rating': {
      post: {
        tags: ['Ratings'],
        summary: 'Soumettre une évaluation après course (client)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['score'],
                properties: {
                  score: { type: 'integer', minimum: 1, maximum: 5 },
                  comment: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Évaluation enregistrée' } },
      },
    },

    // ════════════════════════════════════════════════════════════════════════════
    // ORDERS
    // ════════════════════════════════════════════════════════════════════════════
    '/orders': {
      get: {
        tags: ['Orders'],
        summary: 'Tous les bons de commande (admin + manager)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Liste paginée' } },
      },
    },
    '/orders/mine': {
      get: {
        tags: ['Orders'],
        summary: 'Mes bons de commande (client)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Bons de commande du client connecté' } },
      },
    },
    '/orders/driver/mine': {
      get: {
        tags: ['Orders'],
        summary: 'Mes bons de commande (chauffeur)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Bons de commande du chauffeur connecté' } },
      },
    },
    '/orders/by-reservation/{reservationId}': {
      get: {
        tags: ['Orders'],
        summary: 'Bon de commande d\'une réservation',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'reservationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Bon retourné' }, '404': { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/orders/{id}': {
      get: {
        tags: ['Orders'],
        summary: 'Détail d\'un bon de commande',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Bon retourné' }, '404': { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/orders/{id}/pdf': {
      get: {
        tags: ['Orders'],
        summary: 'URL signée du PDF (valide 1h)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'URL signée retournée' } },
      },
    },

    // ════════════════════════════════════════════════════════════════════════════
    // INVOICES
    // ════════════════════════════════════════════════════════════════════════════
    '/invoices': {
      get: {
        tags: ['Invoices'],
        summary: 'Liste des factures (filtrée par rôle)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Liste paginée' } },
      },
    },
    '/invoices/by-reservation/{reservationId}': {
      get: {
        tags: ['Invoices'],
        summary: 'Facture d\'une réservation',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'reservationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Facture retournée' } },
      },
    },
    '/invoices/{id}': {
      get: {
        tags: ['Invoices'],
        summary: 'Détail d\'une facture',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Facture retournée' }, '404': { $ref: '#/components/responses/NotFound' } },
      },
    },
    '/invoices/{id}/pdf': {
      get: {
        tags: ['Invoices'],
        summary: 'URL signée du PDF de la facture (valide 1h)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'URL signée retournée' } },
      },
    },
    '/invoices/{id}/price': {
      put: {
        tags: ['Invoices'],
        summary: 'Ajuster le prix d\'une facture — geste commercial (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['new_amount_ttc', 'reason'],
                properties: {
                  new_amount_ttc: { type: 'number' },
                  reason: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Prix ajusté avec traçabilité' }, '403': { $ref: '#/components/responses/Forbidden' } },
      },
    },

    // ════════════════════════════════════════════════════════════════════════════
    // NOTIFICATIONS
    // ════════════════════════════════════════════════════════════════════════════
    '/notifications': {
      get: {
        tags: ['Notifications'],
        summary: 'Mes notifications (paginées)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'unread', in: 'query', schema: { type: 'boolean' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        ],
        responses: { '200': { description: 'Liste des notifications' } },
      },
    },
    '/notifications/token': {
      post: {
        tags: ['Notifications'],
        summary: 'Enregistrer le token FCM de l\'appareil',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['token', 'platform'], properties: { token: { type: 'string' }, platform: { type: 'string', enum: ['ios', 'android'] } } },
            },
          },
        },
        responses: { '200': { description: 'Token enregistré' } },
      },
      delete: {
        tags: ['Notifications'],
        summary: 'Supprimer le token FCM',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Token supprimé' } },
      },
    },
    '/notifications/read-all': {
      patch: {
        tags: ['Notifications'],
        summary: 'Tout marquer comme lu',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Toutes notifications marquées lues' } },
      },
    },
    '/notifications/{id}/read': {
      patch: {
        tags: ['Notifications'],
        summary: 'Marquer une notification comme lue',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Notification marquée lue' } },
      },
    },
    '/notifications/send': {
      post: {
        tags: ['Notifications'],
        summary: 'Envoyer une notification manuelle (admin + manager)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['user_id', 'title', 'body'],
                properties: {
                  user_id: { type: 'string', format: 'uuid' },
                  title: { type: 'string' },
                  body: { type: 'string' },
                  channel: { type: 'string', enum: ['push', 'email', 'both'], default: 'push' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Notification envoyée' } },
      },
    },

    // ════════════════════════════════════════════════════════════════════════════
    // CHAT
    // ════════════════════════════════════════════════════════════════════════════
    '/chat/conversations': {
      get: {
        tags: ['Chat'],
        summary: 'Mes conversations en cours (client + chauffeur)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Liste des conversations actives' } },
      },
    },
    '/chat/reservations/{reservationId}/messages': {
      get: {
        tags: ['Chat'],
        summary: 'Historique messages d\'une conversation',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'reservationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Messages retournés' } },
      },
      post: {
        tags: ['Chat'],
        summary: 'Envoyer un message dans une conversation de course',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'reservationId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['content'], properties: { content: { type: 'string' } } },
            },
          },
        },
        responses: { '201': { description: 'Message envoyé' } },
      },
    },
    '/support/tickets': {
      post: {
        tags: ['Chat'],
        summary: 'Ouvrir un ticket support (client + chauffeur)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['subject', 'message'], properties: { subject: { type: 'string' }, message: { type: 'string' } } },
            },
          },
        },
        responses: { '201': { description: 'Ticket créé' } },
      },
      get: {
        tags: ['Chat'],
        summary: 'Mes tickets / tous les tickets (admin)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Liste des tickets' } },
      },
    },
    '/support/tickets/{ticketId}': {
      get: {
        tags: ['Chat'],
        summary: 'Détail d\'un ticket + messages',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'ticketId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Ticket retourné' } },
      },
    },
    '/support/tickets/{ticketId}/status': {
      put: {
        tags: ['Chat'],
        summary: 'Changer le statut d\'un ticket (admin + manager)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'ticketId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['open', 'in_progress', 'resolved', 'closed'] } } },
            },
          },
        },
        responses: { '200': { description: 'Statut mis à jour' } },
      },
    },
    '/support/tickets/{ticketId}/messages': {
      post: {
        tags: ['Chat'],
        summary: 'Envoyer un message dans un ticket support',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'ticketId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['content'], properties: { content: { type: 'string' } } },
            },
          },
        },
        responses: { '201': { description: 'Message envoyé' } },
      },
    },

    // ════════════════════════════════════════════════════════════════════════════
    // PROMO CODES
    // ════════════════════════════════════════════════════════════════════════════
    '/promo-codes/validate': {
      post: {
        tags: ['Promo Codes'],
        summary: 'Vérifier un code promo avant réservation (client)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['code'], properties: { code: { type: 'string' } } },
            },
          },
        },
        responses: {
          '200': { description: 'Code valide — remise calculée' },
          '400': { description: 'Code invalide ou expiré' },
        },
      },
    },

    // ════════════════════════════════════════════════════════════════════════════
    // ADMIN
    // ════════════════════════════════════════════════════════════════════════════
    '/admin/users': {
      get: {
        tags: ['Admin'],
        summary: 'Liste des utilisateurs (admin + manager avec view_users)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'role', in: 'query', schema: { type: 'string' } },
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        ],
        responses: { '200': { description: 'Liste paginée' } },
      },
    },
    '/admin/users/{id}/status': {
      put: {
        tags: ['Admin'],
        summary: 'Activer / suspendre un compte utilisateur (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['active', 'suspended'] }, reason: { type: 'string' } } },
            },
          },
        },
        responses: { '200': { description: 'Statut mis à jour' } },
      },
    },
    '/admin/managers': {
      get: {
        tags: ['Admin'],
        summary: 'Liste des gestionnaires (admin)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Liste des managers' } },
      },
      post: {
        tags: ['Admin'],
        summary: 'Créer un gestionnaire — email avec credentials envoyé (admin)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'first_name', 'last_name'],
                properties: {
                  email: { type: 'string', format: 'email' },
                  first_name: { type: 'string' },
                  last_name: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '201': { description: 'Gestionnaire créé — mot de passe temporaire envoyé par email' } },
      },
    },
    '/admin/managers/{id}': {
      get: {
        tags: ['Admin'],
        summary: 'Détail d\'un gestionnaire (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Manager retourné' } },
      },
      patch: {
        tags: ['Admin'],
        summary: 'Modifier un gestionnaire (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Manager' } } },
        },
        responses: { '200': { description: 'Manager mis à jour' } },
      },
      delete: {
        tags: ['Admin'],
        summary: 'Supprimer un gestionnaire (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Manager supprimé' } },
      },
    },
    '/admin/managers/{id}/status': {
      patch: {
        tags: ['Admin'],
        summary: 'Activer / suspendre un gestionnaire (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['status'], properties: { status: { type: 'string', enum: ['active', 'suspended'] } } },
            },
          },
        },
        responses: { '200': { description: 'Statut mis à jour' } },
      },
    },
    '/admin/managers/{id}/permissions': {
      get: {
        tags: ['Admin'],
        summary: 'Permissions d\'un gestionnaire (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Permissions retournées' } },
      },
      put: {
        tags: ['Admin'],
        summary: 'Définir les permissions d\'un gestionnaire (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['permissions'], properties: { permissions: { type: 'array', items: { type: 'string' } } } },
            },
          },
        },
        responses: { '200': { description: 'Permissions mises à jour' } },
      },
    },
    '/admin/clients': {
      get: {
        tags: ['Admin'],
        summary: 'Liste des clients (admin + manager avec view_clients)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Liste paginée' } },
      },
    },
    '/admin/clients/{id}': {
      get: {
        tags: ['Admin'],
        summary: 'Détail d\'un client (admin + manager avec view_clients)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Client retourné' } },
      },
    },
    '/admin/clients/{id}/trips': {
      get: {
        tags: ['Admin'],
        summary: 'Historique des courses d\'un client (admin + manager avec view_clients)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Courses retournées' } },
      },
    },
    '/admin/reservations': {
      get: {
        tags: ['Admin'],
        summary: 'Vue globale de toutes les réservations (admin + manager)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Réservations retournées' } },
      },
    },
    '/admin/reservations/{id}/assign': {
      put: {
        tags: ['Admin'],
        summary: 'Attribution manuelle d\'un chauffeur (admin + manager avec assign_reservation)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['driver_id'], properties: { driver_id: { type: 'string', format: 'uuid' } } },
            },
          },
        },
        responses: { '200': { description: 'Chauffeur affecté' } },
      },
    },
    '/admin/stats': {
      get: {
        tags: ['Admin'],
        summary: 'Statistiques globales — CA, trajets, taux satisfaction, chauffeurs actifs (admin)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Statistiques retournées' } },
      },
    },
    '/admin/chat': {
      get: {
        tags: ['Chat'],
        summary: 'Conversations de course actives (admin + manager)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Conversations retournées' } },
      },
    },
    '/admin/chat/support': {
      get: {
        tags: ['Chat'],
        summary: 'Tous les tickets support (admin + manager)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Tickets retournés' } },
      },
    },
    '/admin/documents': {
      get: {
        tags: ['Driver Documents'],
        summary: 'Tous les documents (admin + manager avec view_documents)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string', enum: ['pending', 'validated', 'rejected'] } },
        ],
        responses: { '200': { description: 'Liste des documents' } },
      },
    },
    '/admin/documents/stats': {
      get: {
        tags: ['Driver Documents'],
        summary: 'Statistiques des documents (admin + manager avec view_documents)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Stats retournées' } },
      },
    },
    '/admin/documents/{id}': {
      get: {
        tags: ['Driver Documents'],
        summary: 'Détail d\'un document (admin + manager avec view_documents)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Document retourné' } },
      },
    },
    '/admin/documents/{id}/validate': {
      patch: {
        tags: ['Driver Documents'],
        summary: 'Valider un document (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Document validé — notification envoyée au chauffeur' } },
      },
    },
    '/admin/documents/{id}/reject': {
      patch: {
        tags: ['Driver Documents'],
        summary: 'Rejeter un document avec motif obligatoire (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: { type: 'object', required: ['reason'], properties: { reason: { type: 'string' } } },
            },
          },
        },
        responses: { '200': { description: 'Document rejeté — notification envoyée au chauffeur' } },
      },
    },
    '/admin/drivers': {
      get: {
        tags: ['Drivers'],
        summary: 'Liste paginée des chauffeurs (admin + manager avec view_drivers)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'status', in: 'query', schema: { type: 'string' } },
          { name: 'zone', in: 'query', schema: { type: 'string', enum: ['france', 'senegal'] } },
          { name: 'page', in: 'query', schema: { type: 'integer', default: 1 } },
        ],
        responses: { '200': { description: 'Chauffeurs retournés' } },
      },
    },
    '/admin/drivers/{id}': {
      get: {
        tags: ['Drivers'],
        summary: 'Profil complet d\'un chauffeur (admin + manager avec view_drivers)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Chauffeur retourné' } },
      },
      patch: {
        tags: ['Drivers'],
        summary: 'Modifier un chauffeur — tva_rate, siret, zone, vehicle_type (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/Driver' } } },
        },
        responses: { '200': { description: 'Chauffeur mis à jour' } },
      },
    },
    '/admin/drivers/{id}/status': {
      patch: {
        tags: ['Drivers'],
        summary: 'Valider / rejeter / suspendre un chauffeur (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['status'],
                properties: {
                  status: { type: 'string', enum: ['pending', 'active', 'rejected', 'suspended'] },
                  reason: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { '200': { description: 'Statut mis à jour' } },
      },
    },
    '/admin/drivers/{id}/planning': {
      get: {
        tags: ['Drivers'],
        summary: 'Planning d\'un chauffeur (admin + manager avec view_drivers)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['week', 'month'] } },
        ],
        responses: { '200': { description: 'Planning retourné' } },
      },
    },
    '/admin/drivers/{id}/revenues': {
      get: {
        tags: ['Drivers'],
        summary: 'Revenus d\'un chauffeur (admin + manager avec view_drivers)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['week', 'month', 'total'] } },
        ],
        responses: { '200': { description: 'Revenus retournés' } },
      },
    },
    '/admin/drivers/{id}/availability': {
      get: {
        tags: ['Drivers'],
        summary: 'Disponibilité d\'un chauffeur — réservations + indisponibilités (admin + manager view_drivers)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id',     in: 'path',  required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'period', in: 'query', schema: { type: 'string', enum: ['week', 'month'], default: 'week' } },
          { name: 'date',   in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: {
          '200': {
            description: 'Disponibilité retournée',
            content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiSuccess' }, { properties: { data: { $ref: '#/components/schemas/DriverAvailabilityResult' } } }] } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },
    '/admin/drivers/{id}/unavailability': {
      get: {
        tags: ['Drivers'],
        summary: 'Indisponibilités d\'un chauffeur (admin + manager view_drivers)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Liste des indisponibilités',
            content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiSuccess' }, { properties: { data: { type: 'array', items: { $ref: '#/components/schemas/DriverUnavailability' } } } }] } } },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
      post: {
        tags: ['Drivers'],
        summary: 'Créer une indisponibilité pour un chauffeur (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['reason', 'starts_at', 'ends_at'],
                properties: {
                  reason:    { type: 'string', enum: ['conge', 'visite_medicale', 'formation', 'panne_vehicule', 'autre'] },
                  label:     { type: 'string', maxLength: 100 },
                  starts_at: { type: 'string', format: 'date-time' },
                  ends_at:   { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
        responses: {
          '201': { description: 'Indisponibilité créée', content: { 'application/json': { schema: { allOf: [{ $ref: '#/components/schemas/ApiSuccess' }, { properties: { data: { $ref: '#/components/schemas/DriverUnavailability' } } }] } } } },
          '400': { $ref: '#/components/responses/ValidationError' },
          '404': { $ref: '#/components/responses/NotFound' },
          '409': { description: 'Chevauchement avec une réservation confirmée' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/admin/drivers/{id}/unavailability/{unavailId}': {
      delete: {
        tags: ['Drivers'],
        summary: 'Supprimer une indisponibilité chauffeur (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id',        in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
          { name: 'unavailId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': { description: 'Indisponibilité supprimée' },
          '400': { description: 'Indisponibilité déjà commencée ou passée', content: { 'application/json': { schema: { $ref: '#/components/schemas/ApiError' } } } },
          '404': { $ref: '#/components/responses/NotFound' },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/admin/drivers/{id}/ratings': {
      get: {
        tags: ['Ratings'],
        summary: 'Évaluations d\'un chauffeur (admin + manager)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Évaluations retournées' } },
      },
    },
    '/admin/vehicles': {
      get: {
        tags: ['Vehicles'],
        summary: 'Tous les véhicules (admin)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Liste des véhicules' } },
      },
    },
    '/admin/vehicles/{id}': {
      get: {
        tags: ['Vehicles'],
        summary: 'Détail d\'un véhicule (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Véhicule retourné' } },
      },
    },
    '/admin/vehicle-types': {
      get: {
        tags: ['Vehicle Types'],
        summary: 'Tous les types de véhicules (admin)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Types retournés' } },
      },
      post: {
        tags: ['Vehicle Types'],
        summary: 'Créer un type de véhicule (admin)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/VehicleType' } } },
        },
        responses: { '201': { description: 'Type créé' } },
      },
    },
    '/admin/vehicle-types/{id}': {
      get: {
        tags: ['Vehicle Types'],
        summary: 'Détail d\'un type (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Type retourné' } },
      },
      patch: {
        tags: ['Vehicle Types'],
        summary: 'Modifier un type de véhicule (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/VehicleType' } } },
        },
        responses: { '200': { description: 'Type mis à jour' } },
      },
      delete: {
        tags: ['Vehicle Types'],
        summary: 'Supprimer un type de véhicule (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Type supprimé' } },
      },
    },
    '/admin/ratings': {
      get: {
        tags: ['Ratings'],
        summary: 'Liste globale des évaluations (admin + manager)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Évaluations retournées' } },
      },
    },
    '/admin/ratings/{id}': {
      delete: {
        tags: ['Ratings'],
        summary: 'Supprimer une évaluation (admin + manager)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Évaluation supprimée' } },
      },
    },
    '/admin/promo-codes': {
      get: {
        tags: ['Promo Codes'],
        summary: 'Liste paginée des codes promo (admin)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Codes promo retournés' } },
      },
      post: {
        tags: ['Promo Codes'],
        summary: 'Créer un code promo (admin)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/PromoCode' } } },
        },
        responses: { '201': { description: 'Code promo créé' } },
      },
    },
    '/admin/promo-codes/{id}': {
      get: {
        tags: ['Promo Codes'],
        summary: 'Détail d\'un code promo (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Code promo retourné' } },
      },
      patch: {
        tags: ['Promo Codes'],
        summary: 'Modifier un code promo (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/PromoCode' } } },
        },
        responses: { '200': { description: 'Code promo mis à jour' } },
      },
      delete: {
        tags: ['Promo Codes'],
        summary: 'Supprimer un code promo (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Code promo supprimé' } },
      },
    },
    '/admin/commission-settings': {
      get: {
        tags: ['Commission Settings'],
        summary: 'Liste des taux de commission (admin)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Paramètres retournés' } },
      },
      post: {
        tags: ['Commission Settings'],
        summary: 'Créer un taux de commission (admin)',
        security: [{ BearerAuth: [] }],
        requestBody: {
          required: true,
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CommissionSetting' } } },
        },
        responses: { '201': { description: 'Taux créé' } },
      },
    },
    '/admin/commission-settings/{id}': {
      get: {
        tags: ['Commission Settings'],
        summary: 'Détail d\'un taux de commission (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Taux retourné' } },
      },
      patch: {
        tags: ['Commission Settings'],
        summary: 'Modifier un taux de commission (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        requestBody: {
          content: { 'application/json': { schema: { $ref: '#/components/schemas/CommissionSetting' } } },
        },
        responses: { '200': { description: 'Taux mis à jour' } },
      },
      delete: {
        tags: ['Commission Settings'],
        summary: 'Supprimer un taux de commission (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } }],
        responses: { '200': { description: 'Taux supprimé' } },
      },
    },
    '/admin/commissions': {
      get: {
        tags: ['Commission Settings'],
        summary: 'Liste détaillée des commissions par course (admin)',
        security: [{ BearerAuth: [] }],
        responses: { '200': { description: 'Commissions retournées' } },
      },
    },
    '/admin/commissions/summary': {
      get: {
        tags: ['Commission Settings'],
        summary: 'Résumé agrégé des revenus plateforme (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'from', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'to', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: { '200': { description: 'Résumé retourné' } },
      },
    },

    // ════════════════════════════════════════════════════════════════════════════
    // AUDIT LOGS
    // ════════════════════════════════════════════════════════════════════════════
    '/admin/audit-logs': {
      get: {
        tags: ['Audit Logs'],
        summary: 'Liste paginée des logs d\'audit (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [
          {
            name: 'action', in: 'query',
            description: 'Filtrer par action (ex: USER_STATUS_CHANGED)',
            schema: {
              type: 'string',
              enum: [
                'USER_STATUS_CHANGED', 'USER_ANONYMIZED',
                'DOCUMENT_VALIDATED', 'DOCUMENT_REJECTED', 'DOCUMENT_DELETED',
                'RESERVATION_ASSIGNED', 'RESERVATION_CANCELLED',
                'INVOICE_PRICE_ADJUSTED', 'ORDER_PDF_REGENERATED',
                'MANAGER_CREATED', 'MANAGER_DELETED', 'MANAGER_PERMISSIONS_UPDATED', 'MANAGER_STATUS_CHANGED',
                'PRICING_GRID_CREATED', 'PRICING_GRID_UPDATED',
                'PROMO_CODE_CREATED', 'PROMO_CODE_DELETED',
                'COMMISSION_SETTING_CREATED', 'COMMISSION_SETTING_DELETED',
              ],
            },
          },
          { name: 'entity_type', in: 'query', description: 'Type d\'entité (user, reservation, invoice…)', schema: { type: 'string' } },
          { name: 'entity_id',   in: 'query', description: 'UUID de l\'entité ciblée', schema: { type: 'string', format: 'uuid' } },
          { name: 'performed_by', in: 'query', description: 'UUID de l\'utilisateur ayant effectué l\'action', schema: { type: 'string', format: 'uuid' } },
          { name: 'from', in: 'query', description: 'Date de début (ISO 8601)', schema: { type: 'string', format: 'date-time' } },
          { name: 'to',   in: 'query', description: 'Date de fin (ISO 8601)',   schema: { type: 'string', format: 'date-time' } },
          { name: 'page',  in: 'query', schema: { type: 'integer', default: 1 } },
          { name: 'limit', in: 'query', schema: { type: 'integer', default: 50, maximum: 100 } },
        ],
        responses: {
          '200': {
            description: 'Liste paginée des logs',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiSuccess' },
                    {
                      properties: {
                        data: {
                          type: 'object',
                          properties: {
                            logs:        { type: 'array', items: { $ref: '#/components/schemas/AuditLog' } },
                            total:       { type: 'integer' },
                            page:        { type: 'integer' },
                            limit:       { type: 'integer' },
                            total_pages: { type: 'integer' },
                          },
                        },
                      },
                    },
                  ],
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
        },
      },
    },
    '/admin/audit-logs/{id}': {
      get: {
        tags: ['Audit Logs'],
        summary: 'Détail d\'un log d\'audit (admin)',
        security: [{ BearerAuth: [] }],
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
        ],
        responses: {
          '200': {
            description: 'Log retourné',
            content: {
              'application/json': {
                schema: {
                  allOf: [
                    { $ref: '#/components/schemas/ApiSuccess' },
                    { properties: { data: { $ref: '#/components/schemas/AuditLog' } } },
                  ],
                },
              },
            },
          },
          '401': { $ref: '#/components/responses/Unauthorized' },
          '403': { $ref: '#/components/responses/Forbidden' },
          '404': { $ref: '#/components/responses/NotFound' },
        },
      },
    },

    // ════════════════════════════════════════════════════════════════════════════
    // CRON
    // ════════════════════════════════════════════════════════════════════════════
    '/cron/documents/check-expiry': {
      post: {
        tags: ['Cron'],
        summary: 'Vérifier les documents expirant à J-30 et J-7 — envoie push + email au chauffeur',
        security: [{ CronSecret: [] }],
        responses: { '200': { description: 'Alertes envoyées' }, '401': { description: 'CRON_SECRET invalide' } },
      },
    },
    '/cron/notifications/reminders': {
      post: {
        tags: ['Cron'],
        summary: 'Envoyer les rappels de course 1h avant le départ',
        security: [{ CronSecret: [] }],
        responses: { '200': { description: 'Rappels envoyés' }, '401': { description: 'CRON_SECRET invalide' } },
      },
    },
  },
};
