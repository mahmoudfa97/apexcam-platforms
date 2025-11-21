"use client"

import { useEffect, useState } from "react"
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, Alert } from "react-native"
import { useRoute, useNavigation } from "@react-navigation/native"
import { deviceService } from "../services/device-service"

interface RouteParams {
  deviceId: string
  channel: number
}

export const LiveVideoScreen = () => {
  const route = useRoute()
  const navigation = useNavigation()
  const { deviceId, channel } = route.params as RouteParams

  const [loading, setLoading] = useState(true)
  const [streamUrl, setStreamUrl] = useState<string | null>(null)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    startStream()

    return () => {
      if (sessionId) {
        stopStream()
      }
    }
  }, [deviceId, channel])

  const startStream = async () => {
    try {
      setLoading(true)
      setError(null)

      const response = await deviceService.startLiveStream(deviceId, channel)
      setStreamUrl(response.streamUrl)
      setSessionId(response.sessionId)
    } catch (err: any) {
      setError(err.message || "Failed to start stream")
      Alert.alert("Error", err.message || "Failed to start stream")
    } finally {
      setLoading(false)
    }
  }

  const stopStream = async () => {
    if (!sessionId) return

    try {
      await deviceService.stopLiveStream(sessionId)
    } catch (err) {
      console.error("Failed to stop stream:", err)
    }
  }

  if (loading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="#3b82f6" />
        <Text style={styles.loadingText}>Starting live stream...</Text>
      </View>
    )
  }

  if (error) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>{error}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={startStream}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.videoContainer}>
        <Text style={styles.placeholderText}>Video Player Component</Text>
        <Text style={styles.streamInfo}>Stream URL: {streamUrl}</Text>
        <Text style={styles.streamInfo}>Channel: {channel}</Text>
      </View>

      <View style={styles.controls}>
        <TouchableOpacity
          style={styles.controlButton}
          onPress={() => {
            stopStream()
            navigation.goBack()
          }}
        >
          <Text style={styles.controlButtonText}>Stop Stream</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    color: "#fff",
    marginTop: 16,
    fontSize: 16,
  },
  errorText: {
    color: "#ef4444",
    fontSize: 16,
    textAlign: "center",
    paddingHorizontal: 32,
  },
  retryButton: {
    marginTop: 24,
    backgroundColor: "#3b82f6",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  videoContainer: {
    flex: 1,
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
  },
  placeholderText: {
    color: "#fff",
    fontSize: 18,
    fontWeight: "600",
  },
  streamInfo: {
    color: "#9ca3af",
    fontSize: 12,
    marginTop: 8,
  },
  controls: {
    padding: 16,
    width: "100%",
  },
  controlButton: {
    backgroundColor: "#ef4444",
    padding: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  controlButtonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
})
