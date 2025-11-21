# MDVR Platform - Quick Start Guide

## Prerequisites

- Node.js 20+ (LTS recommended)
- npm or yarn
- Docker Desktop (for local development)
- Git

## Installation Steps

### 1. Clone the Repository

\`\`\`bash
git clone https://github.com/yourusername/apexcam-platforms.git
cd apexcam-platforms
\`\`\`

### 2. Install Dependencies

Since we're using a monorepo structure, you need to install dependencies for each service:

\`\`\`bash
# Install root dependencies (Next.js admin panel)
npm install

# Install all service dependencies
npm run install:all
\`\`\`

**Windows Users:** All native dependencies have been removed! No Visual Studio or build tools required.

### 3. Set Up Environment Variables

\`\`\`bash
# Copy the example environment files
cp .env.example .env
cp services/api/.env.example services/api/.env
cp services/tcp-signaling/.env.example services/tcp-signaling/.env
cp services/tcp-media/.env.example services/tcp-media/.env
\`\`\`

Edit each `.env` file with your configuration:

#### Required Supabase Variables

\`\`\`env
# Get these from your Supabase project settings
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
\`\`\`

#### JWT Configuration

\`\`\`env
JWT_SECRET=your-super-secret-jwt-key-change-this
\`\`\`

### 4. Set Up Supabase

1. Create a new Supabase project at https://supabase.com
2. Run the SQL migrations in order:
   - Go to SQL Editor in Supabase Dashboard
   - Copy and paste the content from `supabase/migrations/001_initial_schema.sql`
   - Execute the migration
3. Enable PostGIS extension (if not already enabled)
4. Create storage buckets:
   - `device-media` (for video files)
   - `thumbnails` (for video thumbnails)
   - `firmware` (for OTA updates)

### 5. Start Development Environment

#### Option A: Docker Compose (Recommended)

\`\`\`bash
# Start all services with Docker
docker-compose up -d

# View logs
docker-compose logs -f
\`\`\`

Services will be available at:
- Admin Panel: http://localhost:3000
- API: http://localhost:3001
- WebSocket: http://localhost:3002
- TCP Signaling: tcp://localhost:9000
- TCP Media: tcp://localhost:9001

#### Option B: Local Development

\`\`\`bash
# Terminal 1 - Admin Panel
npm run dev

# Terminal 2 - API Server
cd services/api
npm run dev

# Terminal 3 - TCP Signaling Server
cd services/tcp-signaling
npm run dev

# Terminal 4 - TCP Media Server
cd services/tcp-media
npm run dev

# Terminal 5 - WebSocket Server
cd services/websocket
npm run dev
\`\`\`

### 6. Test with Device Simulator

\`\`\`bash
cd tools/device-simulator
npm start -- --device-id 00001 --host localhost --port 9000
\`\`\`

## Common Issues & Solutions

### Issue: "Cannot find module '@supabase/supabase-js'"

**Solution:** Make sure you've run `npm install` in all service directories:

\`\`\`bash
npm run install:all
\`\`\`

### Issue: Port already in use

**Solution:** Check if another process is using the port:

\`\`\`bash
# Windows
netstat -ano | findstr :3000

# Linux/Mac
lsof -i :3000
\`\`\`

Kill the process or change the port in the `.env` file.

### Issue: Database connection errors

**Solution:** Verify your Supabase credentials:
1. Check that `NEXT_PUBLIC_SUPABASE_URL` and keys are correct
2. Ensure you've run the SQL migrations
3. Check Supabase project status at https://supabase.com/dashboard

### Issue: Redis connection failed

**Solution:** 
- If using Docker: Ensure Redis container is running with `docker-compose up redis -d`
- If local: Install Redis or update `REDIS_URL` to point to your Redis instance

## Next Steps

1. **Create Super Admin User**
   - Visit http://localhost:3000
   - Register with your email
   - Manually update the user role in Supabase to 'super_admin'

2. **Add a Tenant**
   - Log in as super admin
   - Go to Tenants section
   - Create your first tenant organization

3. **Configure MDVR Device**
   - Set the device to connect to your server IP and port 9000
   - Configure the device serial number
   - Test connection with device simulator first

4. **Set Up Mobile App**
   - Follow instructions in `mobile/README.md`
   - Configure API endpoints in `mobile/.env`
   - Run on iOS/Android emulator or device

## Architecture Overview

\`\`\`
┌─────────────────┐
│  MDVR Devices   │
└────────┬────────┘
         │ TCP Protocol
         ↓
┌─────────────────────────────────────┐
│  TCP Servers (Signaling + Media)    │
│  - Device registration               │
│  - Location tracking                 │
│  - Video streaming                   │
└────────┬────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────┐
│  Supabase (PostgreSQL + Storage)    │
│  - Device data                       │
│  - Telemetry                         │
│  - User management                   │
│  - Media files                       │
└────────┬────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────┐
│  REST API + WebSocket                │
│  - Admin panel backend               │
│  - Real-time updates                 │
└────────┬────────────────────────────┘
         │
         ↓
┌─────────────────────────────────────┐
│  Frontend (Next.js + React Native)   │
│  - Admin web panel                   │
│  - Mobile apps                       │
└─────────────────────────────────────┘
\`\`\`

## Documentation

- [Architecture Guide](./ARCHITECTURE.md)
- [API Documentation](./API.md) - Available at http://localhost:3001/docs
- [Deployment Guide](./DEPLOYMENT.md)
- [Supabase Setup](./SUPABASE_SETUP.md)
- [Troubleshooting](./TROUBLESHOOTING.md)

## Support

For issues and questions:
1. Check the [Troubleshooting Guide](./TROUBLESHOOTING.md)
2. Review existing GitHub issues
3. Create a new issue with detailed information

## License

[Your License Here]
