import { View, Text, StyleSheet, FlatList, TouchableOpacity, ActivityIndicator, RefreshControl } from "react-native"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query"
import { deviceService } from "../services/device-service"
import { format } from "date-fns"

export const AlarmsScreen = () => {
  const queryClient = useQueryClient()

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["alarms"],
    queryFn: () => deviceService.getAlarms(),
  })

  const acknowledgeMutation = useMutation({
    mutationFn: (alarmId: string) => deviceService.acknowledgeAlarm(alarmId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["alarms"] })
    },
  })

  const alarms = data?.alarms || []

  const renderAlarm = ({ item }: any) => {
    const isActive = item.status === "active"

    return (
      <View style={[styles.alarmCard, isActive && styles.activeAlarmCard]}>
        <View style={styles.alarmHeader}>
          <View style={[styles.alarmBadge, { backgroundColor: getAlarmColor(item.alarm_type) }]}>
            <Text style={styles.alarmBadgeText}>{item.alarm_type}</Text>
          </View>
          <Text style={styles.alarmTime}>{format(new Date(item.triggered_at), "MMM dd, HH:mm")}</Text>
        </View>

        <Text style={styles.deviceInfo}>
          {item.plate_number} ({item.serial_number})
        </Text>

        {item.alarm_name && <Text style={styles.alarmDescription}>{item.alarm_name}</Text>}

        {item.location && (
          <Text style={styles.locationText}>
            📍 Lat: {item.location.coordinates[1].toFixed(6)}, Lng: {item.location.coordinates[0].toFixed(6)}
          </Text>
        )}

        {isActive && (
          <TouchableOpacity
            style={styles.acknowledgeButton}
            onPress={() => acknowledgeMutation.mutate(item.id)}
            disabled={acknowledgeMutation.isPending}
          >
            <Text style={styles.acknowledgeButtonText}>
              {acknowledgeMutation.isPending ? "Acknowledging..." : "Acknowledge"}
            </Text>
          </TouchableOpacity>
        )}

        {item.status === "acknowledged" && (
          <Text style={styles.statusText}>
            ✓ Acknowledged {item.acknowledged_at && `on ${format(new Date(item.acknowledged_at), "MMM dd, HH:mm")}`}
          </Text>
        )}
      </View>
    )
  }

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
        <Text style={styles.title}>Alarms</Text>
        <View style={styles.stats}>
          <Text style={styles.statText}>Active: {alarms.filter((a: any) => a.status === "active").length}</Text>
        </View>
      </View>

      <FlatList
        data={alarms}
        renderItem={renderAlarm}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={isLoading} onRefresh={refetch} />}
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Text style={styles.emptyText}>No alarms</Text>
          </View>
        }
      />
    </View>
  )
}

function getAlarmColor(type: string): string {
  switch (type) {
    case "speed":
      return "#ef4444"
    case "geofence":
      return "#f59e0b"
    case "harsh_braking":
      return "#f97316"
    case "custom":
      return "#8b5cf6"
    default:
      return "#6b7280"
  }
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
    backgroundColor: "#fff",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#e5e7eb",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#111827",
  },
  stats: {
    marginTop: 8,
  },
  statText: {
    fontSize: 14,
    color: "#6b7280",
  },
  list: {
    padding: 16,
  },
  alarmCard: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: "#e5e7eb",
  },
  activeAlarmCard: {
    borderColor: "#ef4444",
    borderWidth: 2,
  },
  alarmHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  alarmBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  alarmBadgeText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  alarmTime: {
    fontSize: 12,
    color: "#6b7280",
  },
  deviceInfo: {
    fontSize: 16,
    fontWeight: "600",
    color: "#111827",
    marginBottom: 4,
  },
  alarmDescription: {
    fontSize: 14,
    color: "#4b5563",
    marginBottom: 8,
  },
  locationText: {
    fontSize: 12,
    color: "#6b7280",
    marginBottom: 8,
  },
  acknowledgeButton: {
    backgroundColor: "#3b82f6",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 8,
  },
  acknowledgeButtonText: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
  },
  statusText: {
    fontSize: 12,
    color: "#10b981",
    marginTop: 8,
  },
  emptyContainer: {
    padding: 32,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 16,
    color: "#9ca3af",
  },
})
