# Troubleshooting Guide

## Installation Issues

### Windows: node-gyp / Python Errors

**Problem**: `npm install` fails with errors about `node-gyp`, Python, or Visual Studio.

**Solution**: We've removed all native dependencies that require compilation. If you still see these errors:

1. Clear npm cache:
   \`\`\`bash
   npm cache clean --force
   \`\`\`

2. Delete all `node_modules` folders and `package-lock.json`:
   \`\`\`bash
   # Windows PowerShell
   Get-ChildItem -Path . -Include node_modules,package-lock.json -Recurse -Force | Remove-Item -Force -Recurse

   # Linux/Mac
   find . -name "node_modules" -type d -prune -exec rm -rf '{}' +
   find . -name "package-lock.json" -type f -delete
   \`\`\`

3. Run setup script:
   \`\`\`bash
   npm run setup
   \`\`\`

### Missing Dependencies

**Problem**: Import errors or missing module errors when running services.

**Solution**:
\`\`\`bash
# Install all dependencies
npm run install:all

# Or install for specific service
cd services/api
npm install
\`\`\`

### TypeScript Compilation Errors

**Problem**: `tsc` fails to compile TypeScript files.

**Solution**:
1. Ensure TypeScript is installed:
   \`\`\`bash
   npm install -g typescript
   \`\`\`

2. Check `tsconfig.json` exists in the service directory

3. Run build:
   \`\`\`bash
   cd services/api
   npm run build
   \`\`\`

## Runtime Issues

### Supabase Connection Failed

**Problem**: Services can't connect to Supabase.

**Solution**:
1. Verify environment variables in `.env`:
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `SUPABASE_ANON_KEY`

2. Check Supabase project is active at https://supabase.com/dashboard

3. Verify database migrations are applied in SQL Editor

### Redis Connection Failed

**Problem**: `ECONNREFUSED` errors for Redis.

**Solution**:
1. Start Redis with Docker:
   \`\`\`bash
   docker-compose up redis -d
   \`\`\`

2. Or install Redis locally:
   - Windows: https://github.com/microsoftarchive/redis/releases
   - Mac: `brew install redis && brew services start redis`
   - Linux: `sudo apt install redis-server && sudo systemctl start redis`

### TCP Server Not Starting

**Problem**: TCP signaling/media server fails to start.

**Solution**:
1. Check if ports are already in use:
   \`\`\`bash
   # Windows
   netstat -ano | findstr :9000
   netstat -ano | findstr :6602

   # Linux/Mac
   lsof -i :9000
   lsof -i :6602
   \`\`\`

2. Kill process using the port or change port in `.env`

3. Check firewall settings allow TCP connections

## Development Issues

### Hot Reload Not Working

**Problem**: Changes don't reflect in running services.

**Solution**:
1. Restart the service:
   \`\`\`bash
   cd services/api
   npm run dev
   \`\`\`

2. Check `tsx watch` is running (not `node`)

3. Clear Next.js cache:
   \`\`\`bash
   rm -rf .next
   npm run dev
   \`\`\`

### Mobile App Not Connecting

**Problem**: React Native app can't reach API.

**Solution**:
1. Update `NEXT_PUBLIC_API_URL` in `mobile/.env`:
   - iOS Simulator: `http://localhost:3000`
   - Android Emulator: `http://10.0.2.2:3000`
   - Physical Device: `http://YOUR_LOCAL_IP:3000`

2. Ensure Metro bundler is running:
   \`\`\`bash
   cd mobile
   npm start
   \`\`\`

3. Check API is accessible:
   \`\`\`bash
   curl http://localhost:3000/health
   \`\`\`

## Docker Issues

### Container Won't Start

**Problem**: Docker container exits immediately.

**Solution**:
1. Check logs:
   \`\`\`bash
   docker-compose logs api
   \`\`\`

2. Verify environment variables in `docker-compose.yml`

3. Ensure volumes are mounted correctly

4. Rebuild containers:
   \`\`\`bash
   docker-compose down
   docker-compose build --no-cache
   docker-compose up
   \`\`\`

### Out of Disk Space

**Problem**: Docker runs out of space.

**Solution**:
\`\`\`bash
# Clean up Docker
docker system prune -a --volumes

# Remove unused images
docker image prune -a
\`\`\`

## Database Issues

### Migration Failed

**Problem**: Supabase SQL migrations fail.

**Solution**:
1. Check SQL syntax in migration files

2. Run migrations one by one in Supabase SQL Editor

3. Check for foreign key constraints

4. Verify RLS policies don't conflict

### Row Level Security Blocking Queries

**Problem**: Queries return no data or "permission denied".

**Solution**:
1. Use service role key for backend operations (never in client!)

2. Check RLS policies in Supabase Dashboard > Authentication > Policies

3. Verify JWT token includes correct claims

4. Temporarily disable RLS for debugging:
   \`\`\`sql
   ALTER TABLE devices DISABLE ROW LEVEL SECURITY;
   -- Remember to re-enable after debugging!
   \`\`\`

## Performance Issues

### High Memory Usage

**Problem**: Services consuming too much RAM.

**Solution**:
1. Limit worker processes in `.env`:
   \`\`\`
   WORKER_CONCURRENCY=2
   \`\`\`

2. Increase Node.js memory limit:
   \`\`\`bash
   NODE_OPTIONS="--max-old-space-size=4096" npm run dev
   \`\`\`

3. Monitor with:
   \`\`\`bash
   docker stats
   \`\`\`

### Slow Video Processing

**Problem**: FFmpeg transcoding is slow.

**Solution**:
1. Use faster preset in FFmpeg options (already set to `veryfast`)

2. Reduce video quality (increase CRF value)

3. Scale worker containers:
   \`\`\`bash
   docker-compose up --scale media-worker=3
   \`\`\`

4. Ensure FFmpeg has access to hardware acceleration

## Getting Help

If issues persist:

1. Check GitHub Issues: [link]
2. Join Discord Community: [link]
3. Email Support: support@mdvr-platform.com

Include in your report:
- Operating System & Version
- Node.js Version (`node --version`)
- Error messages & stack traces
- Steps to reproduce
