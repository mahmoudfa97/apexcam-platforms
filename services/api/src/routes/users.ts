import type { FastifyPluginAsync } from "fastify"
import bcrypt from "bcrypt"
import { db } from "../db"

const usersRoutes: FastifyPluginAsync = async (fastify) => {
  // Get all users in tenant
  fastify.get("/", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { tenantId } = request.user as any

      const result = await db.query(
        `SELECT id, email, name, role, is_active, created_at
         FROM users
         WHERE tenant_id = $1
         ORDER BY created_at DESC`,
        [tenantId],
      )

      return reply.send({ users: result.rows })
    },
  })

  // Get user by ID
  fastify.get("/:id", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as any
      const { tenantId } = request.user as any

      const result = await db.query(
        `SELECT id, email, name, role, is_active, created_at
         FROM users
         WHERE id = $1 AND tenant_id = $2`,
        [id, tenantId],
      )

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: "User not found" })
      }

      return reply.send({ user: result.rows[0] })
    },
  })

  // Create user (admin only)
  fastify.post("/", {
    onRequest: [fastify.authenticate],
    schema: {
      body: {
        type: "object",
        required: ["email", "password", "name"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          name: { type: "string" },
          role: { type: "string", enum: ["admin", "operator", "viewer"] },
        },
      },
    },
    handler: async (request, reply) => {
      const { tenantId, role: userRole } = request.user as any

      if (userRole !== "admin" && userRole !== "super_admin") {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const { email, password, name, role = "viewer" } = request.body as any

      // Check if user exists
      const existing = await db.query("SELECT id FROM users WHERE email = $1", [email])
      if (existing.rows.length > 0) {
        return reply.code(409).send({ error: "User already exists" })
      }

      const passwordHash = await bcrypt.hash(password, 10)

      const result = await db.query(
        `INSERT INTO users (tenant_id, email, password_hash, name, role)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, email, name, role, created_at`,
        [tenantId, email, passwordHash, name, role],
      )

      return reply.code(201).send({ user: result.rows[0] })
    },
  })

  // Update user
  fastify.patch("/:id", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as any
      const { tenantId, role: userRole } = request.user as any

      if (userRole !== "admin" && userRole !== "super_admin") {
        return reply.code(403).send({ error: "Forbidden" })
      }

      const updates = request.body as any
      const allowedFields = ["name", "email", "role", "is_active"]
      const fields = Object.keys(updates).filter((key) => allowedFields.includes(key))

      if (fields.length === 0) {
        return reply.code(400).send({ error: "No valid fields to update" })
      }

      const setClauses = fields.map((field, i) => `${field} = $${i + 3}`).join(", ")
      const values = [id, tenantId, ...fields.map((field) => updates[field])]

      const result = await db.query(
        `UPDATE users
         SET ${setClauses}, updated_at = NOW()
         WHERE id = $1 AND tenant_id = $2
         RETURNING id, email, name, role, is_active`,
        values,
      )

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: "User not found" })
      }

      return reply.send({ user: result.rows[0] })
    },
  })

  // Delete user
  fastify.delete("/:id", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { id } = request.params as any
      const { tenantId, role: userRole } = request.user as any

      if (userRole !== "admin" && userRole !== "super_admin") {
        return reply.code(403).send({ error: "Forbidden" })
      }

      await db.query("DELETE FROM users WHERE id = $1 AND tenant_id = $2", [id, tenantId])

      return reply.send({ success: true })
    },
  })
}

export default usersRoutes
