import Fastify from "fastify"
import cors from "@fastify/cors"
import { Pool } from "pg"
import Redis from "ioredis"
import { Queue, Worker } from "bullmq"
import { VideoAnalyticsService } from "./services/video-analytics.js"
import { GeofencingService } from "./services/geofencing.js"
import { OTAService } from "./services/ota-service.js"
import { DriverBehaviorService } from "./services/driver-behavior.js"
import { logger } from "./logger.js"

const fastify = Fastify({ logger: true })

// Database connection
const db = new Pool({
  host: process.env.DB_HOST || "postgres",
  port: Number.parseInt(process.env.DB_PORT || "5432"),
  database: process.env.DB_NAME || "mdvr",
  user: process.env.DB_USER || "mdvr",
  password: process.env.DB_PASSWORD || "mdvr_password",
})

// Redis connection
const redis = new Redis({
  host: process.env.REDIS_HOST || "redis",
  port: Number.parseInt(process.env.REDIS_PORT || "6379"),
  maxRetriesPerRequest: null,
})

// Services
const videoAnalytics = new VideoAnalyticsService(db, redis)
const geofencing = new GeofencingService(db, redis)
const otaService = new OTAService(db, redis)
const driverBehavior = new DriverBehaviorService(db, redis)

// Job queues
const analyticsQueue = new Queue("analytics", { connection: redis })

// Workers
const analyticsWorker = new Worker(
  "analytics",
  async (job) => {
    const { type, data } = job.data

    switch (type) {
      case "analyze_video":
        return await videoAnalytics.analyzeVideo(data.videoPath, data.deviceId)
      case "detect_faces":
        return await videoAnalytics.detectFaces(data.imagePath)
      case "analyze_behavior":
        return await driverBehavior.analyzeBehavior(data.deviceId, data.timeRange)
      default:
        throw new Error(`Unknown job type: ${type}`)
    }
  },
  { connection: redis, concurrency: 4 },
)

// CORS
await fastify.register(cors, {
  origin: true,
  credentials: true,
})

// Health check
fastify.get("/health", async () => {
  return { status: "ok", service: "ai-analytics" }
})

// Video analytics routes
fastify.post("/api/analytics/video", async (request, reply) => {
  const { videoPath, deviceId } = request.body as any

  const job = await analyticsQueue.add("analyze_video", {
    type: "analyze_video",
    data: { videoPath, deviceId },
  })

  return { jobId: job.id }
})

fastify.get("/api/analytics/video/:jobId", async (request, reply) => {
  const { jobId } = request.params as any
  const job = await analyticsQueue.getJob(jobId)

  if (!job) {
    reply.code(404)
    return { error: "Job not found" }
  }

  const state = await job.getState()
  const progress = job.progress

  return {
    state,
    progress,
    result: state === "completed" ? job.returnvalue : null,
  }
})

fastify.get("/api/analytics/events/:deviceId", async (request, reply) => {
  const { deviceId } = request.params as any
  const { startDate, endDate, eventType, limit = 100, offset = 0 } = request.query as any

  const events = await videoAnalytics.getEvents(deviceId, {
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    eventType,
    limit: Number.parseInt(limit),
    offset: Number.parseInt(offset),
  })

  return { events }
})

// Geofencing routes
fastify.post("/api/geofences", async (request, reply) => {
  const geofence = await geofencing.createGeofence(request.body as any)
  return { geofence }
})

fastify.get("/api/geofences", async (request, reply) => {
  const { tenantId } = request.query as any
  const geofences = await geofencing.getGeofences(tenantId)
  return { geofences }
})

fastify.get("/api/geofences/:id", async (request, reply) => {
  const { id } = request.params as any
  const geofence = await geofencing.getGeofence(id)
  return { geofence }
})

fastify.put("/api/geofences/:id", async (request, reply) => {
  const { id } = request.params as any
  const geofence = await geofencing.updateGeofence(id, request.body as any)
  return { geofence }
})

fastify.delete("/api/geofences/:id", async (request, reply) => {
  const { id } = request.params as any
  await geofencing.deleteGeofence(id)
  return { success: true }
})

fastify.get("/api/geofences/:id/violations", async (request, reply) => {
  const { id } = request.params as any
  const { startDate, endDate, limit = 100, offset = 0 } = request.query as any

  const violations = await geofencing.getViolations(id, {
    startDate: startDate ? new Date(startDate) : undefined,
    endDate: endDate ? new Date(endDate) : undefined,
    limit: Number.parseInt(limit),
    offset: Number.parseInt(offset),
  })

  return { violations }
})

// OTA update routes
fastify.post("/api/ota/firmware", async (request, reply) => {
  const firmware = await otaService.uploadFirmware(request.body as any)
  return { firmware }
})

fastify.get("/api/ota/firmware", async (request, reply) => {
  const { deviceType, status } = request.query as any
  const firmware = await otaService.getFirmwareList({ deviceType, status })
  return { firmware }
})

fastify.post("/api/ota/updates", async (request, reply) => {
  const update = await otaService.createUpdate(request.body as any)
  return { update }
})

fastify.get("/api/ota/updates/:id", async (request, reply) => {
  const { id } = request.params as any
  const update = await otaService.getUpdate(id)
  return { update }
})

fastify.post("/api/ota/updates/:id/deploy", async (request, reply) => {
  const { id } = request.params as any
  const { deviceIds } = request.body as any

  await otaService.deployUpdate(id, deviceIds)
  return { success: true }
})

fastify.get("/api/devices/:deviceId/ota-status", async (request, reply) => {
  const { deviceId } = request.params as any
  const status = await otaService.getDeviceUpdateStatus(deviceId)
  return { status }
})

// Driver behavior routes
fastify.get("/api/analytics/behavior/:deviceId", async (request, reply) => {
  const { deviceId } = request.params as any
  const { startDate, endDate } = request.query as any

  const analysis = await driverBehavior.analyzeBehavior(deviceId, {
    startDate: new Date(startDate),
    endDate: new Date(endDate),
  })

  return { analysis }
})

fastify.get("/api/analytics/driver-score/:deviceId", async (request, reply) => {
  const { deviceId } = request.params as any
  const score = await driverBehavior.calculateDriverScore(deviceId)
  return { score }
})

// Realtime geofence checking via Redis Pub/Sub
redis.subscribe("device:location", (err, count) => {
  if (err) {
    logger.error("Failed to subscribe to location channel", err)
  } else {
    logger.info(`Subscribed to ${count} channels`)
  }
})

redis.on("message", async (channel, message) => {
  if (channel === "device:location") {
    const location = JSON.parse(message)
    await geofencing.checkGeofenceViolations(location)
  }
})

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3004, host: "0.0.0.0" })
    logger.info("AI Analytics service started on port 3004")
  } catch (err) {
    logger.error(err)
    process.exit(1)
  }
}

start()
