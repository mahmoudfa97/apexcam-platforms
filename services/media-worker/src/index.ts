import { Worker, type Job } from "bullmq"
import { redis } from "./redis"
import { TranscodeService } from "./services/transcode-service"
import { S3Service } from "./services/s3-service"
import { logger } from "./logger"

const transcodeService = new TranscodeService()
const s3Service = new S3Service()

// Worker for transcoding media files
const transcodeWorker = new Worker(
  "media-transcode",
  async (job: Job) => {
    const { sessionId, filePath, deviceId, tenantId, channelNumber } = job.data

    logger.info({ sessionId, filePath }, "Starting transcode job")

    try {
      // Transcode H.264 to MP4
      const mp4Path = await transcodeService.transcodeToMP4(filePath)

      // Generate HLS segments
      const hlsPath = await transcodeService.transcodeToHLS(filePath)

      // Generate thumbnail
      const thumbnailPath = await transcodeService.generateThumbnail(filePath)

      // Upload to S3
      const mp4Key = await s3Service.uploadFile(mp4Path, tenantId, "mp4")
      const hlsManifestKey = await s3Service.uploadFile(`${hlsPath}/playlist.m3u8`, tenantId, "hls")
      const thumbnailKey = await s3Service.uploadFile(thumbnailPath, tenantId, "thumbnails")

      // Upload HLS segments
      const segmentFiles = await transcodeService.getHLSSegments(hlsPath)
      for (const segment of segmentFiles) {
        await s3Service.uploadFile(`${hlsPath}/${segment}`, tenantId, "hls")
      }

      logger.info({ sessionId, mp4Key, hlsManifestKey }, "Transcode completed")

      return {
        mp4Key,
        hlsManifestKey,
        thumbnailKey,
        success: true,
      }
    } catch (error) {
      logger.error({ error, sessionId }, "Transcode failed")
      throw error
    }
  },
  {
    connection: redis,
    concurrency: Number.parseInt(process.env.WORKER_CONCURRENCY || "2", 10),
    limiter: {
      max: 10,
      duration: 1000,
    },
  },
)

// Subscribe to Redis pub/sub for incoming transcode requests
const subscriber = redis.duplicate()

subscriber.subscribe("media.transcode_queue", (err) => {
  if (err) {
    logger.error({ error: err }, "Failed to subscribe to transcode queue")
  } else {
    logger.info("Subscribed to media.transcode_queue")
  }
})

subscriber.on("message", async (channel, message) => {
  if (channel === "media.transcode_queue") {
    try {
      const data = JSON.parse(message)

      // Add job to BullMQ queue
      await transcodeWorker.queue.add("transcode", data, {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2000,
        },
      })

      logger.info({ sessionId: data.sessionId }, "Transcode job queued")
    } catch (error) {
      logger.error({ error, message }, "Failed to queue transcode job")
    }
  }
})

transcodeWorker.on("completed", (job) => {
  logger.info({ jobId: job.id }, "Job completed")
})

transcodeWorker.on("failed", (job, error) => {
  logger.error({ jobId: job?.id, error }, "Job failed")
})

logger.info("Media worker started")

process.on("SIGTERM", async () => {
  logger.info("SIGTERM received, shutting down")
  await transcodeWorker.close()
  await redis.quit()
  await subscriber.quit()
  process.exit(0)
})
