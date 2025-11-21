import fs from "fs/promises"
import path from "path"
import { sql } from "./db"
import { redis } from "./redis"
import { logger } from "./logger"

interface SessionInfo {
  sessionId: string
  deviceSerial: string
  deviceId?: string
  tenantId?: string
  channelNumber: number
  streamType: number
  command: string
  startedAt: Date
  frameCount: number
  totalBytes: number
  filePath: string
  fileHandle?: fs.FileHandle
  fileName?: string
}

export class MediaSessionManager {
  private sessions: Map<string, SessionInfo> = new Map()
  private tempDir: string = process.env.TEMP_MEDIA_DIR || "/tmp/media"

  constructor() {
    this.ensureTempDir()
  }

  private async ensureTempDir() {
    try {
      await fs.mkdir(this.tempDir, { recursive: true })
    } catch (error) {
      logger.error({ error }, "Failed to create temp directory")
    }
  }

  async createSession(params: {
    sessionId: string
    deviceSerial: string
    channelNumber: number
    streamType: number
    command: string
    fileName?: string
  }): Promise<SessionInfo> {
    // Get device info
    const deviceResult = await sql`
      SELECT id, tenant_id 
      FROM devices 
      WHERE device_serial = ${params.deviceSerial}
    `

    const device = deviceResult[0]
    const sessionDir = path.join(this.tempDir, params.sessionId)
    await fs.mkdir(sessionDir, { recursive: true })

    const filePath = path.join(
      sessionDir,
      params.fileName || `ch${params.channelNumber}_stream${params.streamType}.h264`,
    )

    const session: SessionInfo = {
      ...params,
      deviceId: device?.id,
      tenantId: device?.tenant_id,
      startedAt: new Date(),
      frameCount: 0,
      totalBytes: 0,
      filePath,
    }

    this.sessions.set(params.sessionId, session)

    // Create media session record in DB
    if (device && params.command === "V102") {
      await sql`
        INSERT INTO media_sessions (
          session_id,
          device_id,
          tenant_id,
          channel_number,
          stream_type,
          started_at
        )
        VALUES (
          ${params.sessionId},
          ${device.id},
          ${device.tenant_id},
          ${params.channelNumber},
          ${params.streamType},
          NOW()
        )
      `
    }

    logger.info({ sessionId: params.sessionId, deviceSerial: params.deviceSerial }, "Session created")

    return session
  }

  getSession(sessionId: string): SessionInfo | undefined {
    return this.sessions.get(sessionId)
  }

  async writeFrame(sessionId: string, data: Buffer, frameType: "I" | "P"): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    try {
      if (!session.fileHandle) {
        session.fileHandle = await fs.open(session.filePath, "a")
      }

      await session.fileHandle.write(data)
      session.frameCount++
      session.totalBytes += data.length

      // Publish frame event for live streaming
      await redis.publish(
        "media.frame",
        JSON.stringify({
          sessionId,
          deviceSerial: session.deviceSerial,
          deviceId: session.deviceId,
          tenantId: session.tenantId,
          channelNumber: session.channelNumber,
          frameType,
          size: data.length,
          timestamp: new Date().toISOString(),
        }),
      )

      // After 100 frames or 5MB, queue for transcoding
      if (session.frameCount >= 100 || session.totalBytes >= 5 * 1024 * 1024) {
        await this.queueForTranscoding(sessionId)

        // Reset counters and start new file segment
        session.frameCount = 0
        session.totalBytes = 0
        if (session.fileHandle) {
          await session.fileHandle.close()
          session.fileHandle = undefined
        }

        // Create new segment file
        const segmentNum = Math.floor(Date.now() / 1000)
        session.filePath = path.join(
          path.dirname(session.filePath),
          `ch${session.channelNumber}_stream${session.streamType}_${segmentNum}.h264`,
        )
      }
    } catch (error) {
      logger.error({ error, sessionId }, "Failed to write frame")
    }
  }

  async writeAudioFrame(sessionId: string, data: Buffer): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    const audioPath = session.filePath.replace(".h264", ".audio")

    try {
      await fs.appendFile(audioPath, data)
    } catch (error) {
      logger.error({ error, sessionId }, "Failed to write audio frame")
    }
  }

  async writeFileData(sessionId: string, data: Buffer): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    try {
      if (!session.fileHandle) {
        session.fileHandle = await fs.open(session.filePath, "a")
      }

      await session.fileHandle.write(data)
      session.totalBytes += data.length

      // Check if file download is complete
      if (session.fileName) {
        // For file downloads, we need to check total expected size
        // This would be compared with metadata from V232 message
      }
    } catch (error) {
      logger.error({ error, sessionId }, "Failed to write file data")
    }
  }

  private async queueForTranscoding(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    try {
      // Publish to Redis queue for media worker to process
      await redis.publish(
        "media.transcode_queue",
        JSON.stringify({
          sessionId,
          deviceSerial: session.deviceSerial,
          deviceId: session.deviceId,
          tenantId: session.tenantId,
          channelNumber: session.channelNumber,
          streamType: session.streamType,
          filePath: session.filePath,
          timestamp: new Date().toISOString(),
        }),
      )

      logger.info({ sessionId, filePath: session.filePath }, "Queued for transcoding")
    } catch (error) {
      logger.error({ error, sessionId }, "Failed to queue for transcoding")
    }
  }

  async endSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId)
    if (!session) return

    try {
      // Close file handle
      if (session.fileHandle) {
        await session.fileHandle.close()
      }

      // Queue final segment for transcoding
      if (session.frameCount > 0) {
        await this.queueForTranscoding(sessionId)
      }

      // Update session end time in DB
      if (session.deviceId && session.command === "V102") {
        await sql`
          UPDATE media_sessions
          SET ended_at = NOW()
          WHERE session_id = ${sessionId}
        `
      }

      this.sessions.delete(sessionId)

      logger.info({ sessionId }, "Session ended")
    } catch (error) {
      logger.error({ error, sessionId }, "Failed to end session")
    }
  }
}
