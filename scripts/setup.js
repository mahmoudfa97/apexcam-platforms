#!/usr/bin/env node

const fs = require("fs")
const path = require("path")
const { execSync } = require("child_process")

console.log("🚀 MDVR Platform Setup Script\n")

// Check Node.js version
const nodeVersion = process.version
const majorVersion = Number.parseInt(nodeVersion.split(".")[0].slice(1))
if (majorVersion < 18) {
  console.error("❌ Node.js 18 or higher is required")
  process.exit(1)
}
console.log("✅ Node.js version:", nodeVersion)

// Check for required environment variables
const requiredEnvVars = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY", "SUPABASE_ANON_KEY"]

console.log("\n📋 Checking environment variables...")
const missingVars = requiredEnvVars.filter((varName) => !process.env[varName])
if (missingVars.length > 0) {
  console.warn("⚠️  Missing environment variables:", missingVars.join(", "))
  console.warn("Please copy .env.example to .env and fill in the values")
} else {
  console.log("✅ All required environment variables are set")
}

// List of services to install
const services = [
  "services/api",
  "services/tcp-signaling",
  "services/tcp-media",
  "services/media-worker",
  "services/billing",
  "services/ai-analytics",
  "services/websocket",
  "tools/device-simulator",
  "mobile",
]

console.log("\n📦 Installing dependencies...\n")

// Install root dependencies
console.log("Installing root dependencies...")
try {
  execSync("npm install", { stdio: "inherit" })
  console.log("✅ Root dependencies installed\n")
} catch (error) {
  console.error("❌ Failed to install root dependencies")
  process.exit(1)
}

// Install service dependencies
for (const service of services) {
  const servicePath = path.join(process.cwd(), service)
  if (fs.existsSync(servicePath)) {
    console.log(`Installing ${service} dependencies...`)
    try {
      execSync("npm install", { cwd: servicePath, stdio: "inherit" })
      console.log(`✅ ${service} dependencies installed\n`)
    } catch (error) {
      console.error(`❌ Failed to install ${service} dependencies`)
    }
  } else {
    console.warn(`⚠️  ${service} directory not found, skipping...`)
  }
}

console.log("\n✨ Setup complete!\n")
console.log("Next steps:")
console.log("1. Set up your Supabase project and update .env files")
console.log("2. Run database migrations in Supabase SQL Editor")
console.log("3. Start development with: docker-compose up")
console.log("\nFor more information, see docs/INSTALLATION.md\n")
