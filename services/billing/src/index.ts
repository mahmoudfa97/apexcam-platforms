import Fastify from "fastify"
import cors from "@fastify/cors"
import { Pool } from "pg"
import Redis from "ioredis"
import { Queue, Worker } from "bullmq"
import { VerifoneClient } from "./verifone/client.js"
import { BillingService } from "./services/billing-service.js"
import { SubscriptionService } from "./services/subscription-service.js"
import { InvoiceService } from "./services/invoice-service.js"
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

// Verifone client
const verifone = new VerifoneClient({
  apiKey: process.env.VERIFONE_API_KEY!,
  merchantId: process.env.VERIFONE_MERCHANT_ID!,
  baseUrl: process.env.VERIFONE_BASE_URL || "https://api.verifone.cloud",
})

// Services
const billingService = new BillingService(db, redis, verifone)
const subscriptionService = new SubscriptionService(db, redis, verifone)
const invoiceService = new InvoiceService(db, redis)

// Job queues
const billingQueue = new Queue("billing", { connection: redis })
const invoiceQueue = new Queue("invoices", { connection: redis })

// Workers
const billingWorker = new Worker(
  "billing",
  async (job) => {
    const { type, data } = job.data

    switch (type) {
      case "process_subscription":
        return await subscriptionService.processSubscription(data.subscriptionId)
      case "charge_usage":
        return await billingService.chargeUsage(data.tenantId, data.period)
      case "check_renewals":
        return await subscriptionService.checkRenewals()
      default:
        throw new Error(`Unknown job type: ${type}`)
    }
  },
  { connection: redis },
)

const invoiceWorker = new Worker(
  "invoices",
  async (job) => {
    const { type, data } = job.data

    switch (type) {
      case "generate_invoice":
        return await invoiceService.generateInvoice(data.tenantId, data.period)
      case "send_invoice":
        return await invoiceService.sendInvoice(data.invoiceId)
      case "mark_overdue":
        return await invoiceService.markOverdueInvoices()
      default:
        throw new Error(`Unknown job type: ${type}`)
    }
  },
  { connection: redis },
)

// CORS
await fastify.register(cors, {
  origin: true,
  credentials: true,
})

// Health check
fastify.get("/health", async () => {
  return { status: "ok", service: "billing" }
})

// Subscription routes
fastify.post("/api/subscriptions", async (request, reply) => {
  const { tenantId, planId, paymentMethodId } = request.body as any

  try {
    const subscription = await subscriptionService.createSubscription({
      tenantId,
      planId,
      paymentMethodId,
    })

    return { subscription }
  } catch (error: any) {
    reply.code(400)
    return { error: error.message }
  }
})

fastify.get("/api/subscriptions/:id", async (request, reply) => {
  const { id } = request.params as any

  try {
    const subscription = await subscriptionService.getSubscription(id)
    return { subscription }
  } catch (error: any) {
    reply.code(404)
    return { error: error.message }
  }
})

fastify.post("/api/subscriptions/:id/cancel", async (request, reply) => {
  const { id } = request.params as any

  try {
    const subscription = await subscriptionService.cancelSubscription(id)
    return { subscription }
  } catch (error: any) {
    reply.code(400)
    return { error: error.message }
  }
})

// Payment method routes
fastify.post("/api/payment-methods", async (request, reply) => {
  const { tenantId, token } = request.body as any

  try {
    const paymentMethod = await billingService.addPaymentMethod(tenantId, token)
    return { paymentMethod }
  } catch (error: any) {
    reply.code(400)
    return { error: error.message }
  }
})

fastify.get("/api/tenants/:tenantId/payment-methods", async (request, reply) => {
  const { tenantId } = request.params as any

  const paymentMethods = await billingService.getPaymentMethods(tenantId)
  return { paymentMethods }
})

// Invoice routes
fastify.get("/api/tenants/:tenantId/invoices", async (request, reply) => {
  const { tenantId } = request.params as any
  const { status, limit = 50, offset = 0 } = request.query as any

  const invoices = await invoiceService.getInvoices(tenantId, {
    status,
    limit: Number.parseInt(limit),
    offset: Number.parseInt(offset),
  })

  return { invoices }
})

fastify.get("/api/invoices/:id", async (request, reply) => {
  const { id } = request.params as any

  try {
    const invoice = await invoiceService.getInvoice(id)
    return { invoice }
  } catch (error: any) {
    reply.code(404)
    return { error: error.message }
  }
})

fastify.post("/api/invoices/:id/pay", async (request, reply) => {
  const { id } = request.params as any

  try {
    const invoice = await invoiceService.payInvoice(id)
    return { invoice }
  } catch (error: any) {
    reply.code(400)
    return { error: error.message }
  }
})

// Usage tracking routes
fastify.post("/api/usage", async (request, reply) => {
  const { tenantId, deviceId, type, quantity } = request.body as any

  try {
    await billingService.recordUsage({
      tenantId,
      deviceId,
      type,
      quantity,
    })

    return { success: true }
  } catch (error: any) {
    reply.code(400)
    return { error: error.message }
  }
})

fastify.get("/api/tenants/:tenantId/usage", async (request, reply) => {
  const { tenantId } = request.params as any
  const { startDate, endDate } = request.query as any

  const usage = await billingService.getUsage(tenantId, {
    startDate: new Date(startDate),
    endDate: new Date(endDate),
  })

  return { usage }
})

// Verifone webhook
fastify.post("/webhooks/verifone", async (request, reply) => {
  const signature = request.headers["x-verifone-signature"] as string
  const payload = request.body as any

  // Verify webhook signature
  const isValid = verifone.verifyWebhook(payload, signature)
  if (!isValid) {
    reply.code(401)
    return { error: "Invalid signature" }
  }

  // Process webhook event
  await billingService.handleWebhook(payload)

  return { received: true }
})

// Plans routes
fastify.get("/api/plans", async (request, reply) => {
  const plans = await billingService.getPlans()
  return { plans }
})

// Scheduled jobs
setInterval(
  async () => {
    // Check for subscription renewals every hour
    await billingQueue.add("check_renewals", {
      type: "check_renewals",
      data: {},
    })
  },
  60 * 60 * 1000,
)

setInterval(
  async () => {
    // Mark overdue invoices every day
    await invoiceQueue.add("mark_overdue", {
      type: "mark_overdue",
      data: {},
    })
  },
  24 * 60 * 60 * 1000,
)

// Start server
const start = async () => {
  try {
    await fastify.listen({ port: 3003, host: "0.0.0.0" })
    logger.info("Billing service started on port 3003")
  } catch (err) {
    logger.error(err)
    process.exit(1)
  }
}

start()
