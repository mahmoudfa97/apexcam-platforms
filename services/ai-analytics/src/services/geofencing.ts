import type { Pool } from "pg"
import type Redis from "ioredis"
import * as turf from "@turf/turf"
import { logger } from "../logger.js"

export interface Geofence {
  id?: string
  tenantId: string
  name: string
  type: "circle" | "polygon"
  geometry: any // GeoJSON
  trigger: "enter" | "exit" | "both"
  isActive: boolean
}

export class GeofencingService {
  constructor(
    private db: Pool,
    private redis: Redis,
  ) {}

  async createGeofence(geofence: Geofence) {
    const result = await this.db.query(
      `
      INSERT INTO geofences (
        tenant_id, name, type, geometry, trigger_type, is_active
      ) VALUES ($1, $2, $3, ST_GeomFromGeoJSON($4), $5, $6)
      RETURNING id, tenant_id, name, type, 
        ST_AsGeoJSON(geometry)::json as geometry, 
        trigger_type, is_active, created_at
    `,
      [
        geofence.tenantId,
        geofence.name,
        geofence.type,
        JSON.stringify(geofence.geometry),
        geofence.trigger,
        geofence.isActive,
      ],
    )

    // Cache geofence in Redis for fast lookup
    await this.cacheGeofence(result.rows[0])

    logger.info(`Created geofence ${result.rows[0].id}`)

    return result.rows[0]
  }

  async getGeofences(tenantId: string) {
    const result = await this.db.query(
      `
      SELECT 
        id, tenant_id, name, type, 
        ST_AsGeoJSON(geometry)::json as geometry,
        trigger_type, is_active, created_at, updated_at
      FROM geofences
      WHERE tenant_id = $1 AND deleted_at IS NULL
      ORDER BY created_at DESC
    `,
      [tenantId],
    )

    return result.rows
  }

  async getGeofence(id: string) {
    const result = await this.db.query(
      `
      SELECT 
        id, tenant_id, name, type,
        ST_AsGeoJSON(geometry)::json as geometry,
        trigger_type, is_active, created_at, updated_at
      FROM geofences
      WHERE id = $1 AND deleted_at IS NULL
    `,
      [id],
    )

    if (result.rows.length === 0) {
      throw new Error("Geofence not found")
    }

    return result.rows[0]
  }

  async updateGeofence(id: string, updates: Partial<Geofence>) {
    const sets: string[] = []
    const values: any[] = []
    let paramIndex = 1

    if (updates.name) {
      sets.push(`name = $${paramIndex++}`)
      values.push(updates.name)
    }

    if (updates.geometry) {
      sets.push(`geometry = ST_GeomFromGeoJSON($${paramIndex++})`)
      values.push(JSON.stringify(updates.geometry))
    }

    if (updates.trigger) {
      sets.push(`trigger_type = $${paramIndex++}`)
      values.push(updates.trigger)
    }

    if (updates.isActive !== undefined) {
      sets.push(`is_active = $${paramIndex++}`)
      values.push(updates.isActive)
    }

    sets.push(`updated_at = NOW()`)
    values.push(id)

    const result = await this.db.query(
      `
      UPDATE geofences
      SET ${sets.join(", ")}
      WHERE id = $${paramIndex}
      RETURNING id, tenant_id, name, type,
        ST_AsGeoJSON(geometry)::json as geometry,
        trigger_type, is_active, created_at, updated_at
    `,
      values,
    )

    if (result.rows.length === 0) {
      throw new Error("Geofence not found")
    }

    // Update cache
    await this.cacheGeofence(result.rows[0])

    return result.rows[0]
  }

  async deleteGeofence(id: string) {
    await this.db.query(
      `
      UPDATE geofences
      SET deleted_at = NOW()
      WHERE id = $1
    `,
      [id],
    )

    // Remove from cache
    await this.redis.hdel("geofences", id)

    logger.info(`Deleted geofence ${id}`)
  }

  private async cacheGeofence(geofence: any) {
    await this.redis.hset("geofences", geofence.id, JSON.stringify(geofence))
  }

  async checkGeofenceViolations(location: {
    deviceId: string
    tenantId: string
    latitude: number
    longitude: number
    timestamp: Date
  }) {
    // Get active geofences for tenant from cache
    const geofenceIds = await this.redis.hkeys("geofences")
    const geofences = []

    for (const id of geofenceIds) {
      const data = await this.redis.hget("geofences", id)
      if (data) {
        const geofence = JSON.parse(data)
        if (geofence.tenant_id === location.tenantId && geofence.is_active) {
          geofences.push(geofence)
        }
      }
    }

    const point = turf.point([location.longitude, location.latitude])

    for (const geofence of geofences) {
      const polygon = turf.polygon(geofence.geometry.coordinates)
      const isInside = turf.booleanPointInPolygon(point, polygon)

      // Get previous state
      const stateKey = `geofence:${geofence.id}:device:${location.deviceId}`
      const wasInside = (await this.redis.get(stateKey)) === "true"

      // Update state
      await this.redis.set(stateKey, isInside.toString())

      // Check for trigger
      let triggered = false

      if (geofence.trigger_type === "enter" && isInside && !wasInside) {
        triggered = true
      } else if (geofence.trigger_type === "exit" && !isInside && wasInside) {
        triggered = true
      } else if (geofence.trigger_type === "both" && isInside !== wasInside) {
        triggered = true
      }

      if (triggered) {
        await this.recordViolation({
          geofenceId: geofence.id,
          deviceId: location.deviceId,
          violationType: isInside ? "enter" : "exit",
          location: { lat: location.latitude, lng: location.longitude },
          timestamp: location.timestamp,
        })

        // Publish event
        await this.redis.publish(
          "geofence:violation",
          JSON.stringify({
            geofenceId: geofence.id,
            geofenceName: geofence.name,
            deviceId: location.deviceId,
            violationType: isInside ? "enter" : "exit",
            location: { lat: location.latitude, lng: location.longitude },
            timestamp: location.timestamp,
          }),
        )

        logger.info(`Geofence ${isInside ? "entry" : "exit"} detected for device ${location.deviceId}`)
      }
    }
  }

  private async recordViolation(violation: {
    geofenceId: string
    deviceId: string
    violationType: "enter" | "exit"
    location: { lat: number; lng: number }
    timestamp: Date
  }) {
    await this.db.query(
      `
      INSERT INTO geofence_violations (
        geofence_id, device_id, violation_type, 
        location, created_at
      ) VALUES ($1, $2, $3, ST_SetSRID(ST_MakePoint($4, $5), 4326), $6)
    `,
      [
        violation.geofenceId,
        violation.deviceId,
        violation.violationType,
        violation.location.lng,
        violation.location.lat,
        violation.timestamp,
      ],
    )
  }

  async getViolations(
    geofenceId: string,
    options: {
      startDate?: Date
      endDate?: Date
      limit: number
      offset: number
    },
  ) {
    let query = `
      SELECT 
        id, geofence_id, device_id, violation_type,
        ST_X(location) as longitude,
        ST_Y(location) as latitude,
        created_at
      FROM geofence_violations
      WHERE geofence_id = $1
    `
    const params: any[] = [geofenceId]

    if (options.startDate) {
      params.push(options.startDate)
      query += ` AND created_at >= $${params.length}`
    }

    if (options.endDate) {
      params.push(options.endDate)
      query += ` AND created_at < $${params.length}`
    }

    params.push(options.limit, options.offset)
    query += ` ORDER BY created_at DESC LIMIT $${params.length - 1} OFFSET $${params.length}`

    const result = await this.db.query(query, params)
    return result.rows
  }
}
