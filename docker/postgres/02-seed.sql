-- HomeOn Seed Data
-- NOTE: Admin user is created by AuthService.onModuleInit() with a proper bcrypt hash.
-- We only seed the gate config here.

-- Default gate config
INSERT INTO gate_config (name, status, "autoCloseEnabled", "autoCloseSeconds", "doubleConfirmation")
VALUES (
  'Portón Principal',
  'closed',
  true,
  180,
  true
);
