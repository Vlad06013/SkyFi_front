package com.skyfi.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;

import org.json.JSONObject;

import java.util.concurrent.TimeUnit;

import okhttp3.MediaType;
import okhttp3.OkHttpClient;
import okhttp3.Request;
import okhttp3.RequestBody;
import okhttp3.Response;
import okhttp3.WebSocket;
import okhttp3.WebSocketListener;

/**
 * Сокет, когда активити (и её WebView) уже нет, а процесс держит
 * «На связи». Иначе закрытое приложение не получает соц-события:
 * Echo жил только в JS. Пока экран свёрнут, сокет по-прежнему в WebView,
 * сюда не подключаемся — иначе одно событие пришло бы дважды.
 */
public class SocialRelay {
    static final String ACTION_HEADLESS = "com.skyfi.app.HEADLESS";
    static final String EXTRA_OPEN = "skyfi_open";

    private static final String CHANNEL_ID = "skyfi-social";
    private static final MediaType JSON = MediaType.get("application/json");

    private final Context context;
    private final Handler handler = new Handler(Looper.getMainLooper());
    private final OkHttpClient http = new OkHttpClient.Builder()
        .pingInterval(25, TimeUnit.SECONDS)
        .build();

    private boolean running;
    private int generation;
    private int socketEpoch;
    private WebSocket webSocket;

    SocialRelay(Context context) {
        this.context = context.getApplicationContext();
    }

    void start() {
        if (running) return;
        running = true;
        generation += 1;
        connect(generation);
    }

    void stop() {
        running = false;
        generation += 1;
        WebSocket socket = webSocket;
        webSocket = null;
        if (socket != null) socket.cancel();
    }

    private void connect(int gen) {
        Config config = readConfig();
        if (config == null || gen != generation || !running) return;
        String scheme = "https".equals(config.scheme) ? "wss" : "ws";
        String url = scheme + "://" + config.host + ":" + config.port
            + "/app/" + config.key
            + "?protocol=7&client=android&version=1.0&flash=false";
        Request request = new Request.Builder().url(url).build();
        final int epoch = ++socketEpoch;
        WebSocket previous = webSocket;
        webSocket = http.newWebSocket(request, new WebSocketListener() {
            @Override
            public void onMessage(WebSocket socket, String text) {
                if (gen != generation || epoch != socketEpoch) return;
                onFrame(socket, config, text);
            }

            @Override
            public void onFailure(WebSocket socket, Throwable t, Response response) {
                if (epoch == socketEpoch) scheduleRetry(gen);
            }

            @Override
            public void onClosed(WebSocket socket, int code, String reason) {
                if (epoch == socketEpoch) scheduleRetry(gen);
            }
        });
        if (previous != null) previous.cancel();
    }

    private void scheduleRetry(int gen) {
        if (gen != generation || !running) return;
        handler.postDelayed(() -> {
            if (gen == generation && running) connect(gen);
        }, 4_000);
    }

    private void onFrame(WebSocket socket, Config config, String text) {
        try {
            JSONObject message = new JSONObject(text);
            String event = message.optString("event");
            if ("pusher:ping".equals(event)) {
                socket.send("{\"event\":\"pusher:pong\",\"data\":\"{}\"}");
                return;
            }
            if ("pusher:connection_established".equals(event)) {
                JSONObject data = new JSONObject(message.optString("data", "{}"));
                subscribeAll(socket, config, data.optString("socket_id"));
                return;
            }
            if (event.startsWith("pusher:") || event.startsWith("pusher_internal:")) return;
            JSONObject data = new JSONObject(message.optString("data", "{}"));
            notifySocial(event, data);
        } catch (Exception ignored) {
            /* битый кадр не роняет сервис */
        }
    }

    private void subscribeAll(WebSocket socket, Config config, String socketId) {
        if (socketId == null || socketId.isEmpty()) return;
        subscribe(socket, config, socketId, "private-App.Models.User." + config.userId);
        if (config.deviceUuid != null) {
            subscribe(socket, config, socketId, "private-device." + config.deviceUuid);
        }
    }

    private void subscribe(WebSocket socket, Config config, String socketId, String channel) {
        String auth = authorize(config, socketId, channel);
        if (auth == null) return;
        try {
            JSONObject data = new JSONObject();
            data.put("channel", channel);
            data.put("auth", auth);
            JSONObject message = new JSONObject();
            message.put("event", "pusher:subscribe");
            message.put("data", data.toString());
            socket.send(message.toString());
        } catch (Exception ignored) {
            /* без подписки просто нет событий */
        }
    }

    private String authorize(Config config, String socketId, String channel) {
        try {
            JSONObject body = new JSONObject();
            body.put("socket_id", socketId);
            body.put("channel_name", channel);
            Request request = new Request.Builder()
                .url(config.origin + "/broadcasting/auth")
                .header("Authorization", "Bearer " + config.token)
                .header("Accept", "application/json")
                .post(RequestBody.create(body.toString(), JSON))
                .build();
            try (Response response = http.newCall(request).execute()) {
                if (!response.isSuccessful() || response.body() == null) return null;
                String auth = new JSONObject(response.body().string()).optString("auth", "");
                return auth.isEmpty() ? null : auth;
            }
        } catch (Exception ignored) {
            return null;
        }
    }

