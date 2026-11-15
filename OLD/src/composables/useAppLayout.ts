import {computed, ref, watch} from 'vue';
import type {ComputedRef, Ref} from 'vue';

/**
 * Режим навигации интерфейса.
 *
 * На телевизорах и автомагнитолах боковое меню неудобно
 * (управление с кресла/дивана, пульт, DPAD) — там меню
 * переносится вниз, как на телефонах. Режим определяется
 * автоматически, но пользователь может включить его и вручную
 * (профиль → «Навигация»).
 *
 * Результатом является класс `app--bottom-nav` на <body> —
 * стили рядом с медиа-запросами (max-width: 700px) дублируются
 * под этот класс в variables.css, AppNavigation.vue и
 * audioPlayer.css.
 */

export type AppNavMode = 'auto' | 'tv';

const STORAGE_KEY = 'skyfi_nav_mode';

const manualMode = ref<AppNavMode>(readStoredMode());
const autoBottomNav = ref(false);

let started = false;

function readStoredMode(): AppNavMode {
    try {
        return localStorage.getItem(STORAGE_KEY) === 'tv'
            ? 'tv'
            : 'auto';
    } catch {
        // Приватный режим — без сохранения, просто авто.
        return 'auto';
    }
}

/**
 * Автодетект «экрана с дивана»:
 * - ТВ-приставки и Smart TV по User-Agent;
 * - автомагнитолы: ландшафт и невысокий экран (600-820px).
 *   Телефоны в ландшафте (~360-440px высотой) не попадают.
 */
function detectBottomNav(): boolean {
    if (
        typeof navigator === 'undefined'
        || typeof screen === 'undefined'
        || typeof window === 'undefined'
    ) {
        return false;
    }

    const ua = navigator.userAgent;

    if (/(Android TV|AFT\w*|BRAVIA|Tizen|webOS|CrKey|Viera)/i.test(ua)) {
        return true;
    }

    const isPortrait = window.innerHeight > window.innerWidth;

    return (
        !isPortrait
        && screen.height >= 460
        && screen.height <= 820
        && screen.width >= 700
    );
}

function applyBodyClass(isBottom: boolean): void {
    if (typeof document === 'undefined') return;

    document.body.classList.toggle('app--bottom-nav', isBottom);
}

function refreshDetection(): void {
    if (manualMode.value !== 'auto') return;

    autoBottomNav.value = detectBottomNav();
}

export function useAppLayout(): {
    navMode: Ref<AppNavMode>;
    isBottomNav: ComputedRef<boolean>;
    setNavMode: (mode: AppNavMode) => void;
    start: () => void;
} {
    const isBottomNavActive = computed(
        () => manualMode.value === 'tv' || autoBottomNav.value,
    );

    function setNavMode(mode: AppNavMode): void {
        manualMode.value = mode;

        try {
            localStorage.setItem(STORAGE_KEY, mode);
        } catch {
            // Приватный режим — режим просто не запомнится.
        }

        refreshDetection();
    }

    function start(): void {
        if (started || typeof window === 'undefined') return;

        started = true;
        autoBottomNav.value = detectBottomNav();

        watch(isBottomNavActive, applyBodyClass, {immediate: true});

        window.addEventListener('resize', refreshDetection);
        window.addEventListener('orientationchange', refreshDetection);
    }

    return {
        navMode: manualMode,
        isBottomNav: isBottomNavActive,
        setNavMode,
        start,
    };
}
