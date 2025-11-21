import Redis from "ioredis"

export const redis = new Redis(process.env.REDIS_URL!, {
  maxRetriesPerRequest: 3,
  enableReadyCheck: true,
  lazyConnect: false,
})

redis.on("error", (err) => {
  console.error("Redis connection error:", err)
})

redis.on("connect", () => {
  console.log("Redis connected")
})

export default redis
