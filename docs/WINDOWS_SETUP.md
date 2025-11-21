# Windows Setup Guide

This guide helps you set up the MDVR Platform on Windows without native build tool requirements.

## Prerequisites

- Node.js 18+ (Download from nodejs.org)
- pnpm (Recommended) or npm

## Installation Steps

### 1. Install pnpm (Recommended)

\`\`\`bash
npm install -g pnpm
\`\`\`

### 2. Clean Previous Installations

If you previously tried to install with npm, clean up first:

\`\`\`bash
# Delete all node_modules
Get-ChildItem -Path . -Include node_modules -Recurse -Force | Remove-Item -Recurse -Force

# Delete lock files
Remove-Item package-lock.json -ErrorAction SilentlyContinue
Remove-Item pnpm-lock.yaml -ErrorAction SilentlyContinue
\`\`\`

### 3. Install Dependencies

\`\`\`bash
# Install all dependencies recursively
pnpm install
\`\`\`

### 4. Configure Environment Variables

Copy `.env.example` to `.env.local`:

\`\`\`bash
Copy-Item .env.example .env.local
\`\`\`

Edit `.env.local` and add your Supabase credentials:

\`\`\`env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
\`\`\`

### 5. Run Development Server

\`\`\`bash
# Start Next.js admin dashboard
pnpm dev

# Or use npm if you prefer
npm run dev
\`\`\`

The dashboard will be available at http://localhost:3000

## Common Issues

### Issue: Turbopack WASM Error

**Error:** `turbo.createProject is not supported by the wasm bindings`

**Solution:** We've disabled Turbopack in the config. The app now uses the standard webpack bundler which is more stable on Windows.

### Issue: Native Module Errors (libpq, canvas, etc.)

**Error:** Module requires C++ build tools

**Solution:** This project no longer uses native modules. All database operations use Supabase's JavaScript SDK. If you see this error, ensure you've cleaned old installations.

### Issue: Multiple Lockfiles Warning

**Solution:** Use only one package manager. We recommend pnpm. Delete `package-lock.json` if it exists:

\`\`\`bash
Remove-Item package-lock.json -ErrorAction SilentlyContinue
\`\`\`

### Issue: Port Already in Use

**Error:** `Port 3000 is already in use`

**Solution:** Kill the process or use a different port:

\`\`\`bash
# Kill process on port 3000
npx kill-port 3000

# Or run on different port
pnpm dev --port 3001
\`\`\`

## Running Backend Services

The backend services (TCP servers, workers) are designed to run in Docker:

\`\`\`bash
# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop services
docker-compose down
\`\`\`

## Next Steps

1. Set up your Supabase project and run migrations from `supabase/migrations/`
2. Configure the TCP signaling server to accept MDVR device connections
3. Test with the device simulator: `cd tools/device-simulator && pnpm dev`

## Support

For issues, check:
- docs/TROUBLESHOOTING.md
- docs/SUPABASE_SETUP.md
- GitHub Issues
