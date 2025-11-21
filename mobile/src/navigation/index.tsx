"use client"
import { NavigationContainer } from "@react-navigation/native"
import { createNativeStackNavigator } from "@react-navigation/native-stack"
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs"
import { useAuth } from "../contexts/AuthContext"

// Screens
import { LoginScreen } from "../screens/LoginScreen"
import { MapScreen } from "../screens/MapScreen"
import { DevicesScreen } from "../screens/DevicesScreen"
import { DeviceDetailScreen } from "../screens/DeviceDetailScreen"
import { LiveVideoScreen } from "../screens/LiveVideoScreen"
import { AlarmsScreen } from "../screens/AlarmsScreen"
import { ProfileScreen } from "../screens/ProfileScreen"

const Stack = createNativeStackNavigator()
const Tab = createBottomTabNavigator()

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: "#3b82f6",
        tabBarInactiveTintColor: "#6b7280",
        tabBarStyle: {
          backgroundColor: "#ffffff",
          borderTopWidth: 1,
          borderTopColor: "#e5e7eb",
        },
      }}
    >
      <Tab.Screen
        name="Map"
        component={MapScreen}
        options={{
          tabBarLabel: "Map",
          tabBarIcon: ({ color, size }) => <MapIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Devices"
        component={DevicesScreen}
        options={{
          tabBarLabel: "Devices",
          tabBarIcon: ({ color, size }) => <DeviceIcon color={color} size={size} />,
        }}
      />
      <Tab.Screen
        name="Alarms"
        component={AlarmsScreen}
        options={{
          tabBarLabel: "Alarms",
          tabBarIcon: ({ color, size }) => <AlarmIcon color={color} size={size} />,
          tabBarBadge: undefined, // Will be set dynamically
        }}
      />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          tabBarLabel: "Profile",
          tabBarIcon: ({ color, size }) => <ProfileIcon color={color} size={size} />,
        }}
      />
    </Tab.Navigator>
  )
}

export function Navigation() {
  const { isAuthenticated, isLoading } = useAuth()

  if (isLoading) {
    return null // Or loading screen
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!isAuthenticated ? (
          <Stack.Screen name="Login" component={LoginScreen} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} />
            <Stack.Screen
              name="DeviceDetail"
              component={DeviceDetailScreen}
              options={{ headerShown: true, title: "Device Details" }}
            />
            <Stack.Screen
              name="LiveVideo"
              component={LiveVideoScreen}
              options={{ headerShown: true, title: "Live Video", presentation: "fullScreenModal" }}
            />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  )
}

// Simple icon components (replace with react-native-vector-icons in production)
const MapIcon = ({ color, size }: { color: string; size: number }) => <Text style={{ color, fontSize: size }}>🗺️</Text>
const DeviceIcon = ({ color, size }: { color: string; size: number }) => (
  <Text style={{ color, fontSize: size }}>📱</Text>
)
const AlarmIcon = ({ color, size }: { color: string; size: number }) => (
  <Text style={{ color, fontSize: size }}>🚨</Text>
)
const ProfileIcon = ({ color, size }: { color: string; size: number }) => (
  <Text style={{ color, fontSize: size }}>👤</Text>
)
