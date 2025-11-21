# MDVR Platform

Production-grade MDVR (Mobile Digital Video Recorder) platform with multi-tenant SaaS management, native mobile apps, and real-time video streaming.

## Architecture

The platform consists of the following services:

- **API Service** (Port 3000): REST API for all platform operations
- **WebSocket Service** (Port 4000): Real-time updates and notifications
- **TCP Signaling Server** (Port 1087): Device registration and telemetry
- **TCP Media Server** (Port 6602): Video stream ingestion
- **Media Worker**: Video transcoding and processing
- **Admin Web Panel** (Port 3001): Management dashboard
- **Mobile Apps**: React Native apps for iOS and Android

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 20+
- PostgreSQL 16+
- Redis 7+

### Development Setup

1. Clone the repository:
\`\`\`bash
git clone <repository-url>
cd mdvr-platform
\`\`\`

2. Start all services:
\`\`\`bash
npm run dev
\`\`\`

3. Access the services:
- API: http://localhost:3000
- API Docs: http://localhost:3000/docs
- Admin Web: http://localhost:3001
- WebSocket: ws://localhost:4000
- Prometheus: http://localhost:9090
- Grafana: http://localhost:3002

### Default Credentials

**Super Admin:**
- Email: admin@mdvr-platform.com
- Password: Admin123!

**Demo Tenant Admin:**
- Email: admin@demo-fleet.com
- Password: Admin123!

## Services

### REST API

The REST API provides all platform functionality including:
- Authentication (JWT with refresh tokens)
- Multi-tenant management
- Device provisioning and management
- Real-time telemetry access
- Media file management
- Billing and subscriptions (Verifone integration)
- Webhooks

API documentation is available at `/docs` when running in development mode.

### TCP Signaling Server

Implements the MDVR protocol specification exactly as documented. Handles:
- Device registration (V101)
- Heartbeat packets (V109)
- Location reporting (V114)
- Alarm notifications (V201, V251, V232)
- Command responses (V100)

### TCP Media Server

Handles binary media streams:
- H.264 video frames (I-frames, P-frames)
- Audio frames
- Session management
- File downloads

### Media Worker

Background processing:
- Video transcoding (H.264 to MP4/HLS)
- Thumbnail generation
- AI video analytics
- Upload to S3-compatible storage

## Database Schema

The platform uses PostgreSQL with:
- Multi-tenant row-level security (RLS)
- Partitioned telemetry table for performance
- PostGIS for geospatial queries
- Full audit logging

See `db/init/001_schema.sql` for complete schema.

## Testing

Run all tests:
\`\`\`bash
npm test
\`\`\`

Run device simulator:
\`\`\`bash
npm run simulator
\`\`\`

## Deployment

### Production Deployment

The platform includes Helm charts for Kubernetes deployment:

\`\`\`bash
helm install mdvr-platform ./helm/mdvr-platform
\`\`\`

See `docs/deployment.md` for detailed deployment instructions.

## Security

- TLS/SSL for all web traffic
- JWT authentication with refresh tokens
- Row-level security (RLS) in PostgreSQL
- Rate limiting on all API endpoints
- Webhook signature verification
- PCI compliance for billing (Verifone integration)

## Monitoring

The platform includes:
- Prometheus metrics collection
- Grafana dashboards
- Structured JSON logging
- OpenTelemetry tracing

## License

Proprietary - All rights reserved

## Support

For support, contact: support@mdvr-platform.com
