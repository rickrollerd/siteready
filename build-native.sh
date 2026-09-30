#!/bin/bash

echo "🚀 Building SiteReady Native Apps"
echo "================================="
echo "Current: $(date '+%H:%M %Z')"
echo ""

# Check prerequisites
echo "📋 Checking prerequisites..."
if ! command -v node &> /dev/null; then
  echo "❌ Node.js not found"
  exit 1
fi

if ! command -v npm &> /dev/null; then
  echo "❌ npm not found"
  exit 1
fi

echo "✅ Node.js $(node -v)"
echo "✅ npm $(npm -v)"

# Check Capacitor
echo ""
echo "🔧 Checking Capacitor setup..."
if [ ! -f "package.json" ]; then
  echo "❌ Not in project directory"
  exit 1
fi

if ! npx cap --version &> /dev/null; then
  echo "❌ Capacitor CLI not available"
  echo "Installing Capacitor..."
  npm install @capacitor/cli
fi

echo "✅ Capacitor ready"

# Build web assets
echo ""
echo "🌐 Building web assets..."
# Note: SiteReady is a simple Express app, no complex build needed
echo "✅ Web assets ready (static files)"

# Sync with Capacitor
echo ""
echo "🔄 Syncing with Capacitor..."
npx cap sync

if [ $? -ne 0 ]; then
  echo "❌ Capacitor sync failed"
  exit 1
fi

echo "✅ Capacitor sync complete"

# Android build
echo ""
echo "🤖 Building Android..."
if [ -d "android" ]; then
  echo "Building Android APK..."
  cd android
  ./gradlew assembleDebug 2>&1 | tail -20
  
  if [ $? -eq 0 ]; then
    APK_PATH="app/build/outputs/apk/debug/app-debug.apk"
    if [ -f "$APK_PATH" ]; then
      echo "✅ Android APK built: $APK_PATH"
      echo "   Size: $(du -h "$APK_PATH" | cut -f1)"
      echo "   To install: adb install $APK_PATH"
    else
      echo "⚠️ Build succeeded but APK not found in expected location"
    fi
  else
    echo "❌ Android build failed"
  fi
  cd ..
else
  echo "⚠️ Android directory not found (run: npx cap add android)"
fi

# iOS build (simulator)
echo ""
echo "🍎 Building iOS (simulator)..."
if [ -d "ios" ]; then
  echo "iOS project exists"
  echo "To build for iOS simulator:"
  echo "  1. Open ios/App.xcworkspace in Xcode"
  echo "  2. Select simulator device"
  echo "  3. Build and run (Cmd+R)"
  echo ""
  echo "⚠️ Note: iOS builds require macOS with Xcode"
else
  echo "⚠️ iOS directory not found (requires macOS: npx cap add ios)"
fi

# Create build report
echo ""
echo "📊 BUILD REPORT"
echo "==============="
echo "Timestamp: $(date)"
echo "Status: $(if [ -f "android/app/build/outputs/apk/debug/app-debug.apk" ]; then echo "ANDROID READY"; else echo "IN PROGRESS"; fi)"
echo ""

echo "🎯 CHECKLIST"
echo "--------------------------------"
echo "[$(if [ -d "android" ]; then echo "✅"; else echo " "; fi)] Android project initialized"
echo "[$(if [ -f "android/app/build/outputs/apk/debug/app-debug.apk" ]; then echo "✅"; else echo " "; fi)] Android APK built"
echo "[$(if [ -d "ios" ]; then echo "✅"; else echo " "; fi)] iOS project initialized"
echo "[$(if [ -f "capacitor.config.json" ]; then echo "✅"; else echo " "; fi)] Capacitor configured"
echo "[$(if npx cap --version &> /dev/null; then echo "✅"; else echo " "; fi)] Build system working"
echo ""

echo "📁 OUTPUT FILES"
echo "--------------"
find . -name "*.apk" -o -name "*.ipa" 2>/dev/null | while read file; do
  echo "  📄 $(basename "$file") - $(du -h "$file" | cut -f1)"
done

if [ ! -f "android/app/build/outputs/apk/debug/app-debug.apk" ] && [ ! -d "ios" ]; then
  echo "  📄 capacitor.config.json - Configuration"
  echo "  📄 build-native.sh - Build automation"
fi

echo ""
echo "🚀 NEXT STEPS"
echo "------------"
echo "1. Test Android APK on device/emulator"
echo "2. Complete iOS simulator setup (requires macOS)"
echo "3. Begin Apple Developer account application"
echo "4. Start beta testing program"
echo "5. Prepare app store assets"

echo ""
echo "The native app calls the server named in <meta name=\"siteready-api\"> in public/index.html."
echo "Set it to the deployed server address before a release build."
