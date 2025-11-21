import type net from "net"
import { EventEmitter } from "events"
import { MediaProtocolParser } from "./protocol/media-parser"
import { MediaSessionManager } from "./session-manager"
import { logger } from "./logger"

export class MediaConnection extends EventEmitter {
  private socket: net.Socket
  private parser: MediaProtocolParser
  private sessionManager: MediaSessionManager
  private sessionId: string | null = null
  private deviceSerial: string | null = null

  constructor(socket: net.Socket) {
    super()
    this.socket = socket
    this.parser = new MediaProtocolParser()
    this.sessionManager = new MediaSessionManager()

    this.setupSocketHandlers()
  }

  private setupSocketHandlers() {
    this.socket.on("data", this.handleData.bind(this))
    this.socket.on("close", this.handleClose.bind(this))
    this.socket.on("error", this.handleError.bind(this))
    this.socket.on("timeout", this.handleTimeout.bind(this))

    this.socket.setTimeout(300000) // 5 minutes
  }

  private async handleData(data: Buffer) {
    try {
      const packets = this.parser.parse(data)

      for (const packet of packets) {
        await this.processPacket(packet)
      }
    } catch (error) {
      logger.error({ error, deviceSerial: this.deviceSerial }, "Error processing media data")
      this.emit("error", error)
    }
  }

  private async processPacket(packet: any) {
    switch (packet.type) {
      case "registration": // V102 or V103
        await this.handleRegistration(packet)
        break

      case "video_i_frame": // 0x6011
        await this.handleVideoFrame(packet, "I")
        break

      case "video_p_frame": // 0x6012
        await this.handleVideoFrame(packet, "P")
        break

      case "audio_frame": // 0x6013
        await this.handleAudioFrame(packet)
        break

      case "file_data": // 0x6102
        await this.handleFileData(packet)
        break

      case "command": // Commands from server
        await this.handleCommand(packet)
        break

      default:
        logger.warn({ type: packet.type }, "Unknown packet type")
    }
  }

  private async handleRegistration(packet: any) {
    this.deviceSerial = packet.deviceSerial
    this.sessionId = packet.sessionId

    logger.info(
      {
        deviceSerial: this.deviceSerial,
        sessionId: this.sessionId,
        channel: packet.channelNumber,
        streamType: packet.streamType,
      },
      "Media registration",
    )

    // Create session
    await this.sessionManager.createSession({
      sessionId: this.sessionId,
      deviceSerial: this.deviceSerial,
      channelNumber: packet.channelNumber,
      streamType: packet.streamType,
      command: packet.command,
    })

    // Send registration ACK (0x6000)
    const ackPacket = Buffer.alloc(16)
    ackPacket.writeUInt32BE(0x40400060, 0) // Magic + command
    ackPacket.writeUInt32BE(0x08000000, 4) // Length
    ackPacket.writeUInt32BE(0x01000000, 8) // Status
    ackPacket.writeUInt32BE(0x00000000, 12) // Reserved

    this.send(ackPacket)

    this.emit("session_started", this.sessionId)
  }

  private async handleVideoFrame(packet: any, frameType: "I" | "P") {
    if (!this.sessionId) {
      logger.warn("Received video frame without active session")
      return
    }

    const session = this.sessionManager.getSession(this.sessionId)
    if (!session) {
      logger.warn({ sessionId: this.sessionId }, "Session not found")
      return
    }

    // Write frame to temporary file
    await session.writeFrame(packet.data, frameType)

    logger.debug(
      {
        sessionId: this.sessionId,
        frameType,
        size: packet.data.length,
      },
      "Video frame received",
    )

    // Send receive report every 10 frames
    if (session.frameCount % 10 === 0) {
      this.sendReceiveReport(packet.timestamp)
    }
  }

  private async handleAudioFrame(packet: any) {
    if (!this.sessionId) return

    const session = this.sessionManager.getSession(this.sessionId)
    if (!session) return

    await session.writeAudioFrame(packet.data)

    logger.debug(
      {
        sessionId: this.sessionId,
        size: packet.data.length,
      },
      "Audio frame received",
    )
  }

  private async handleFileData(packet: any) {
    if (!this.sessionId) return

    const session = this.sessionManager.getSession(this.sessionId)
    if (!session) return

    await session.writeFileData(packet.data)

    logger.debug(
      {
        sessionId: this.sessionId,
        size: packet.data.length,
        offset: packet.offset,
      },
      "File data received",
    )
  }

  private async handleCommand(packet: any) {
    logger.debug({ command: packet.command }, "Command received")

    switch (packet.command) {
      case "request_i_frame": // 0x6002
        // Request I-frame from device - this is handled automatically
        break

      default:
        logger.warn({ command: packet.command }, "Unknown command")
    }
  }

  private sendReceiveReport(timestamp: number) {
    // Send 0x6403 receive report
    const reportPacket = Buffer.alloc(24)
    reportPacket.writeUInt32BE(0x40400364, 0) // Magic + command
    reportPacket.writeUInt32BE(0x18000000, 4) // Length
    reportPacket.writeUInt32BE(0x00000000, 8) // Reserved
    reportPacket.writeUInt32BE(timestamp, 12) // Timestamp
    reportPacket.writeUInt32BE(0x00000000, 16) // Reserved
    reportPacket.writeUInt32BE(0xd688fb22, 20) // Checksum placeholder

    this.send(reportPacket)
  }

  private handleClose() {
    if (this.sessionId) {
      this.sessionManager.endSession(this.sessionId)
      this.emit("session_ended", this.sessionId)
    }
    this.emit("disconnected")
  }

  private handleError(error: Error) {
    logger.error({ error, deviceSerial: this.deviceSerial }, "Socket error")
    this.emit("error", error)
  }

  private handleTimeout() {
    logger.warn({ deviceSerial: this.deviceSerial }, "Socket timeout")
    this.close()
  }

  send(data: Buffer) {
    if (this.socket.writable) {
      this.socket.write(data)
    } else {
      logger.warn({ deviceSerial: this.deviceSerial }, "Socket not writable")
    }
  }

  close() {
    this.socket.destroy()
  }
}
