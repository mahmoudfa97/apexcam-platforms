import Fastify from "fastify"
import cors from "@fastify/cors"
import helmet from "@fastify/helmet"
import jwt from "@fastify/jwt"
import rateLimit from "@fastify/rate-limit"
import swagger from "@fastify/swagger"
import swaggerUi from "@fastify/swagger-ui"
import { db } from "./db"
import { redis } from "./redis"
import authRoutes from "./routes/auth"
import tenantsRoutes from "./routes/tenants"
import usersRoutes from "./routes/users"
import devicesRoutes from "./routes/devices"
import telemetryRoutes from "./routes/telemetry"
import alarmsRoutes from "./routes/alarms"
import mediaRoutes from "./routes/media"
import billingRoutes from "./routes/billing"
import webhooksRoutes from "./routes/webhooks"

const server = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || "info",
    transport:
      process.env.NODE_ENV === "development"
        ? {
            target: "pino-pretty",
            options: {
              translateTime: "HH:MM:ss Z",
              ignore: "pid,hostname",
            },
          }
        : undefined,
  },
})

// Register plugins
async function registerPlugins() {
  // Security
  await server.register(helmet)
  await server.register(cors, {
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  })

  // JWT
  await server.register(jwt, {
    secret: process.env.JWT_SECRET!,
    sign: {
      expiresIn: "15m",
    },
  })

  // Rate limiting
  await server.register(rateLimit, {
    max: 100,
    timeWindow: "1 minute",
    redis,
  })

  // API Documentation
  await server.register(swagger, {
    openapi: {
      info: {
        title: "MDVR Platform API",
        description: "REST API for MDVR Platform",
        version: "1.0.0",
      },
      servers: [
        {
          url: "http://localhost:3000",
          description: "Development",
        },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: "http",
            scheme: "bearer",
            bearerFormat: "JWT",
          },
        },
      },
    },
  })

  await server.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
    },
  })
}

// Register routes
async function registerRoutes() {
  await server.register(authRoutes, { prefix: "/api/auth" })
  await server.register(tenantsRoutes, { prefix: "/api/tenants" })
  await server.register(usersRoutes, { prefix: "/api/users" })
  await server.register(devicesRoutes, { prefix: "/api/devices" })
  await server.register(telemetryRoutes, { prefix: "/api/telemetry" })
  await server.register(alarmsRoutes, { prefix: "/api/alarms" })
  await server.register(mediaRoutes, { prefix: "/api/media" })
  await server.register(billingRoutes, { prefix: "/api/billing" })
  await server.register(webhooksRoutes, { prefix: "/api/webhooks" })
}

// Health check
server.get("/health", async () => {
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  }
})

// Start server
async function start() {
  try {
    await registerPlugins()
    await registerRoutes()

    const port = Number.parseInt(process.env.PORT || "3000", 10)
    const host = process.env.HOST || "0.0.0.0"

    await server.listen({ port, host })
    server.log.info(`Server listening on ${host}:${port}`)
    server.log.info(`API Documentation available at http://${host}:${port}/docs`)
  } catch (err) {
    server.log.error(err)
    process.exit(1)
  }
}

// Graceful shutdown
process.on("SIGTERM", async () => {
  server.log.info("SIGTERM received, shutting down gracefully")
  await server.close()
  await db.end()
  await redis.quit()
  process.exit(0)
})

start()
