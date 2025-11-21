import type { FastifyPluginAsync } from "fastify"
import { db } from "../db"

const telemetryRoutes: FastifyPluginAsync = async (fastify) => {
  // Get telemetry for device
  fastify.get("/device/:deviceId", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { deviceId } = request.params as any
      const { tenantId } = request.user as any
      const { start, end, limit = 100 } = request.query as any

      // Verify device belongs to tenant
      const deviceCheck = await db.query("SELECT id FROM devices WHERE id = $1 AND tenant_id = $2", [
        deviceId,
        tenantId,
      ])

      if (deviceCheck.rows.length === 0) {
        return reply.code(404).send({ error: "Device not found" })
      }

      let query = `SELECT * FROM device_telemetry WHERE device_id = $1`
      const params: any[] = [deviceId]

      if (start) {
        params.push(start)
        query += ` AND timestamp >= $${params.length}`
      }

      if (end) {
        params.push(end)
        query += ` AND timestamp <= $${params.length}`
      }

      query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`
      params.push(limit)

      const result = await db.query(query, params)

      return reply.send({ telemetry: result.rows })
    },
  })

  // Get latest telemetry for all devices
  fastify.get("/latest", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { tenantId } = request.user as any

      const result = await db.query(
        `SELECT DISTINCT ON (device_id) 
                device_id, timestamp, location, speed, gps_valid, 
                status_flags, temperature, mileage
         FROM device_telemetry dt
         WHERE EXISTS (
           SELECT 1 FROM devices d 
           WHERE d.id = dt.device_id AND d.tenant_id = $1
         )
         ORDER BY device_id, timestamp DESC`,
        [tenantId],
      )

      return reply.send({ telemetry: result.rows })
    },
  })

  // Get device route/track
  fastify.get("/route/:deviceId", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { deviceId } = request.params as any
      const { tenantId } = request.user as any
      const { start, end } = request.query as any

      // Verify device
      const deviceCheck = await db.query("SELECT id FROM devices WHERE id = $1 AND tenant_id = $2", [
        deviceId,
        tenantId,
      ])

      if (deviceCheck.rows.length === 0) {
        return reply.code(404).send({ error: "Device not found" })
      }

      const result = await db.query(
        `SELECT timestamp, location, speed, heading
         FROM device_telemetry
         WHERE device_id = $1 
           AND timestamp >= $2 
           AND timestamp <= $3
           AND gps_valid = true
         ORDER BY timestamp ASC`,
        [deviceId, start, end],
      )

      return reply.send({ route: result.rows })
    },
  })
}

export default telemetryRoutes
