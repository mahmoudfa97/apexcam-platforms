#!/usr/bin/env node

import net from "net"
import { Command } from "commander"

const program = new Command()

program.name("mdvr-simulator").description("MDVR Device Simulator for testing").version("1.0.0")

program
  .option("-h, --host <host>", "Server host", "localhost")
  .option("-p, --port <port>", "Server port", "1087")
  .option("-s, --serial <serial>", "Device serial number", "00007")
  .option("-i, --interval <seconds>", "Location report interval", "10")
  .option("--license-plate <plate>", "License plate number", "DEMO123")
  .option("--imei <imei>", "IMEI number", "123456789012345")

program.parse()

const options = program.opts()

class MDVRSimulator {
  private socket: net.Socket | null = null
  private deviceSerial: string
  private connected = false
  private locationInterval: NodeJS.Timeout | null = null
  private latitude = 22.4
  private longitude = 114.03

  constructor(
    private host: string,
    private port: number,
    serial: string,
    private intervalSeconds: number,
    private licensePlate: string,
    private imei: string,
  ) {
    this.deviceSerial = serial
  }

  async start() {
    console.log(`Starting MDVR Simulator for device ${this.deviceSerial}`)
    console.log(`Connecting to ${this.host}:${this.port}...`)

    this.socket = new net.Socket()

    this.socket.on("connect", () => {
      console.log("Connected to server")
      this.connected = true
      this.sendRegistration()
    })

    this.socket.on("data", (data) => {
      const message = data.toString()
      console.log("Received:", message)
      this.handleResponse(message)
    })

    this.socket.on("close", () => {
      console.log("Connection closed")
      this.connected = false
      if (this.locationInterval) {
        clearInterval(this.locationInterval)
      }
    })

    this.socket.on("error", (error) => {
      console.error("Socket error:", error.message)
    })

    this.socket.connect(this.port, this.host)
  }

  private sendRegistration() {
    const timestamp = this.getCurrentTimestamp()
    const location = this.buildLocationStatus()

    const message = `$$dc0227,1,V101,${this.deviceSerial},,${timestamp},${location},,V1.0.0.1,4108,,0,0,${this.licensePlate},2,,1,1,2,101,${this.imei},D2017120781,V6.1.45 20160519,#`

    this.send(message)
    console.log("Sent V101 Registration")
  }

  private sendHeartbeat() {
    const timestamp = this.getCurrentTimestamp()
    const message = `$$dc0029,${this.getRandomSerial()},V109,${this.deviceSerial},,${timestamp}#`

    this.send(message)
    console.log("Sent V109 Heartbeat")
  }

  private sendLocationReport() {
    const timestamp = this.getCurrentTimestamp()
    const location = this.buildLocationStatus()

    // Simulate movement
    this.latitude += (Math.random() - 0.5) * 0.0001
    this.longitude += (Math.random() - 0.5) * 0.0001

    const message = `$$dc0165,${this.getRandomSerial()},V114,${this.deviceSerial},,${timestamp},${location},1#`

    this.send(message)
    console.log(`Sent V114 Location Report (${this.latitude.toFixed(6)}, ${this.longitude.toFixed(6)})`)
  }

  private sendAlarm() {
    const timestamp = this.getCurrentTimestamp()
    const location = this.buildLocationStatus()
    const alarmUid = this.generateAlarmUid()

    const message = `$$dc0203,${this.getRandomSerial()},V201,${this.deviceSerial},,${timestamp},${location},${timestamp},${alarmUid},0,,0,,2,0,#`

    this.send(message)
    console.log(`Sent V201 Alarm Start (UID: ${alarmUid})`)

    // Send alarm end after 5 seconds
    setTimeout(() => {
      const endTimestamp = this.getCurrentTimestamp()
      const endLocation = this.buildLocationStatus()
      const endMessage = `$$dc0202,${this.getRandomSerial()},V251,${this.deviceSerial},,${endTimestamp},${endLocation},${endTimestamp},${alarmUid},0,,0,,2,0,#`

      this.send(endMessage)
      console.log(`Sent V251 Alarm End (UID: ${alarmUid})`)
    }, 5000)
  }

  private handleResponse(message: string) {
    if (message.includes("C100") && message.includes("V101")) {
      console.log("Registration acknowledged")
      this.startPeriodicReports()
    }
  }

  private startPeriodicReports() {
    // Send heartbeat every 30 seconds
    setInterval(() => {
      if (this.connected) {
        this.sendHeartbeat()
      }
    }, 30000)

    // Send location reports at specified interval
    this.locationInterval = setInterval(() => {
      if (this.connected) {
        this.sendLocationReport()
      }
    }, this.intervalSeconds * 1000)

    // Send random alarm every 2 minutes
    setInterval(() => {
      if (this.connected && Math.random() > 0.7) {
        this.sendAlarm()
      }
    }, 120000)

    // Send first location report immediately
    setTimeout(() => this.sendLocationReport(), 1000)
  }

  private buildLocationStatus(): string {
    const satellites = 10
    const speed = (Math.random() * 60).toFixed(2)
    const course = (Math.random() * 360).toFixed(0)
    const mileage = Math.floor(Math.random() * 1000000)

    // Convert decimal degrees to protocol format (degrees, minutes, seconds)
    const lonDeg = Math.floor(this.longitude)
    const lonMin = Math.floor((this.longitude - lonDeg) * 60)
    const lonSec = Math.floor(((this.longitude - lonDeg) * 60 - lonMin) * 60 * 1000000)

    const latDeg = Math.floor(this.latitude)
    const latMin = Math.floor((this.latitude - latDeg) * 60)
    const latSec = Math.floor(((this.latitude - latDeg) * 60 - latMin) * 60 * 1000000)

    return `A00${satellites},${lonDeg},${lonMin},${lonSec},${latDeg},${latMin},${latSec},${speed},${course},000E00010101D383,0000000000000000,0.00,0.00,0.00,${mileage},0.00,0,0|0.00|0|0|0|0|0|0|0`
  }

  private getCurrentTimestamp(): string {
    const now = new Date()
    const yy = String(now.getFullYear()).slice(2)
    const mm = String(now.getMonth() + 1).padStart(2, "0")
    const dd = String(now.getDate()).padStart(2, "0")
    const hh = String(now.getHours()).padStart(2, "0")
    const min = String(now.getMinutes()).padStart(2, "0")
    const ss = String(now.getSeconds()).padStart(2, "0")

    return `${yy}${mm}${dd} ${hh}${min}${ss}`
  }

  private generateAlarmUid(): string {
    return Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 16)
        .toString(16)
        .toUpperCase(),
    ).join("")
  }

  private getRandomSerial(): number {
    return Math.floor(Math.random() * 1000)
  }

  private send(message: string) {
    if (this.socket && this.connected) {
      this.socket.write(message)
    }
  }

  stop() {
    if (this.locationInterval) {
      clearInterval(this.locationInterval)
    }
    if (this.socket) {
      this.socket.destroy()
    }
  }
}

// Create and start simulator
const simulator = new MDVRSimulator(
  options.host,
  Number.parseInt(options.port, 10),
  options.serial,
  Number.parseInt(options.interval, 10),
  options.licensePlate,
  options.imei,
)

simulator.start()

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log("\nShutting down simulator...")
  simulator.stop()
  process.exit(0)
})

process.on("SIGTERM", () => {
  console.log("\nShutting down simulator...")
  simulator.stop()
  process.exit(0)
})
