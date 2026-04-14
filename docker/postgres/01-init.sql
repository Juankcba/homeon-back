-- HomeOn Database Schema
-- Auto-generated from TypeORM entities
-- Run order: types → tables → indexes

-- ─── Custom ENUM types ────────────────────────────────────
CREATE TYPE user_role AS ENUM ('admin', 'family', 'guest');
CREATE TYPE camera_status AS ENUM ('online', 'offline', 'recording');
CREATE TYPE detection_type AS ENUM ('face', 'vehicle', 'person', 'motion');
CREATE TYPE gate_status_enum AS ENUM ('open', 'closed', 'opening', 'closing');
CREATE TYPE gate_action_type AS ENUM ('open', 'close');
CREATE TYPE gate_method AS ENUM ('manual_app', 'automatic', 'face_recognition', 'plate_recognition', 'schedule', 'api');
CREATE TYPE event_severity AS ENUM ('critical', 'warning', 'info', 'success');
CREATE TYPE face_role AS ENUM ('admin', 'family', 'guest', 'staff');

-- ─── Users ────────────────────────────────────────────────
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR NOT NULL UNIQUE,
  password VARCHAR NOT NULL,
  name VARCHAR,
  email VARCHAR,
  role user_role NOT NULL DEFAULT 'family',
  "avatarUrl" VARCHAR,
  "mfaEnabled" BOOLEAN NOT NULL DEFAULT false,
  "mfaSecret" VARCHAR,
  "isActive" BOOLEAN NOT NULL DEFAULT true,
  "lastLoginAt" TIMESTAMP,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- ─── Cameras ──────────────────────────────────────────────
CREATE TABLE cameras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  location VARCHAR NOT NULL,
  status camera_status NOT NULL DEFAULT 'offline',
  ip VARCHAR NOT NULL,
  mac VARCHAR,
  model VARCHAR DEFAULT 'Tapo C320WS',
  firmware VARCHAR,
  resolution VARCHAR DEFAULT '1920x1080',
  fps INTEGER DEFAULT 25,
  codec VARCHAR,
  zone VARCHAR DEFAULT 'exterior',
  features JSONB DEFAULT '{"nightVision": true, "audio": true, "motionDetection": true}',
  "storageUsed" DECIMAL DEFAULT 0,
  "storageTotal" DECIMAL DEFAULT 1000,
  uptime BIGINT DEFAULT 0,
  temperature DECIMAL,
  "lastMotion" TIMESTAMP,
  "lastPing" TIMESTAMP,
  "rtspUsername" VARCHAR,
  "rtspPassword" VARCHAR,
  credentials JSONB,
  "isActive" BOOLEAN DEFAULT true,
  "sortOrder" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- ─── Lights ───────────────────────────────────────────────
CREATE TABLE lights (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  "hueId" VARCHAR,
  "on" BOOLEAN DEFAULT false,
  brightness INTEGER DEFAULT 254,
  color JSONB,
  "colorTemp" INTEGER,
  room VARCHAR,
  floor VARCHAR,
  type VARCHAR,
  reachable BOOLEAN DEFAULT true,
  "sortOrder" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- ─── Light Groups ─────────────────────────────────────────
CREATE TABLE light_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  "hueGroupId" VARCHAR,
  "lightIds" TEXT DEFAULT '',
  "on" BOOLEAN DEFAULT false,
  brightness INTEGER DEFAULT 254,
  room VARCHAR,
  floor VARCHAR,
  icon VARCHAR,
  "sortOrder" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- ─── Light Scenes ─────────────────────────────────────────
CREATE TABLE light_scenes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  description VARCHAR,
  "hueSceneId" VARCHAR,
  icon VARCHAR,
  "lightStates" JSONB DEFAULT '{}',
  "isActive" BOOLEAN DEFAULT false,
  "sortOrder" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- ─── Gate Config ──────────────────────────────────────────
CREATE TABLE gate_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR DEFAULT 'Portón Principal',
  status gate_status_enum NOT NULL DEFAULT 'closed',
  position INTEGER DEFAULT 0,
  "autoCloseEnabled" BOOLEAN DEFAULT true,
  "autoCloseSeconds" INTEGER DEFAULT 180,
  "doubleConfirmation" BOOLEAN DEFAULT true,
  "restrictedHours" BOOLEAN DEFAULT false,
  "restrictedFrom" TIME,
  "restrictedTo" TIME,
  "faceRecognitionAccess" BOOLEAN DEFAULT true,
  "plateRecognitionAccess" BOOLEAN DEFAULT true,
  "controllerIp" VARCHAR,
  "controllerPort" INTEGER,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- ─── Gate Actions ─────────────────────────────────────────
CREATE TABLE gate_actions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action gate_action_type NOT NULL,
  method gate_method NOT NULL DEFAULT 'manual_app',
  "userId" VARCHAR,
  "userName" VARCHAR,
  "ipAddress" VARCHAR,
  detail VARCHAR,
  success BOOLEAN DEFAULT true,
  timestamp TIMESTAMP NOT NULL DEFAULT now()
);

