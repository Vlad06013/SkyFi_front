/** Открыть URL снаружи приложения. В APK навигация главного фрейма на
 *  чужой хост уходит из WebView в систему (Bridge.launchIntent →
 *  ACTION_VIEW) — ссылку забирает браузер, WebView остаётся на месте.
 *  window.open для этого не подходит: onCreateWindow в WebView
 *  Capacitor не реализован, вызов молча ничего не делает. */
export function openExternalUrl(url: string): void {
  window.location.assign(url);
}
