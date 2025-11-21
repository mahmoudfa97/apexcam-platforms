import type { FastifyPluginAsync } from "fastify"
import { db } from "../db"
import { redis } from "../redis"

const mediaRoutes: FastifyPluginAsync = async (fastify) => {
  // Get media files
  fastify.get("/", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { tenantId } = request.user as any
      const { deviceId, type, limit = 50 } = request.query as any

      let query = `
        SELECT m.*, d.serial_number, d.plate_number
        FROM media_files m
        JOIN devices d ON d.id = m.device_id
        WHERE d.tenant_id = $1
      `
      const params: any[] = [tenantId]

      if (deviceId) {
        params.push(deviceId)
        query += ` AND m.device_id = $${params.length}`
      }

      if (type) {
        params.push(type)
        query += ` AND m.file_type = $${params.length}`
      }

      query += ` ORDER BY m.recorded_at DESC LIMIT $${params.length + 1}`
      params.push(limit)

      const result = await db.query(query, params)

      return reply.send({ media: result.rows })
    },
  })

  // Get media file by ID
  fastify.get("/:id", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as any
      const { tenantId } = request.user as any

      const result = await db.query(
        `SELECT m.*, d.serial_number, d.plate_number
         FROM media_files m
         JOIN devices d ON d.id = m.device_id
         WHERE m.id = $1 AND d.tenant_id = $2`,
        [id, tenantId],
      )

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: "Media file not found" })
      }

      return reply.send({ media: result.rows[0] })
    },
  })

  // Request live stream
  fastify.post("/stream/start", {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["deviceId", "channel"],
        properties: {
          deviceId: { type: "string", format: "uuid" },
          channel: { type: "number" },
          streamType: { type: "string", enum: ["main", "sub"] },
        },
      },
    },
    handler: async (request, reply) => {
      const { tenantId } = request.user as any
      const { deviceId, channel, streamType = "sub" } = request.body as any

      // Verify device
      const deviceCheck = await db.query(
        "SELECT id, serial_number, status FROM devices WHERE id = $1 AND tenant_id = $2",
        [deviceId, tenantId],
      )

      if (deviceCheck.rows.length === 0) {
        return reply.code(404).send({ error: "Device not found" })
      }

      const device = deviceCheck.rows[0]

      if (device.status !== "online") {
        return reply.code(400).send({ error: "Device is offline" })
      }

      // Generate session ID
      const sessionId = `${Date.now()}`

      // Publish stream request to device via Redis
      await redis.publish(
        `device:${device.serial_number}:commands`,
        JSON.stringify({
          command: "C508",
          sessionId,
          action: "start",
          channel,
          streamType: streamType === "main" ? 0 : 1,
        }),
      )

      return reply.send({
        sessionId,
        streamUrl: `${process.env.MEDIA_SERVER_URL}/stream/${sessionId}`,
      })
    },
  })

  // Stop live stream
  fastify.post("/stream/stop", {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["sessionId"],
        properties: {
          sessionId: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const { sessionId } = request.body as any

      // Publish stop command via Redis
      await redis.publish(
        "media:commands",
        JSON.stringify({
          command: "stop_stream",
          sessionId,
        }),
      )

      return reply.send({ success: true })
    },
  })
}

export default mediaRoutes
