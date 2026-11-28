package com.skyfi.app;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;

import org.json.JSONObject;

import androidx.core.content.ContextCompat;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** Живые активити. Ноль — WebView нет, сокет можно забрать сервису. */
    static int liveActivities;

    private int topCss;
    private int bottomCss;
    private int leftCss;
    private int rightCss;
    private int openAttempt;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        liveActivities += 1;
        // Android 15+ рисует вебвью под системными барами, а env(safe-area-inset-*)
        // в WebView остаётся 0. Реальные отступы кладём в CSS-переменные.
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        WindowInsetsControllerCompat bars = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
        if (bars != null) {
            bars.setAppearanceLightStatusBars(false);
            bars.setAppearanceLightNavigationBars(false);
        }

        View content = findViewById(android.R.id.content);
        ViewCompat.setOnApplyWindowInsetsListener(content, (view, insets) -> {
            rememberInsets(insets);
            publishSafeArea();
            return insets;
        });
        ViewCompat.requestApplyInsets(content);
        content.postDelayed(this::publishSafeArea, 400);
        content.postDelayed(this::publishSafeArea, 1500);
        askNotificationPermission();
        deliverOpenTarget(getIntent());
    }

    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        deliverOpenTarget(intent);
    }

    /** Закрытие (не сворачивание): WebView умрёт, сокет переезжает в сервис. */
    @Override
    public void onDestroy() {
        liveActivities = Math.max(0, liveActivities - 1);
        if (liveActivities == 0) {
            Intent intent = new Intent(this, ConnectionService.class);
            intent.setAction(SocialRelay.ACTION_HEADLESS);
            try {
                ContextCompat.startForegroundService(this, intent);
            } catch (Exception ignored) {
                /* процесс уже уходит — сервис не поднять */
            }
        }
        super.onDestroy();
    }

    /** Тап по уведомлению, которое показал сервис без WebView. */
    private void deliverOpenTarget(Intent intent) {
        if (intent == null) return;
        String raw = intent.getStringExtra(SocialRelay.EXTRA_OPEN);
        if (raw == null || raw.isEmpty()) return;
        intent.removeExtra(SocialRelay.EXTRA_OPEN);
        openAttempt = 0;
        pushOpenTarget(raw);
    }

    private void pushOpenTarget(String raw) {
        if (getBridge() == null || getBridge().getWebView() == null) {
            retryOpen(raw);
            return;
        }
        String js = "(function(){if(!window.__skyfiNotifyOpen)return 'wait';"
            + "window.__skyfiNotifyOpen(JSON.parse(" + JSONObject.quote(raw) + "));return 'ok';})()";
        getBridge().getWebView().evaluateJavascript(js, value -> {
            if (value != null && value.contains("ok")) return;
            retryOpen(raw);
        });
    }

    private void retryOpen(String raw) {
        if (openAttempt >= 6) return;
        openAttempt += 1;
        View content = findViewById(android.R.id.content);
        if (content == null) return;
        content.postDelayed(() -> pushOpenTarget(raw), 400L * openAttempt);
    }

    /** Уведомление плеера с API 33. Без разрешения сервис жив, шторки нет. */
    private void askNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS) == PackageManager.PERMISSION_GRANTED) return;
        requestPermissions(new String[]{Manifest.permission.POST_NOTIFICATIONS}, 41);
    }

    @Override
    public void onPause() {
        super.onPause();
        // Сворачивание. Сервис держит процесс: сокет, скачивание, уведомления.
        ContextCompat.startForegroundService(this, new Intent(this, ConnectionService.class));
    }

    @Override
    public void onResume() {
        super.onResume();
        stopService(new Intent(this, ConnectionService.class));
        View content = findViewById(android.R.id.content);
        if (content != null) {
            ViewCompat.requestApplyInsets(content);
            content.post(this::publishSafeArea);
        }
    }

    private void rememberInsets(WindowInsetsCompat insets) {
        Insets system = insets.getInsets(
            WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout()
        );
        float density = getResources().getDisplayMetrics().density;
        if (density <= 0f) density = 1f;
        topCss = Math.round(system.top / density);
        bottomCss = Math.round(system.bottom / density);
        leftCss = Math.round(system.left / density);
        rightCss = Math.round(system.right / density);
    }

    private void publishSafeArea() {
        if (topCss <= 0 && bottomCss <= 0) return;
        if (getBridge() == null || getBridge().getWebView() == null) return;
        String js = "(function(){var r=document.documentElement;if(!r)return;"
            + "r.style.setProperty('--safe-top','" + topCss + "px');"
            + "r.style.setProperty('--safe-bottom','" + bottomCss + "px');"
            + "r.style.setProperty('--safe-left','" + leftCss + "px');"
            + "r.style.setProperty('--safe-right','" + rightCss + "px');})()";
        getBridge().getWebView().evaluateJavascript(js, null);
    }
}
