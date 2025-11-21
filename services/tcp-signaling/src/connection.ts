import type net from "net"
import { EventEmitter } from "events"
import type { ProtocolParser, ParsedMessage } from "./protocol/parser"
import { DeviceHandler } from "./handlers/device-handler"
import { logger } from "./logger"

export class DeviceConnection extends EventEmitter {
  private socket: net.Socket
  private parser: ProtocolParser
  private handler: DeviceHandler
  private deviceSerial: string | null = null
  private lastActivity: Date = new Date()

  constructor(socket: net.Socket, parser: ProtocolParser) {
    super()
    this.socket = socket
    this.parser = parser
    this.handler = new DeviceHandler()

    this.setupSocketHandlers()
  }

  private setupSocketHandlers() {
    this.socket.on("data", this.handleData.bind(this))
    this.socket.on("close", this.handleClose.bind(this))
    this.socket.on("error", this.handleError.bind(this))
    this.socket.on("timeout", this.handleTimeout.bind(this))

    // Set socket timeout to 5 minutes
    this.socket.setTimeout(300000)
  }

  private async handleData(data: Buffer) {
    this.lastActivity = new Date()

    try {
      const messages = this.parser.parse(data)

      for (const message of messages) {
        await this.processMessage(message)
      }
    } catch (error) {
      logger.error({ error, deviceSerial: this.deviceSerial }, "Error processing data")
      this.emit("error", error)
    }
  }

  private async processMessage(message: ParsedMessage) {
    logger.debug(
      {
        command: message.command,
        deviceSerial: message.deviceSerial,
        serial: message.serial,
      },
      "Processing message",
    )

    try {
      let response: string | null = null

      switch (message.command) {
        case "V101": // Registration
          response = await this.handler.handleRegistration(message)
          this.deviceSerial = message.deviceSerial
          this.emit("registered", this.deviceSerial)
          break

        case "V109": // Heartbeat
          response = await this.handler.handleHeartbeat(message)
          break

        case "V114": // Location report
          await this.handler.handleLocationReport(message)
          break

        case "V201": // Alarm start
          response = await this.handler.handleAlarmStart(message)
          break

        case "V251": // Alarm end
          response = await this.handler.handleAlarmEnd(message)
          break

        case "V232": // Alarm file upload notification
          response = await this.handler.handleAlarmFileUpload(message)
          break

        case "V141": // Get download file list
          response = await this.handler.handleGetDownloadList(message)
          break

        case "V100": // Device response to command
          await this.handler.handleDeviceResponse(message)
          break

        default:
          logger.warn({ command: message.command }, "Unknown command type")
      }

      if (response) {
        this.send(response)
      }
    } catch (error) {
      logger.error({ error, message }, "Error handling message")
      this.emit("error", error)
    }
  }

  private handleClose() {
    logger.info({ deviceSerial: this.deviceSerial }, "Socket closed")
    this.emit("disconnected", this.deviceSerial)
  }

  private handleError(error: Error) {
    logger.error({ error, deviceSerial: this.deviceSerial }, "Socket error")
    this.emit("error", error)
  }

  private handleTimeout() {
    logger.warn({ deviceSerial: this.deviceSerial }, "Socket timeout")
    this.close()
  }

  send(data: string | Buffer) {
    if (this.socket.writable) {
      this.socket.write(data)
      logger.debug({ deviceSerial: this.deviceSerial, length: data.length }, "Sent data")
    } else {
      logger.warn({ deviceSerial: this.deviceSerial }, "Socket not writable")
    }
  }

  close() {
    this.socket.destroy()
  }

  getLastActivity(): Date {
    return this.lastActivity
  }

  getDeviceSerial(): string | null {
    return this.deviceSerial
  }
}
