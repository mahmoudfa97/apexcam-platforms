# Supabase Setup Guide

This document explains how to set up Supabase for the MDVR Platform.

## Prerequisites

- A Supabase account (free tier works for development)
- Supabase CLI installed (optional, for local development)

## 1. Create a Supabase Project

1. Go to [https://app.supabase.com](https://app.supabase.com)
2. Click "New Project"
3. Fill in the project details:
   - Name: `mdvr-platform`
   - Database Password: (generate a strong password)
   - Region: Choose closest to your users
4. Click "Create new project"
5. Wait for the project to be provisioned (2-3 minutes)

## 2. Get Your API Keys

1. Go to Project Settings > API
2. Copy the following values to your `.env` file:
   \`\`\`bash
   SUPABASE_URL=https://xxxxxxxxxxxxx.supabase.co
   SUPABASE_ANON_KEY=eyJhbGc...
   SUPABASE_SERVICE_ROLE_KEY=eyJhbGc...
   \`\`\`

⚠️ **Important**: Never commit `SUPABASE_SERVICE_ROLE_KEY` to version control. It has full database access.

## 3. Enable Required Extensions

1. Go to Database > Extensions
2. Enable the following extensions:
   - `uuid-ossp` - For UUID generation
   - `postgis` - For geospatial queries
   - `pg_stat_statements` - For query performance monitoring

## 4. Run Database Migrations

### Option A: Using Supabase Dashboard (Recommended for first-time setup)

1. Go to SQL Editor
2. Copy the contents of `supabase/migrations/001_initial_schema.sql`
3. Paste and run the SQL
4. Verify tables are created in Database > Tables

### Option B: Using Supabase CLI (For ongoing development)

\`\`\`bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref your-project-id

# Run migrations
supabase db push
\`\`\`

## 5. Create Storage Buckets

1. Go to Storage in the Supabase Dashboard
2. Create the following buckets:

### mdvr-media (Private)
- Click "New bucket"
- Name: `mdvr-media`
- Public: **Unchecked**
- File size limit: 2GB
- Allowed MIME types: `video/*`, `image/*`

### mdvr-thumbnails (Public)
- Click "New bucket"
- Name: `mdvr-thumbnails`
- Public: **Checked**
- File size limit: 10MB
- Allowed MIME types: `image/*`

### mdvr-firmware (Private)
- Click "New bucket"
- Name: `mdvr-firmware`
- Public: **Unchecked**
- File size limit: 100MB
- Allowed MIME types: `application/*`

## 6. Configure Storage Policies

For each bucket, add the following policies:

### mdvr-media bucket policies:

\`\`\`sql
-- Allow authenticated users to upload files to their tenant folder
CREATE POLICY "Tenant media upload" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'mdvr-media' 
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text 
      FROM public.users 
      WHERE id = auth.uid()
    )
  );

-- Allow authenticated users to read files from their tenant folder
CREATE POLICY "Tenant media read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'mdvr-media' 
    AND (storage.foldername(name))[1] = (
      SELECT tenant_id::text 
      FROM public.users 
      WHERE id = auth.uid()
    )
  );

-- Allow service role to manage all files
CREATE POLICY "Service role full access" ON storage.objects
  FOR ALL TO service_role
  USING (bucket_id = 'mdvr-media');
\`\`\`

## 7. Configure Authentication

1. Go to Authentication > Providers
2. Enable Email provider:
   - Enable email sign-ups: **Yes**
   - Confirm email: **Recommended for production**
   - Secure email change: **Enabled**

3. Configure email templates (optional):
   - Go to Authentication > Email Templates
   - Customize sign-up, password reset templates

## 8. Set Up Realtime (Optional)

1. Go to Database > Replication
2. Enable replication for real-time updates on these tables:
   - `devices` - For device status updates
   - `telemetry` - For real-time location tracking
   - `alarms` - For instant alarm notifications

## 9. Configure Row Level Security (RLS)

RLS is automatically configured by the migration script. To verify:

1. Go to Database > Tables
2. For each table, check that:
   - "Enable RLS" is checked
   - Policies are listed

## 10. Create Test Data

\`\`\`sql
-- Create a test tenant
INSERT INTO public.tenants (name, slug, subscription_tier)
VALUES ('Test Company', 'test-company', 'premium');

-- Get the tenant ID
SELECT id FROM public.tenants WHERE slug = 'test-company';

-- Create a test user (replace with your Supabase auth user ID)
INSERT INTO public.users (id, tenant_id, email, full_name, role)
VALUES (
  'your-auth-user-id',
  'tenant-id-from-above',
  'test@example.com',
  'Test User',
  'admin'
);

-- Create a test device
INSERT INTO public.devices (
  tenant_id, 
  device_serial, 
  license_plate, 
  device_type, 
  protocol_version
)
VALUES (
  'tenant-id-from-above',
  '00001',
  'ABC-123',
  '4108',
  'V1.0.0.1'
);
\`\`\`

## 11. Test the Connection

From your application:

\`\`\`typescript
import { supabase } from './lib/supabase';

// Test query
const { data, error } = await supabase
  .from('devices')
  .select('*')
  .limit(1);

console.log('Connection test:', { data, error });
\`\`\`

## 12. Monitor Usage

1. Go to Project Settings > Billing
2. Monitor your usage:
   - Database size
   - Storage usage
   - Bandwidth
   - Function invocations

## Free Tier Limits

- Database: 500 MB
- Storage: 1 GB
- Bandwidth: 2 GB
- API requests: Unlimited

For production, consider upgrading to Pro ($25/month) for:
- 8 GB database
- 100 GB storage
- 50 GB bandwidth
- Daily backups
- Production support

## Troubleshooting

### Connection Issues
- Verify SUPABASE_URL and keys are correct
- Check if IP is whitelisted (not needed for most cases)
- Ensure project is not paused (free tier pauses after inactivity)

### RLS Errors
- Make sure user is authenticated
- Verify user has correct tenant_id in users table
- Check RLS policies are enabled

### Storage Upload Fails
- Verify bucket exists
- Check storage policies are configured
- Ensure file size is within limits
- Verify MIME type is allowed

## Next Steps

- Configure production environment variables
- Set up automated backups
- Configure monitoring and alerts
- Review and optimize RLS policies
- Set up staging environment
