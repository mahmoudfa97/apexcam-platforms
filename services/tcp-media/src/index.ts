import net from "net"
import { logger } from "./logger"
import { MediaConnection } from "./connection"
import { redis } from "./redis"

const TCP_PORT = Number.parseInt(process.env.TCP_PORT || "6602", 10)
const TCP_HOST = process.env.TCP_HOST || "0.0.0.0"

class MediaServer {
  private server: net.Server
  private connections: Map<string, MediaConnection> = new Map()

  constructor() {
    this.server = net.createServer(this.handleConnection.bind(this))
  }

  private handleConnection(socket: net.Socket) {
    const remoteAddress = `${socket.remoteAddress}:${socket.remotePort}`
    logger.info({ remoteAddress }, "New media connection")

    const connection = new MediaConnection(socket)
    const connectionId = `${Date.now()}-${Math.random()}`

    this.connections.set(connectionId, connection)

    connection.on("session_started", (sessionId: string) => {
      logger.info({ sessionId, remoteAddress }, "Media session started")
    })

    connection.on("session_ended", (sessionId: string) => {
      logger.info({ sessionId, remoteAddress }, "Media session ended")
    })

    connection.on("disconnected", () => {
      this.connections.delete(connectionId)
      logger.info({ remoteAddress }, "Media connection closed")
    })

    connection.on("error", (error) => {
      logger.error({ error, remoteAddress }, "Media connection error")
    })

    socket.on("error", (error) => {
      logger.error({ error, remoteAddress }, "Media socket error")
    })
  }

  async start() {
    return new Promise<void>((resolve, reject) => {
      this.server.listen(TCP_PORT, TCP_HOST, () => {
        logger.info(`TCP Media Server listening on ${TCP_HOST}:${TCP_PORT}`)
        resolve()
      })

      this.server.on("error", (error) => {
        logger.error({ error }, "Media server error")
        reject(error)
      })
    })
  }

  async stop() {
    logger.info("Stopping TCP Media Server")

    for (const connection of this.connections.values()) {
      connection.close()
    }
    this.connections.clear()

    return new Promise<void>((resolve) => {
      this.server.close(() => {
        logger.info("TCP Media Server stopped")
        resolve()
      })
    })
  }

  getConnectionCount(): number {
    return this.connections.size
  }
}

const server = new MediaServer()

server.start().catch((error) => {
  logger.error({ error }, "Failed to start media server")
  process.exit(1)
})

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
