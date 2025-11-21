import axios, { type AxiosInstance } from "axios"
import crypto from "crypto"
import { logger } from "../logger.js"

export interface VerifoneConfig {
  apiKey: string
  merchantId: string
  baseUrl: string
}

export interface PaymentMethodToken {
  token: string
  last4: string
  brand: string
  expiryMonth: number
  expiryYear: number
}

export interface ChargeRequest {
  amount: number
  currency: string
  paymentMethodId: string
  description?: string
  metadata?: Record<string, string>
}

export interface ChargeResponse {
  id: string
  status: "succeeded" | "pending" | "failed"
  amount: number
  currency: string
  createdAt: Date
}

export class VerifoneClient {
  private client: AxiosInstance
  private config: VerifoneConfig

  constructor(config: VerifoneConfig) {
    this.config = config

    this.client = axios.create({
      baseURL: config.baseUrl,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
        "X-Merchant-Id": config.merchantId,
      },
    })
  }

  async createPaymentMethod(token: string): Promise<PaymentMethodToken> {
    try {
      const response = await this.client.post("/v1/payment-methods", {
        type: "card",
        token,
      })

      return {
        token: response.data.id,
        last4: response.data.card.last4,
        brand: response.data.card.brand,
        expiryMonth: response.data.card.exp_month,
        expiryYear: response.data.card.exp_year,
      }
    } catch (error: any) {
      logger.error("Failed to create payment method", error)
      throw new Error("Failed to create payment method")
    }
  }

  async charge(request: ChargeRequest): Promise<ChargeResponse> {
    try {
      const response = await this.client.post("/v1/charges", {
        amount: request.amount,
        currency: request.currency,
        payment_method: request.paymentMethodId,
        description: request.description,
        metadata: request.metadata,
      })

      return {
        id: response.data.id,
        status: response.data.status,
        amount: response.data.amount,
        currency: response.data.currency,
        createdAt: new Date(response.data.created * 1000),
      }
    } catch (error: any) {
      logger.error("Failed to process charge", error)
      throw new Error("Failed to process charge")
    }
  }

  async refund(chargeId: string, amount?: number): Promise<void> {
    try {
      await this.client.post(`/v1/charges/${chargeId}/refunds`, {
        amount,
      })
    } catch (error: any) {
      logger.error("Failed to process refund", error)
      throw new Error("Failed to process refund")
    }
  }

  async getCharge(chargeId: string): Promise<ChargeResponse> {
    try {
      const response = await this.client.get(`/v1/charges/${chargeId}`)

      return {
        id: response.data.id,
        status: response.data.status,
        amount: response.data.amount,
        currency: response.data.currency,
        createdAt: new Date(response.data.created * 1000),
      }
    } catch (error: any) {
      logger.error("Failed to get charge", error)
      throw new Error("Failed to get charge")
    }
  }

  verifyWebhook(payload: any, signature: string): boolean {
    const webhookSecret = process.env.VERIFONE_WEBHOOK_SECRET!
    const computedSignature = crypto.createHmac("sha256", webhookSecret).update(JSON.stringify(payload)).digest("hex")

    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computedSignature))
  }
}
