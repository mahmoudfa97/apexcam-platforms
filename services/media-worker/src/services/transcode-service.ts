import ffmpeg from "fluent-ffmpeg"
import fs from "fs/promises"
import path from "path"
import { logger } from "../logger"

export class TranscodeService {
  private outputDir: string = process.env.TRANSCODE_OUTPUT_DIR || "/tmp/media/transcoded"

  constructor() {
    this.ensureOutputDir()
  }

  private async ensureOutputDir() {
    try {
      await fs.mkdir(this.outputDir, { recursive: true })
    } catch (error) {
      logger.error({ error }, "Failed to create output directory")
    }
  }

  /**
   * Transcode H.264 raw stream to MP4 container
   */
  async transcodeToMP4(inputPath: string): Promise<string> {
    const outputPath = path.join(this.outputDir, `${path.basename(inputPath, ".h264")}.mp4`)

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .inputFormat("h264")
        .videoCodec("copy") // Copy video stream without re-encoding
        .outputOptions([
          "-movflags",
          "faststart", // Enable progressive streaming
          "-f",
          "mp4",
        ])
        .output(outputPath)
        .on("start", (commandLine) => {
          logger.debug({ commandLine }, "FFmpeg started")
        })
        .on("progress", (progress) => {
          logger.debug({ progress }, "Transcoding progress")
        })
        .on("end", () => {
          logger.info({ outputPath }, "MP4 transcode completed")
          resolve(outputPath)
        })
        .on("error", (error) => {
          logger.error({ error, inputPath }, "MP4 transcode failed")
          reject(error)
        })
        .run()
    })
  }

  /**
   * Transcode to HLS (HTTP Live Streaming) format
   */
  async transcodeToHLS(inputPath: string): Promise<string> {
    const outputDir = path.join(this.outputDir, path.basename(inputPath, ".h264"))

    await fs.mkdir(outputDir, { recursive: true })

    const playlistPath = path.join(outputDir, "playlist.m3u8")

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .inputFormat("h264")
        .videoCodec("libx264") // Re-encode for HLS compatibility
        .audioCodec("aac")
        .outputOptions([
          "-hls_time",
          "4", // 4-second segments
          "-hls_list_size",
          "0", // Keep all segments in playlist
          "-hls_segment_filename",
          path.join(outputDir, "segment_%03d.ts"),
          "-f",
          "hls",
        ])
        .output(playlistPath)
        .on("end", () => {
          logger.info({ outputDir }, "HLS transcode completed")
          resolve(outputDir)
        })
        .on("error", (error) => {
          logger.error({ error, inputPath }, "HLS transcode failed")
          reject(error)
        })
        .run()
    })
  }

  /**
   * Generate video thumbnail
   */
  async generateThumbnail(inputPath: string): Promise<string> {
    const outputPath = path.join(this.outputDir, `${path.basename(inputPath, ".h264")}_thumb.jpg`)

    return new Promise((resolve, reject) => {
      ffmpeg(inputPath)
        .inputFormat("h264")
        .screenshots({
          timestamps: ["1"], // Take screenshot at 1 second
          filename: path.basename(outputPath),
          folder: path.dirname(outputPath),
          size: "320x240",
        })
        .on("end", () => {
          logger.info({ outputPath }, "Thumbnail generated")
          resolve(outputPath)
        })
        .on("error", (error) => {
          logger.error({ error, inputPath }, "Thumbnail generation failed")
          reject(error)
        })
    })
  }

  /**
   * Get list of HLS segment files
   */
  async getHLSSegments(hlsDir: string): Promise<string[]> {
    try {
      const files = await fs.readdir(hlsDir)
      return files.filter((f) => f.endsWith(".ts"))
    } catch (error) {
      logger.error({ error, hlsDir }, "Failed to read HLS segments")
      return []
    }
  }

  /**
   * Extract metadata from video file
   */
  async getMetadata(inputPath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(inputPath, (error, metadata) => {
        if (error) {
          reject(error)
        } else {
          resolve(metadata)
        }
      })
    })
  }
}
