/**
 * Ngôn ngữ giao diện (en / vi), lưu localStorage + broadcast cho scene refresh.
 */

import { GameConstants } from '../Game/GameConstants';
import { I18N_STRINGS } from './I18nTables';

const STORAGE_KEY = GameConstants.STORAGE.PREF_LOCALE;

let currentLocale = 'en';
const listeners: Array<() => void> = [];

function normalizeLocale(raw: string | null | undefined): string {
    if (raw === 'vi' || raw === 'en') {
        return raw;
    }
    try {
        const code = (cc.sys.languageCode || 'en').toLowerCase();
        if (code.indexOf('vi') === 0) {
            return 'vi';
        }
    } catch (_e) {
        /* ignore */
    }
    return 'en';
}

function readStorageLocale(): string {
    try {
        return normalizeLocale(cc.sys.localStorage.getItem(STORAGE_KEY));
    } catch (_e) {
        return 'en';
    }
}

function writeStorageLocale(locale: string): void {
    try {
        cc.sys.localStorage.setItem(STORAGE_KEY, locale);
    } catch (_e) {
        /* ignore */
    }
}

function notify(): void {
    for (let i = 0; i < listeners.length; i++) {
        try {
            listeners[i]();
        } catch (_e) {
            /* ignore */
        }
    }
}

export const I18n = {
    initFromStorage(): string {
        currentLocale = readStorageLocale();
        return currentLocale;
    },

    getLocale(): string {
        return currentLocale;
    },

    setLocale(locale: string): void {
        if (locale !== 'en' && locale !== 'vi') {
            return;
        }
        if (currentLocale === locale) {
            writeStorageLocale(locale);
            return;
        }
        currentLocale = locale;
        writeStorageLocale(locale);
        notify();
    },

    t(key: string): string {
        const table = I18N_STRINGS[currentLocale];
        const s = table && table[key];
        if (typeof s === 'string' && s.length > 0) {
            return s;
        }
        const fb = I18N_STRINGS.en[key];
        return typeof fb === 'string' ? fb : key;
    },

    /** Trả về hàm gỡ đăng ký. */
    subscribe(fn: () => void): () => void {
        listeners.push(fn);
        return function (): void {
            const idx = listeners.indexOf(fn);
            if (idx >= 0) {
                listeners.splice(idx, 1);
            }
        };
    },
};
