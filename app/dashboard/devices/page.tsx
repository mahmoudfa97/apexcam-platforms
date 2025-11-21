"use client"

import { useEffect, useState } from "react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Video, MapPin, Play, Search } from "lucide-react"

export default function DevicesPage() {
  const [devices, setDevices] = useState<any[]>([])
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchDevices = async () => {
      try {
        const token = localStorage.getItem("mdvr_auth_token")
        const response = await fetch("/api/devices", {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (response.ok) {
          const data = await response.json()
          setDevices(data.devices || [])
        }
      } catch (error) {
        console.error("Failed to fetch devices:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchDevices()
  }, [])

  const filteredDevices = devices.filter(
    (device) =>
      device.serial_number?.toLowerCase().includes(search.toLowerCase()) ||
      device.license_plate?.toLowerCase().includes(search.toLowerCase()),
  )

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Devices</h1>
          <p className="text-muted-foreground">Manage your MDVR devices</p>
        </div>
        <Button>
          <Video className="size-4" />
          Add Device
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <Input
                placeholder="Search by serial number or license plate..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Loading devices...</div>
          ) : filteredDevices.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">No devices found</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Serial Number</TableHead>
                  <TableHead>License Plate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Last Seen</TableHead>
                  <TableHead>Location</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredDevices.map((device) => (
                  <TableRow key={device.id}>
                    <TableCell className="font-medium">{device.serial_number}</TableCell>
                    <TableCell>{device.license_plate || "N/A"}</TableCell>
                    <TableCell>
                      <Badge variant={device.status === "online" ? "default" : "secondary"}>{device.status}</Badge>
                    </TableCell>
                    <TableCell>{device.last_seen ? new Date(device.last_seen).toLocaleString() : "Never"}</TableCell>
                    <TableCell>
                      {device.last_location ? (
                        <span className="flex items-center gap-1">
                          <MapPin className="size-3" />
                          {device.last_location.lat?.toFixed(4)}, {device.last_location.lng?.toFixed(4)}
                        </span>
                      ) : (
                        "Unknown"
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline">
                          <Play className="size-3" />
                          Live
                        </Button>
                        <Button size="sm" variant="ghost">
                          Details
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
