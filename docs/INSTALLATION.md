# MDVR Platform Installation Guide

## Prerequisites

### Required Software
- **Node.js** 20.x or higher
- **Docker & Docker Compose** (for local development)
- **Git**

### Windows-Specific Setup

Since we're using Supabase instead of native PostgreSQL, you **DO NOT** need to install:
- ❌ Visual Studio C++ Build Tools
- ❌ Windows SDK
- ❌ Python for node-gyp

All database operations are handled through Supabase's REST API, eliminating native dependency issues.

## Installation Steps

### 1. Clone Repository

\`\`\`bash
git clone https://github.com/your-org/apexcam-platforms.git
cd apexcam-platforms
\`\`\`

### 2. Install Dependencies

\`\`\`bash
npm install
\`\`\`

**Note for Windows users:** This installation will now complete successfully without requiring Visual Studio Build Tools since we've removed all native PostgreSQL dependencies (`pg-native`, `libpq`).

### 3. Configure Supabase

#### Option A: Use Supabase Cloud (Recommended)

1. Create account at [supabase.com](https://supabase.com)
2. Create new project
3. Copy your project credentials:
   - Project URL (e.g., `https://xxxxx.supabase.co`)
   - Anon/Public Key
   - Service Role Key (keep this secret!)

#### Option B: Self-hosted Supabase

\`\`\`bash
# Clone Supabase
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
cp .env.example .env

# Start Supabase stack
docker compose up -d
\`\`\`

### 4. Environment Configuration

Copy example environment files:

\`\`\`bash
cp .env.example .env
\`\`\`

Edit `.env` with your Supabase credentials:

\`\`\`bash
# Supabase Configuration
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# Redis Configuration (for local dev)
REDIS_HOST=localhost
REDIS_PORT=6379

# JWT Configuration
JWT_SECRET=your_jwt_secret_here

# Verifone Configuration (for billing)
VERIFONE_API_URL=https://api.verifone.com
VERIFONE_API_KEY=your_verifone_key
VERIFONE_WEBHOOK_SECRET=your_webhook_secret
\`\`\`

### 5. Run Database Migrations

\`\`\`bash
# Install Supabase CLI
npm install -g supabase

# Login to Supabase
supabase login

# Link to your project
supabase link --project-ref your-project-ref

# Run migrations
supabase db push
\`\`\`

Or manually execute SQL from `supabase/migrations/` in Supabase Dashboard SQL Editor.

### 6. Start Development Services

\`\`\`bash
# Start Redis and other supporting services
docker compose up -d redis

# Start all microservices
npm run dev
\`\`\`

This will start:
- API Server (port 3001)
- TCP Signaling Server (port 9000)
- TCP Media Server (port 9001)
- WebSocket Server (port 3002)
- Media Worker
- Billing Service
- AI Analytics Service

### 7. Start Web Admin Panel

\`\`\`bash
npm run dev
\`\`\`

Access at: http://localhost:3000

### 8. Start Mobile App (Optional)

\`\`\`bash
cd mobile
npm install
npm start
\`\`\`

## Verification

### Check Service Health

\`\`\`bash
# API Health Check
curl http://localhost:3001/health

# WebSocket Health Check
curl http://localhost:3002/health
\`\`\`

### Test Device Connection

Use the device simulator:

\`\`\`bash
cd tools/device-simulator
npm install
npm start
\`\`\`

## Troubleshooting

### Windows: npm install fails

**Solution:** We've removed all native dependencies. If you still see issues:

\`\`\`bash
# Clear npm cache
npm cache clean --force

# Delete node_modules
rm -rf node_modules package-lock.json

# Reinstall
npm install
\`\`\`

### Supabase Connection Issues

Check your `.env` file has correct credentials:

\`\`\`bash
# Test connection
curl -X GET "https://xxxxx.supabase.co/rest/v1/" \
  -H "apikey: YOUR_ANON_KEY"
\`\`\`

### Redis Connection Issues

Ensure Redis is running:

\`\`\`bash
docker compose up -d redis

# Test Redis
docker compose exec redis redis-cli ping
# Should return: PONG
\`\`\`

### Port Conflicts

If ports are already in use, modify in `.env`:

\`\`\`bash
API_PORT=3001
TCP_SIGNALING_PORT=9000
TCP_MEDIA_PORT=9001
WEBSOCKET_PORT=3002
\`\`\`

## Production Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for production deployment with Kubernetes.

## Next Steps

1. Configure Verifone payment integration
2. Set up monitoring (Grafana/Prometheus)
3. Configure email/SMS notifications
4. Set up backup procedures
5. Review security settings

For detailed documentation, see:
- [Architecture](./ARCHITECTURE.md)
- [API Documentation](./API.md)
- [Supabase Setup](./SUPABASE_SETUP.md)
