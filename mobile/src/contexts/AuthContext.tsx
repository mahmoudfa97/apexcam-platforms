"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect } from "react"
import * as SecureStore from "expo-secure-store"
import { authService } from "../services/auth-service"

interface User {
  id: string
  email: string
  fullName: string
  role: string
  tenantId: string
}

interface AuthContextType {
  user: User | null
  isAuthenticated: boolean
  isLoading: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => Promise<void>
  refreshToken: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    loadStoredAuth()
  }, [])

  const loadStoredAuth = async () => {
    try {
      const token = await SecureStore.getItemAsync("accessToken")
      const userData = await SecureStore.getItemAsync("user")

      if (token && userData) {
        setUser(JSON.parse(userData))
        authService.setAccessToken(token)
      }
    } catch (error) {
      console.error("Failed to load stored auth:", error)
    } finally {
      setIsLoading(false)
    }
  }

  const login = async (email: string, password: string) => {
    try {
      const response = await authService.login(email, password)

      await SecureStore.setItemAsync("accessToken", response.accessToken)
      await SecureStore.setItemAsync("refreshToken", response.refreshToken)
      await SecureStore.setItemAsync("user", JSON.stringify(response.user))

      setUser(response.user)
      authService.setAccessToken(response.accessToken)
    } catch (error) {
      console.error("Login failed:", error)
      throw error
    }
  }

  const logout = async () => {
    try {
      await SecureStore.deleteItemAsync("accessToken")
      await SecureStore.deleteItemAsync("refreshToken")
      await SecureStore.deleteItemAsync("user")

      setUser(null)
      authService.setAccessToken(null)
    } catch (error) {
      console.error("Logout failed:", error)
    }
  }

  const refreshToken = async () => {
    try {
      const storedRefreshToken = await SecureStore.getItemAsync("refreshToken")
      if (!storedRefreshToken) throw new Error("No refresh token")

      const response = await authService.refresh(storedRefreshToken)

      await SecureStore.setItemAsync("accessToken", response.accessToken)
      authService.setAccessToken(response.accessToken)
    } catch (error) {
      console.error("Token refresh failed:", error)
      await logout()
    }
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        isAuthenticated: !!user,
        isLoading,
        login,
        logout,
        refreshToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error("useAuth must be used within AuthProvider")
  }
  return context
}
