import type { FastifyPluginAsync } from "fastify"
import { db } from "../db"

const devicesRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all devices
  fastify.get("/", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { tenantId } = request.user as any

      const result = await db.query(
        `SELECT d.*, 
                (SELECT location FROM device_telemetry 
                 WHERE device_id = d.id 
                 ORDER BY timestamp DESC LIMIT 1) as last_location,
                (SELECT timestamp FROM device_telemetry 
                 WHERE device_id = d.id 
                 ORDER BY timestamp DESC LIMIT 1) as last_seen
         FROM devices d
         WHERE d.tenant_id = $1
         ORDER BY d.created_at DESC`,
        [tenantId],
      )

      return reply.send({ devices: result.rows })
    },
  })

  // Get device by ID
  fastify.get("/:id", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as any
      const { tenantId } = request.user as any

      const result = await db.query(`SELECT * FROM devices WHERE id = $1 AND tenant_id = $2`, [id, tenantId])

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: "Device not found" })
      }

      return reply.send({ device: result.rows[0] })
    },
  })

  // Create device
  fastify.post("/", {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["serialNumber", "plateNumber"],
        properties: {
          serialNumber: { type: "string" },
          plateNumber: { type: "string" },
          deviceType: { type: "string" },
          channels: { type: "number" },
        },
      },
    },
    handler: async (request, reply) => {
      const { tenantId } = request.user as any
      const { serialNumber, plateNumber, deviceType, channels } = request.body as any

      const result = await db.query(
        `INSERT INTO devices (tenant_id, serial_number, plate_number, device_type, channels)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [tenantId, serialNumber, plateNumber, deviceType, channels],
      )

      return reply.code(201).send({ device: result.rows[0] })
    },
  })

  // Update device
  fastify.patch("/:id", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as any
      const { tenantId } = request.user as any
      const updates = request.body as any

      const allowedFields = ["plate_number", "device_type", "channels", "is_active"]
      const fields = Object.keys(updates).filter((key) => allowedFields.includes(key))

      if (fields.length === 0) {
        return reply.code(400).send({ error: "No valid fields to update" })
      }

      const setClauses = fields.map((field, i) => `${field} = $${i + 3}`).join(", ")
      const values = [id, tenantId, ...fields.map((field) => updates[field])]

      const result = await db.query(
        `UPDATE devices
         SET ${setClauses}, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2
         RETURNING *`,
        values,
      )

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: "Device not found" })
      }

      return reply.send({ device: result.rows[0] })
    },
  })

  // Delete device
  fastify.delete("/:id", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as any
      const { tenantId } = request.user as any

      await db.query("DELETE FROM devices WHERE id = $1 AND tenant_id = $2", [id, tenantId])

      return reply.send({ success: true })
    },
  })
}

export default devicesRoutes
