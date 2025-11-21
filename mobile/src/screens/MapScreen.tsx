"use client"

import { useEffect, useState } from "react"
import { View, StyleSheet, Text, ActivityIndicator } from "react-native"
import MapView, { Marker, PROVIDER_GOOGLE } from "react-native-maps"
import { useQuery } from "@tanstack/react-query"
import { useWebSocket } from "../contexts/WebSocketContext"
import { deviceService } from "../services/device-service"

interface DeviceMarker {
  id: string
  deviceSerial: string
  licensePlate: string
  latitude: number
  longitude: number
  speed: number
  status: string
}

export function MapScreen() {
  const [deviceMarkers, setDeviceMarkers] = useState<DeviceMarker[]>([])
  const { socket, isConnected } = useWebSocket()

  const { data: devices, isLoading } = useQuery({
    queryKey: ["devices"],
    queryFn: () => deviceService.getDevices(),
    refetchInterval: 30000, // Refetch every 30 seconds
  })

  useEffect(() => {
    if (devices) {
      const markers = devices
        .filter((d: any) => d.lastTelemetry)
        .map((d: any) => ({
          id: d.id,
          deviceSerial: d.deviceSerial,
          licensePlate: d.licensePlate || d.deviceSerial,
          latitude: d.lastTelemetry.latitude,
          longitude: d.lastTelemetry.longitude,
          speed: d.lastTelemetry.speed,
          status: d.status,
        }))
      setDeviceMarkers(markers)
    }
  }, [devices])

  useEffect(() => {
    if (!socket) return

    socket.on("devices.position", (data: any) => {
      setDeviceMarkers((prev) =>
        prev.map((marker) =>
          marker.id === data.deviceId
            ? {
                ...marker,
                latitude: data.latitude,
                longitude: data.longitude,
                speed: data.speed,
              }
            : marker,
        ),
      )
    })

    return () => {
      socket.off("devices.position")
    }
  }, [socket])

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    )
  }

  const initialRegion =
    deviceMarkers.length > 0
      ? {
          latitude: deviceMarkers[0].latitude,
          longitude: deviceMarkers[0].longitude,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }
      : {
          latitude: 22.4,
          longitude: 114.03,
          latitudeDelta: 0.5,
          longitudeDelta: 0.5,
        }

  return (
    <View style={styles.container}>
      <MapView
        style={styles.map}
        provider={PROVIDER_GOOGLE}
        initialRegion={initialRegion}
        showsUserLocation
        showsMyLocationButton
      >
        {deviceMarkers.map((marker) => (
          <Marker
            key={marker.id}
            coordinate={{
              latitude: marker.latitude,
              longitude: marker.longitude,
            }}
            title={marker.licensePlate}
            description={`Speed: ${marker.speed.toFixed(1)} km/h`}
            pinColor={marker.status === "online" ? "#10b981" : "#6b7280"}
          />
        ))}
      </MapView>

      <View style={styles.statusBar}>
        <View style={[styles.statusDot, isConnected && styles.statusDotConnected]} />
        <Text style={styles.statusText}>
          {isConnected ? "Live" : "Offline"} • {deviceMarkers.length} devices
        </Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  map: {
    flex: 1,
  },
  statusBar: {
    position: "absolute",
    top: 60,
    left: 16,
    right: 16,
    backgroundColor: "rgba(255, 255, 255, 0.95)",
    padding: 12,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6b7280",
    marginRight: 8,
  },
  statusDotConnected: {
    backgroundColor: "#10b981",
  },
  statusText: {
    fontSize: 14,
    color: "#374151",
    fontWeight: "500",
  },
})
