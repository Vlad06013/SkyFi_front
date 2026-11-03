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
./gradlew clean assembleDebug

echo "[4/4] Переименование APK..."

cp app/build/outputs/apk/debug/app-debug.apk \
   ~/projects/SkyFi_front/skyFy.apk

echo "================================"
echo "       СБОРКА ЗАВЕРШЕНА!"
echo "================================"
echo "APK находится здесь:"
echo "~/projects/SkyFi_front/skyFy.apk"