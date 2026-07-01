-- Add new_reservation_admin to notification_type enum
-- Sent to all admin users when a client creates a new reservation
ALTER TYPE public.notification_type ADD VALUE IF NOT EXISTS 'new_reservation_admin';
