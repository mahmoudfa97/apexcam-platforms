# MDVR Platform Deployment Guide

## Prerequisites

- Kubernetes cluster (v1.24+)
- Helm 3.x
- kubectl configured
- cert-manager installed
- Ingress controller (nginx)

## Quick Start

### 1. Add Helm Repository

\`\`\`bash
helm repo add mdvr-platform https://charts.mdvr.example.com
helm repo update
\`\`\`

### 2. Create Namespace

\`\`\`bash
kubectl create namespace mdvr-platform
\`\`\`

### 3. Install Platform

\`\`\`bash
helm install mdvr-platform mdvr-platform/mdvr-platform \
  --namespace mdvr-platform \
  --set global.domain=mdvr.example.com \
  --set postgresql.auth.password=YOUR_SECURE_PASSWORD \
  --set redis.auth.password=YOUR_SECURE_PASSWORD
\`\`\`

## Production Deployment

### 1. Prepare values.yaml

\`\`\`yaml
global:
  domain: mdvr.example.com
  environment: production

replicaCount:
  api: 5
  tcpSignaling: 3
  tcpMedia: 5
  websocket: 3
  mediaWorker: 8
  billing: 3
  aiAnalytics: 3

postgresql:
  auth:
    password: CHANGE_ME
  primary:
    persistence:
      size: 500Gi
      storageClass: fast-ssd
    resources:
      requests:
        memory: 16Gi
        cpu: 8
      limits:
        memory: 32Gi
        cpu: 16

redis:
  auth:
    password: CHANGE_ME
  master:
    persistence:
      size: 100Gi
    resources:
      requests:
        memory: 8Gi
        cpu: 4

minio:
  persistence:
    size: 10Ti
  resources:
    requests:
      memory: 16Gi
      cpu: 8
\`\`\`

### 2. Deploy

\`\`\`bash
helm install mdvr-platform mdvr-platform/mdvr-platform \
  --namespace mdvr-platform \
  -f production-values.yaml \
  --wait
\`\`\`

### 3. Verify Deployment

\`\`\`bash
kubectl get pods -n mdvr-platform
kubectl get svc -n mdvr-platform
kubectl get ingress -n mdvr-platform
\`\`\`

## Configuration

### Environment Variables

Required environment variables:
- `DB_PASSWORD` - PostgreSQL password
- `REDIS_PASSWORD` - Redis password
- `JWT_SECRET` - JWT signing secret
- `AWS_ACCESS_KEY_ID` - S3 access key
- `AWS_SECRET_ACCESS_KEY` - S3 secret key
- `VERIFONE_API_KEY` - Verifone API key
- `VERIFONE_MERCHANT_ID` - Verifone merchant ID

### Secrets Management

Store secrets in Kubernetes secrets:

\`\`\`bash
kubectl create secret generic mdvr-secrets \
  --namespace mdvr-platform \
  --from-literal=jwt-secret=YOUR_SECRET \
  --from-literal=verifone-api-key=YOUR_KEY
\`\`\`

## Monitoring

### Access Grafana

\`\`\`bash
kubectl port-forward -n monitoring svc/grafana 3000:80
\`\`\`

Navigate to http://localhost:3000

Default credentials:
- Username: admin
- Password: (from values.yaml)

### Access Prometheus

\`\`\`bash
kubectl port-forward -n monitoring svc/prometheus 9090:9090
\`\`\`

## Scaling

### Manual Scaling

\`\`\`bash
kubectl scale deployment mdvr-platform-api --replicas=10 -n mdvr-platform
\`\`\`

### Auto-scaling

HPA is enabled by default and will scale based on CPU/memory usage.

View HPA status:
\`\`\`bash
kubectl get hpa -n mdvr-platform
\`\`\`

## Backup & Recovery

### Database Backup

\`\`\`bash
kubectl exec -n mdvr-platform mdvr-platform-postgresql-0 -- \
  pg_dump -U mdvr mdvr > backup-$(date +%Y%m%d).sql
\`\`\`

### Restore Database

\`\`\`bash
kubectl exec -i -n mdvr-platform mdvr-platform-postgresql-0 -- \
  psql -U mdvr mdvr < backup-20240101.sql
\`\`\`

### Redis Backup

Redis persistence is enabled by default with RDB snapshots.

## Troubleshooting

### Check Logs

\`\`\`bash
# API logs
kubectl logs -f -n mdvr-platform deployment/mdvr-platform-api

# TCP signaling logs
kubectl logs -f -n mdvr-platform deployment/mdvr-platform-tcp-signaling

# All logs
kubectl logs -f -n mdvr-platform -l app.kubernetes.io/name=mdvr-platform
\`\`\`

### Common Issues

#### Devices Can't Connect

1. Check TCP signaling service:
\`\`\`bash
kubectl get svc mdvr-platform-tcp-signaling -n mdvr-platform
\`\`\`

2. Verify external IP:
\`\`\`bash
kubectl describe svc mdvr-platform-tcp-signaling -n mdvr-platform
\`\`\`

#### High Latency

1. Check resource usage:
\`\`\`bash
kubectl top pods -n mdvr-platform
\`\`\`

2. Scale up if needed:
\`\`\`bash
kubectl scale deployment mdvr-platform-api --replicas=10 -n mdvr-platform
\`\`\`

#### Database Connection Issues

1. Check PostgreSQL status:
\`\`\`bash
kubectl get pods -n mdvr-platform -l app.kubernetes.io/component=postgresql
\`\`\`

2. Check connection pool:
\`\`\`bash
kubectl exec -n mdvr-platform mdvr-platform-postgresql-0 -- \
  psql -U mdvr -c "SELECT count(*) FROM pg_stat_activity;"
\`\`\`

## Upgrades

### Rolling Update

\`\`\`bash
helm upgrade mdvr-platform mdvr-platform/mdvr-platform \
  --namespace mdvr-platform \
  -f production-values.yaml \
  --wait
\`\`\`

### Rollback

\`\`\`bash
helm rollback mdvr-platform -n mdvr-platform
\`\`\`

## Security

### Network Policies

Network policies are enabled by default to restrict traffic between pods.

### TLS/SSL

TLS certificates are managed by cert-manager. Ensure cert-manager is installed:

\`\`\`bash
kubectl get pods -n cert-manager
\`\`\`

### RBAC

RBAC is configured to follow principle of least privilege.

View service account:
\`\`\`bash
kubectl get serviceaccount mdvr-platform -n mdvr-platform
