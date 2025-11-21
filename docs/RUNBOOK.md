# MDVR Platform Operations Runbook

## On-Call Response

### Severity Levels

- **P0 (Critical)**: Complete service outage, data loss risk
- **P1 (High)**: Major functionality impaired, significant user impact
- **P2 (Medium)**: Minor functionality impaired, workaround available
- **P3 (Low)**: Cosmetic issue, no functional impact

### Response Times

- P0: 15 minutes
- P1: 1 hour
- P2: 4 hours
- P3: Next business day

## Common Incidents

### 1. High Error Rate

**Alert**: `HighErrorRate`

**Symptoms**:
- 5xx errors > 5%
- Users reporting errors
- Elevated response times

**Diagnosis**:
\`\`\`bash
# Check error logs
kubectl logs -n mdvr-platform -l app.kubernetes.io/component=api --tail=100 | grep ERROR

# Check service health
kubectl get pods -n mdvr-platform

# Check resource usage
kubectl top pods -n mdvr-platform
\`\`\`

**Resolution**:
1. Identify failing service
2. Check database connectivity
3. Verify external service availability (Verifone, S3)
4. Scale up if resource constrained
5. Rollback if recent deployment

**Escalation**: If unresolved in 30 minutes, escalate to engineering lead

---

### 2. Device Connection Loss

**Alert**: `HighDeviceDisconnectionRate`

**Symptoms**:
- Mass device disconnections
- No telemetry data
- Map shows offline devices

**Diagnosis**:
\`\`\`bash
# Check TCP signaling service
kubectl get svc mdvr-platform-tcp-signaling -n mdvr-platform

# Check signaling logs
kubectl logs -n mdvr-platform -l app.kubernetes.io/component=tcp-signaling --tail=200

# Check network connectivity
kubectl exec -n mdvr-platform deployment/mdvr-platform-tcp-signaling -- netstat -an | grep 9000
\`\`\`

**Resolution**:
1. Verify LoadBalancer external IP
2. Check firewall rules
3. Restart signaling service if necessary:
   \`\`\`bash
   kubectl rollout restart deployment/mdvr-platform-tcp-signaling -n mdvr-platform
   \`\`\`
4. Check for DDoS or network attack

**Escalation**: If network-related, escalate to infrastructure team

---

### 3. Database Performance Issues

**Alert**: `DatabaseConnectionPoolExhausted`

**Symptoms**:
- Slow queries
- Connection timeouts
- High database CPU

**Diagnosis**:
\`\`\`bash
# Check active connections
kubectl exec -n mdvr-platform mdvr-platform-postgresql-0 -- \
  psql -U mdvr -c "SELECT count(*), state FROM pg_stat_activity GROUP BY state;"

# Check slow queries
kubectl exec -n mdvr-platform mdvr-platform-postgresql-0 -- \
  psql -U mdvr -c "SELECT query, state, wait_event_type FROM pg_stat_activity WHERE state != 'idle' ORDER BY query_start;"

# Check database size
kubectl exec -n mdvr-platform mdvr-platform-postgresql-0 -- \
  psql -U mdvr -c "SELECT pg_size_pretty(pg_database_size('mdvr'));"
\`\`\`

**Resolution**:
1. Kill long-running queries:
   \`\`\`sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity 
   WHERE state = 'active' AND query_start < NOW() - INTERVAL '5 minutes';
   \`\`\`
2. Increase connection pool size
3. Add read replica if needed
4. Run VACUUM ANALYZE
5. Check for missing indexes

**Escalation**: If performance doesn't improve, escalate to DBA

---

### 4. Media Transcoding Backlog

**Alert**: `TranscodingQueueBacklog`

**Symptoms**:
- Videos not processing
- Queue size increasing
- Storage filling up

**Diagnosis**:
\`\`\`bash
# Check queue size
kubectl exec -n mdvr-platform deployment/mdvr-platform-media-worker -- \
  redis-cli -h redis LLEN media-transcoding-queue

# Check worker status
kubectl get pods -n mdvr-platform -l app.kubernetes.io/component=media-worker

# Check worker logs
kubectl logs -n mdvr-platform -l app.kubernetes.io/component=media-worker --tail=100
\`\`\`

**Resolution**:
1. Scale up media workers:
   \`\`\`bash
   kubectl scale deployment mdvr-platform-media-worker --replicas=12 -n mdvr-platform
   \`\`\`
2. Check S3 connectivity
3. Verify FFmpeg is working
4. Clear failed jobs if necessary

---

### 5. High Payment Failure Rate

**Alert**: `HighPaymentFailureRate`

**Symptoms**:
- Payment processing failures
- Users can't subscribe
- Revenue impact

**Diagnosis**:
\`\`\`bash
# Check billing service logs
kubectl logs -n mdvr-platform -l app.kubernetes.io/component=billing --tail=200 | grep ERROR

# Check Verifone API status
curl -I https://api.verifone.cloud/health

# Check recent transactions
kubectl exec -n mdvr-platform mdvr-platform-postgresql-0 -- \
  psql -U mdvr -c "SELECT status, count(*) FROM transactions WHERE created_at > NOW() - INTERVAL '1 hour' GROUP BY status;"
\`\`\`

**Resolution**:
1. Verify Verifone API credentials
2. Check API rate limits
3. Review failed transaction details
4. Contact Verifone support if widespread issue
5. Enable retry mechanism

**Escalation**: Critical - escalate to engineering lead and notify finance team

---

## Maintenance Procedures

### Planned Database Maintenance

1. **Schedule maintenance window** (prefer low-traffic hours)

2. **Enable maintenance mode**:
\`\`\`bash
kubectl scale deployment mdvr-platform-api --replicas=1 -n mdvr-platform
kubectl annotate deployment mdvr-platform-api maintenance="true" -n mdvr-platform
\`\`\`

3. **Backup database**:
\`\`\`bash
kubectl exec -n mdvr-platform mdvr-platform-postgresql-0 -- \
  pg_dump -U mdvr mdvr > backup-$(date +%Y%m%d-%H%M%S).sql
\`\`\`

4. **Perform maintenance** (VACUUM, REINDEX, etc.)

5. **Disable maintenance mode**:
\`\`\`bash
kubectl scale deployment mdvr-platform-api --replicas=5 -n mdvr-platform
kubectl annotate deployment mdvr-platform-api maintenance- -n mdvr-platform
\`\`\`

### Certificate Renewal

Certificates are auto-renewed by cert-manager. To force renewal:

\`\`\`bash
kubectl delete secret mdvr-tls -n mdvr-platform
kubectl delete certificaterequest -n mdvr-platform --all
\`\`\`

### Log Rotation

Logs are automatically rotated by Kubernetes. To manually clean old logs:

\`\`\`bash
kubectl exec -n mdvr-platform mdvr-platform-postgresql-0 -- \
  find /var/log/postgresql -name "*.log" -mtime +30 -delete
\`\`\`

## Emergency Procedures

### Complete Service Restore

If complete platform failure:

1. **Check cluster health**:
\`\`\`bash
kubectl get nodes
kubectl get pods --all-namespaces
\`\`\`

2. **Restore from backup**:
\`\`\`bash
# Restore database
kubectl exec -i -n mdvr-platform mdvr-platform-postgresql-0 -- \
  psql -U mdvr mdvr < latest-backup.sql

# Restore Redis
kubectl exec -n mdvr-platform mdvr-platform-redis-master-0 -- \
  redis-cli --rdb /data/dump.rdb
\`\`\`

3. **Restart all services**:
\`\`\`bash
kubectl rollout restart deployment -n mdvr-platform
\`\`\`

### Data Breach Response

1. **Immediately isolate affected systems**
2. **Notify security team**
3. **Enable audit logging**:
\`\`\`bash
kubectl patch deployment mdvr-platform-api -n mdvr-platform -p '
{"spec":{"template":{"spec":{"containers":[{"name":"api","env":[{"name":"AUDIT_LOGGING","value":"true"}]}]}}}}'
\`\`\`
4. **Collect evidence**
5. **Follow incident response plan**

## Contact Information

- **On-Call Engineer**: +1-XXX-XXX-XXXX
- **Engineering Lead**: +1-XXX-XXX-XXXX
- **Infrastructure Team**: infrastructure@mdvr.com
- **Security Team**: security@mdvr.com
- **Verifone Support**: +1-XXX-XXX-XXXX
