import { type NextRequest, NextResponse } from "next/server"

export async function GET(request: NextRequest) {
  try {
    // TODO: Replace with actual Supabase queries
    // For now, return mock data for development
    return NextResponse.json({
      devices: [
        {
          id: "1",
          serial_number: "00007",
          license_plate: "ABC-123",
          status: "online",
          last_seen: new Date().toISOString(),
          last_location: { lat: 22.67, lng: 114.06 },
        },
        {
          id: "2",
          serial_number: "00008",
          license_plate: "XYZ-789",
          status: "offline",
          last_seen: new Date(Date.now() - 3600000).toISOString(),
          last_location: { lat: 22.68, lng: 114.05 },
        },
      ],
    })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
