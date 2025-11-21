import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase environment variables")
}

// Service role client for TCP server operations (bypasses RLS)
export const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Helper functions for common operations
export const db = {
  async query(sql: string, params: any[] = []) {
    // For raw SQL queries if needed
    const { data, error } = await supabase.rpc("execute_sql", {
      sql_query: sql,
      sql_params: params,
    })

    if (error) throw error
    return data
  },

  // Direct table access
  tenants: supabase.from("tenants"),
  users: supabase.from("users"),
  devices: supabase.from("devices"),
  telemetry: supabase.from("telemetry"),
  alarms: supabase.from("alarms"),
  media_files: supabase.from("media_files"),
}

export default db
