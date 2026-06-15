-- Migration : ajout du type 'marketing' dans l'enum notification_type
--
-- Contexte Sprint 6–7 :
--   Le module marketing envoie des notifications push via notificationsService.send().
--   La colonne notifications.type est de type public.notification_type (enum PostgreSQL).
--   Sans cette valeur, chaque insert échoue silencieusement côté Supabase.

DO $$ BEGIN
  ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'marketing';
EXCEPTION WHEN others THEN NULL;
END $$;
