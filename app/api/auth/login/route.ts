import { type NextRequest, NextResponse } from "next/server"

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json()

    // TODO: Replace with actual Supabase auth
    // For now, return mock data for development
    if (email && password) {
      return NextResponse.json({
        token: "mock-jwt-token-" + Date.now(),
        user: {
          id: "1",
          email,
          name: "Admin User",
          role: "admin",
        },
      })
    }

    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 })
  } catch (error) {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 })
  }
}
