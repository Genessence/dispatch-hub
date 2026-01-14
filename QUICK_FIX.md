# Quick Fix - Connection Issue

## Problem
Getting `ERR_CONNECTION_CLOSED` when accessing the site.

## Solution
HTTPS has been made **optional**. The server now defaults to **HTTP** which should work immediately.

## Steps to Fix

1. **Restart your frontend server**:
   ```bash
   # Stop current server (Ctrl+C), then:
   npm run dev
   ```

2. **Access via HTTP** (this should work now):
   - On your phone: `http://192.168.1.8:8080`
   - On your computer: `http://localhost:8080`

## For Camera Access (Optional)

If you need camera access on mobile, you can enable HTTPS:

1. **Set environment variable before starting**:
   ```bash
   VITE_HTTPS=true npm run dev
   ```

2. **Or add to your `.env` file**:
   ```env
   VITE_HTTPS=true
   ```

3. **Then access via HTTPS**:
   - `https://192.168.1.8:8080`
   - Accept the security warning

## Current Status

- ✅ **HTTP mode**: Works for all features except camera
- ⚠️ **HTTPS mode**: Required for camera, but may have certificate issues on some devices

Try accessing via HTTP first - it should work now!

