# Camera Access Setup - HTTPS Configuration

## Problem
Mobile browsers require **HTTPS** for camera access (except for localhost). When accessing your app via HTTP (`http://192.168.1.8:8080`), the camera API (`navigator.mediaDevices.getUserMedia`) is not available.

## Solution
I've configured your Vite dev server to use **HTTPS** with automatic certificate generation. This allows camera access on mobile devices.

## Changes Made

1. **Vite Configuration** (`vite.config.ts`):
   - Enabled HTTPS with auto-generated self-signed certificate
   - Added proxy for API requests to avoid mixed content issues
   - WebSocket proxying for Socket.IO

2. **API Configuration** (`src/lib/api.ts`):
   - Updated to use relative URLs in development (proxied to backend)
   - Automatically uses HTTPS when frontend is HTTPS

3. **Camera Error Handling** (`src/components/BarcodeScanner.tsx`):
   - Added checks for `navigator.mediaDevices` availability
   - Better error messages for HTTPS requirement

## How to Use

### 1. Restart Your Frontend Server

Stop your current frontend server (Ctrl+C) and restart:

```bash
npm run dev
```

You'll see output like:
```
  ➜  Local:   https://localhost:8080/
  ➜  Network: https://192.168.1.8:8080/
```

### 2. Access from Mobile

1. **Open your phone's browser**
2. **Navigate to**: `https://192.168.1.8:8080`
   - ⚠️ **Note**: Use `https://` not `http://`
3. **Accept the security warning**:
   - Your browser will show a warning about the self-signed certificate
   - This is normal for development
   - Click "Advanced" → "Proceed to 192.168.1.8 (unsafe)" or similar
   - On iOS Safari: Settings → General → About → Certificate Trust Settings

### 3. Camera Access

Once you accept the certificate:
- The camera should work normally
- You'll be able to scan barcodes on your mobile device
- The app will use HTTPS for all connections

## Browser Certificate Warnings

Since we're using a self-signed certificate, browsers will show security warnings. This is **normal for development**:

- **Chrome/Edge**: Click "Advanced" → "Proceed to 192.168.1.8 (unsafe)"
- **Safari (iOS)**: You may need to trust the certificate in Settings
- **Firefox**: Click "Advanced" → "Accept the Risk and Continue"

## Troubleshooting

### Still getting camera errors?

1. **Make sure you're using HTTPS**: Check the URL bar - it should show `https://` not `http://`
2. **Accept the certificate**: The browser must trust the self-signed certificate
3. **Check browser console**: Look for any additional error messages
4. **Try a different browser**: Some browsers handle self-signed certs differently

### API connection issues?

The Vite proxy automatically forwards `/api/*` requests to your backend. If you see API errors:
- Make sure your backend is running on `http://localhost:3001`
- Check that CORS is properly configured in the backend
- Look at the browser Network tab to see if requests are being proxied

### WebSocket not connecting?

The proxy also handles WebSocket connections. If Socket.IO isn't working:
- Check that the backend WebSocket server is running
- Verify the proxy configuration in `vite.config.ts`
- Check browser console for WebSocket errors

## Production Notes

For production deployment:
- Use a proper SSL certificate (Let's Encrypt, etc.)
- Update `VITE_API_URL` in your production environment
- The proxy is only active in development mode

## Alternative: Using ngrok (If HTTPS doesn't work)

If you prefer not to use self-signed certificates, you can use ngrok:

```bash
# Install ngrok: https://ngrok.com/download
ngrok http 8080
```

This will give you a public HTTPS URL that tunnels to your local server.

