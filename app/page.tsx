import { redirect } from "next/navigation"
import { cookies } from "next/headers"

export default async function HomePage() {
  // Check for auth token in cookies
  const cookieStore = await cookies()
  const token = cookieStore.get("mdvr_auth_token")

  if (token) {
    redirect("/dashboard")
  } else {
    redirect("/login")
  }
}
