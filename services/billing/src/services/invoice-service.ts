import type { Pool } from "pg"
import type Redis from "ioredis"
import { logger } from "../logger.js"

export class InvoiceService {
  constructor(
    private db: Pool,
    private redis: Redis,
  ) {}

  async generateInvoice(tenantId: string, period: { start: Date; end: Date }) {
    // Get all transactions for the period
    const txResult = await this.db.query(
      `
      SELECT * FROM transactions 
      WHERE tenant_id = $1 
        AND created_at >= $2 
        AND created_at < $3
        AND status = 'succeeded'
    `,
      [tenantId, period.start, period.end],
    )

    const transactions = txResult.rows
    const totalAmount = transactions.reduce((sum, tx) => sum + Number.parseFloat(tx.amount), 0)

    // Create invoice
    const invoiceResult = await this.db.query(
      `
      INSERT INTO invoices (
        tenant_id, invoice_number, amount, currency, status, period_start, period_end
      ) VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
      [tenantId, `INV-${Date.now()}`, totalAmount, "USD", "paid", period.start, period.end],
    )

    const invoice = invoiceResult.rows[0]

    // Link transactions to invoice
    for (const tx of transactions) {
      await this.db.query(
        `
        UPDATE transactions 
        SET invoice_id = $1 
        WHERE id = $2
      `,
        [invoice.id, tx.id],
      )
    }

    logger.info(`Generated invoice ${invoice.invoice_number} for tenant ${tenantId}`)

    return invoice
  }

  async getInvoice(id: string) {
    const result = await this.db.query(
      `
      SELECT * FROM invoices WHERE id = $1
    `,
      [id],
    )

    if (result.rows.length === 0) {
      throw new Error("Invoice not found")
    }

    return result.rows[0]
  }

  async getInvoices(tenantId: string, options: { status?: string; limit: number; offset: number }) {
    let query = `SELECT * FROM invoices WHERE tenant_id = $1`
    const params: any[] = [tenantId]

    if (options.status) {
      params.push(options.status)
      query += ` AND status = $${params.length}`
    }

    params.push(options.limit, options.offset)
    query += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`

    const result = await this.db.query(query, params)
    return result.rows
  }

  async payInvoice(id: string) {
    const result = await this.db.query(
      `
      UPDATE invoices 
      SET status = 'paid', paid_at = NOW(), updated_at = NOW()
      WHERE id = $1
      RETURNING *
    `,
      [id],
    )

    if (result.rows.length === 0) {
      throw new Error("Invoice not found")
    }

    logger.info(`Paid invoice ${id}`)

    return result.rows[0]
  }

  async sendInvoice(invoiceId: string) {
    // Implementation for sending invoice via email
    logger.info(`Sent invoice ${invoiceId}`)
  }

  async markOverdueInvoices() {
    const result = await this.db.query(`
      UPDATE invoices 
      SET status = 'overdue', updated_at = NOW()
      WHERE status = 'pending' 
        AND due_date < NOW()
      RETURNING id
    `)

    logger.info(`Marked ${result.rows.length} invoices as overdue`)
  }
}