-- ─── Authorized Faces ─────────────────────────────────────
CREATE TABLE authorized_faces (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  role face_role NOT NULL DEFAULT 'family',
  "userId" VARCHAR,
  encoding BYTEA,
  "photoPath" VARCHAR,
  "totalDetections" INTEGER DEFAULT 0,
  "avgConfidence" DECIMAL DEFAULT 0,
  "lastSeenAt" TIMESTAMP,
  "lastSeenCamera" VARCHAR,
  "gateAccess" BOOLEAN DEFAULT true,
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- ─── Authorized Vehicles ──────────────────────────────────
CREATE TABLE authorized_vehicles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plate VARCHAR NOT NULL,
  owner VARCHAR,
  "userId" VARCHAR,
  type VARCHAR DEFAULT 'auto',
  brand VARCHAR,
  model VARCHAR,
  color VARCHAR,
  "totalDetections" INTEGER DEFAULT 0,
  "lastSeenAt" TIMESTAMP,
  "lastSeenCamera" VARCHAR,
  "gateAccess" BOOLEAN DEFAULT true,
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- ─── Detections ───────────────────────────────────────────
CREATE TABLE detections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type detection_type NOT NULL,
  label VARCHAR NOT NULL,
  "cameraId" VARCHAR NOT NULL,
  "cameraName" VARCHAR,
  confidence DECIMAL DEFAULT 0,
  authorized BOOLEAN DEFAULT false,
  "matchedFaceId" VARCHAR,
  "matchedVehicleId" VARCHAR,
  "snapshotPath" VARCHAR,
  "boundingBox" JSONB,
  metadata JSONB,
  "alertSent" BOOLEAN DEFAULT false,
  "triggeredAutomationId" VARCHAR,
  timestamp TIMESTAMP NOT NULL DEFAULT now()
);

-- ─── Automations ──────────────────────────────────────────
CREATE TABLE automations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  description VARCHAR,
  trigger JSONB NOT NULL,
  actions JSONB NOT NULL,
  conditions JSONB,
  enabled BOOLEAN DEFAULT true,
  "lastRunAt" TIMESTAMP,
  "runCount" INTEGER DEFAULT 0,
  "failCount" INTEGER DEFAULT 0,
  "sortOrder" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- ─── Events ───────────────────────────────────────────────
CREATE TABLE events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR NOT NULL,
  severity event_severity NOT NULL DEFAULT 'info',
  message VARCHAR NOT NULL,
  detail TEXT,
  "cameraId" VARCHAR,
  "cameraName" VARCHAR,
  "userId" VARCHAR,
  "userName" VARCHAR,
  "deviceId" VARCHAR,
  "snapshotPath" VARCHAR,
  "detectionId" VARCHAR,
  metadata JSONB,
  acknowledged BOOLEAN DEFAULT false,
  timestamp TIMESTAMP NOT NULL DEFAULT now()
);

