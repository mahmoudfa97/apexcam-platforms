import type { FastifyPluginAsync } from "fastify"
import { db } from "../db"

const alarmsRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all alarms
  fastify.get("/", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { tenantId } = request.user as any
      const { status, deviceId, limit = 50 } = request.query as any

      let query = `
        SELECT a.*, d.serial_number, d.plate_number
        FROM device_alarms a
        JOIN devices d ON d.id = a.device_id
        WHERE d.tenant_id = $1
      `
      const params: any[] = [tenantId]

      if (status) {
        params.push(status)
        query += ` AND a.status = $${params.length}`
      }

      if (deviceId) {
        params.push(deviceId)
        query += ` AND a.device_id = $${params.length}`
      }

      query += ` ORDER BY a.triggered_at DESC LIMIT $${params.length + 1}`
      params.push(limit)

      const result = await db.query(query, params)

      return reply.send({ alarms: result.rows })
    },
  })

  // Get alarm by ID
  fastify.get("/:id", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as any
      const { tenantId } = request.user as any

      const result = await db.query(
        `SELECT a.*, d.serial_number, d.plate_number
         FROM device_alarms a
         JOIN devices d ON d.id = a.device_id
         WHERE a.id = $1 AND d.tenant_id = $2`,
        [id, tenantId],
      )

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: "Alarm not found" })
      }

      return reply.send({ alarm: result.rows[0] })
    },
  })

  // Acknowledge alarm
  fastify.post("/:id/acknowledge", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as any
      const { tenantId, userId } = request.user as any

      const result = await db.query(
        `UPDATE device_alarms a
         SET status = 'acknowledged', 
             acknowledged_by = $3,
             acknowledged_at = NOW(),
             updated_at = NOW()
         FROM devices d
         WHERE a.id = $1 
           AND a.device_id = d.id 
           AND d.tenant_id = $2
         RETURNING a.*`,
        [id, tenantId, userId],
      )

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: "Alarm not found" })
      }

      return reply.send({ alarm: result.rows[0] })
    },
  })

  // Resolve alarm
  fastify.post("/:id/resolve", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as any
      const { tenantId } = request.user as any

      const result = await db.query(
        `UPDATE device_alarms a
         SET status = 'resolved',
             updated_at = NOW()
         FROM devices d
         WHERE a.id = $1 
           AND a.device_id = d.id 
           AND d.tenant_id = $2
         RETURNING a.*`,
        [id, tenantId],
      )

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: "Alarm not found" })
      }

      return reply.send({ alarm: result.rows[0] })
    },
  })
}

export default alarmsRoutes
