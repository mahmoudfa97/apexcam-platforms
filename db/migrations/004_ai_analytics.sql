-- Analytics events table
CREATE TABLE IF NOT EXISTS analytics_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id),
  event_type VARCHAR(50) NOT NULL,
  confidence DECIMAL(5,4),
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_analytics_device (device_id),
  INDEX idx_analytics_type (event_type),
  INDEX idx_analytics_created (created_at)
);

-- Geofences table
CREATE TABLE IF NOT EXISTS geofences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES tenants(id),
  name VARCHAR(255) NOT NULL,
  type VARCHAR(20) NOT NULL CHECK (type IN ('circle', 'polygon')),
  geometry GEOMETRY(POLYGON, 4326) NOT NULL,
  trigger_type VARCHAR(20) NOT NULL CHECK (trigger_type IN ('enter', 'exit', 'both')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_geofences_tenant ON geofences(tenant_id);
CREATE INDEX idx_geofences_geometry ON geofences USING GIST(geometry);

-- Geofence violations table
CREATE TABLE IF NOT EXISTS geofence_violations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  geofence_id UUID NOT NULL REFERENCES geofences(id),
  device_id UUID NOT NULL REFERENCES devices(id),
  violation_type VARCHAR(20) NOT NULL CHECK (violation_type IN ('enter', 'exit')),
  location GEOMETRY(POINT, 4326) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_violations_geofence (geofence_id),
  INDEX idx_violations_device (device_id),
  INDEX idx_violations_created (created_at)
);

-- Firmware table
CREATE TABLE IF NOT EXISTS firmware (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version VARCHAR(50) NOT NULL,
  device_type VARCHAR(50) NOT NULL,
  file_url TEXT NOT NULL,
  checksum VARCHAR(64) NOT NULL,
  release_notes TEXT,
  status VARCHAR(20) NOT NULL CHECK (status IN ('draft', 'released', 'deprecated')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(version, device_type)
);

-- OTA updates table
CREATE TABLE IF NOT EXISTS ota_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  firmware_id UUID NOT NULL REFERENCES firmware(id),
  name VARCHAR(255) NOT NULL,
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'in_progress', 'completed', 'failed')),
  target_devices TEXT[] NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- OTA deployments table
CREATE TABLE IF NOT EXISTS ota_deployments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  update_id UUID NOT NULL REFERENCES ota_updates(id),
  device_id UUID NOT NULL REFERENCES devices(id),
  status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'downloading', 'installing', 'completed', 'failed')),
  progress INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(update_id, device_id)
);

-- Driver behavior analysis table
CREATE TABLE IF NOT EXISTS driver_behavior_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id UUID NOT NULL REFERENCES devices(id),
  period_start TIMESTAMPTZ NOT NULL,
  period_end TIMESTAMPTZ NOT NULL,
  harsh_braking INTEGER DEFAULT 0,
  harsh_acceleration INTEGER DEFAULT 0,
  sharp_turns INTEGER DEFAULT 0,
  speeding INTEGER DEFAULT 0,
  idling INTEGER DEFAULT 0,
  score DECIMAL(5,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  INDEX idx_behavior_device (device_id),
  INDEX idx_behavior_period (period_start, period_end)
);
