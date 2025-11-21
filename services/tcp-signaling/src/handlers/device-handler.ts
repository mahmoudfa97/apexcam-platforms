import type { ParsedMessage } from "../protocol/parser"
import { sql } from "../db"
import { redis } from "../redis"
import { logger } from "../logger"

export class DeviceHandler {
  /**
   * Handle V101 - Device Registration
   */
  async handleRegistration(message: ParsedMessage): Promise<string> {
    const { deviceSerial, timestamp, fields } = message
    const location = fields.locationAndStatus

    try {
      // Upsert device in database
      const result = await sql`
        INSERT INTO devices (
          device_serial, 
          imei, 
          license_plate,
          device_type,
          firmware_version,
          protocol_version,
          num_channels,
          status,
          last_seen_at,
          registration_data,
          tenant_id
        )
        VALUES (
          ${deviceSerial},
          ${fields.imei || null},
          ${fields.licensePlate || null},
          ${fields.deviceType?.toString() || "mdvr"},
          ${fields.hostVersion || null},
          ${fields.protocolVersion || "V1.0.0.1"},
          ${this.getChannelCount(fields.deviceType)},
          'online',
          NOW(),
          ${JSON.stringify(fields)},
          (SELECT id FROM tenants WHERE slug = 'demo-fleet' LIMIT 1)
        )
        ON CONFLICT (device_serial) 
        DO UPDATE SET
          status = 'online',
          last_seen_at = NOW(),
          registration_data = ${JSON.stringify(fields)},
          firmware_version = COALESCE(${fields.hostVersion}, devices.firmware_version),
          imei = COALESCE(${fields.imei}, devices.imei),
          license_plate = COALESCE(${fields.licensePlate}, devices.license_plate)
        RETURNING id, tenant_id
      `

      const device = result[0]

      // Store initial telemetry if GPS is valid
      if (location.gpsValid && location.latitude && location.longitude) {
        await this.storeTelemetry(device.id, device.tenant_id, location)
      }

      // Publish device online event
      await redis.publish(
        "devices.status",
        JSON.stringify({
          deviceSerial,
          deviceId: device.id,
          tenantId: device.tenant_id,
          status: "online",
          timestamp: new Date().toISOString(),
        }),
      )

      logger.info({ deviceSerial, deviceId: device.id }, "Device registered successfully")

      // Build success response: C100
      return this.buildC100Response(message, "0", "1", "1")
    } catch (error) {
      logger.error({ error, deviceSerial }, "Failed to register device")

      // Build failure response
      return this.buildC100Response(message, "0", "1", "2")
    }
  }

  /**
   * Handle V109 - Heartbeat
   */
  async handleHeartbeat(message: ParsedMessage): Promise<string> {
    const { deviceSerial } = message

    try {
      // Update last_seen_at
      await sql`
        UPDATE devices 
        SET last_seen_at = NOW() 
        WHERE device_serial = ${deviceSerial}
      `

      logger.debug({ deviceSerial }, "Heartbeat received")

      // Build C501 response
      return `$$dc0028,${Math.floor(Math.random() * 1000)},C501,${deviceSerial},,${this.getCurrentTimestamp()}#`
    } catch (error) {
      logger.error({ error, deviceSerial }, "Failed to process heartbeat")
      throw error
    }
  }

  /**
   * Handle V114 - Location Report
   */
  async handleLocationReport(message: ParsedMessage): Promise<void> {
    const { deviceSerial, fields } = message
    const location = fields.locationAndStatus

    try {
      // Get device info
      const deviceResult = await sql`
        SELECT id, tenant_id 
        FROM devices 
        WHERE device_serial = ${deviceSerial}
      `

      if (deviceResult.length === 0) {
        logger.warn({ deviceSerial }, "Device not found for location report")
        return
      }

      const device = deviceResult[0]

      // Store telemetry
      await this.storeTelemetry(device.id, device.tenant_id, location)

      // Update device last_seen_at
      await sql`
        UPDATE devices 
        SET last_seen_at = NOW() 
        WHERE device_serial = ${deviceSerial}
      `

      // Publish location update event
      await redis.publish(
        "devices.position",
        JSON.stringify({
          deviceSerial,
          deviceId: device.id,
          tenantId: device.tenant_id,
          latitude: location.latitude,
          longitude: location.longitude,
          speed: location.speed,
          course: location.course,
          gpsValid: location.gpsValid,
          timestamp: new Date().toISOString(),
        }),
      )

      logger.debug({ deviceSerial }, "Location report processed")
    } catch (error) {
      logger.error({ error, deviceSerial }, "Failed to process location report")
    }
  }

