import axios from "axios"
import { API_CONFIG } from "../config"

let accessToken: string | null = null

const api = axios.create({
  baseURL: API_CONFIG.API_URL,
  timeout: 10000,
})

// Request interceptor to add auth token
api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`
  }
  return config
})

export const authService = {
  setAccessToken(token: string | null) {
    accessToken = token
  },

  async login(email: string, password: string) {
    const response = await api.post("/auth/login", { email, password })
    return response.data
  },

  async refresh(refreshToken: string) {
    const response = await api.post("/auth/refresh", { refreshToken })
    return response.data
  },

  async logout() {
    await api.post("/auth/logout")
  },
}

export { api }
