-- MDVR Platform Database Schema
-- PostgreSQL 16+

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm"; -- For text search
CREATE EXTENSION IF NOT EXISTS "postgis"; -- For geospatial queries

-- ============================================
-- ENUMS
-- ============================================

CREATE TYPE user_role AS ENUM ('super_admin', 'tenant_admin', 'technician', 'client_user');
CREATE TYPE subscription_status AS ENUM ('trial', 'active', 'past_due', 'canceled', 'paused');
CREATE TYPE subscription_plan AS ENUM ('basic', 'pro', 'enterprise', 'custom');
CREATE TYPE device_status AS ENUM ('online', 'offline', 'inactive', 'maintenance');
CREATE TYPE alarm_type AS ENUM ('custom', 'speed', 'geofence', 'impact', 'fatigue', 'phone_usage', 'seatbelt', 'fuel_fraud', 'maintenance');
CREATE TYPE media_file_type AS ENUM ('jpeg', 'h264', 'mp4', 'hls');
CREATE TYPE command_status AS ENUM ('pending', 'sent', 'acknowledged', 'failed', 'timeout');

-- ============================================
-- TENANTS TABLE
-- ============================================

CREATE TABLE tenants (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    contact_email VARCHAR(255) NOT NULL,
    contact_phone VARCHAR(50),
    logo_url TEXT,
    custom_domain VARCHAR(255),
    theme_config JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_tenants_slug ON tenants(slug);
CREATE INDEX idx_tenants_deleted ON tenants(deleted_at) WHERE deleted_at IS NULL;

-- ============================================
-- USERS TABLE
-- ============================================

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(255) NOT NULL,
    role user_role NOT NULL DEFAULT 'client_user',
    phone VARCHAR(50),
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    email_verified_at TIMESTAMPTZ,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_users_tenant ON users(tenant_id);
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);

-- ============================================
-- REFRESH TOKENS TABLE
-- ============================================

CREATE TABLE refresh_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash VARCHAR(255) NOT NULL UNIQUE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id);
CREATE INDEX idx_refresh_tokens_expires ON refresh_tokens(expires_at);

-- ============================================
-- SUBSCRIPTIONS TABLE
-- ============================================

CREATE TABLE subscriptions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    plan subscription_plan NOT NULL DEFAULT 'basic',
    status subscription_status NOT NULL DEFAULT 'trial',
    verifone_customer_id VARCHAR(255),
    verifone_subscription_id VARCHAR(255),
    current_period_start TIMESTAMPTZ,
    current_period_end TIMESTAMPTZ,
    trial_ends_at TIMESTAMPTZ,
    canceled_at TIMESTAMPTZ,
    max_devices INTEGER NOT NULL DEFAULT 5,
    max_users INTEGER NOT NULL DEFAULT 3,
    features JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_subscriptions_tenant ON subscriptions(tenant_id);
CREATE INDEX idx_subscriptions_status ON subscriptions(status);
CREATE INDEX idx_subscriptions_verifone ON subscriptions(verifone_subscription_id);

-- ============================================
-- INVOICES TABLE
-- ============================================

CREATE TABLE invoices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
    verifone_invoice_id VARCHAR(255),
    invoice_number VARCHAR(100) UNIQUE NOT NULL,
    amount_cents INTEGER NOT NULL,
    currency VARCHAR(3) NOT NULL DEFAULT 'ILS',
    status VARCHAR(50) NOT NULL DEFAULT 'pending',
    paid_at TIMESTAMPTZ,
    due_date TIMESTAMPTZ,
    pdf_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_invoices_tenant ON invoices(tenant_id);
CREATE INDEX idx_invoices_subscription ON invoices(subscription_id);
CREATE INDEX idx_invoices_status ON invoices(status);

-- ============================================
-- DEVICES TABLE
-- ============================================

