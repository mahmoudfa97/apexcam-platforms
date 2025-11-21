import { createClient } from "@supabase/supabase-js"
import type Redis from "ioredis"
import { generateObject } from "ai"
import logger from "../logger"
import * as fs from "fs"
import * as path from "path"
import { spawn } from "child_process"

export class VideoAnalyticsService {
  private supabase
  private modelsLoaded = false

  constructor(private redis: Redis) {
    this.supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
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

        const faces = await this.detectFaces(framePath)

        if (faces.length > 0) {
          events.push({
            type: "face_detected",
            timestamp,
            confidence: faces[0].confidence,
            count: faces.length,
            framePath,
          })
        }

        // Detect objects using AI SDK
        const objects = await this.detectObjects(framePath)

        for (const obj of objects) {
          events.push({
            type: "object_detected",
            timestamp,
            objectType: obj.class,
            confidence: obj.confidence,
            framePath,
          })
        }

        // Clean up frame
        fs.unlinkSync(framePath)
      }

      for (const event of events) {
        await this.supabase.from("analytics_events").insert({
          device_id: deviceId,
          event_type: event.type,
          confidence: event.confidence,
          metadata: event,
          created_at: new Date().toISOString(),
        })
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
    try {
      // Upload image to Supabase Storage temporarily
      const imageBuffer = fs.readFileSync(imagePath)
      const fileName = `temp/${Date.now()}-${path.basename(imagePath)}`

      const { data: uploadData, error: uploadError } = await this.supabase.storage
        .from("analytics")
        .upload(fileName, imageBuffer, {
          contentType: "image/jpeg",
          upsert: true,
        })

      if (uploadError) throw uploadError

      const {
        data: { publicUrl },
      } = this.supabase.storage.from("analytics").getPublicUrl(fileName)

      // Use AI SDK for face detection
      const result = await generateObject({
        model: "openai/gpt-4-vision-preview",
        prompt:
          "Detect all faces in this image and provide their bounding boxes (normalized 0-1 coordinates) and confidence scores",
        schema: {
          type: "object",
          properties: {
            faces: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  bbox: { type: "array", items: { type: "number" } },
                  confidence: { type: "number" },
                },
              },
            },
          },
        },
        messages: [
          {
            role: "user",
            content: [{ type: "image", image: publicUrl }],
          },
        ],
      })

      // Clean up temporary file
      await this.supabase.storage.from("analytics").remove([fileName])

      return result.object.faces
    } catch (error) {
      logger.error("Face detection failed", error)
      return []
    }
  }

  private async detectObjects(imagePath: string) {
    try {
      const imageBuffer = fs.readFileSync(imagePath)
      const fileName = `temp/${Date.now()}-${path.basename(imagePath)}`

      const { data: uploadData } = await this.supabase.storage.from("analytics").upload(fileName, imageBuffer, {
        contentType: "image/jpeg",
        upsert: true,
      })

      const {
        data: { publicUrl },
      } = this.supabase.storage.from("analytics").getPublicUrl(fileName)

      const result = await generateObject({
        model: "openai/gpt-4-vision-preview",
        prompt:
          "Detect all objects, vehicles, and people in this traffic camera image. Provide class name and confidence for each.",
        schema: {
          type: "object",
          properties: {
            objects: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  class: { type: "string" },
                  confidence: { type: "number" },
                },
              },
            },
          },
        },
        messages: [
          {
            role: "user",
            content: [{ type: "image", image: publicUrl }],
          },
        ],
      })

      await this.supabase.storage.from("analytics").remove([fileName])

      return result.object.objects
    } catch (error) {
      logger.error("Object detection failed", error)
      return []
    }
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
    let query = this.supabase.from("analytics_events").select("*").eq("device_id", deviceId)

    if (options.startDate) {
      query = query.gte("created_at", options.startDate.toISOString())
    }

    if (options.endDate) {
      query = query.lt("created_at", options.endDate.toISOString())
    }

    if (options.eventType) {
      query = query.eq("event_type", options.eventType)
    }

    query = query.order("created_at", { ascending: false }).range(options.offset, options.offset + options.limit - 1)

    const { data, error } = await query

    if (error) {
      logger.error({ error }, "Failed to fetch analytics events")
      return []
    }

    return data
  }
}
