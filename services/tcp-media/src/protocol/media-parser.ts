import { logger } from "../logger"

/**
 * Media Protocol Parser for binary media frames
 * Handles 0x60xx protocol packets as per MDVR specification
 */

export interface MediaPacket {
  type: "registration" | "video_i_frame" | "video_p_frame" | "audio_frame" | "file_data" | "command"
  command?: number
  length: number
  timestamp?: number
  data: Buffer
  [key: string]: any
}

export class MediaProtocolParser {
  private buffer: Buffer = Buffer.alloc(0)

  parse(data: Buffer): MediaPacket[] {
    this.buffer = Buffer.concat([this.buffer, data])
    const packets: MediaPacket[] = []

    while (true) {
      // Check for ASCII registration message (@@$$dc)
      if (this.buffer.indexOf("@@$$dc") === 0) {
        const packet = this.parseRegistrationMessage()
        if (packet) {
          packets.push(packet)
          continue
        }
        break
      }

      // Check for binary protocol (0x4040)
      if (this.buffer.length < 8) break

      const magic = this.buffer.readUInt16BE(0)
      if (magic !== 0x4040) {
        // Invalid magic, skip byte and try again
        this.buffer = this.buffer.subarray(1)
        continue
      }

      const command = this.buffer.readUInt16BE(2)
      const length = this.buffer.readUInt32BE(4)

      // Wait for complete packet
      if (this.buffer.length < length) break

      try {
        const packetBuffer = this.buffer.subarray(0, length)
        const packet = this.parseBinaryPacket(command, packetBuffer)
        if (packet) {
          packets.push(packet)
        }
      } catch (error) {
        logger.error({ error, command }, "Failed to parse binary packet")
      }

      this.buffer = this.buffer.subarray(length)
    }

    // Keep buffer under 10MB
    if (this.buffer.length > 10 * 1024 * 1024) {
      logger.warn("Buffer overflow, resetting")
      this.buffer = Buffer.alloc(0)
    }

    return packets
  }

  private parseRegistrationMessage(): MediaPacket | null {
    const endIndex = this.buffer.indexOf("#")
    if (endIndex === -1) return null

    const messageStr = this.buffer.subarray(2, endIndex + 1).toString("utf8") // Skip @@
    this.buffer = this.buffer.subarray(endIndex + 1)

    // Parse V102 or V103 message
    const match = messageStr.match(/\$\$dc(\d+),(\d+),(V10[23]),([^,]+),([^,]*),([^,]+),(.+)#/)
    if (!match) {
      logger.warn({ message: messageStr }, "Invalid registration message")
      return null
    }

    const [, length, serial, command, deviceSerial, workstation, timestamp, fieldsStr] = match
    const fields = fieldsStr.split(",")

    if (command === "V102") {
      // Media registration for live video
      return {
        type: "registration",
        command: "V102",
        length: Number.parseInt(length, 10),
        deviceSerial,
        sessionId: fields[10] || "",
        channelNumber: Number.parseInt(fields[12] || "0", 10),
        streamType: Number.parseInt(fields[13] || "1", 10),
        data: Buffer.from(messageStr),
      }
    } else if (command === "V103") {
      // Media registration for file download
      return {
        type: "registration",
        command: "V103",
        length: Number.parseInt(length, 10),
        deviceSerial,
        sessionId: fields[10] || "",
        fileSize: Number.parseInt(fields[11] || "0", 10),
        fileName: fields[12] || "",
        data: Buffer.from(messageStr),
      }
    }

    return null
  }

  private parseBinaryPacket(command: number, buffer: Buffer): MediaPacket | null {
    switch (command) {
      case 0x6011: // I-frame
        return this.parseVideoFrame(buffer, "I")

      case 0x6012: // P-frame
        return this.parseVideoFrame(buffer, "P")

      case 0x6013: // Audio frame
        return this.parseAudioFrame(buffer)

      case 0x6102: // File data
        return this.parseFileData(buffer)

      case 0x6000: // Registration ACK
      case 0x6002: // Request I-frame
      case 0x6403: // Receive report
        return {
          type: "command",
          command,
          length: buffer.length,
          data: buffer,
        }

      default:
        logger.warn({ command: command.toString(16) }, "Unknown binary command")
        return null
    }
  }

  private parseVideoFrame(buffer: Buffer, frameType: "I" | "P"): MediaPacket {
    // Binary video frame structure:
    // 0-3: Magic + Command (0x40406011 or 0x40406012)
    // 4-7: Total length
    // 8-11: Timestamp
    // 12-15: Sequence number
    // 16+: H.264 NAL units

    const timestamp = buffer.length >= 12 ? buffer.readUInt32BE(8) : 0
    const sequence = buffer.length >= 16 ? buffer.readUInt32BE(12) : 0
    const videoData = buffer.subarray(16)

    return {
      type: frameType === "I" ? "video_i_frame" : "video_p_frame",
      command: frameType === "I" ? 0x6011 : 0x6012,
      length: buffer.length,
      timestamp,
      sequence,
      data: videoData,
    }
  }

  private parseAudioFrame(buffer: Buffer): MediaPacket {
    const timestamp = buffer.length >= 12 ? buffer.readUInt32BE(8) : 0
    const audioData = buffer.subarray(16)

    return {
      type: "audio_frame",
      command: 0x6013,
      length: buffer.length,
      timestamp,
      data: audioData,
    }
  }

  private parseFileData(buffer: Buffer): MediaPacket {
    const offset = buffer.length >= 12 ? buffer.readUInt32BE(8) : 0
    const fileData = buffer.subarray(16)

    return {
      type: "file_data",
      command: 0x6102,
      length: buffer.length,
      offset,
      data: fileData,
    }
  }
}
