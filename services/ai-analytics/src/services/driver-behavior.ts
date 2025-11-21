import type { Pool } from "pg"
import type Redis from "ioredis"

export interface BehaviorAnalysis {
  deviceId: string
  period: { start: Date; end: Date }
  metrics: {
    harshBraking: number
    harshAcceleration: number
    sharpTurns: number
    speeding: number
    idling: number
  }
  score: number
}

export class DriverBehaviorService {
  constructor(
    private db: Pool,
    private redis: Redis,
  ) {}

  async analyzeBehavior(deviceId: string, timeRange: { startDate: Date; endDate: Date }): Promise<BehaviorAnalysis> {
    // Get telemetry data for period
    const telemetryResult = await this.db.query(
      `
      SELECT 
        speed,
        latitude,
        longitude,
        created_at,
        LAG(speed) OVER (ORDER BY created_at) as prev_speed,
        LAG(course) OVER (ORDER BY created_at) as prev_course,
        course
      FROM device_telemetry
      WHERE device_id = $1 
        AND created_at >= $2 
        AND created_at < $3
      ORDER BY created_at
    `,
      [deviceId, timeRange.startDate, timeRange.endDate],
    )

    const metrics = {
      harshBraking: 0,
      harshAcceleration: 0,
      sharpTurns: 0,
      speeding: 0,
      idling: 0,
    }

    let prevSpeed = 0
    let prevCourse = 0

    for (const row of telemetryResult.rows) {
      const speed = Number.parseFloat(row.speed)
      const course = Number.parseFloat(row.course)

      // Detect harsh braking (deceleration > 8 km/h/s)
      if (prevSpeed > 0 && prevSpeed - speed > 8) {
        metrics.harshBraking++
      }

      // Detect harsh acceleration (acceleration > 8 km/h/s)
      if (prevSpeed > 0 && speed - prevSpeed > 8) {
        metrics.harshAcceleration++
      }

      // Detect sharp turns (course change > 30 degrees)
      if (prevCourse > 0 && Math.abs(course - prevCourse) > 30) {
        metrics.sharpTurns++
      }

      // Detect speeding (speed > 120 km/h - adjust based on region)
      if (speed > 120) {
        metrics.speeding++
      }

      // Detect idling (speed = 0 for extended period)
      if (speed === 0) {
        metrics.idling++
      }

      prevSpeed = speed
      prevCourse = course
    }

    // Calculate driver score (0-100)
    const score = this.calculateScore(metrics, telemetryResult.rows.length)

    // Store analysis
    await this.db.query(
      `
      INSERT INTO driver_behavior_analysis (
        device_id, period_start, period_end, 
        harsh_braking, harsh_acceleration, sharp_turns, speeding, idling,
        score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
      [
        deviceId,
        timeRange.startDate,
        timeRange.endDate,
        metrics.harshBraking,
        metrics.harshAcceleration,
        metrics.sharpTurns,
        metrics.speeding,
        metrics.idling,
        score,
      ],
    )

    return {
      deviceId,
      period: { start: timeRange.startDate, end: timeRange.endDate },
      metrics,
      score,
    }
  }

  private calculateScore(metrics: any, totalPoints: number): number {
    // Scoring algorithm (simplified)
    let score = 100

    // Penalties per incident
    const penalties = {
      harshBraking: 2,
      harshAcceleration: 2,
      sharpTurns: 1,
      speeding: 3,
      idling: 0.1,
    }

    for (const [key, value] of Object.entries(metrics)) {
      score -= (value as number) * penalties[key as keyof typeof penalties]
    }

    return Math.max(0, Math.min(100, score))
  }

  async calculateDriverScore(deviceId: string): Promise<number> {
    // Get average score over last 30 days
    const result = await this.db.query(
      `
      SELECT AVG(score) as avg_score
      FROM driver_behavior_analysis
      WHERE device_id = $1 
        AND period_start >= NOW() - INTERVAL '30 days'
    `,
      [deviceId],
    )

    if (result.rows.length === 0 || !result.rows[0].avg_score) {
      return 100 // Default score for new drivers
    }

    return Number.parseFloat(result.rows[0].avg_score)
  }
}
