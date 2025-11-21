import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native"
import { useQuery } from "@tanstack/react-query"
import { useRoute, useNavigation } from "@react-navigation/native"
import { deviceService } from "../services/device-service"

export function DeviceDetailScreen() {
  const route = useRoute()
  const navigation = useNavigation()
  const { deviceId } = route.params as { deviceId: string }

  const { data: device, isLoading } = useQuery({
    queryKey: ["device", deviceId],
    queryFn: () => deviceService.getDevice(deviceId),
  })

  const handleStartVideo = (channelNumber: number) => {
    navigation.navigate("LiveVideo", {
      deviceId,
      channelNumber,
      streamType: 1, // Sub-stream for mobile
    })
  }

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    )
  }

  if (!device) {
    return (
      <View style={styles.centerContainer}>
        <Text>Device not found</Text>
      </View>
    )
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Serial Number:</Text>
          <Text style={styles.infoValue}>{device.deviceSerial}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>License Plate:</Text>
          <Text style={styles.infoValue}>{device.licensePlate || "N/A"}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Status:</Text>
          <Text style={[styles.infoValue, device.status === "online" && styles.online]}>{device.status}</Text>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Live Video Channels</Text>
        {Array.from({ length: device.numChannels }, (_, i) => (
          <TouchableOpacity key={i} style={styles.channelButton} onPress={() => handleStartVideo(i)}>
            <Text style={styles.channelButtonText}>Channel {i + 1}</Text>
            <Text style={styles.channelButtonArrow}>▶</Text>
          </TouchableOpacity>
        ))}
      </View>

      {device.lastTelemetry && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Latest Telemetry</Text>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Speed:</Text>
            <Text style={styles.infoValue}>{device.lastTelemetry.speed.toFixed(1)} km/h</Text>
          </View>
          <View style={styles.infoRow}>
            <Text style={styles.infoLabel}>Location:</Text>
            <Text style={styles.infoValue}>
              {device.lastTelemetry.latitude.toFixed(6)}, {device.lastTelemetry.longitude.toFixed(6)}
            </Text>
          </View>
        </View>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f9fafb",
  },
  centerContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  section: {
    backgroundColor: "#fff",
    padding: 16,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: "row",
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#f3f4f6",
  },
  infoLabel: {
    flex: 1,
    fontSize: 14,
    color: "#6b7280",
  },
  infoValue: {
    flex: 1,
    fontSize: 14,
    color: "#111827",
    fontWeight: "500",
    textAlign: "right",
  },
  online: {
    color: "#10b981",
  },
  channelButton: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#f9fafb",
    borderRadius: 8,
    marginBottom: 8,
  },
  channelButtonText: {
    fontSize: 16,
    color: "#111827",
    fontWeight: "500",
  },
  channelButtonArrow: {
    fontSize: 16,
    color: "#3b82f6",
  },
})
