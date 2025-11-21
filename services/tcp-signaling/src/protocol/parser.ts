import { logger } from "../logger"

/**
 * MDVR Protocol Parser
 * Implements exact protocol from specification document
 */

export interface ParsedMessage {
  type: "signaling"
  command: string
  length: number
  serial: number
  deviceSerial: string
  workstationSerial: string
  timestamp: string
  fields: Record<string, any>
  raw: string
}

export class ProtocolParser {
  private buffer: Buffer = Buffer.alloc(0)

  /**
   * Parse incoming data buffer for ASCII $$dc protocol messages
   */
  parse(data: Buffer): ParsedMessage[] {
    this.buffer = Buffer.concat([this.buffer, data])
    const messages: ParsedMessage[] = []

    while (true) {
      // Look for message start marker $$dc
      const startIndex = this.buffer.indexOf("$$dc")
      if (startIndex === -1) break

      // Look for message end marker #
      const endIndex = this.buffer.indexOf("#", startIndex)
      if (endIndex === -1) break

      // Extract complete message
      const messageBuffer = this.buffer.subarray(startIndex, endIndex + 1)
      const messageStr = messageBuffer.toString("utf8")

      try {
        const parsed = this.parseSignalingMessage(messageStr)
        if (parsed) {
          messages.push(parsed)
        }
      } catch (error) {
        logger.error({ error, message: messageStr }, "Failed to parse message")
      }

      // Remove processed message from buffer
      this.buffer = this.buffer.subarray(endIndex + 1)
    }

    // Keep buffer under 64KB
    if (this.buffer.length > 65536) {
      logger.warn("Buffer overflow, resetting")
      this.buffer = Buffer.alloc(0)
    }

    return messages
  }

  /**
   * Parse ASCII signaling message: $$dc<length>,<serial>,<command>,...#
   */
  private parseSignalingMessage(message: string): ParsedMessage | null {
    // Remove $$dc prefix and # suffix
    const content = message.slice(4, -1)
    const parts = content.split(",")

    if (parts.length < 4) {
      logger.warn({ message }, "Invalid message format")
      return null
    }

    const [lengthStr, serialStr, command, deviceSerial, ...rest] = parts

    return {
      type: "signaling",
      command,
      length: Number.parseInt(lengthStr, 10),
      serial: Number.parseInt(serialStr, 10),
      deviceSerial,
      workstationSerial: rest[0] || "",
      timestamp: rest[1] || "",
      fields: this.parseCommandFields(command, rest.slice(2)),
      raw: message,
    }
  }

  /**
   * Parse command-specific fields based on protocol specification
   */
  private parseCommandFields(command: string, fields: string[]): Record<string, any> {
    const parsed: Record<string, any> = {}

    switch (command) {
      case "V101": // Registration
        return this.parseV101Fields(fields)
      case "V109": // Heartbeat
        return {} // No additional fields
      case "V114": // Report location
        return this.parseV114Fields(fields)
      case "V201": // Alarm start
      case "V251": // Alarm end
        return this.parseAlarmFields(fields)
      case "V232": // Alarm file upload
        return this.parseV232Fields(fields)
      case "V100": // Device response
        return this.parseV100Fields(fields)
      default:
        logger.warn({ command }, "Unknown command type")
        return { rawFields: fields }
    }
  }

  /**
   * Parse V101 Registration command fields
   */
  private parseV101Fields(fields: string[]): Record<string, any> {
    const [
      locationAndStatus,
      numPeople,
      protocolVersion,
      deviceType,
      loginServerAddress,
      port,
      powerUps,
      connections,
      licensePlate,
      networkType,
      networkName,
      audioType,
      hardDiskType,
      manufacturerType,
      manufacturerDeviceType,
      imei,
      hostVersion,
      networkLibVersion,
    ] = fields

    return {
      locationAndStatus: this.parseLocationAndStatus(locationAndStatus),
      numPeople,
      protocolVersion,
      deviceType: Number.parseInt(deviceType || "0", 10),
      loginServerAddress,
      port: Number.parseInt(port || "0", 10),
      powerUps: Number.parseInt(powerUps || "0", 10),
      connections: Number.parseInt(connections || "0", 10),
      licensePlate,
      networkType: Number.parseInt(networkType || "0", 10),
      networkName,
      audioType: Number.parseInt(audioType || "1", 10),
      hardDiskType: Number.parseInt(hardDiskType || "1", 10),
      manufacturerType,
      manufacturerDeviceType,
      imei,
      hostVersion,
      networkLibVersion,
    }
  }

  /**
   * Parse V114 Report location fields
   */
  private parseV114Fields(fields: string[]): Record<string, any> {
    const [locationAndStatus, driveFlag] = fields

    return {
      locationAndStatus: this.parseLocationAndStatus(locationAndStatus),
      driveFlag: Number.parseInt(driveFlag || "0", 10),
    }
  }

