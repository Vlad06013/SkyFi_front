#!/bin/sh
# Тап по local-notification не поднимал свёрнутую активити (нет FLAG_ACTIVITY_NEW_TASK).
# Патч в node_modules, иначе npm install его сотрёт. Повторный запуск — no-op.
cd "$(dirname "$0")/.." || exit 0
patchfile=patches/local-notifications-tap.patch
if patch -p1 --dry-run --forward --silent -i "$patchfile" >/dev/null 2>&1; then
  patch -p1 --forward --silent -i "$patchfile"
fi
