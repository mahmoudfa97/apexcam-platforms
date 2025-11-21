"use client"

import { redirect } from "next/navigation"
import { useEffect } from "react"

export default function HomePage() {
  useEffect(() => {
    // Check if user is authenticated, if so redirect to dashboard
    const token = localStorage.getItem("mdvr_auth_token")
    if (token) {
      redirect("/dashboard")
    } else {
      redirect("/login")
    }
  }, [])

  return null
}