  /**
   * Parse location and status string (complex field from protocol)
   */
  private parseLocationAndStatus(locationStr: string): Record<string, any> {
    if (!locationStr) return {}

    const parts = locationStr.split(",")
    if (parts.length < 10) return { raw: locationStr }

    const [
      gpsStatus,
      lonDeg,
      lonMin,
      lonSec,
      latDeg,
      latMin,
      latSec,
      speed,
      course,
      statusFlags,
      statusMask,
      equipTemp,
      engineTemp,
      insideTemp,
      mileage,
      fuelConsumption,
      parkingTime,
      rpmSpeed,
    ] = parts

    // Convert GPS coordinates to decimal degrees
    const longitude = this.coordinatesToDecimal(
      Number.parseInt(lonDeg, 10),
      Number.parseInt(lonMin, 10),
      Number.parseInt(lonSec, 10),
    )
    const latitude = this.coordinatesToDecimal(
      Number.parseInt(latDeg, 10),
      Number.parseInt(latMin, 10),
      Number.parseInt(latSec, 10),
    )

    return {
      gpsValid: gpsStatus?.startsWith("A") || false,
      satellites: gpsStatus ? Number.parseInt(gpsStatus.slice(1), 10) : 0,
      longitude,
      latitude,
      speed: Number.parseFloat(speed || "0"),
      course: Number.parseFloat(course || "0"),
      statusFlags,
      statusMask,
      equipTemp: Number.parseFloat(equipTemp || "0"),
      engineTemp: Number.parseFloat(engineTemp || "0"),
      insideTemp: Number.parseFloat(insideTemp || "0"),
      mileage: Number.parseInt(mileage || "0", 10),
      fuelConsumption: Number.parseFloat(fuelConsumption || "0"),
      parkingTime: Number.parseInt(parkingTime || "0", 10),
      rpmSpeed,
    }
  }

  /**
   * Parse alarm fields (V201/V251)
   */
  private parseAlarmFields(fields: string[]): Record<string, any> {
    const [
      locationAndStatus,
      alarmTime,
      alarmUid,
      pictureShot,
      pictureAddress,
      alarmRecording,
      recordingAddress,
      customAlarmNumber,
      alarmSource,
      alarmName,
    ] = fields

    return {
      locationAndStatus: this.parseLocationAndStatus(locationAndStatus),
      alarmTime,
      alarmUid,
      pictureShot: Number.parseInt(pictureShot || "0", 10),
      pictureAddress,
      alarmRecording: Number.parseInt(alarmRecording || "0", 10),
      recordingAddress,
      customAlarmNumber: Number.parseInt(customAlarmNumber || "0", 10),
      alarmSource: Number.parseInt(alarmSource || "0", 10),
      alarmName,
    }
  }

  /**
   * Parse V232 Alarm file upload fields
   */
  private parseV232Fields(fields: string[]): Record<string, any> {
    const [
      locationAndStatus,
      alarmTime,
      alarmUid,
      pictureShot,
      pictureAddress,
      alarmRecording,
      recordingAddress,
      fileType,
      filePath,
      fileSize,
      fileTypeFlag,
      fileStartTime,
      fileLength,
      channelNumber,
      reserved,
    ] = fields

    return {
      locationAndStatus: this.parseLocationAndStatus(locationAndStatus),
      alarmTime,
      alarmUid,
      fileType: Number.parseInt(fileType || "1", 10),
      filePath,
      fileSize: Number.parseInt(fileSize || "0", 10),
      fileTypeFlag: Number.parseInt(fileTypeFlag || "1", 10),
      fileStartTime,
      fileLength: Number.parseInt(fileLength || "0", 10),
      channelNumber: Number.parseInt(channelNumber || "0", 10),
    }
  }

  /**
   * Parse V100 Device response fields
   */
  private parseV100Fields(fields: string[]): Record<string, any> {
    const [locationAndStatus, respondingCommand, respondingTimestamp, status, ...extra] = fields

    return {
      locationAndStatus: this.parseLocationAndStatus(locationAndStatus),
      respondingCommand,
      respondingTimestamp,
      status: Number.parseInt(status || "0", 10),
      extra,
    }
  }

  /**
   * Convert GPS coordinates to decimal degrees
   */
  private coordinatesToDecimal(deg: number, min: number, sec: number): number {
    return deg + min / 60 + sec / 3600000
  }

  /**
   * Build response message in protocol format
   */
  buildResponse(command: string, deviceSerial: string, workstationSerial: string, fields: string[]): string {
    const timestamp = this.getCurrentTimestamp()
    const serial = Math.floor(Math.random() * 1000)

    const parts = [command, deviceSerial, workstationSerial || "", timestamp, ...fields]

    const content = parts.join(",")
    const length = String(content.length + 4).padStart(4, "0")

    return `$$dc${length},${serial},${content}#`
  }

  /**
   * Get current timestamp in YYMMDD hhmmss format
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
}
