import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase environment variables")
}

export const supabase = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

export const db = {
  devices: supabase.from("devices"),
  media_files: supabase.from("media_files"),
  alarms: supabase.from("alarms"),
}

// Supabase Storage helper
export const storage = {
  async uploadFile(bucket: string, path: string, file: Buffer, contentType: string) {
    const { data, error } = await supabase.storage.from(bucket).upload(path, file, {
      contentType,
      upsert: false,
    })

    if (error) throw error
    return data
  },

  async getPublicUrl(bucket: string, path: string) {
    const { data } = supabase.storage.from(bucket).getPublicUrl(path)

    return data.publicUrl
  },
}

export default db
