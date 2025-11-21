import type { FastifyPluginAsync } from "fastify"
import { db } from "../db"

const tenantsRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all tenants (super admin only)
  fastify.get("/", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { role } = request.user as any

      if (role !== "super_admin") {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const result = await db.query(
        `SELECT id, name, contact_email, subscription_tier, is_active, created_at
         FROM tenants
         ORDER BY created_at DESC`,
      )

      return reply.send({ tenants: result.rows })
    },
  })

  // Get tenant by ID
  fastify.get("/:id", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as any
      const { tenantId, role } = request.user as any

      // Only allow access to own tenant or super admin
      if (role !== "super_admin" && tenantId !== id) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const result = await db.query(
        `SELECT id, name, contact_email, subscription_tier, max_devices, is_active, created_at
         FROM tenants
         WHERE id = $1`,
        [id],
      )

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: "Tenant not found" })
      }

      return reply.send({ tenant: result.rows[0] })
    },
  })

  // Create tenant (super admin only)
  fastify.post("/", {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["name", "contactEmail"],
        properties: {
          name: { type: "string" },
          contactEmail: { type: "string", format: "email" },
          subscriptionTier: { type: "string", enum: ["free", "basic", "pro", "enterprise"] },
          maxDevices: { type: "number" },
        },
      },
    },
    handler: async (request, reply) => {
      const { role } = request.user as any

      if (role !== "super_admin") {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const { name, contactEmail, subscriptionTier = "free", maxDevices = 5 } = request.body as any

      const result = await db.query(
        `INSERT INTO tenants (name, contact_email, subscription_tier, max_devices)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, contact_email, subscription_tier, max_devices, created_at`,
        [name, contactEmail, subscriptionTier, maxDevices],
      )

      return reply.code(201).send({ tenant: result.rows[0] })
    },
  })

  // Update tenant
  fastify.patch("/:id", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as any
      const { tenantId, role } = request.user as any

      // Only allow access to own tenant or super admin
      if (role !== "super_admin" && tenantId !== id) {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const updates = request.body as any
      const allowedFields = ["name", "contact_email", "subscription_tier", "max_devices", "is_active"]
      const fields = Object.keys(updates).filter((key) => allowedFields.includes(key))

      if (fields.length === 0) {
        return reply.code(400).send({ error: "No valid fields to update" })
      }

      const setClauses = fields.map((field, i) => `${field} = $${i + 2}`).join(", ")
      const values = [id, ...fields.map((field) => updates[field])]

      const result = await db.query(
        `UPDATE tenants
         SET ${setClauses}, updated_at = NOW()
         WHERE id = $1
         RETURNING id, name, contact_email, subscription_tier, max_devices, is_active`,
        values,
      )

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: "Tenant not found" })
      }

      return reply.send({ tenant: result.rows[0] })
    },
  })

  // Delete tenant (super admin only)
  fastify.delete("/:id", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as any
      const { role } = request.user as any

      if (role !== "super_admin") {
        return reply.code(403).send({ error: "Forbidden" })
      }

      await db.query("DELETE FROM tenants WHERE id = $1", [id])

      return reply.send({ success: true })
    },
  })
}

export default tenantsRoutes
