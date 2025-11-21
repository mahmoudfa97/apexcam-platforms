# Environment Setup Guide

This guide explains how to configure environment variables for the MDVR Platform.

## Quick Start

1. **Copy the example files:**
   \`\`\`bash
   cp .env.example .env
   cp services/api/.env.example services/api/.env
   cp services/tcp-signaling/.env.example services/tcp-signaling/.env
   cp services/tcp-media/.env.example services/tcp-media/.env
   cp services/media-worker/.env.example services/media-worker/.env
   cp services/billing/.env.example services/billing/.env
   cp services/ai-analytics/.env.example services/ai-analytics/.env
   cp services/websocket/.env.example services/websocket/.env
   cp mobile/.env.example mobile/.env
   \`\`\`

2. **Update critical values:**
   - Change `JWT_SECRET` to a strong random string
   - Update database credentials
   - Configure Verifone API credentials
   - Set production URLs for API and WebSocket

## Environment Variables by Category

### Security (CRITICAL - Change Before Production)

\`\`\`bash
JWT_SECRET=your-super-secret-jwt-key-change-in-production
POSTGRES_PASSWORD=mdvr_password
REDIS_PASSWORD=
S3_SECRET_KEY=minioadmin
VERIFONE_API_SECRET=your-api-secret
\`\`\`

### Database Configuration

\`\`\`bash
DATABASE_URL=postgresql://mdvr_user:mdvr_password@localhost:5432/mdvr_platform
\`\`\`

**Production:** Use managed PostgreSQL (AWS RDS, Google Cloud SQL, Azure Database)
- Enable SSL connections
- Use connection pooling
- Set up read replicas for scaling

### Redis Configuration

\`\`\`bash
REDIS_URL=redis://localhost:6379
\`\`\`

**Production:** Use managed Redis (AWS ElastiCache, Redis Cloud)
- Enable persistence (AOF + RDB)
- Configure clustering for high availability
- Use separate instances for caching vs. queues

### Object Storage (S3)

\`\`\`bash
S3_ENDPOINT=http://localhost:9000
S3_ACCESS_KEY=minioadmin
S3_SECRET_KEY=minioadmin
S3_BUCKET=mdvr-media
\`\`\`

**Production:** Use AWS S3, Google Cloud Storage, or Azure Blob
- Enable versioning for media files
- Configure lifecycle policies for old data
- Set up CDN (CloudFront, Cloudflare) for media delivery

### Verifone Payment Gateway

\`\`\`bash
VERIFONE_API_URL=https://api-sandbox.verifone.com
VERIFONE_MERCHANT_ID=your-merchant-id
VERIFONE_API_KEY=your-api-key
VERIFONE_API_SECRET=your-api-secret
VERIFONE_WEBHOOK_SECRET=your-webhook-secret
\`\`\`

**Getting Credentials:**
1. Sign up at https://developer.verifone.com
2. Create a merchant account
3. Generate API credentials in the dashboard
4. Configure webhook URL: `https://yourdomain.com/webhooks/verifone`

### Email Configuration

\`\`\`bash
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASSWORD=your-email-password
\`\`\`

**Production Options:**
- SendGrid
- AWS SES
- Mailgun
- Postmark

### Mobile App Configuration

\`\`\`bash
EXPO_PUBLIC_API_URL=http://localhost:3000
EXPO_PUBLIC_WS_URL=ws://localhost:3001
EXPO_PUBLIC_GOOGLE_MAPS_API_KEY=your-google-maps-api-key
\`\`\`

**Google Maps API Key:**
1. Go to https://console.cloud.google.com
2. Enable Maps SDK for Android/iOS
3. Create API key with restrictions

## Environment-Specific Configurations

### Development

\`\`\`bash
NODE_ENV=development
LOG_LEVEL=debug
SWAGGER_ENABLED=true
\`\`\`

### Staging

\`\`\`bash
NODE_ENV=staging
LOG_LEVEL=info
SWAGGER_ENABLED=true
DATABASE_URL=postgresql://user:pass@staging-db:5432/mdvr
API_URL=https://staging-api.mdvrplatform.com
\`\`\`

### Production

\`\`\`bash
NODE_ENV=production
LOG_LEVEL=warn
SWAGGER_ENABLED=false
DATABASE_URL=postgresql://user:pass@prod-db:5432/mdvr
API_URL=https://api.mdvrplatform.com
REDIS_URL=rediss://prod-redis:6379  # Use TLS
S3_USE_SSL=true
RATE_LIMIT_MAX_REQUESTS=50  # Stricter limits
\`\`\`

## Security Best Practices

1. **Never commit .env files** - Already in .gitignore
2. **Use different secrets per environment**
3. **Rotate secrets regularly** (every 90 days)
4. **Use secret management** in production:
   - AWS Secrets Manager
   - HashiCorp Vault
   - Kubernetes Secrets
5. **Restrict API access** with IP whitelisting
6. **Enable SSL/TLS** for all connections

## Generating Secure Secrets

### JWT Secret (256-bit)
\`\`\`bash
openssl rand -base64 32
\`\`\`

### Webhook Secret (512-bit)
\`\`\`bash
openssl rand -base64 64
\`\`\`

### Database Password
\`\`\`bash
openssl rand -base64 24 | tr -d "=+/" | cut -c1-25
\`\`\`

## Kubernetes ConfigMaps & Secrets

For Kubernetes deployment, create:

\`\`\`bash
# Create namespace
kubectl create namespace mdvr-platform

# Create secrets
kubectl create secret generic mdvr-secrets \
  --from-literal=jwt-secret=$(openssl rand -base64 32) \
  --from-literal=db-password=$(openssl rand -base64 24) \
  --from-literal=verifone-api-secret=your-secret \
  -n mdvr-platform

# Create ConfigMap
kubectl create configmap mdvr-config \
  --from-file=.env.production \
  -n mdvr-platform
\`\`\`

## Troubleshooting

### Database Connection Issues
- Verify DATABASE_URL format
- Check firewall rules
- Ensure database is running: `docker-compose ps postgres`

### Redis Connection Issues
- Test connection: `redis-cli -u $REDIS_URL ping`
- Check if Redis is running: `docker-compose ps redis`

### S3/MinIO Access Issues
- Verify bucket exists: `aws s3 ls --endpoint-url=$S3_ENDPOINT`
- Check IAM permissions
- Ensure CORS is configured for browser uploads

### Verifone API Errors
- Verify you're using correct environment (sandbox vs. production)
- Check API credentials are active
- Verify webhook URL is publicly accessible
- Check webhook signature validation

## Support

For environment configuration help:
- Documentation: `/docs`
- Support Email: support@mdvrplatform.com
- Slack: #platform-support
