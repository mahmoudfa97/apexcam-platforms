# MDVR Platform Architecture

## System Overview

\`\`\`
┌─────────────────────────────────────────────────────────────┐
│                         Internet                            │
└───────────────┬─────────────────────────┬───────────────────┘
                │                         │
        ┌───────▼────────┐       ┌────────▼────────┐
        │  MDVR Devices  │       │  Mobile Apps    │
        │  (TCP 1087)    │       │  Web Clients    │
        │  (TCP 6602)    │       │  (HTTPS/WSS)    │
        └───────┬────────┘       └────────┬────────┘
                │                         │
        ┌───────▼────────┐       ┌────────▼────────┐
        │ TCP Signaling  │       │    API Server   │
        │    Server      │◄──────┤  (REST/JWT)     │
        │  (Port 1087)   │       │  (Port 3000)    │
        └───────┬────────┘       └────────┬────────┘
                │                         │
        ┌───────▼────────┐                │
        │  TCP Media     │                │
        │    Server      │                │
        │  (Port 6602)   │                │
        └───────┬────────┘                │
                │                         │
        ┌───────▼────────┐       ┌────────▼────────┐
        │ Media Workers  │       │   WebSocket     │
        │  (Transcoding) │       │     Server      │
        │  (AI Analytics)│       │  (Port 4000)    │
        └───────┬────────┘       └────────┬────────┘
                │                         │
        ┌───────▼─────────────────────────▼────────┐
        │            Redis Pub/Sub                  │
        │        (Events & Job Queue)               │
        └───────────────────┬───────────────────────┘
                            │
        ┌───────────────────▼───────────────────────┐
        │          PostgreSQL Database              │
        │       (Multi-tenant with RLS)             │
        └───────────────────┬───────────────────────┘
                            │
        ┌───────────────────▼───────────────────────┐
        │       S3-Compatible Object Storage        │
        │        (MinIO / AWS S3)                   │
        └───────────────────────────────────────────┘
\`\`\`

## Protocol Flow

### 1. Device Registration (V101)

\`\`\`
Device                  Signaling Server            Database
  │                            │                        │
  ├──V101 Registration────────►│                        │
  │                            ├─Parse & Validate──────►│
  │                            │                        ├─Upsert Device
  │                            │◄──────────────────────┤
  │◄───C100 Success────────────┤                        │
  │                            │                        │
\`\`\`

### 2. Live Video Streaming (C508)

\`\`\`
Mobile App          API Server       Signaling Server     Media Server      Device
  │                    │                    │                  │              │
  ├─POST /start/video─►│                    │                  │              │
  │                    ├─C508 Command──────►│                  │              │
  │                    │                    ├──Forward C508────────────────►│
  │                    │                    │                  │              ├─V102 Media Reg
  │                    │                    │                  │◄─────────────┤
  │                    │                    │                  ├─0x6000 ACK──►│
  │◄──Stream Token─────┤                    │                  │              │
  │                    │                    │                  │◄─0x6011 I────┤
  ├─WebRTC/HLS Request─────────────────────────────────────►│              │
  │◄─────Video Stream─────────────────────────────────────────┤              │
\`\`\`

### 3. Alarm Processing

\`\`\`
Device            Signaling Server      Media Server     Media Worker     Mobile App
  │                      │                    │               │               │
  ├─V201 Alarm Start────►│                    │               │               │
  │                      ├─Store Alarm───────►DB              │               │
  │                      ├─Publish Event─────►Redis           │               │
  │                      │                    │               │               ├─Push Notification
  ├─V232 File Upload────►│                    │               │               │
  │                      ├─C702 Download─────►│               │               │
  │                      │                    │◄─V103 Media───┤               │
  │                      │                    ├─0x6102 Data──►│               │
  │                      │                    │               ├─Transcode───►│
  │                      │                    │               ├─AI Analysis─►│
  │                      │                    │               ├─Upload S3───►│
  │                      │                    │               ├─Publish─────►Redis
  │                      │                    │               │               ├─Notify User
\`\`\`

## Data Flow

### Telemetry Data Pipeline

\`\`\`
Device ──V114──► Signaling Server ──Parse──► PostgreSQL (Partitioned Table)
                        │                            │
                        └────Publish────► Redis ────┴──► WebSocket Clients
                                           │
                                           └──► Map Updates (Mobile App)
\`\`\`

### Media Processing Pipeline

\`\`\`
Device ──Binary Frames──► Media Server ──Raw H.264──► Media Worker
                                                           │
                                                           ├──Transcode──► MP4/HLS
                                                           ├──Thumbnail──► JPEG
                                                           ├──AI Analysis──► Events
                                                           └──Upload──► S3
\`\`\`

## Database Design

### Multi-Tenancy Strategy

- **Row-Level Security (RLS)**: Enforced at PostgreSQL level
- **Tenant Isolation**: All tables include `tenant_id` foreign key
- **Session Variables**: Application sets `app.current_tenant_id` per request
- **Super Admin**: Can bypass RLS with elevated permissions

### Partitioning Strategy

**Telemetry Table**: Partitioned by month for performance
- Automatic partition creation via cron job
- Retention policy: 90 days by default (configurable per tenant)
- Indexes on device_id, timestamp, location

## Security Architecture

### Authentication Flow

\`\`\`
Mobile App          API Server              Database
  │                    │                        │
  ├─POST /auth/login──►│                        │
  │                    ├──Verify Credentials───►│
  │                    │◄──User Data────────────┤
  │                    ├──Generate JWT Token    │
  │                    ├──Generate Refresh Token│
  │                    ├──Store Refresh Token──►│
  │◄──JWT + Refresh────┤                        │
\`\`\`

### Authorization (RBAC)

**Roles:**
- `super_admin`: Full platform access
- `tenant_admin`: Tenant-level management
- `technician`: Device provisioning and diagnostics
- `client_user`: View-only access to assigned devices

**Token Scopes:**
- `device:read`, `device:write`, `device:control`
- `video:watch`, `video:download`
- `alarm:read`, `alarm:acknowledge`
- `user:manage`, `billing:manage`

## Scalability Considerations

### Horizontal Scaling

- **API Server**: Stateless, can scale to N replicas
- **WebSocket Server**: Uses Redis pub/sub for cross-server events
- **TCP Servers**: Single instance per port, use load balancer for HA
- **Media Workers**: Scale based on queue depth

### Performance Optimization

- **Database Connection Pooling**: pgBouncer in production
- **Redis Caching**: Device metadata, user sessions
- **CDN**: Static assets and HLS segments
- **Media Storage**: S3 with CloudFront distribution

## Monitoring & Observability

### Metrics (Prometheus)

- Request rates, latencies, error rates
- Database connection pool stats
- Queue depths and processing times
- Device connection counts
- Media transcoding rates

### Logging

- Structured JSON logs (Pino)
- Correlation IDs for request tracing
- Log levels: ERROR, WARN, INFO, DEBUG
- Centralized logging (Loki/ELK)

### Tracing (OpenTelemetry)

- Distributed tracing across services
- Database query performance
- External API call latencies
