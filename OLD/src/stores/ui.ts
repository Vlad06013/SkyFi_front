import {defineStore} from 'pinia';
import {ref} from 'vue';

/**
 * Общее UI-состояние приложения.
 *
 * Состояние карточки трека вынесено из AudioPlayer: модалку
 * должны уметь открывать и другие экраны (например, плашка
 * текущего трека на странице волны), при этом сам AudioPlayer
 * на волне скрыт.
 */
export const useUiStore = defineStore('ui', () => {
    /** Полноэкранная карточка текущего трека открыта. */
    const trackDetailsOpen = ref(false);

    function openTrackDetails(): void {
        trackDetailsOpen.value = true;
    }

    function closeTrackDetails(): void {
        trackDetailsOpen.value = false;
    }

    return {
        trackDetailsOpen,
        openTrackDetails,
        closeTrackDetails,
    };
});
