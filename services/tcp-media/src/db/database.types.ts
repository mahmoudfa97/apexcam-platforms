export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export interface Database {
  public: {
    Tables: {
      devices: {
        Row: {
          id: string
          tenant_id: string
          device_serial: string
          license_plate: string | null
          device_type: string
          protocol_version: string
          firmware_version: string | null
          is_online: boolean
          last_seen_at: string | null
          settings: Json
          created_at: string
          updated_at: string
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
      }
      alarms: {
        Row: {
          id: string
          tenant_id: string
          device_id: string
          alarm_uid: string
        }
      }
    }
  }
}
