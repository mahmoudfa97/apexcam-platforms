import type { Pool } from "pg"
import type Redis from "ioredis"
import type { VerifoneClient } from "../verifone/client.js"
import { logger } from "../logger.js"

export interface UsageRecord {
  tenantId: string
  deviceId: string
  type: "data_transfer" | "storage" | "video_minutes"
  quantity: number
}

export class BillingService {
  constructor(
    private db: Pool,
    private redis: Redis,
    private verifone: VerifoneClient,
  ) {}

  async addPaymentMethod(tenantId: string, token: string) {
    const paymentMethod = await this.verifone.createPaymentMethod(token)

    const result = await this.db.query(
      `
      INSERT INTO payment_methods (
        tenant_id, verifone_payment_method_id, last4, brand, expiry_month, expiry_year, is_default
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
      [
        tenantId,
        paymentMethod.token,
        paymentMethod.last4,
        paymentMethod.brand,
        paymentMethod.expiryMonth,
        paymentMethod.expiryYear,
        true,
      ],
    )

    // Set as default and unset others
    await this.db.query(
      `
      UPDATE payment_methods 
      SET is_default = false 
      WHERE tenant_id = $1 AND id != $2
    `,
      [tenantId, result.rows[0].id],
    )

    return result.rows[0]
  }

  async getPaymentMethods(tenantId: string) {
    const result = await this.db.query(
      `
      SELECT * FROM payment_methods 
      WHERE tenant_id = $1 AND deleted_at IS NULL
      ORDER BY is_default DESC, created_at DESC
    `,
      [tenantId],
    )

    return result.rows
  }

  async recordUsage(usage: UsageRecord) {
    await this.db.query(
      `
      INSERT INTO usage_records (tenant_id, device_id, usage_type, quantity)
      VALUES ($1, $2, $3, $4)
    `,
      [usage.tenantId, usage.deviceId, usage.type, usage.quantity],
    )

    // Update current period usage in Redis
    const key = `usage:${usage.tenantId}:${usage.type}`
    await this.redis.incrby(key, usage.quantity)
  }

  async getUsage(tenantId: string, options: { startDate: Date; endDate: Date }) {
    const result = await this.db.query(
      `
      SELECT 
        usage_type,
        SUM(quantity) as total_quantity,
        COUNT(*) as record_count
      FROM usage_records
      WHERE tenant_id = $1 
        AND created_at >= $2 
        AND created_at < $3
      GROUP BY usage_type
    `,
      [tenantId, options.startDate, options.endDate],
    )

    return result.rows
  }

  async chargeUsage(tenantId: string, period: { start: Date; end: Date }) {
    // Get tenant's subscription plan
    const subResult = await this.db.query(
      `
      SELECT s.*, p.price_per_device, p.included_data_gb, p.price_per_gb
      FROM subscriptions s
      JOIN subscription_plans p ON s.plan_id = p.id
      WHERE s.tenant_id = $1 AND s.status = 'active'
    `,
      [tenantId],
    )

    if (subResult.rows.length === 0) {
      throw new Error("No active subscription found")
    }

    const subscription = subResult.rows[0]

    // Get usage for period
    const usage = await this.getUsage(tenantId, {
      startDate: period.start,
      endDate: period.end,
    })

    // Calculate overage charges
    let overageAmount = 0
    const dataUsage = usage.find((u) => u.usage_type === "data_transfer")

    if (dataUsage) {
      const dataGB = dataUsage.total_quantity / (1024 * 1024 * 1024)
      const overage = Math.max(0, dataGB - subscription.included_data_gb)
      overageAmount = overage * subscription.price_per_gb
    }

    if (overageAmount > 0) {
      // Get default payment method
      const pmResult = await this.db.query(
        `
        SELECT * FROM payment_methods 
        WHERE tenant_id = $1 AND is_default = true AND deleted_at IS NULL
      `,
        [tenantId],
      )

      if (pmResult.rows.length === 0) {
        throw new Error("No default payment method found")
      }

      const paymentMethod = pmResult.rows[0]

      // Charge overage
      const charge = await this.verifone.charge({
        amount: Math.round(overageAmount * 100), // Convert to cents
        currency: "USD",
        paymentMethodId: paymentMethod.verifone_payment_method_id,
        description: `Overage charges for ${period.start.toISOString().split("T")[0]}`,
        metadata: {
          tenantId,
          period: JSON.stringify(period),
        },
      })

      // Record transaction
      await this.db.query(
        `
        INSERT INTO transactions (
          tenant_id, type, amount, currency, status, verifone_charge_id, description
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      `,
        [
          tenantId,
          "charge",
          overageAmount,
          "USD",
          charge.status,
          charge.id,
          `Overage charges for ${period.start.toISOString().split("T")[0]}`,
        ],
      )

      logger.info(`Charged ${overageAmount} for overage to tenant ${tenantId}`)
    }

    return { overageAmount }
  }

  async getPlans() {
    const result = await this.db.query(`
      SELECT * FROM subscription_plans 
      WHERE is_active = true
      ORDER BY price_per_device ASC
    `)

    return result.rows
  }

  async handleWebhook(payload: any) {
    const eventType = payload.type

    switch (eventType) {
      case "charge.succeeded":
        await this.handleChargeSucceeded(payload.data)
        break
      case "charge.failed":
        await this.handleChargeFailed(payload.data)
        break
      case "charge.refunded":
        await this.handleChargeRefunded(payload.data)
        break
      default:
        logger.warn(`Unhandled webhook event: ${eventType}`)
    }
  }

  private async handleChargeSucceeded(data: any) {
    await this.db.query(
      `
      UPDATE transactions 
      SET status = 'succeeded', updated_at = NOW()
      WHERE verifone_charge_id = $1
    `,
      [data.id],
    )

    logger.info(`Charge succeeded: ${data.id}`)
  }

  private async handleChargeFailed(data: any) {
    await this.db.query(
      `
      UPDATE transactions 
      SET status = 'failed', updated_at = NOW()
      WHERE verifone_charge_id = $1
    `,
      [data.id],
    )

    logger.error(`Charge failed: ${data.id}`)
  }

  private async handleChargeRefunded(data: any) {
    await this.db.query(
      `
      UPDATE transactions 
      SET status = 'refunded', updated_at = NOW()
      WHERE verifone_charge_id = $1
    `,
      [data.id],
    )

    logger.info(`Charge refunded: ${data.id}`)
  }
}