  /**
   * Handle V201 - Alarm Start
   */
  async handleAlarmStart(message: ParsedMessage): Promise<string> {
    const { deviceSerial, fields } = message
    const location = fields.locationAndStatus

    try {
      // Get device info
      const deviceResult = await sql`
        SELECT id, tenant_id 
        FROM devices 
        WHERE device_serial = ${deviceSerial}
      `

      if (deviceResult.length === 0) {
        throw new Error("Device not found")
      }

      const device = deviceResult[0]

      // Create alarm record
      const alarmResult = await sql`
        INSERT INTO alarms (
          device_id,
          tenant_id,
          alarm_uid,
          alarm_type,
          alarm_number,
          alarm_source,
          alarm_name,
          started_at,
          latitude,
          longitude,
          speed,
          snapshot_count,
          recording_count,
          metadata
        )
        VALUES (
          ${device.id},
          ${device.tenant_id},
          ${fields.alarmUid},
          'custom',
          ${fields.customAlarmNumber || 0},
          ${fields.alarmSource || 0},
          ${fields.alarmName || ""},
          ${this.parseTimestamp(fields.alarmTime)},
          ${location.latitude || null},
          ${location.longitude || null},
          ${location.speed || null},
          ${fields.pictureShot || 0},
          ${fields.alarmRecording || 0},
          ${JSON.stringify(fields)}
        )
        RETURNING id
      `

      const alarm = alarmResult[0]

      // Publish alarm event
      await redis.publish(
        "devices.alarm",
        JSON.stringify({
          deviceSerial,
          deviceId: device.id,
          tenantId: device.tenant_id,
          alarmId: alarm.id,
          alarmUid: fields.alarmUid,
          alarmType: "custom",
          alarmNumber: fields.customAlarmNumber,
          latitude: location.latitude,
          longitude: location.longitude,
          timestamp: new Date().toISOString(),
        }),
      )

      logger.info({ deviceSerial, alarmUid: fields.alarmUid }, "Alarm started")

      // Build C100 response
      return this.buildC100Response(message, "0", fields.alarmUid)
    } catch (error) {
      logger.error({ error, deviceSerial }, "Failed to process alarm start")
      throw error
    }
  }

  /**
   * Handle V251 - Alarm End
   */
  async handleAlarmEnd(message: ParsedMessage): Promise<string> {
    const { deviceSerial, fields } = message

    try {
      // Update alarm end time
      await sql`
        UPDATE alarms 
        SET ended_at = ${this.parseTimestamp(fields.alarmTime)}
        WHERE alarm_uid = ${fields.alarmUid}
      `

      logger.info({ deviceSerial, alarmUid: fields.alarmUid }, "Alarm ended")

      // Build C100 response
      return this.buildC100Response(message, "0", fields.alarmUid)
    } catch (error) {
      logger.error({ error, deviceSerial }, "Failed to process alarm end")
      throw error
    }
  }

  /**
   * Handle V232 - Alarm File Upload Notification
   */
  async handleAlarmFileUpload(message: ParsedMessage): Promise<string> {
    const { deviceSerial, fields } = message

    try {
      // Get device and alarm info
      const deviceResult = await sql`
        SELECT d.id as device_id, d.tenant_id, a.id as alarm_id
        FROM devices d
        LEFT JOIN alarms a ON a.alarm_uid = ${fields.alarmUid}
        WHERE d.device_serial = ${deviceSerial}
      `

      if (deviceResult.length === 0) {
        throw new Error("Device not found")
      }

      const { device_id, tenant_id, alarm_id } = deviceResult[0]

      // Create media file record (placeholder until actual file is downloaded)
      const mediaResult = await sql`
        INSERT INTO media_files (
          device_id,
          tenant_id,
          alarm_id,
          file_type,
          file_path,
          file_size,
          s3_key,
          s3_bucket,
          channel_number,
          is_alarm_file,
          duration_seconds,
          start_time,
          metadata
        )
        VALUES (
          ${device_id},
          ${tenant_id},
          ${alarm_id},
          ${fields.fileType === 1 ? "jpeg" : "h264"},
          ${fields.filePath},
          ${fields.fileSize || 0},
          '',
          'mdvr-media',
          ${fields.channelNumber || 0},
          true,
          ${fields.fileLength || 0},
          ${this.parseTimestamp(fields.fileStartTime)},
          ${JSON.stringify(fields)}
        )
        RETURNING id
      `

      const mediaFile = mediaResult[0]

      // Publish file upload event (to trigger download via C702)
      await redis.publish(
        "media.file_ready",
        JSON.stringify({
          deviceSerial,
          deviceId: device_id,
          tenantId: tenant_id,
          alarmId: alarm_id,
          mediaFileId: mediaFile.id,
          alarmUid: fields.alarmUid,
          filePath: fields.filePath,
          fileSize: fields.fileSize,
          fileType: fields.fileType,
          timestamp: new Date().toISOString(),
        }),
      )

      logger.info(
        { deviceSerial, alarmUid: fields.alarmUid, filePath: fields.filePath },
        "Alarm file upload notification",
      )

      // Build C100 response
      return this.buildC100Response(message, "0", fields.alarmUid)
    } catch (error) {
      logger.error({ error, deviceSerial }, "Failed to process alarm file upload")
      throw error
    }
  }

