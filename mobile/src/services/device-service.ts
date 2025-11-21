import { api } from "./auth-service"

export const deviceService = {
  async getDevices() {
    const response = await api.get("/devices")
    return response.data
  },

  async getDevice(deviceId: string) {
    const response = await api.get(`/devices/${deviceId}`)
    return response.data
  },

  async getDeviceTelemetry(deviceId: string, limit = 100) {
    const response = await api.get(`/telemetry/${deviceId}`, {
      params: { limit },
    })
    return response.data
  },

  async startLiveVideo(deviceId: string, channelNumber: number, streamType: number) {
    const response = await api.post(`/devices/${deviceId}/video/start`, {
      channelNumber,
      streamType,
    })
    return response.data
  },

  async stopLiveVideo(deviceId: string, sessionId: string) {
    const response = await api.post(`/devices/${deviceId}/video/stop`, {
      sessionId,
    })
    return response.data
  },

  async getAlarms(deviceId?: string) {
    const response = await api.get("/alarms", {
      params: deviceId ? { deviceId } : {},
    })
    return response.data
  },
}
