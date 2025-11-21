-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "postgis";

-- Enable Row Level Security
ALTER DATABASE postgres SET "app.jwt_secret" TO 'your-jwt-secret-here';

-- Create tenants table
CREATE TABLE IF NOT EXISTS public.tenants (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  settings JSONB DEFAULT '{}'::jsonb,
  subscription_tier TEXT DEFAULT 'free',
  subscription_status TEXT DEFAULT 'active',
  billing_email TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  role TEXT DEFAULT 'user',
  is_active BOOLEAN DEFAULT true,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create devices table
CREATE TABLE IF NOT EXISTS public.devices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_serial TEXT NOT NULL,
  license_plate TEXT,
  device_type TEXT NOT NULL,
  protocol_version TEXT NOT NULL,
  firmware_version TEXT,
  network_type TEXT,
  imei TEXT,
  is_online BOOLEAN DEFAULT false,
  last_seen_at TIMESTAMPTZ,
  last_location JSONB,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, device_serial)
);

-- Create telemetry table with PostGIS
CREATE TABLE IF NOT EXISTS public.telemetry (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  gps_status TEXT NOT NULL,
  speed NUMERIC DEFAULT 0,
  heading NUMERIC DEFAULT 0,
  altitude NUMERIC DEFAULT 0,
  satellites INTEGER DEFAULT 0,
  component_status TEXT,
  temperature NUMERIC,
  mileage BIGINT,
  fuel_level NUMERIC,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Partition telemetry by month for performance
CREATE INDEX idx_telemetry_device_timestamp ON public.telemetry(device_id, timestamp DESC);
CREATE INDEX idx_telemetry_location ON public.telemetry USING GIST(location);

-- Create alarms table
CREATE TABLE IF NOT EXISTS public.alarms (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  alarm_uid TEXT NOT NULL,
  alarm_type TEXT NOT NULL,
  alarm_source TEXT DEFAULT 'device',
  severity TEXT DEFAULT 'medium',
  status TEXT DEFAULT 'active',
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  location GEOGRAPHY(POINT, 4326),
  metadata JSONB DEFAULT '{}'::jsonb,
  acknowledged_at TIMESTAMPTZ,
  acknowledged_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(tenant_id, alarm_uid)
);

CREATE INDEX idx_alarms_device_status ON public.alarms(device_id, status, start_time DESC);

-- Create media_files table
CREATE TABLE IF NOT EXISTS public.media_files (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  device_id UUID NOT NULL REFERENCES public.devices(id) ON DELETE CASCADE,
  alarm_id UUID REFERENCES public.alarms(id) ON DELETE SET NULL,
  file_type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_size BIGINT NOT NULL,
  duration INTEGER,
  channel INTEGER NOT NULL,
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ,
  thumbnail_path TEXT,
  hls_path TEXT,
  processing_status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_media_files_device ON public.media_files(device_id, start_time DESC);
CREATE INDEX idx_media_files_alarm ON public.media_files(alarm_id) WHERE alarm_id IS NOT NULL;

-- Enable Row Level Security on all tables
ALTER TABLE public.tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alarms ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.media_files ENABLE ROW LEVEL SECURITY;

-- RLS Policies for multi-tenant isolation
-- Tenants: Users can only see their own tenant
CREATE POLICY tenant_isolation ON public.tenants
  FOR ALL
  USING (id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Users: Users can see other users in their tenant
CREATE POLICY user_isolation ON public.users
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Devices: Users can only see devices in their tenant
CREATE POLICY device_isolation ON public.devices
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Telemetry: Users can only see telemetry for their tenant's devices
CREATE POLICY telemetry_isolation ON public.telemetry
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Alarms: Users can only see alarms for their tenant's devices
CREATE POLICY alarm_isolation ON public.alarms
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Media Files: Users can only see media for their tenant's devices
CREATE POLICY media_isolation ON public.media_files
  FOR ALL
  USING (tenant_id = (SELECT tenant_id FROM public.users WHERE id = auth.uid()));

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers for updated_at
CREATE TRIGGER update_tenants_updated_at BEFORE UPDATE ON public.tenants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_devices_updated_at BEFORE UPDATE ON public.devices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Create storage buckets (run this in Supabase Dashboard > Storage)
-- INSERT INTO storage.buckets (id, name, public) VALUES 
--   ('mdvr-media', 'mdvr-media', false),
--   ('mdvr-thumbnails', 'mdvr-thumbnails', true),
--   ('mdvr-firmware', 'mdvr-firmware', false);

-- Storage policies for multi-tenant isolation
-- CREATE POLICY "Users can upload media to their tenant folder" ON storage.objects
--   FOR INSERT TO authenticated
--   WITH CHECK (bucket_id = 'mdvr-media' AND (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.users WHERE id = auth.uid()));

-- CREATE POLICY "Users can read media from their tenant folder" ON storage.objects
--   FOR SELECT TO authenticated
--   USING (bucket_id = 'mdvr-media' AND (storage.foldername(name))[1] = (SELECT tenant_id::text FROM public.users WHERE id = auth.uid()));
