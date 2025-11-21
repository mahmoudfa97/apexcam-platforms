import { neon } from "@neondatabase/serverless"

export const sql = neon(process.env.DATABASE_URL!)

export const db = {
  query: sql,
}

export default db
