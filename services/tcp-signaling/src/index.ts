import net from "net"
import { logger } from "./logger"
import { ProtocolParser } from "./protocol/parser"
import { DeviceConnection } from "./connection"
import { redis } from "./redis"

const TCP_PORT = Number.parseInt(process.env.TCP_PORT || "1087", 10)
const TCP_HOST = process.env.TCP_HOST || "0.0.0.0"

class SignalingServer {
  private server: net.Server
  private connections: Map<string, DeviceConnection> = new Map()
  private parser: ProtocolParser

  constructor() {
    this.parser = new ProtocolParser()
    this.server = net.createServer(this.handleConnection.bind(this))
  }

  private handleConnection(socket: net.Socket) {
    const remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`
    logger.info({ remoteAddress }, "New device connection")

    const connection = new DeviceConnection(socket, this.parser)

    connection.on("registered", (deviceSerial: string) => {
      this.connections.set(deviceSerial, connection)
      logger.info({ deviceSerial, remoteAddress }, "Device registered")
    })

    connection.on("disconnected", (deviceSerial: string) => {
      if (deviceSerial) {
        this.connections.delete(deviceSerial)
      }
      logger.info({ deviceSerial, remoteAddress }, "Device disconnected")
    })

    connection.on("error", (error) => {
      logger.error({ error, remoteAddress }, "Connection error")
    })

    socket.on("error", (error) => {
      logger.error({ error, remoteAddress }, "Socket error")
    })
  }

  async start() {
    return new Promise<void>((resolve, reject) => {
      this.server.listen(TCP_PORT, TCP_HOST, () => {
        logger.info(`TCP Signaling Server listening on ${TCP_HOST}:${TCP_PORT}`)
        resolve()
      })

      this.server.on("error", (error) => {
        logger.error({ error }, "Server error")
        reject(error)
      })
    })
  }

  async stop() {
    logger.info("Stopping TCP Signaling Server")

    // Close all connections
    for (const connection of this.connections.values()) {
      connection.close()
    }
    this.connections.clear()

    // Close server
    return new Promise<void>((resolve) => {
      this.server.close(() => {
        logger.info("TCP Signaling Server stopped")
        resolve()
      })
    })
  }

  getConnectionCount(): number {
    return this.connections.size
  }
}

// Create and start server
const server = new SignalingServer()

server.start().catch((error) => {
  logger.error({ error }, "Failed to start server")
  process.exit(1)
})

// Graceful shutdown
process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down gracefully")
  await server.stop()
  await redis.quit()
  process.exit(0)
})

process.on("SIGINT", async () => {
  logger.info("SIGINT received, shutting down gracefully")
  await server.stop()
  await redis.quit()
  process.exit(0)
})
