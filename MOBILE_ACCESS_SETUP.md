# Mobile Access Setup Guide

This guide will help you access your Dispatch Hub application on your mobile phone for testing invoice scanning.

## Prerequisites

- Your computer and mobile phone must be on the **same WiFi network**
- Both frontend and backend servers must be running

## Step 1: Find Your Local IP Address

Your local IP address is: **192.168.1.8**

If you need to find it again, run this command in your terminal:
```bash
ipconfig getifaddr en0
```

Or check:
- **macOS**: System Settings > Network > WiFi > Details > TCP/IP > IPv4 Address
- **Windows**: `ipconfig` in Command Prompt, look for "IPv4 Address"
- **Linux**: `hostname -I` or `ip addr show`

## Step 2: Configure Environment Variables

### Frontend Configuration

1. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

2. Update `.env` with your local IP:
   ```env
   LOCAL_IP=192.168.1.8
   VITE_API_URL=http://192.168.1.8:3001
   ```

### Backend Configuration

1. Navigate to the backend directory:
   ```bash
   cd backend
   ```

2. Copy the example environment file:
   ```bash
   cp .env.example .env
   ```

3. Update `backend/.env` with your local IP:
   ```env
   LOCAL_IP=192.168.1.8
   FRONTEND_URL=http://localhost:8080
   PORT=3001
   ```

## Step 3: Start the Servers

### Terminal 1 - Backend Server
```bash
cd backend
npm run dev
```

You should see output like:
```
📡 Server (Local):  http://localhost:3001
📡 Server (Network): http://192.168.1.8:3001
📱 Mobile Access:   http://192.168.1.8:8080
```

### Terminal 2 - Frontend Server
```bash
cd frontend
npm run dev
```

The frontend will start on port 8080 and should be accessible from your network.

## Step 4: Access from Your Mobile Phone

1. **Make sure your phone is on the same WiFi network** as your computer

2. **Open a web browser** on your phone (Chrome, Safari, etc.)

3. **Enter the following URL** in your phone's browser:
   ```
   http://192.168.1.8:8080
   ```
   (Replace `192.168.1.8` with your actual local IP if different)

4. The application should load on your phone!

## Troubleshooting

### Can't connect from phone?

1. **Check firewall settings**:
   - macOS: System Settings > Network > Firewall (may need to allow Node.js)
   - Windows: Windows Defender Firewall (may need to allow Node.js)
   - Linux: Check `ufw` or `iptables` settings

2. **Verify IP address**:
   - Make sure you're using the correct local IP (not 127.0.0.1 or localhost)
   - Run `ipconfig getifaddr en0` again to confirm

3. **Check WiFi network**:
   - Both devices must be on the same network
   - Some networks have "client isolation" enabled - disable it if possible

4. **Verify servers are running**:
   - Backend should show "Server (Network): http://192.168.1.8:3001"
   - Frontend should be accessible at http://192.168.1.8:8080

5. **Try accessing from computer first**:
   - Open `http://192.168.1.8:8080` in your computer's browser
   - If it works on computer but not phone, it's likely a network/firewall issue

### Camera/Scanner not working on mobile?

- Make sure you're using **HTTPS** or **localhost** for camera access
- Some browsers require HTTPS for camera permissions
- Try using Chrome on Android or Safari on iOS
- Check browser permissions for camera access

### API connection errors?

- Verify `VITE_API_URL` in `.env` matches your local IP
- Check that backend server is listening on `0.0.0.0` (all interfaces)
- Look for CORS errors in browser console

## Quick Reference

- **Frontend URL**: `http://192.168.1.8:8080`
- **Backend API**: `http://192.168.1.8:3001`
- **Health Check**: `http://192.168.1.8:3001/api/health`

## Notes

- If your IP address changes (e.g., after reconnecting to WiFi), update the `.env` files
- The servers are configured to accept connections from both localhost and your network IP
- For production, you'll need proper hosting and HTTPS for camera access

