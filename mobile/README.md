# MDVR Mobile App

React Native mobile application for MDVR Platform fleet management.

## Features

- Secure JWT authentication with biometric support
- Real-time device location tracking on interactive map
- Live video streaming from vehicle cameras
- Push notifications for alarms and events
- Historical video playback
- Device management and provisioning
- Offline support with local caching

## Setup

1. Install dependencies:
\`\`\`bash
npm install
\`\`\`

2. Configure environment variables:
Create `.env` file:
\`\`\`
EXPO_PUBLIC_API_URL=http://your-api-url/api
EXPO_PUBLIC_WS_URL=ws://your-ws-url
\`\`\`

3. Run development server:
\`\`\`bash
npm start
\`\`\`

4. Run on device/simulator:
\`\`\`bash
npm run ios    # iOS
npm run android # Android
\`\`\`

## Build for Production

### iOS
\`\`\`bash
eas build --platform ios
\`\`\`

### Android
\`\`\`bash
eas build --platform android
\`\`\`

## Testing

\`\`\`bash
npm test
\`\`\`

## Features Implementation Status

- [x] Authentication
- [x] Device list
- [x] Live map with markers
- [x] Real-time WebSocket updates
- [x] Device details
- [ ] Live video playback (WebRTC/HLS)
- [ ] Historical video timeline
- [ ] Alarm management
- [ ] Push notifications
- [ ] QR code device provisioning
- [ ] Offline mode
\`\`\`
