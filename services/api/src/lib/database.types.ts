export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          name: string
          slug: string
          settings: Json
          subscription_tier: string
          subscription_status: string
          billing_email: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          name: string
          slug: string
          settings?: Json
          subscription_tier?: string
          subscription_status?: string
          billing_email?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          name?: string
          slug?: string
          settings?: Json
          subscription_tier?: string
          subscription_status?: string
          billing_email?: string | null
          updated_at?: string
        }
      }
      users: {
        Row: {
          id: string
          tenant_id: string
          email: string
          full_name: string | null
          role: string
          is_active: boolean
          last_login_at: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          email: string
          full_name?: string | null
          role?: string
          is_active?: boolean
          last_login_at?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          email?: string
          full_name?: string | null
          role?: string
          is_active?: boolean
          last_login_at?: string | null
          updated_at?: string
        }
      }
      devices: {
        Row: {
          id: string
          tenant_id: string
          device_serial: string
          license_plate: string | null
          device_type: string
          protocol_version: string
          firmware_version: string | null
          network_type: string | null
          imei: string | null
          is_online: boolean
          last_seen_at: string | null
          last_location: Json | null
          settings: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          device_serial: string
          license_plate?: string | null
          device_type: string
          protocol_version: string
          firmware_version?: string | null
          network_type?: string | null
          imei?: string | null
          is_online?: boolean
          last_seen_at?: string | null
          last_location?: Json | null
          settings?: Json
          created_at?: string
          updated_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          device_serial?: string
          license_plate?: string | null
          device_type?: string
          protocol_version?: string
          firmware_version?: string | null
          network_type?: string | null
          imei?: string | null
          is_online?: boolean
          last_seen_at?: string | null
          last_location?: Json | null
          settings?: Json
          updated_at?: string
        }
      }
      telemetry: {
        Row: {
          id: string
          tenant_id: string
          device_id: string
          timestamp: string
          location: unknown
          gps_status: string
          speed: number
          heading: number
          altitude: number
          satellites: number
          component_status: string
          temperature: number | null
          mileage: number | null
          fuel_level: number | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          device_id: string
          timestamp: string
          location: unknown
          gps_status: string
          speed?: number
          heading?: number
          altitude?: number
          satellites?: number
          component_status?: string
          temperature?: number | null
          mileage?: number | null
          fuel_level?: number | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          device_id?: string
          timestamp?: string
          location?: unknown
          gps_status?: string
          speed?: number
          heading?: number
          altitude?: number
          satellites?: number
          component_status?: string
          temperature?: number | null
          mileage?: number | null
          fuel_level?: number | null
        }
      }
      alarms: {
        Row: {
          id: string
          tenant_id: string
          device_id: string
          alarm_uid: string
          alarm_type: string
          alarm_source: string
          severity: string
          status: string
          start_time: string
          end_time: string | null
          location: unknown | null
          metadata: Json
          acknowledged_at: string | null
          acknowledged_by: string | null
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          device_id: string
          alarm_uid: string
          alarm_type: string
          alarm_source?: string
          severity?: string
          status?: string
          start_time: string
          end_time?: string | null
          location?: unknown | null
          metadata?: Json
          acknowledged_at?: string | null
          acknowledged_by?: string | null
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          device_id?: string
          alarm_uid?: string
          alarm_type?: string
          alarm_source?: string
          severity?: string
          status?: string
          start_time?: string
          end_time?: string | null
          location?: unknown | null
          metadata?: Json
          acknowledged_at?: string | null
          acknowledged_by?: string | null
        }
      }
      media_files: {
        Row: {
          id: string
          tenant_id: string
          device_id: string
          alarm_id: string | null
          file_type: string
          file_path: string
          storage_path: string
          file_size: number
          duration: number | null
          channel: number
          start_time: string
          end_time: string | null
          thumbnail_path: string | null
          hls_path: string | null
          processing_status: string
          created_at: string
        }
        Insert: {
          id?: string
          tenant_id: string
          device_id: string
          alarm_id?: string | null
          file_type: string
          file_path: string
          storage_path: string
          file_size: number
          duration?: number | null
          channel: number
          start_time: string
          end_time?: string | null
          thumbnail_path?: string | null
          hls_path?: string | null
          processing_status?: string
          created_at?: string
        }
        Update: {
          id?: string
          tenant_id?: string
          device_id?: string
          alarm_id?: string | null
          file_type?: string
          file_path?: string
          storage_path?: string
          file_size?: number
          duration?: number | null
          channel?: number
          start_time?: string
          end_time?: string | null
          thumbnail_path?: string | null
          hls_path?: string | null
          processing_status?: string
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
