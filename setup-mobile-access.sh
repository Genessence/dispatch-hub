#!/bin/bash

# Mobile Access Setup Script
# This script helps configure your environment for mobile access

echo "📱 Dispatch Hub - Mobile Access Setup"
echo "======================================"
echo ""

# Get local IP address
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || ifconfig | grep "inet " | grep -v 127.0.0.1 | awk '{print $2}' | head -1)

if [ -z "$LOCAL_IP" ]; then
    echo "❌ Could not detect local IP address"
    echo "Please enter your local IP address manually:"
    read -p "Local IP: " LOCAL_IP
else
    echo "✅ Detected local IP: $LOCAL_IP"
    read -p "Is this correct? (y/n): " confirm
    if [ "$confirm" != "y" ]; then
        read -p "Enter your local IP address: " LOCAL_IP
    fi
fi

echo ""
echo "📝 Creating environment files..."

# Frontend .env
if [ ! -f .env ]; then
    cat > .env << EOF
# Frontend Environment Variables
LOCAL_IP=$LOCAL_IP
VITE_API_URL=http://$LOCAL_IP:3001
EOF
    echo "✅ Created .env (frontend)"
else
    echo "⚠️  .env already exists, skipping..."
fi

# Backend .env
if [ ! -f backend/.env ]; then
    cat > backend/.env << EOF
# Backend Environment Variables
LOCAL_IP=$LOCAL_IP
FRONTEND_URL=http://localhost:8080
PORT=3001
EOF
    echo "✅ Created backend/.env (backend)"
else
    echo "⚠️  backend/.env already exists, skipping..."
fi

echo ""
echo "✅ Setup complete!"
echo ""
echo "📱 To access from your mobile phone:"
echo "   1. Make sure your phone is on the same WiFi network"
echo "   2. Open browser and go to: http://$LOCAL_IP:8080"
echo ""
echo "🚀 To start the servers:"
echo "   Terminal 1: cd backend && npm run dev"
echo "   Terminal 2: cd frontend && npm run dev"
echo ""

