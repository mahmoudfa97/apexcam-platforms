import { createClient } from "@supabase/supabase-js"

if (!process.env.SUPABASE_URL) {
  throw new Error("Missing SUPABASE_URL environment variable")
}

if (!process.env.SUPABASE_ANON_KEY) {
  throw new Error("Missing SUPABASE_ANON_KEY environment variable")
}

// Client for browser/client-side usage
export const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY)

// Service role client for server-side operations (bypasses RLS)
export const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  },
)

// Database types (auto-generated from Supabase)
export type Database = {
  public: {
    Tables: {
      tenants: {
        Row: {
          id: string
          name: string
          slug: string
          settings: any
          subscription_tier: string
          subscription_status: string
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["tenants"]["Row"], "id" | "created_at" | "updated_at">
        Update: Partial<Database["public"]["Tables"]["tenants"]["Insert"]>
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
        Insert: Omit<Database["public"]["Tables"]["users"]["Row"], "id" | "created_at" | "updated_at">
        Update: Partial<Database["public"]["Tables"]["users"]["Insert"]>
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
          is_online: boolean
          last_seen_at: string | null
          settings: any
          created_at: string
          updated_at: string
        }
        Insert: Omit<Database["public"]["Tables"]["devices"]["Row"], "id" | "created_at" | "updated_at">
        Update: Partial<Database["public"]["Tables"]["devices"]["Insert"]>
      }
    }
  }
}
