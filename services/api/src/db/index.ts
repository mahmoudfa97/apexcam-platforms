import { neon } from "@neondatabase/serverless"

export const sql = neon(process.env.DATABASE_URL!)

export const db = {
  query: sql,
  end: async () => {
    // Neon serverless doesn't require explicit connection closing
  },
}

export default db
