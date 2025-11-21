import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    // TODO: Replace with actual Supabase queries
    // For now, return mock data for development
    return NextResponse.json({
      totalDevices: 24,
      onlineDevices: 18,
      activeDevices: 12,
      alarms: 3,
    })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