  /**
   * Handle V141 - Get Download File List
   */
  async handleGetDownloadList(message: ParsedMessage): Promise<string> {
    const { deviceSerial } = message

    // For now, return empty list
    // In production, this would query pending OTA updates or files to download
    const parts = [
      "C100",
      deviceSerial,
      "",
      this.getCurrentTimestamp(),
      "V141",
      message.timestamp,
      "0", // status
      "0", // flag
      "0", // file type
      "0", // file id
      "", // file path
      "", // server ip
      "", // port
      "", // md5
      "0", // file param length
      "", // file param
      "0", // reserved
    ]

    const content = parts.join(",")
    const length = String(content.length + 4).padStart(4, "0")
    const serial = Math.floor(Math.random() * 1000)

    return `$$dc${length},${serial},${content}#`
  }

  /**
   * Handle V100 - Device Response to Command
   */
  async handleDeviceResponse(message: ParsedMessage): Promise<void> {
    const { deviceSerial, fields } = message

    try {
      // Update command status
      await sql`
        UPDATE device_commands
        SET 
          status = ${fields.status === 0 ? "acknowledged" : "failed"},
          acknowledged_at = NOW(),
          response_data = ${JSON.stringify(fields)}
        WHERE device_id = (SELECT id FROM devices WHERE device_serial = ${deviceSerial})
          AND command_type = ${fields.respondingCommand}
          AND sent_at IS NOT NULL
          AND acknowledged_at IS NULL
        ORDER BY created_at DESC
        LIMIT 1
      `

      logger.info(
        {
          deviceSerial,
          respondingCommand: fields.respondingCommand,
          status: fields.status,
        },
        "Device response processed",
      )
    } catch (error) {
      logger.error({ error, deviceSerial }, "Failed to process device response")
    }
  }

  /**
   * Store telemetry data
   */
  private async storeTelemetry(deviceId: string, tenantId: string, location: any) {
    if (!location.latitude || !location.longitude) {
      return
    }

    try {
      await sql`
        INSERT INTO telemetry (
          device_id,
          tenant_id,
          timestamp,
          latitude,
          longitude,
          speed,
          course,
          satellites,
          gps_valid,
          odometer,
          fuel_level,
          temperature,
          engine_temp,
          rpm,
          metadata
        )
        VALUES (
          ${deviceId},
          ${tenantId},
          NOW(),
          ${location.latitude},
          ${location.longitude},
          ${location.speed || 0},
          ${location.course || 0},
          ${location.satellites || 0},
          ${location.gpsValid || false},
          ${location.mileage || 0},
          ${location.fuelConsumption || 0},
          ${location.equipTemp || 0},
          ${location.engineTemp || 0},
          ${location.rpmSpeed ? Number.parseInt(location.rpmSpeed.split("|")[0], 10) : 0},
          ${JSON.stringify(location)}
        )
      `
    } catch (error) {
      logger.error({ error, deviceId }, "Failed to store telemetry")
    }
  }

  /**
   * Build C100 response message
   */
  private buildC100Response(message: ParsedMessage, status = "0", ...extraFields: string[]): string {
    const parts = [
      "C100",
      message.deviceSerial,
      message.workstationSerial || "",
      this.getCurrentTimestamp(),
      message.command,
      message.timestamp,
      status,
      ...extraFields,
    ]

    const content = parts.join(",")
    const length = String(content.length + 4).padStart(4, "0")
    const serial = Math.floor(Math.random() * 1000)

    return `$$dc${length},${serial},${content}#`
  }

  /**
   * Get current timestamp in protocol format: YYMMDD hhmmss
   */
  private getCurrentTimestamp(): string {
    const now = new Date()
    const yy = String(now.getFullYear()).slice(2)
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    const hh = String(now.getHours()).padStart(2, "0")
    const min = String(now.getMinutes()).padStart(2, "0")
    const ss = String(now.getSeconds()).padStart(2, "0")

    return `${yy}${mm}${dd} ${hh}${min}${ss}`
  }

  /**
   * Parse protocol timestamp to ISO string
   */
  private parseTimestamp(timestamp: string): string {
    if (!timestamp) return new Date().toISOString()

    const [date, time] = timestamp.split(" ")
    const yy = "20" + date.slice(0, 2)
    const mm = date.slice(2, 4)
    const dd = date.slice(4, 6)
    const hh = time.slice(0, 2)
    const min = time.slice(2, 4)
    const ss = time.slice(4, 6)

    return new Date(`${yy}-${mm}-${dd}T${hh}:${min}:${ss}Z`).toISOString()
  }

  /**
   * Get channel count from device type
   */
  private getChannelCount(deviceType: number): number {
    if (!deviceType) return 4

    // Extract channel count from device type (last byte)
    return deviceType & 0xff
  }
}