-- ─── Device Configs ───────────────────────────────────────
CREATE TABLE device_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR NOT NULL UNIQUE,
  label VARCHAR,
  ip VARCHAR,
  "apiKey" VARCHAR,
  meta JSONB DEFAULT '{}',
  connected BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- ─── Zones ────────────────────────────────────────────────
CREATE TABLE zones (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  floor VARCHAR,
  description VARCHAR,
  icon VARCHAR,
  "deviceIds" TEXT DEFAULT '',
  "sortOrder" INTEGER DEFAULT 0,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

-- ─── Alarms (Tuya / Smart Life) ──────────────────────────
CREATE TYPE alarm_mode AS ENUM ('arm', 'disarm', 'home', 'sos', 'unknown');

CREATE TABLE alarms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  "tuyaDeviceId" VARCHAR NOT NULL UNIQUE,
  model VARCHAR,
  mode alarm_mode NOT NULL DEFAULT 'unknown',
  "alarmActive" BOOLEAN NOT NULL DEFAULT false,
  online BOOLEAN NOT NULL DEFAULT false,
  battery DECIMAL,
  zone VARCHAR DEFAULT 'general',
  sensors JSONB DEFAULT '{}',
  "lastSyncAt" TIMESTAMP,
  "isActive" BOOLEAN DEFAULT true,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);

CREATE TABLE alarm_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "alarmId" VARCHAR NOT NULL,
  type VARCHAR NOT NULL,
  message VARCHAR NOT NULL,
  detail JSONB,
  "triggeredBy" VARCHAR,
  timestamp TIMESTAMP NOT NULL DEFAULT now()
);

-- ─── INDEXES ──────────────────────────────────────────────
CREATE INDEX idx_detections_type_ts ON detections (type, timestamp);
CREATE INDEX idx_detections_camera_ts ON detections ("cameraId", timestamp);
CREATE INDEX idx_detections_auth_ts ON detections (authorized, timestamp);

CREATE INDEX idx_gate_actions_ts ON gate_actions (timestamp);
CREATE INDEX idx_gate_actions_user_ts ON gate_actions ("userId", timestamp);

CREATE INDEX idx_events_type_ts ON events (type, timestamp);
CREATE INDEX idx_events_camera_ts ON events ("cameraId", timestamp);
CREATE INDEX idx_events_severity_ts ON events (severity, timestamp);
CREATE INDEX idx_events_ts ON events (timestamp);

CREATE INDEX idx_alarm_events_alarm_ts ON alarm_events ("alarmId", timestamp);
CREATE INDEX idx_alarm_events_type_ts ON alarm_events (type, timestamp);

-- ─── Edge devices (ESP32 LAN bridges) ─────────────────────
CREATE TABLE IF NOT EXISTS edge_devices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR NOT NULL,
  product VARCHAR NOT NULL,
  version VARCHAR,
  mac VARCHAR NOT NULL UNIQUE,
  token TEXT NOT NULL UNIQUE,
  connected BOOLEAN DEFAULT false,
  "lastIp" VARCHAR,
  "lastRssi" INTEGER,
  "lastSeenAt" TIMESTAMP,
  "locationName" VARCHAR,
  latitude DOUBLE PRECISION,
  longitude DOUBLE PRECISION,
  timezone VARCHAR,
  "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
  "updatedAt" TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_edge_devices_mac ON edge_devices (mac);

-- Idempotent migrations for existing installs
ALTER TABLE edge_devices ADD COLUMN IF NOT EXISTS "locationName" VARCHAR;
ALTER TABLE edge_devices ADD COLUMN IF NOT EXISTS latitude  DOUBLE PRECISION;
ALTER TABLE edge_devices ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION;
ALTER TABLE edge_devices ADD COLUMN IF NOT EXISTS timezone  VARCHAR;