    private void notifySocial(String event, JSONObject data) {
        try {
            String title;
            String body;
            String target;
            if ("friendship.request.sent".equals(event)) {
                JSONObject friendship = data.optJSONObject("friendship");
                if (friendship == null) friendship = data;
                title = nameOf(friendship, "sender");
                body = "заявка в друзья";
                target = "{\"to\":\"friends\"}";
            } else if ("friendship.request.accepted".equals(event)) {
                JSONObject friendship = data.optJSONObject("friendship");
                if (friendship == null) friendship = data;
                title = nameOf(friendship, "receiver");
                body = "принял заявку";
                target = "{\"to\":\"friends\"}";
            } else if ("friend.queue.item.added".equals(event)) {
                JSONObject item = data.optJSONObject("item");
                title = item != null ? item.optString("title", "Очередь") : "Очередь";
                body = nameOf(data, "added_by") + " добавил в очередь";
                target = "{\"to\":\"queue\"}";
            } else if ("share.sent".equals(event)) {
                JSONObject snapshot = data.optJSONObject("snapshot");
                if (snapshot == null) return;
                title = snapshot.optString("title", "SkyFi");
                body = nameOf(data, "sender") + " поделился";
                JSONObject open = new JSONObject();
                open.put("to", "share");
                open.put("shareId", data.optInt("share_id"));
                open.put("snapshot", snapshot);
                target = open.toString();
            } else {
                return;
            }
            show(title, body, target);
        } catch (Exception ignored) {
            /* уведомление не должно валить сокет */
        }
    }

    private static String nameOf(JSONObject parent, String key) {
        JSONObject side = parent.optJSONObject(key);
        if (side == null) return "Друг";
        String name = side.optString("name", "");
        return name.isEmpty() ? "Друг" : name;
    }

    private void show(String title, String body, String target) {
        NotificationManager manager = (NotificationManager) context.getSystemService(Context.NOTIFICATION_SERVICE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && manager != null
            && manager.getNotificationChannel(CHANNEL_ID) == null) {
            NotificationChannel channel = new NotificationChannel(
                CHANNEL_ID,
                "Уведомления SkyFi",
                NotificationManager.IMPORTANCE_HIGH
            );
            channel.setDescription("Заявки в друзья, поделились треком, очередь");
            channel.enableVibration(true);
            manager.createNotificationChannel(channel);
        }
        int id = (int) (System.currentTimeMillis() % 2_000_000_000L);
        Intent open = new Intent(context, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        open.putExtra(EXTRA_OPEN, target);
        PendingIntent pending = PendingIntent.getActivity(
            context,
            id,
            open,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
        android.app.Notification notification = new NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_stat_skyfi)
            .setColor(Color.parseColor("#1ED760"))
            .setContentTitle(title)
            .setContentText(body)
            .setContentIntent(pending)
            .setAutoCancel(true)
            .build();
        try {
            NotificationManagerCompat.from(context).notify(id, notification);
        } catch (SecurityException ignored) {
            /* нет разрешения — шторки не будет */
        }
    }

    private Config readConfig() {
        SharedPreferences prefs = context.getSharedPreferences("CapacitorStorage", Context.MODE_PRIVATE);
        String realtimeRaw = prefs.getString("skyfi.realtime", null);
        String sessionRaw = prefs.getString("skyfi.session", null);
        if (realtimeRaw == null || sessionRaw == null) return null;
        try {
            JSONObject realtime = new JSONObject(realtimeRaw);
            JSONObject session = new JSONObject(sessionRaw);
            String token = session.optString("token", "");
            JSONObject user = session.optJSONObject("user");
            int userId = user != null ? user.optInt("id", 0) : 0;
            if (token.isEmpty() || userId == 0 || userId != realtime.optInt("userId")) return null;
            String host = realtime.optString("host", "");
            String origin = realtime.optString("origin", "");
            String key = realtime.optString("key", "");
            if (host.isEmpty() || origin.isEmpty() || key.isEmpty()) return null;
            String deviceUuid = null;
            String deviceRaw = prefs.getString("skyfi.device", null);
            if (deviceRaw != null) {
                String uuid = new JSONObject(deviceRaw).optString("uuid", "");
                if (!uuid.isEmpty()) deviceUuid = uuid;
            }
            Config config = new Config();
            config.host = host;
            config.port = realtime.optInt("port", 80);
            config.scheme = realtime.optString("scheme", "http");
            config.key = key;
            config.origin = origin;
            config.token = token;
            config.userId = userId;
            config.deviceUuid = deviceUuid;
            return config;
        } catch (Exception ignored) {
            return null;
        }
    }

    private static final class Config {
        String host;
        int port;
        String scheme;
        String key;
        String origin;
        String token;
        int userId;
        String deviceUuid;
    }
}
