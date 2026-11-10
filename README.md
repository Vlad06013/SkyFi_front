Запуск 
# npm run dev -- --host 0.0.0.0 поднять дев сервер
# ./build_apk.sh сборка апк
# pm2 start "serve -s /var/www/SkyFi_front/dist -l 5173" --name skyfi-front
# pm2 status
# pm2 logs skyfi-front
# pm2 restart skyfi-front
# pm2 stop skyfi-front

ТЕСТЫ

• npm run test:unit — интерактивный режим (перезапускает при правках);                                                                                                                                                          
• npm run test:unit:run — один прогон (для проверки перед коммитом). 