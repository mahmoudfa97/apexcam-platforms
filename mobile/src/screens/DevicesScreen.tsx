import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from "react-native"
import { useQuery } from "@tanstack/react-query"
import { useNavigation } from "@react-navigation/native"
import { deviceService } from "../services/device-service"

export function DevicesScreen() {
  const navigation = useNavigation()
  const {
    data: devices,
    isLoading,
    refetch,
    isRefreshing,
  } = useQuery({
    queryKey: ["devices"],
    queryFn: () => deviceService.getDevices(),
  })

  const renderDevice = ({ item }: { item: any }) => (
    <TouchableOpacity
      style={styles.deviceCard}
      onPress={() => navigation.navigate("DeviceDetail", { deviceId: item.id })}
    >
      <View style={styles.deviceHeader}>
        <Text style={styles.deviceTitle}>{item.licensePlate || item.deviceSerial}</Text>
        <View style={[styles.statusBadge, item.status === "online" && styles.statusBadgeOnline]}>
          <Text style={styles.statusText}>{item.status === "online" ? "Online" : "Offline"}</Text>
        </View>
      </View>

      <Text style={styles.deviceSerial}>{item.deviceSerial}</Text>

      {item.lastTelemetry && (
        <View style={styles.telemetryRow}>
          <Text style={styles.telemetryLabel}>Speed:</Text>
          <Text style={styles.telemetryValue}>{item.lastTelemetry.speed.toFixed(1)} km/h</Text>
        </View>
      )}

      <Text style={styles.lastSeen}>Last seen: {new Date(item.lastSeenAt).toLocaleString()}</Text>
    </TouchableOpacity>
  )

  if (isLoading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    )
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Devices</Text>
        <Text style={styles.headerSubtitle}>{devices?.length || 0} devices</Text>
      </View>

      <FlatList
        data={devices}
        renderItem={renderDevice}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isRefreshing} onRefresh={refetch} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No devices found</Text>
          </View>
        }
      />
    </View>
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
  header: {
    padding: 24,
    paddingTop: 60,
    backgroundColor: "#fff",
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#111827",
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: "#6b7280",
  },
  list: {
    padding: 16,
    gap: 12,
  },
  deviceCard: {
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  deviceHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  deviceTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#111827",
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
    backgroundColor: "#f3f4f6",
  },
  statusBadgeOnline: {
    backgroundColor: "#d1fae5",
  },
  statusText: {
    fontSize: 12,
    fontWeight: "500",
    color: "#6b7280",
  },
  deviceSerial: {
    fontSize: 14,
    color: "#6b7280",
    marginBottom: 12,
  },
  telemetryRow: {
    flexDirection: "row",
    marginBottom: 8,
  },
  telemetryLabel: {
    fontSize: 14,
    color: "#6b7280",
    marginRight: 8,
  },
  telemetryValue: {
    fontSize: 14,
    fontWeight: "500",
    color: "#111827",
  },
  lastSeen: {
    fontSize: 12,
    color: "#9ca3af",
    marginTop: 8,
  },
  emptyContainer: {
    padding: 48,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#6b7280",
  },
})
