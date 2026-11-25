#!/bin/bash

set -e

echo "================================"
echo "       Сборка SkyFi APK"
echo "================================"

cd ~/projects/SkyFi_front

echo "[1/4] Сборка Vue-приложения..."
npm run build

echo "[2/4] Синхронизация Capacitor..."
npx cap sync android

echo "[3/4] Очистка и сборка APK..."
cd android
# Каждая сборка — новый versionCode: приложение отличает установку от отменённой загрузки.
gradle_file=app/build.gradle
code=$(sed -n 's/^[[:space:]]*versionCode[[:space:]]\([0-9][0-9]*\).*/\1/p' "$gradle_file" | head -n 1)
if [ -n "$code" ]; then
  next=$((code + 1))
  sed -i "s/versionCode ${code}/versionCode ${next}/" "$gradle_file"
  echo "versionCode ${code} → ${next}"
fi
./gradlew clean assembleDebug

echo "[4/4] Переименование APK..."

cp app/build/outputs/apk/debug/app-debug.apk \
   ~/projects/SkyFi_front/skyFy.apk

echo "================================"
echo "       СБОРКА ЗАВЕРШЕНА!"
echo "================================"
echo "APK находится здесь:"
echo "~/projects/SkyFi_front/skyFy.apk"