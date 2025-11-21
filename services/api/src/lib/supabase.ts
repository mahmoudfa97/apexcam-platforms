import { createClient } from "@supabase/supabase-js"
import type { Database } from "./database.types"

const supabaseUrl = process.env.SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Missing Supabase environment variables")
}

// Service role client for API operations (bypasses RLS when needed)
export const supabaseAdmin = createClient<Database>(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
})

// Helper to create a client with user context (respects RLS)
export function createSupabaseClient(accessToken?: string) {
  if (!accessToken) {
    return createClient<Database>(supabaseUrl, process.env.SUPABASE_ANON_KEY || supabaseServiceKey)
  }

  return createClient<Database>(supabaseUrl, process.env.SUPABASE_ANON_KEY || supabaseServiceKey, {
    global: {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  })
}

// Storage helpers for Supabase Storage
export const storage = {
  async uploadFile(bucket: string, path: string, file: Buffer, contentType: string) {
    const { data, error } = await supabaseAdmin.storage.from(bucket).upload(path, file, {
      contentType,
      upsert: false,
    })

    if (error) throw error
    return data
  },

  async getPublicUrl(bucket: string, path: string) {
    const { data } = supabaseAdmin.storage.from(bucket).getPublicUrl(path)

    return data.publicUrl
  },

  async downloadFile(bucket: string, path: string) {
    const { data, error } = await supabaseAdmin.storage.from(bucket).download(path)

    if (error) throw error
    return data
  },

  async deleteFile(bucket: string, path: string) {
    const { error } = await supabaseAdmin.storage.from(bucket).remove([path])

    if (error) throw error
  },
}
