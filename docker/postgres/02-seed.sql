-- HomeOn Seed Data
-- Default admin user (password: admin123 hashed with bcrypt 10 rounds)

INSERT INTO users (username, password, name, role, "isActive")
VALUES (
  'admin',
  '$2a$10$8KzaNdKIMyOkASCnqPJSa.T1WCGxHv2tOoa0FnfDGW0xGD.CMW0V6',
  'Administrador',
  'admin',
  true
)
ON CONFLICT (username) DO NOTHING;

-- Default gate config
INSERT INTO gate_config (name, status, "autoCloseEnabled", "autoCloseSeconds", "doubleConfirmation")
VALUES (
  'Portón Principal',
  'closed',
  true,
  180,
  true
);
