import type { FastifyPluginAsync } from "fastify"
import bcrypt from "bcrypt"
import { db } from "../db"
import { redis } from "../redis"

const authRoutes: FastifyPluginAsync = async (fastify) => {
  // Register
  fastify.post("/register", {
    schema: {
      body: {
        type: "object",
        required: ["email", "password", "name", "tenantId"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string", minLength: 8 },
          name: { type: "string" },
          tenantId: { type: "string", format: "uuid" },
          role: { type: "string", enum: ["admin", "operator", "viewer"] },
        },
      },
    },
    handler: async (request, reply) => {
      const { email, password, name, tenantId, role = "viewer" } = request.body as any

      // Check if user exists
      const existingUser = await db.query("SELECT id FROM users WHERE email = $1", [email])
      if (existingUser.rows.length > 0) {
        return reply.code(409).send({ error: "User already exists" })
      }

      // Hash password
      const passwordHash = await bcrypt.hash(password, 10)

      // Create user
      const result = await db.query(
        `INSERT INTO users (tenant_id, email, password_hash, name, role) 
         VALUES ($1, $2, $3, $4, $5) 
         RETURNING id, email, name, role, created_at`,
        [tenantId, email, passwordHash, name, role],
      )

      const user = result.rows[0]

      // Generate token
      const token = fastify.jwt.sign({
        userId: user.id,
        tenantId,
        role: user.role,
      })

      return reply.send({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
        },
      })
    },
  })

  // Login
  fastify.post("/login", {
    schema: {
      body: {
        type: "object",
        required: ["email", "password"],
        properties: {
          email: { type: "string", format: "email" },
          password: { type: "string" },
        },
      },
    },
    handler: async (request, reply) => {
      const { email, password } = request.body as any

      // Get user
      const result = await db.query(
        `SELECT u.id, u.tenant_id, u.email, u.password_hash, u.name, u.role, u.is_active
         FROM users u
         WHERE u.email = $1`,
        [email],
      )

      if (result.rows.length === 0) {
        return reply.code(401).send({ error: "Invalid credentials" })
      }

      const user = result.rows[0]

      if (!user.is_active) {
        return reply.code(403).send({ error: "Account is disabled" })
      }

      // Verify password
      const valid = await bcrypt.compare(password, user.password_hash)
      if (!valid) {
        return reply.code(401).send({ error: "Invalid credentials" })
      }

      // Generate token
      const token = fastify.jwt.sign({
        userId: user.id,
        tenantId: user.tenant_id,
        role: user.role,
      })

      // Store session in Redis
      await redis.setex(`session:${user.id}`, 900, token) // 15 minutes

      return reply.send({
        token,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          tenantId: user.tenant_id,
        },
      })
    },
  })

  // Refresh token
  fastify.post("/refresh", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId, tenantId, role } = request.user as any

      // Generate new token
      const token = fastify.jwt.sign({
        userId,
        tenantId,
        role,
      })

      return reply.send({ token })
    },
  })

  // Logout
  fastify.post("/logout", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user as any

      // Remove session from Redis
      await redis.del(`session:${userId}`)

      return reply.send({ success: true })
    },
  })

  // Get current user
  fastify.get("/me", {
    onRequest: [fastify.authenticate],
    handler: async (request, reply) => {
      const { userId } = request.user as any

      const result = await db.query(
        `SELECT id, email, name, role, tenant_id, created_at
         FROM users
         WHERE id = $1`,
        [userId],
      )

      if (result.rows.length === 0) {
        return reply.code(404).send({ error: "User not found" })
      }

      return reply.send({ user: result.rows[0] })
    },
  })
}

export default authRoutes
