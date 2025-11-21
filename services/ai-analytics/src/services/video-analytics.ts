import type { Pool } from "pg"
import type Redis from "ioredis"
import * as faceapi from "@vladmandic/face-api"
import { createCanvas, loadImage } from "canvas"
import { S3Client } from "@aws-sdk/client-s3"
import { logger } from "../logger.js"
import * as fs from "fs"
import * as path from "path"
import { spawn } from "child_process"

export class VideoAnalyticsService {
  private s3Client: S3Client
  private modelsLoaded = false

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

    this.loadModels()
  }

  private async loadModels() {
    try {
      await faceapi.nets.ssdMobilenetv1.loadFromDisk("./models")
      await faceapi.nets.faceLandmark68Net.loadFromDisk("./models")
      await faceapi.nets.faceRecognitionNet.loadFromDisk("./models")
      this.modelsLoaded = true
      logger.info("Face detection models loaded")
    } catch (error) {
      logger.error("Failed to load face detection models", error)
    }
  }

  async analyzeVideo(videoPath: string, deviceId: string) {
    logger.info(`Starting video analysis for ${videoPath}`)

    try {
      // Extract frames from video
      const frames = await this.extractFrames(videoPath)

      const events = []

      for (let i = 0; i < frames.length; i++) {
        const framePath = frames[i]
        const timestamp = (i / 30) * 1000 // Assuming 30 FPS

        // Detect faces
        const faces = await this.detectFaces(framePath)

        if (faces.length > 0) {
          events.push({
            type: "face_detected",
            timestamp,
            confidence: faces[0].detection.score,
            count: faces.length,
            framePath,
          })
        }

        // Detect objects (simplified - would use YOLO or similar in production)
        const objects = await this.detectObjects(framePath)

        for (const obj of objects) {
          events.push({
            type: "object_detected",
            timestamp,
            objectType: obj.class,
            confidence: obj.score,
            framePath,
          })
        }

        // Clean up frame
        fs.unlinkSync(framePath)
      }

      // Store events in database
      for (const event of events) {
        await this.db.query(
          `
          INSERT INTO analytics_events (
            device_id, event_type, confidence, metadata, created_at
          ) VALUES ($1, $2, $3, $4, NOW())
        `,
          [deviceId, event.type, event.confidence, JSON.stringify(event)],
        )
      }

      logger.info(`Completed video analysis: ${events.length} events detected`)

      return {
        eventsDetected: events.length,
        events: events.slice(0, 10), // Return first 10 for preview
      }
    } catch (error) {
      logger.error("Video analysis failed", error)
      throw error
    }
  }

  private async extractFrames(videoPath: string): Promise<string[]> {
    return new Promise((resolve, reject) => {
      const outputDir = `/tmp/frames-${Date.now()}`
      fs.mkdirSync(outputDir, { recursive: true })

      // Extract 1 frame per second
      const ffmpeg = spawn("ffmpeg", [
        "-i",
        videoPath,
        "-vf",
        "fps=1",
        "-q:v",
        "2",
        path.join(outputDir, "frame-%04d.jpg"),
      ])

      ffmpeg.on("close", (code) => {
        if (code === 0) {
          const frames = fs
            .readdirSync(outputDir)
            .filter((f) => f.endsWith(".jpg"))
            .map((f) => path.join(outputDir, f))
          resolve(frames)
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`))
        }
      })
    })
  }

  async detectFaces(imagePath: string) {
    if (!this.modelsLoaded) {
      logger.warn("Face detection models not loaded")
      return []
    }

    try {
      const img = await loadImage(imagePath)
      const canvas = createCanvas(img.width, img.height)
      const ctx = canvas.getContext("2d")
      ctx.drawImage(img, 0, 0)

      const detections = await faceapi
        .detectAllFaces(canvas as any)
        .withFaceLandmarks()
        .withFaceDescriptors()

      return detections
    } catch (error) {
      logger.error("Face detection failed", error)
      return []
    }
  }

  private async detectObjects(imagePath: string) {
    // Simplified object detection - in production, use YOLO or similar
    // For now, return empty array
    return []
  }

  async getEvents(
    deviceId: string,
    options: {
      startDate?: Date
      endDate?: Date
      eventType?: string
      limit: number
      offset: number
    },
  ) {
    let query = `SELECT * FROM analytics_events WHERE device_id = $1`
    const params: any[] = [deviceId]

    if (options.startDate) {
      params.push(options.startDate)
      query += ` AND created_at >= $${params.length}`
    }

    if (options.endDate) {
      params.push(options.endDate)
      query += ` AND created_at < $${params.length}`
    }

    if (options.eventType) {
      params.push(options.eventType)
      query += ` AND event_type = $${params.length}`
    }

    params.push(options.limit, options.offset)
    query += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`

    const result = await this.db.query(query, params)
    return result.rows
  }
}