CREATE TABLE devices (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    device_serial VARCHAR(100) UNIQUE NOT NULL,
    imei VARCHAR(50) UNIQUE,
    license_plate VARCHAR(50),
    device_name VARCHAR(255),
    device_type VARCHAR(50) NOT NULL DEFAULT 'mdvr',
    firmware_version VARCHAR(50),
    protocol_version VARCHAR(20),
    num_channels INTEGER NOT NULL DEFAULT 4,
    status device_status NOT NULL DEFAULT 'offline',
    last_seen_at TIMESTAMPTZ,
    registration_data JSONB DEFAULT '{}',
    settings JSONB DEFAULT '{}',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE INDEX idx_devices_tenant ON devices(tenant_id);
CREATE INDEX idx_devices_serial ON devices(device_serial);
CREATE INDEX idx_devices_imei ON devices(imei);
CREATE INDEX idx_devices_status ON devices(status);
CREATE INDEX idx_devices_last_seen ON devices(last_seen_at);

-- ============================================
-- DEVICE GROUPS TABLE
-- ============================================

CREATE TABLE device_groups (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_groups_tenant ON device_groups(tenant_id);

-- ============================================
-- DEVICE GROUP MEMBERS TABLE
-- ============================================

CREATE TABLE device_group_members (
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    group_id UUID NOT NULL REFERENCES device_groups(id) ON DELETE CASCADE,
    added_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (device_id, group_id)
);

CREATE INDEX idx_device_group_members_group ON device_group_members(group_id);

-- ============================================
-- TELEMETRY TABLE (Partitioned by time)
-- ============================================

CREATE TABLE telemetry (
    id UUID DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    altitude NUMERIC(8, 2),
    speed NUMERIC(6, 2),
    course NUMERIC(5, 2),
    satellites INTEGER,
    gps_valid BOOLEAN,
    odometer BIGINT,
    fuel_level NUMERIC(5, 2),
    battery_voltage NUMERIC(5, 2),
    temperature NUMERIC(5, 2),
    engine_temp NUMERIC(5, 2),
    rpm INTEGER,
    status_flags BYTEA,
    location GEOGRAPHY(POINT, 4326),
    metadata JSONB DEFAULT '{}',
    PRIMARY KEY (device_id, timestamp)
) PARTITION BY RANGE (timestamp);

-- Create partitions for the last 3 months and next month
CREATE TABLE telemetry_2024_01 PARTITION OF telemetry
    FOR VALUES FROM ('2024-01-01') TO ('2024-02-01');
CREATE TABLE telemetry_2024_02 PARTITION OF telemetry
    FOR VALUES FROM ('2024-02-01') TO ('2024-03-01');
CREATE TABLE telemetry_2024_03 PARTITION OF telemetry
    FOR VALUES FROM ('2024-03-01') TO ('2024-04-01');

CREATE INDEX idx_telemetry_device ON telemetry(device_id, timestamp DESC);
CREATE INDEX idx_telemetry_tenant ON telemetry(tenant_id, timestamp DESC);
CREATE INDEX idx_telemetry_location ON telemetry USING GIST(location);

-- ============================================
-- ALARMS TABLE
-- ============================================

CREATE TABLE alarms (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    alarm_uid VARCHAR(100) UNIQUE NOT NULL,
    alarm_type alarm_type NOT NULL,
    alarm_name VARCHAR(255),
    alarm_number INTEGER,
    alarm_source INTEGER DEFAULT 0,
    severity VARCHAR(20) NOT NULL DEFAULT 'medium',
    started_at TIMESTAMPTZ NOT NULL,
    ended_at TIMESTAMPTZ,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    location GEOGRAPHY(POINT, 4326),
    speed NUMERIC(6, 2),
    confidence NUMERIC(5, 4),
    snapshot_count INTEGER DEFAULT 0,
    recording_count INTEGER DEFAULT 0,
    acknowledged BOOLEAN NOT NULL DEFAULT false,
    acknowledged_by UUID REFERENCES users(id) ON DELETE SET NULL,
    acknowledged_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_alarms_device ON alarms(device_id, started_at DESC);
CREATE INDEX idx_alarms_tenant ON alarms(tenant_id, started_at DESC);
CREATE INDEX idx_alarms_type ON alarms(alarm_type);
CREATE INDEX idx_alarms_uid ON alarms(alarm_uid);
CREATE INDEX idx_alarms_location ON alarms USING GIST(location);

-- ============================================
-- MEDIA SESSIONS TABLE
-- ============================================

CREATE TABLE media_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id VARCHAR(100) UNIQUE NOT NULL,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    channel_number INTEGER NOT NULL,
    stream_type INTEGER NOT NULL DEFAULT 1,
    connection_type INTEGER NOT NULL DEFAULT 0,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMPTZ,
    client_ip VARCHAR(50),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_sessions_device ON media_sessions(device_id);
CREATE INDEX idx_media_sessions_session ON media_sessions(session_id);
CREATE INDEX idx_media_sessions_tenant ON media_sessions(tenant_id);

-- ============================================
-- MEDIA FILES TABLE
-- ============================================

CREATE TABLE media_files (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    alarm_id UUID REFERENCES alarms(id) ON DELETE SET NULL,
    session_id UUID REFERENCES media_sessions(id) ON DELETE SET NULL,
    file_type media_file_type NOT NULL,
    file_path TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    s3_key TEXT NOT NULL,
    s3_bucket VARCHAR(255) NOT NULL,
    channel_number INTEGER,
    is_alarm_file BOOLEAN NOT NULL DEFAULT false,
    duration_seconds INTEGER,
    start_time TIMESTAMPTZ,
    end_time TIMESTAMPTZ,
    thumbnail_url TEXT,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_media_files_device ON media_files(device_id, created_at DESC);
CREATE INDEX idx_media_files_tenant ON media_files(tenant_id, created_at DESC);
CREATE INDEX idx_media_files_alarm ON media_files(alarm_id);
CREATE INDEX idx_media_files_type ON media_files(file_type);
CREATE INDEX idx_media_files_s3 ON media_files(s3_bucket, s3_key);

-- ============================================
-- DEVICE COMMANDS TABLE
-- ============================================

CREATE TABLE device_commands (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    issued_by UUID REFERENCES users(id) ON DELETE SET NULL,
    command_type VARCHAR(50) NOT NULL,
    command_params JSONB DEFAULT '{}',
    status command_status NOT NULL DEFAULT 'pending',
    sent_at TIMESTAMPTZ,
    acknowledged_at TIMESTAMPTZ,
    response_data JSONB,
    error_message TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_device_commands_device ON device_commands(device_id, created_at DESC);
CREATE INDEX idx_device_commands_status ON device_commands(status);

-- ============================================
-- GEOFENCES TABLE
-- ============================================

CREATE TABLE geofences (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    geometry GEOGRAPHY(POLYGON, 4326) NOT NULL,
    trigger_on_enter BOOLEAN NOT NULL DEFAULT true,
    trigger_on_exit BOOLEAN NOT NULL DEFAULT true,
    actions JSONB DEFAULT '[]',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_geofences_tenant ON geofences(tenant_id);
CREATE INDEX idx_geofences_geometry ON geofences USING GIST(geometry);

-- ============================================
-- GEOFENCE EVENTS TABLE
-- ============================================

CREATE TABLE geofence_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    geofence_id UUID NOT NULL REFERENCES geofences(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    event_type VARCHAR(20) NOT NULL,
    latitude NUMERIC(10, 7),
    longitude NUMERIC(10, 7),
    location GEOGRAPHY(POINT, 4326),
    occurred_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata JSONB DEFAULT '{}'
);

CREATE INDEX idx_geofence_events_geofence ON geofence_events(geofence_id, occurred_at DESC);
CREATE INDEX idx_geofence_events_device ON geofence_events(device_id, occurred_at DESC);

-- ============================================
-- FIRMWARE TABLE
-- ============================================

CREATE TABLE firmware (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    version VARCHAR(50) NOT NULL UNIQUE,
    device_type VARCHAR(50) NOT NULL,
    file_url TEXT NOT NULL,
    file_size BIGINT NOT NULL,
    checksum VARCHAR(64) NOT NULL,
    release_notes TEXT,
    is_stable BOOLEAN NOT NULL DEFAULT false,
    min_version VARCHAR(50),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_firmware_version ON firmware(version);
CREATE INDEX idx_firmware_device_type ON firmware(device_type);

-- ============================================
-- OTA SCHEDULES TABLE
-- ============================================

CREATE TABLE ota_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    firmware_id UUID NOT NULL REFERENCES firmware(id) ON DELETE CASCADE,
    device_group_id UUID REFERENCES device_groups(id) ON DELETE SET NULL,
    scheduled_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(50) NOT NULL DEFAULT 'scheduled',
    completed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_ota_schedules_tenant ON ota_schedules(tenant_id);
CREATE INDEX idx_ota_schedules_status ON ota_schedules(status);

-- ============================================
-- MAINTENANCE SCHEDULES TABLE
-- ============================================

CREATE TABLE maintenance_schedules (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    schedule_type VARCHAR(50) NOT NULL,
    interval_value INTEGER,
    interval_unit VARCHAR(20),
    last_maintenance_at TIMESTAMPTZ,
    next_maintenance_at TIMESTAMPTZ NOT NULL,
    odometer_at_last_maintenance BIGINT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_maintenance_device ON maintenance_schedules(device_id);
CREATE INDEX idx_maintenance_next ON maintenance_schedules(next_maintenance_at);

-- ============================================
-- AUDIT LOGS TABLE
-- ============================================

CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100),
    entity_id UUID,
    changes JSONB,
    ip_address VARCHAR(50),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id, created_at DESC);
CREATE INDEX idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- ============================================
-- WEBHOOKS TABLE
-- ============================================

CREATE TABLE webhooks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    url TEXT NOT NULL,
    secret VARCHAR(255) NOT NULL,
    events TEXT[] NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT true,
    last_triggered_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhooks_tenant ON webhooks(tenant_id);

-- ============================================
-- WEBHOOK DELIVERIES TABLE
-- ============================================

CREATE TABLE webhook_deliveries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    webhook_id UUID NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    attempts INTEGER NOT NULL DEFAULT 0,
    delivered BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    delivered_at TIMESTAMPTZ
);

CREATE INDEX idx_webhook_deliveries_webhook ON webhook_deliveries(webhook_id, created_at DESC);

-- ============================================
-- PUSH NOTIFICATION TOKENS TABLE
-- ============================================

CREATE TABLE push_tokens (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(20) NOT NULL,
    token TEXT NOT NULL,
    device_info JSONB DEFAULT '{}',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, token)
);

CREATE INDEX idx_push_tokens_user ON push_tokens(user_id);

-- ============================================
-- FUNCTIONS & TRIGGERS
-- ============================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at trigger to relevant tables
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_subscriptions_updated_at BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON devices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_alarms_updated_at BEFORE UPDATE ON alarms
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Update location from lat/lng for telemetry
CREATE OR REPLACE FUNCTION update_telemetry_location()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_telemetry_location_trigger BEFORE INSERT ON telemetry
    FOR EACH ROW EXECUTE FUNCTION update_telemetry_location();

-- Update location for alarms
CREATE OR REPLACE FUNCTION update_alarm_location()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.latitude IS NOT NULL AND NEW.longitude IS NOT NULL THEN
        NEW.location = ST_SetSRID(ST_MakePoint(NEW.longitude, NEW.latitude), 4326)::geography;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_alarm_location_trigger BEFORE INSERT OR UPDATE ON alarms
    FOR EACH ROW EXECUTE FUNCTION update_alarm_location();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on tenant-isolated tables
ALTER TABLE devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE alarms ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_files ENABLE ROW LEVEL SECURITY;
ALTER TABLE device_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofences ENABLE ROW LEVEL SECURITY;
ALTER TABLE geofence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE maintenance_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhooks ENABLE ROW LEVEL SECURITY;

-- RLS Policies (application will set current_setting for tenant_id)
CREATE POLICY tenant_isolation_devices ON devices
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_telemetry ON telemetry
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_alarms ON alarms
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

CREATE POLICY tenant_isolation_media_files ON media_files
    USING (tenant_id = current_setting('app.current_tenant_id', true)::UUID);

-- ============================================
-- SEED DATA (Development Only)
-- ============================================

-- Insert super admin tenant
INSERT INTO tenants (id, name, slug, contact_email)
VALUES ('00000000-0000-0000-0000-000000000001', 'Platform Admin', 'admin', 'admin@mdvr-platform.com');

-- Insert super admin user (password: Admin123!)
INSERT INTO users (id, tenant_id, email, password_hash, full_name, role)
VALUES (
    '00000000-0000-0000-0000-000000000001',
    '00000000-0000-0000-0000-000000000001',
    'admin@mdvr-platform.com',
    '$2b$10$XQfC8qP9vZn5Y3RJG.TjA.KHJjH8KZvFXQZ5b9n5Y3RJG.TjA.KHKH',
    'System Administrator',
    'super_admin'
);

-- Insert demo tenant
INSERT INTO tenants (id, name, slug, contact_email)
VALUES ('00000000-0000-0000-0000-000000000002', 'Demo Fleet Company', 'demo-fleet', 'contact@demo-fleet.com');

-- Insert demo subscription
INSERT INTO subscriptions (tenant_id, plan, status, max_devices, max_users, trial_ends_at)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    'pro',
    'trial',
    50,
    10,
    NOW() + INTERVAL '30 days'
);

-- Insert demo tenant admin
INSERT INTO users (tenant_id, email, password_hash, full_name, role)
VALUES (
    '00000000-0000-0000-0000-000000000002',
    'admin@demo-fleet.com',
    '$2b$10$XQfC8qP9vZn5Y3RJG.TjA.KHJjH8KZvFXQZ5b9n5Y3RJG.TjA.KHKH',
    'Fleet Manager',
    'tenant_admin'
);
