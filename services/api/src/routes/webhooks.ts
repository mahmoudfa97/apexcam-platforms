import type { FastifyPluginAsync } from "fastify"
import crypto from "crypto"

const webhooksRoutes: FastifyPluginAsync = async (fastify) => {
  // Verifone webhook handler
  fastify.post("/verifone", {
    handler: async (request, reply) => {
      const signature = request.headers["x-verifone-signature"] as string
      const body = JSON.stringify(request.body)

      // Verify signature
      const expectedSignature = crypto
        .createHmac("sha256", process.env.VERIFONE_WEBHOOK_SECRET!)
        .update(body)
        .digest("hex")

      if (signature !== expectedSignature) {
        return reply.code(401).send({ error: "Invalid signature" })
      }

      const event = request.body as any

      fastify.log.info({ event }, "Received Verifone webhook")

      // Handle different event types
      switch (event.type) {
        case "payment.succeeded":
          // Update subscription status
          await handlePaymentSucceeded(event.data)
          break

        case "payment.failed":
          // Handle failed payment
          await handlePaymentFailed(event.data)
          break

        case "subscription.cancelled":
          // Handle subscription cancellation
          await handleSubscriptionCancelled(event.data)
          break

        default:
          fastify.log.warn({ eventType: event.type }, "Unhandled webhook event type")
      }

      return reply.send({ received: true })
    },
  })

  // Generic webhook endpoint for testing
  fastify.post("/test", {
    handler: async (request, reply) => {
      fastify.log.info({ body: request.body }, "Received test webhook")
      return reply.send({ received: true })
    },
  })
}

// Helper functions
async function handlePaymentSucceeded(data: any) {
  // Implementation for payment succeeded
  console.log("Payment succeeded:", data)
}

async function handlePaymentFailed(data: any) {
  // Implementation for payment failed
  console.log("Payment failed:", data)
}

async function handleSubscriptionCancelled(data: any) {
  // Implementation for subscription cancelled
  console.log("Subscription cancelled:", data)
}

export default webhooksRoutes
