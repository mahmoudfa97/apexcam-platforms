import type { Pool } from "pg"
import type Redis from "ioredis"
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3"
import { logger } from "../logger.js"
import crypto from "crypto"

export interface Firmware {
  id?: string
  version: string
  deviceType: string
  fileUrl: string
  checksum: string
  releaseNotes: string
  status: "draft" | "released" | "deprecated"
}

export interface OTAUpdate {
  id?: string
  firmwareId: string
  name: string
  status: "pending" | "in_progress" | "completed" | "failed"
  targetDevices: string[]
}

export class OTAService {
  private s3Client: S3Client

  constructor(
    private db: Pool,
    private redis: Redis,
  ) {
    this.s3Client = new S3Client({
      region: process.env.AWS_REGION || "us-east-1",
      endpoint: process.env.S3_ENDPOINT,
      credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      },
    })
  }

  async uploadFirmware(firmware: {
    version: string
    deviceType: string
    file: Buffer
    releaseNotes: string
  }) {
    // Calculate checksum
    const checksum = crypto.createHash("sha256").update(firmware.file).digest("hex")

    // Upload to S3
    const key = `firmware/${firmware.deviceType}/${firmware.version}.bin`
    await this.s3Client.send(
      new PutObjectCommand({
        Bucket: process.env.S3_BUCKET!,
        Key: key,
        Body: firmware.file,
        ContentType: "application/octet-stream",
      }),
    )

    const fileUrl = `https://${process.env.S3_BUCKET}.s3.amazonaws.com/${key}`

    // Store firmware metadata
    const result = await this.db.query(
      `
      INSERT INTO firmware (
        version, device_type, file_url, checksum, release_notes, status
      ) VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING *
    `,
      [firmware.version, firmware.deviceType, fileUrl, checksum, firmware.releaseNotes, "draft"],
    )

    logger.info(`Uploaded firmware ${firmware.version} for ${firmware.deviceType}`)

    return result.rows[0]
  }

  async getFirmwareList(filters: { deviceType?: string; status?: string }) {
    let query = `SELECT * FROM firmware WHERE 1=1`
    const params: any[] = []

    if (filters.deviceType) {
      params.push(filters.deviceType)
      query += ` AND device_type = $${params.length}`
    }

    if (filters.status) {
      params.push(filters.status)
      query += ` AND status = $${params.length}`
    }

    query += ` ORDER BY created_at DESC`

    const result = await this.db.query(query, params)
    return result.rows
  }

  async createUpdate(update: {
    firmwareId: string
    name: string
    targetDevices: string[]
  }) {
    const result = await this.db.query(
      `
      INSERT INTO ota_updates (
        firmware_id, name, status, target_devices
      ) VALUES ($1, $2, $3, $4)
      RETURNING *
    `,
      [update.firmwareId, update.name, "pending", update.targetDevices],
    )

    logger.info(`Created OTA update ${result.rows[0].id}`)

    return result.rows[0]
  }

  async getUpdate(id: string) {
    const result = await this.db.query(
      `
      SELECT u.*, f.version, f.device_type, f.file_url, f.checksum
      FROM ota_updates u
      JOIN firmware f ON u.firmware_id = f.id
      WHERE u.id = $1
    `,
      [id],
    )

    if (result.rows.length === 0) {
      throw new Error("OTA update not found")
    }

    return result.rows[0]
  }

  async deployUpdate(updateId: string, deviceIds: string[]) {
    const update = await this.getUpdate(updateId)

    // Create deployment records for each device
    for (const deviceId of deviceIds) {
      await this.db.query(
        `
        INSERT INTO ota_deployments (
          update_id, device_id, status
        ) VALUES ($1, $2, $3)
        ON CONFLICT (update_id, device_id) 
        DO UPDATE SET status = $3, updated_at = NOW()
      `,
        [updateId, deviceId, "pending"],
      )

      // Send update command to device via Redis
      await this.redis.publish(
        `device:${deviceId}:commands`,
        JSON.stringify({
          type: "ota_update",
          firmwareUrl: update.file_url,
          version: update.version,
          checksum: update.checksum,
        }),
      )
    }

    // Update campaign status
    await this.db.query(
      `
      UPDATE ota_updates
      SET status = 'in_progress', updated_at = NOW()
      WHERE id = $1
    `,
      [updateId],
    )

    logger.info(`Deployed OTA update ${updateId} to ${deviceIds.length} devices`)
  }

  async getDeviceUpdateStatus(deviceId: string) {
    const result = await this.db.query(
      `
      SELECT d.*, u.name as update_name, f.version
      FROM ota_deployments d
      JOIN ota_updates u ON d.update_id = u.id
      JOIN firmware f ON u.firmware_id = f.id
      WHERE d.device_id = $1
      ORDER BY d.created_at DESC
      LIMIT 10
    `,
      [deviceId],
    )

    return result.rows
  }

  async updateDeploymentStatus(deviceId: string, updateId: string, status: string, progress?: number) {
    await this.db.query(
      `
      UPDATE ota_deployments
      SET status = $1, progress = $2, updated_at = NOW()
      WHERE device_id = $3 AND update_id = $4
    `,
      [status, progress, deviceId, updateId],
    )

    // Check if all deployments are complete
    const result = await this.db.query(
      `
      SELECT COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed
      FROM ota_deployments
      WHERE update_id = $1
    `,
      [updateId],
    )

    const { total, completed } = result.rows[0]

    if (Number.parseInt(total) === Number.parseInt(completed)) {
      await this.db.query(
        `
        UPDATE ota_updates
        SET status = 'completed', updated_at = NOW()
        WHERE id = $1
      `,
        [updateId],
      )
    }
  }
}
