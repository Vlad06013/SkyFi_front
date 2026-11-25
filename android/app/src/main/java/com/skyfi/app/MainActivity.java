package com.skyfi.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private int topCss;
    private int bottomCss;
    private int leftCss;
    private int rightCss;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
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
    }

    @Override
    public void onResume() {
        super.onResume();
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
