import type { Pool } from "pg"
import type Redis from "ioredis"
import type { VerifoneClient } from "../verifone/client.js"
import { addMonths } from "date-fns"
import { logger } from "../logger.js"

export interface CreateSubscriptionRequest {
  tenantId: string
  planId: string
  paymentMethodId: string
}

export class SubscriptionService {
  constructor(
    private db: Pool,
    private redis: Redis,
    private verifone: VerifoneClient,
  ) {}

  async createSubscription(request: CreateSubscriptionRequest) {
    // Get plan details
    const planResult = await this.db.query(
      `
      SELECT * FROM subscription_plans WHERE id = $1
    `,
      [request.planId],
    )

    if (planResult.rows.length === 0) {
      throw new Error("Plan not found")
    }

    const plan = planResult.rows[0]

    // Get device count
    const deviceResult = await this.db.query(
      `
      SELECT COUNT(*) as device_count 
      FROM devices 
      WHERE tenant_id = $1 AND deleted_at IS NULL
    `,
      [request.tenantId],
    )

    const deviceCount = Number.parseInt(deviceResult.rows[0].device_count)

    // Calculate first payment
    const amount = plan.price_per_device * deviceCount

    // Get payment method
    const pmResult = await this.db.query(
      `
      SELECT * FROM payment_methods WHERE id = $1
    `,
      [request.paymentMethodId],
    )

    if (pmResult.rows.length === 0) {
      throw new Error("Payment method not found")
    }

    const paymentMethod = pmResult.rows[0]

    // Charge first payment
    const charge = await this.verifone.charge({
      amount: Math.round(amount * 100),
      currency: "USD",
      paymentMethodId: paymentMethod.verifone_payment_method_id,
      description: `Subscription - ${plan.name}`,
      metadata: {
        tenantId: request.tenantId,
        planId: request.planId,
      },
    })

    // Create subscription
    const now = new Date()
    const nextBillingDate = addMonths(now, 1)

    const subResult = await this.db.query(
      `
      INSERT INTO subscriptions (
        tenant_id, plan_id, status, current_period_start, current_period_end, 
        next_billing_date, device_count
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
      [request.tenantId, request.planId, "active", now, nextBillingDate, nextBillingDate, deviceCount],
    )

    // Record transaction
    await this.db.query(
      `
      INSERT INTO transactions (
        tenant_id, type, amount, currency, status, verifone_charge_id, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      [request.tenantId, "subscription", amount, "USD", charge.status, charge.id, `Subscription - ${plan.name}`],
    )

    logger.info(`Created subscription for tenant ${request.tenantId}`)

    return subResult.rows[0]
  }

  async getSubscription(id: string) {
    const result = await this.db.query(
      `
      SELECT s.*, p.name as plan_name, p.price_per_device
      FROM subscriptions s
      JOIN subscription_plans p ON s.plan_id = p.id
      WHERE s.id = $1
    `,
      [id],
    )

    if (result.rows.length === 0) {
      throw new Error("Subscription not found")
    }

    return result.rows[0]
  }

  async cancelSubscription(id: string) {
    const result = await this.db.query(
      `
      UPDATE subscriptions 
      SET status = 'cancelled', updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
      [id],
    )

    if (result.rows.length === 0) {
      throw new Error("Subscription not found")
    }

    logger.info(`Cancelled subscription ${id}`)

    return result.rows[0]
  }

  async processSubscription(subscriptionId: string) {
    const sub = await this.getSubscription(subscriptionId)

    // Get current device count
    const deviceResult = await this.db.query(
      `
      SELECT COUNT(*) as device_count 
      FROM devices 
      WHERE tenant_id = $1 AND deleted_at IS NULL
    `,
      [sub.tenant_id],
    )

    const deviceCount = Number.parseInt(deviceResult.rows[0].device_count)
    const amount = sub.price_per_device * deviceCount

    // Get default payment method
    const pmResult = await this.db.query(
      `
      SELECT * FROM payment_methods 
      WHERE tenant_id = $1 AND is_default = true AND deleted_at IS NULL
    `,
      [sub.tenant_id],
    )

    if (pmResult.rows.length === 0) {
      throw new Error("No default payment method found")
    }

    const paymentMethod = pmResult.rows[0]

    // Charge subscription
    const charge = await this.verifone.charge({
      amount: Math.round(amount * 100),
      currency: "USD",
      paymentMethodId: paymentMethod.verifone_payment_method_id,
      description: `Subscription renewal - ${sub.plan_name}`,
      metadata: {
        tenantId: sub.tenant_id,
        subscriptionId: subscriptionId,
      },
    })

    // Update subscription
    const nextBillingDate = addMonths(new Date(), 1)

    await this.db.query(
      `
      UPDATE subscriptions 
      SET 
        current_period_start = current_period_end,
        current_period_end = $1,
        next_billing_date = $1,
        device_count = $2,
        updated_at = NOW()
      WHERE id = $3
    `,
      [nextBillingDate, deviceCount, subscriptionId],
    )

    // Record transaction
    await this.db.query(
      `
      INSERT INTO transactions (
        tenant_id, type, amount, currency, status, verifone_charge_id, description
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
      [
        sub.tenant_id,
        "subscription",
        amount,
        "USD",
        charge.status,
        charge.id,
        `Subscription renewal - ${sub.plan_name}`,
      ],
    )

    logger.info(`Processed subscription renewal for ${subscriptionId}`)
  }

  async checkRenewals() {
    const result = await this.db.query(`
      SELECT id FROM subscriptions 
      WHERE status = 'active' 
        AND next_billing_date <= NOW()
    `)

    for (const row of result.rows) {
      try {
        await this.processSubscription(row.id)
      } catch (error: any) {
        logger.error(`Failed to process subscription ${row.id}:`, error)
      }
    }

    logger.info(`Checked ${result.rows.length} subscriptions for renewal`)
  }
}
