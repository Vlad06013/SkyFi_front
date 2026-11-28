package com.skyfi.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Color;
import android.os.Build;
import android.os.IBinder;

import androidx.core.app.NotificationCompat;

/**
 * Пока активити свёрнута, процесс без сервиса замирает: сокет, скачивание
 * и входящие события встают. Уведомление тихое, его снимаем при возврате.
 */
public class ConnectionService extends Service {
    static final String CHANNEL_ID = "skyfi-connection";
    static final int NOTIFICATION_ID = 42;

    private SocialRelay relay;

    @Override
    public void onCreate() {
        super.onCreate();
        relay = new SocialRelay(this);
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        Notification notification = buildNotification();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            startForeground(NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        if (intent != null && SocialRelay.ACTION_HEADLESS.equals(intent.getAction())) {
            relay.start();
        }
        return START_NOT_STICKY;
    }

    /**
     * Смахнули из недавних. onDestroy активити на части прошивок не
     * доходит — сокет всё равно забираем здесь. Повторный start() пустой.
     */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        relay.start();
    }

    @Override
    public void onDestroy() {
        relay.stop();
        super.onDestroy();
    }

    private Notification buildNotification() {
        NotificationManager manager = (NotificationManager) getSystemService(NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Соединение",
                NotificationManager.IMPORTANCE_MIN
            );
            channel.setShowBadge(false);
            channel.setSound(null, null);
            manager.createNotificationChannel(channel);
        }
        Intent open = new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent pending = PendingIntent.getActivity(
            this,
            43,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_skyfi)
            .setColor(Color.parseColor("#1ED760"))
            .setContentTitle("SkyFi")
            .setContentText("На связи")
            .setContentIntent(pending)
            .setOngoing(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .build();
    }
}
