# MDVR Platform Setup Instructions

## Quick Fix for Current Errors

The errors you're seeing are caused by:
1. Next.js 16.0.3 (unstable beta version)
2. React 19.2.0 (incompatible with Next.js 15)
3. Invalid Next.js configuration options
4. Incorrect font variable application

### Step 1: Clean Installation

\`\`\`bash
# Remove all node_modules and lock files
rm -rf node_modules .next pnpm-lock.yaml

# Clear pnpm cache (optional but recommended)
pnpm store prune

# Install with the fixed dependencies
pnpm install
\`\`\`

### Step 2: Start Development Server

\`\`\`bash
pnpm dev
\`\`\`

The application should now start without errors on `http://localhost:3000`

## What Was Fixed

### 1. Downgraded Next.js
- Changed from `next@16.0.3` (unstable) to `next@15.0.3` (stable)
- Next.js 16 is in beta and has breaking changes

### 2. Fixed React Version
- Changed from `react@19.2.0` to `react@19.0.0`
- Ensures compatibility with Next.js 15

### 3. Cleaned next.config.mjs
- Removed invalid options: `swcMinify`, `turbopack`, `experimental.turbo.resolveAlias`
- Kept only stable, supported configuration options

### 4. Fixed Font Configuration
- Added proper font variable names in layout.tsx
- Applied variables to body className
- Matches the globals.css @theme configuration

### 5. Converted Root Page to Server Component
- Changed from client component with useEffect
- Now uses proper Next.js Server Component pattern
- Uses cookies instead of localStorage for SSR compatibility

### 6. Removed Server Dependencies from Root
- Moved `fastify`, `pg`, `ioredis`, etc. to service-specific packages
- Root package.json now only contains Next.js and UI dependencies

## Project Structure

\`\`\`
mdvr-platform/
├── app/                          # Next.js admin dashboard
│   ├── page.tsx                 # Root redirect
│   ├── login/page.tsx           # Authentication
│   └── dashboard/               # Admin interface
├── services/                     # Backend microservices
│   ├── api/                     # REST API server
│   ├── tcp-signaling/           # MDVR device signaling
│   ├── tcp-media/               # Video streaming
│   ├── media-worker/            # Video transcoding
│   ├── billing/                 # Verifone integration
│   ├── ai-analytics/            # AI features
│   └── websocket/               # Real-time updates
├── mobile/                       # React Native app
└── tools/device-simulator/       # Testing tool
\`\`\`

## Running the Platform

### Admin Dashboard (Next.js)
\`\`\`bash
pnpm dev                          # http://localhost:3000
\`\`\`

### Backend Services (Docker)
\`\`\`bash
cd services
docker-compose up                 # Starts all microservices
\`\`\`

### Mobile App
\`\`\`bash
cd mobile
pnpm start                        # Expo development server
\`\`\`

## Environment Configuration

Create a `.env.local` file in the root directory:

\`\`\`bash
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Authentication
JWT_SECRET=your_jwt_secret_key

# API Configuration
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8081
\`\`\`

## Common Issues

### Issue: "Cannot find module" errors
**Solution**: Delete `node_modules`, `.next`, and `pnpm-lock.yaml`, then run `pnpm install`

### Issue: Port already in use
**Solution**: Kill the process using port 3000:
\`\`\`bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID> /F

# Mac/Linux
lsof -ti:3000 | xargs kill -9
\`\`\`

### Issue: Font loading errors
**Solution**: This is now fixed. Ensure you're using the updated `app/layout.tsx`

### Issue: Build errors with native modules
**Solution**: Native modules are removed from root. Each service manages its own dependencies.

## Next Steps

1. **Configure Supabase**: Set up your Supabase project and add credentials to `.env.local`
2. **Run Migrations**: Apply the database schema from `supabase/migrations/001_initial_schema.sql`
3. **Test Admin Dashboard**: Navigate to `http://localhost:3000` and log in
4. **Start Backend Services**: Run `docker-compose up` in the services directory
5. **Test Device Simulator**: Run the MDVR device simulator to test TCP connections

## Support

For issues or questions:
- Check `docs/TROUBLESHOOTING.md`
- Review `docs/SUPABASE_SETUP.md`
- See `docs/WINDOWS_SETUP.md` for Windows-specific guidance
