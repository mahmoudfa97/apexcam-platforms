"use client"

import { cn } from "@/lib/utils"

import { useEffect, useState } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Video, AlertTriangle, MapPin, Activity } from "lucide-react"

export default function DashboardPage() {
  const [stats, setStats] = useState({
    totalDevices: 0,
    activeDevices: 0,
    alarms: 0,
    onlineDevices: 0,
  })

  useEffect(() => {
    // Fetch dashboard stats
    const fetchStats = async () => {
      try {
        const token = localStorage.getItem("mdvr_auth_token")
        const response = await fetch("/api/dashboard/stats", {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })
        if (response.ok) {
          const data = await response.json()
          setStats(data)
        }
      } catch (error) {
        console.error("Failed to fetch stats:", error)
      }
    }

    fetchStats()
    const interval = setInterval(fetchStats, 30000) // Refresh every 30s
    return () => clearInterval(interval)
  }, [])

  const statCards = [
    {
      title: "Total Devices",
      value: stats.totalDevices,
      description: "Registered devices",
      icon: Video,
      color: "text-blue-500",
    },
    {
      title: "Online Devices",
      value: stats.onlineDevices,
      description: "Currently connected",
      icon: Activity,
      color: "text-green-500",
    },
    {
      title: "Active Streams",
      value: stats.activeDevices,
      description: "Live video streams",
      icon: MapPin,
      color: "text-purple-500",
    },
    {
      title: "Active Alarms",
      value: stats.alarms,
      description: "Unacknowledged alarms",
      icon: AlertTriangle,
      color: "text-red-500",
    },
  ]

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">Monitor your fleet in real-time</p>
      </div>

      {/* Stats Grid */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon
          return (
            <Card key={stat.title}>
              <CardHeader className="flex flex-row items-center justify-between pb-2">
                <CardTitle className="text-sm font-medium">{stat.title}</CardTitle>
                <Icon className={cn("size-4", stat.color)} />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{stat.value}</div>
                <p className="text-xs text-muted-foreground">{stat.description}</p>
              </CardContent>
            </Card>
          )
        })}
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
          <CardDescription>Latest events from your fleet</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Badge variant="outline">Device Connected</Badge>
              <span className="text-sm">Device #00007 connected</span>
              <span className="text-xs text-muted-foreground ml-auto">2 min ago</span>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant="destructive">Alarm</Badge>
              <span className="text-sm">Speed violation detected</span>
              <span className="text-xs text-muted-foreground ml-auto">5 min ago</span>
            </div>
            <div className="flex items-center gap-4">
              <Badge variant="outline">Video Started</Badge>
              <span className="text-sm">Live stream initiated</span>
              <span className="text-xs text-muted-foreground ml-auto">10 min ago</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
