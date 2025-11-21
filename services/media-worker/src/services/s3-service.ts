import { S3Client } from "@aws-sdk/client-s3"
import { Upload } from "@aws-sdk/lib-storage"
import fs from "fs"
import path from "path"
import { logger } from "../logger"

export class S3Service {
  private client: S3Client
  private bucket: string

  constructor() {
    this.bucket = process.env.S3_BUCKET || "mdvr-media"

    this.client = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || "us-east-1",
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY!,
        secretAccessKey: process.env.S3_SECRET_KEY!,
      },
      forcePathStyle: true, // Required for MinIO
    })
  }

  /**
   * Upload file to S3
   */
  async uploadFile(filePath: string, tenantId: string, category: string): Promise<string> {
    const fileName = path.basename(filePath)
    const key = `${tenantId}/${category}/${Date.now()}-${fileName}`

    try {
      const fileStream = fs.createReadStream(filePath)
      const stats = fs.statSync(filePath)

      const upload = new Upload({
        client: this.client,
        params: {
          Bucket: this.bucket,
          Key: key,
          Body: fileStream,
          ContentType: this.getContentType(fileName),
          ContentLength: stats.size,
        },
      })

      await upload.done()

      logger.info({ key, size: stats.size }, "File uploaded to S3")

      return key
    } catch (error) {
      logger.error({ error, filePath, key }, "Failed to upload file to S3")
      throw error
    }
  }

  /**
   * Get content type from file extension
   */
  private getContentType(fileName: string): string {
    const ext = path.extname(fileName).toLowerCase()

    const contentTypes: Record<string, string> = {
      ".mp4": "video/mp4",
      ".m3u8": "application/vnd.apple.mpegurl",
      ".ts": "video/mp2t",
      ".jpg": "image/jpeg",
      ".jpeg": "image/jpeg",
      ".png": "image/png",
      ".h264": "video/h264",
    }

    return contentTypes[ext] || "application/octet-stream"
  }

  /**
   * Generate signed URL for file access
   */
  async getSignedUrl(key: string, expiresIn = 3600): Promise<string> {
    // Implementation would use getSignedUrl from @aws-sdk/s3-request-presigner
    // For now, return direct URL (MinIO public access)
    const endpoint = process.env.S3_ENDPOINT || "http://localhost:9000"
    return `${endpoint}/${this.bucket}/${key}`
  }
}
