import type { FastifyInstance } from "fastify"
import axios from "axios"

const BILLING_SERVICE_URL = process.env.BILLING_SERVICE_URL || "http://billing:3003"

export async function billingRoutes(fastify: FastifyInstance) {
  // Proxy to billing service
  fastify.post("/api/subscriptions", async (request, reply) => {
    const response = await axios.post(`${BILLING_SERVICE_URL}/api/subscriptions`, request.body)
    return response.data
  })

  fastify.get("/api/subscriptions/:id", async (request, reply) => {
    const { id } = request.params as any
    const response = await axios.get(`${BILLING_SERVICE_URL}/api/subscriptions/${id}`)
    return response.data
  })

  fastify.post("/api/subscriptions/:id/cancel", async (request, reply) => {
    const { id } = request.params as any
    const response = await axios.post(`${BILLING_SERVICE_URL}/api/subscriptions/${id}/cancel`)
    return response.data
  })

  fastify.post("/api/payment-methods", async (request, reply) => {
    const response = await axios.post(`${BILLING_SERVICE_URL}/api/payment-methods`, request.body)
    return response.data
  })

  fastify.get("/api/tenants/:tenantId/payment-methods", async (request, reply) => {
    const { tenantId } = request.params as any
    const response = await axios.get(`${BILLING_SERVICE_URL}/api/tenants/${tenantId}/payment-methods`)
    return response.data
  })

  fastify.get("/api/tenants/:tenantId/invoices", async (request, reply) => {
    const { tenantId } = request.params as any
    const response = await axios.get(`${BILLING_SERVICE_URL}/api/tenants/${tenantId}/invoices`, {
      params: request.query,
    })
    return response.data
  })

  fastify.get("/api/invoices/:id", async (request, reply) => {
    const { id } = request.params as any
    const response = await axios.get(`${BILLING_SERVICE_URL}/api/invoices/${id}`)
    return response.data
  })

  fastify.get("/api/plans", async (request, reply) => {
    const response = await axios.get(`${BILLING_SERVICE_URL}/api/plans`)
    return response.data
  })

  fastify.get("/api/tenants/:tenantId/usage", async (request, reply) => {
    const { tenantId } = request.params as any
    const response = await axios.get(`${BILLING_SERVICE_URL}/api/tenants/${tenantId}/usage`, {
      params: request.query,
    })
    return response.data
  })
}
