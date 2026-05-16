/**
 * Title: GameConstants
 * Description: Central configuration for the falling-block puzzle game.
 *              Board size, colors, scoring, timings, and layout values.
 *              All gameplay tuning lives here.
 */

export enum GameState {
    Boot = 0,
    Ready = 1,
    Running = 2,
    Paused = 3,
    LineClear = 4,
    GameOver = 5,
}

export enum PieceKind {
    I = 0,
    O = 1,
    T = 2,
    S = 3,
    Z = 4,
    J = 5,
    L = 6,
}

/** Play mode: serialized on Canvas `GameMain` (see marathonScene / normalScene / invisibilityScene). */
export enum GameMode {
    Normal = 0,
    Marathon = 1,
    /** Marathon rules + tàng hình stack; tốc độ tăng chậm hơn Marathon. */
    Invisibility = 2,
}

export const GameConstants = {
    // ----- Design resolution (portrait 9:16) -----
    DESIGN_WIDTH: 720,
    DESIGN_HEIGHT: 1280,

    /** UV offset cho shader blur node `bg-bh` (tăng = mờ hơn). */
    BG_BH_BLUR_SIZE: 0.006,

    /** Hiện prefab Guide khi best score của chế độ < giá trị này. */
    GUIDE_SHOW_BELOW_SCORE: 50,

    // ----- Board (10 cols × 20 rows; pixel size matches editor Board node) -----
    BOARD_COLS: 10,
    BOARD_ROWS: 20,
    HIDDEN_ROWS: 2, // buffer rows above visible area for spawn
    BOARD_WIDTH: 452,
    BOARD_HEIGHT: 880,
    /** Cell width: BOARD_WIDTH / BOARD_COLS */
    BLOCK_WIDTH: 45.2,
    /** Cell height: BOARD_HEIGHT / BOARD_ROWS */
    BLOCK_HEIGHT: 44,
    /** @deprecated Use BLOCK_WIDTH / BLOCK_HEIGHT — kept for gesture thresholds that expect one scalar */
    BLOCK_SIZE: 45.2,

    // ----- Side panels (HOLD / NEXT) preview -----
    PREVIEW_BLOCK_SIZE: 22,

    // ----- Layout (relative to canvas center, portrait 720x1280) -----
    LAYOUT: {
        TOP_HUD_HEIGHT: 178,
        TOP_HUD_TOP_MARGIN: 26,
        AD_BANNER_HEIGHT: 86,
        AD_BANNER_BOTTOM_MARGIN: 14,
        BOARD_VERTICAL_OFFSET: -48, // tuned with taller board so it clears HUD + ad strip
        SIDE_PANEL_WIDTH: 112,
        SIDE_PANEL_GAP: 10, // gap between board and side panel
        PAUSE_BUTTON_SIZE: 54,
        /** Width of LINES / LEVEL panels in TopHUD — used for pause button X placement */
        SMALL_STAT_PANEL_WIDTH: 142,
    },

    // ----- Colors -----
    COLOR: {
        BG_DEEP: '#0B1B3D',
        BG_DOT: '#152A55',
        BOARD_BG: '#04122E',
        BOARD_BORDER: '#4DC1F9',
        BOARD_GRID: '#1A3068',
        PANEL_BG: '#142353',
        PANEL_BORDER: '#4DC1F9',
        TEXT_PRIMARY: '#FFFFFF',
        TEXT_CYAN: '#7DE7FF',
        TEXT_GOLD: '#FFD54F',
        GHOST: '#FFFFFF',
        OVERLAY_DIM: '#000000',
        /** HUD group border (LINES / SCORE / LEVEL strip, HOLD / NEXT outlines) */
        HUD_OUTLINE_WHITE: '#FFFFFF',
    },

    // ----- Tetromino colors (index by PieceKind) -----
    PIECE_COLORS: [
        '#22D3FF', // I  cyan
        '#FFD600', // O  yellow
        '#B388FF', // T  purple
        '#2EC9B8', // S  teal (closer to HUD cyan than neon green)
        '#FF5252', // Z  red
        '#2979FF', // J  blue
        '#FF9100', // L  orange
    ],

    // ----- Gravity & lock -----
    /** Giây mỗi hàng ở level 1 (trước khi cộng thêm GRAVITY_BASE_EXTRA_ROWS_PER_SEC). */
    INITIAL_GRAVITY_SECONDS: 0.85,
    /** Cộng vào tốc độ rơi cơ bản (hàng/giây) — Normal + nền Marathon level 1. */
    GRAVITY_BASE_EXTRA_ROWS_PER_SEC: 1.5,
    /** Legacy Marathon tuning (replaced by MARATHON_SPEED_INCREMENT_ROWS_PER_SEC + GameplayRules). */
    GRAVITY_DECREMENT_PER_LEVEL: 0.07,
    MIN_GRAVITY_SECONDS: 0.06,
    SOFT_DROP_GRAVITY_SECONDS: 0.06,
    /** Sau khi chạm đáy/khối khác: chờ khoảng này rồi mới cố định (vẫn xoay/di chuyển trong lúc chờ). */
    LOCK_DELAY_SECONDS: 0.5,

    // ----- Movement repeat (DAS-like for keyboard) -----
    DAS_DELAY_SECONDS: 0.16,
    DAS_RATE_SECONDS: 0.05,

    // ----- Scoring -----
    /** Per lock: SCORE_PER_LOCK_BASE * level */
    SCORE_PER_LOCK_BASE: 3,
    /** Line clear: min(lineCount, SCORE_MAX_LINES_FOR_CLEAR) * SCORE_PER_LINE_CLEAR_STEP * level */
    SCORE_PER_LINE_CLEAR_STEP: 10,
    SCORE_MAX_LINES_FOR_CLEAR: 10,

    /** Một lần khóa phải xoá ≥ bấy nhiêu hàng mới tính vào streak (EvaluationUnbelievable). */
    MULTI_LINE_STREAK_MIN_LINES: 2,
    /** Đủ streak nây nhiêu lần xoá ≥ MIN liên tiếp (mọi chế độ) → phát EvaluationUnbelievable. */
    MULTI_LINE_STREAK_FOR_UNBELIEVABLE: 5,

    // ----- Progression (Marathon) -----
    /** Total lines cleared → level = 1 + floor(lines / MARATHON_LINES_PER_LEVEL). */
    MARATHON_LINES_PER_LEVEL: 15,
    /** Each Marathon level adds this many rows/sec to fall speed (see GameplayRules.marathonGravitySecondsForLevel). */
    MARATHON_SPEED_INCREMENT_ROWS_PER_SEC: 0.5,
    /** Invisibility mode: mỗi level cộng thêm hàng/giây (mặc định = một nửa Marathon). */
    INVISIBILITY_SPEED_INCREMENT_ROWS_PER_SEC: 0.25,
    /** Chu kỳ tàng hình: ẩn stack N giây, rồi hiện toàn bộ M giây (chỉ GameMode.Invisibility). */
    INVISIBILITY_HIDDEN_SECONDS: 15,
    INVISIBILITY_REVEAL_SECONDS: 5,
    /** Lưới ô trên BoardGraphics (chế độ tàng hình): nét mỏng + alpha màu `BOARD_GRID`. */
    INVISIBILITY_GRID_LINE_WIDTH: 1,
    INVISIBILITY_GRID_STROKE_ALPHA: 105,
    /**
     * Pha ẩn stack: từ lúc khối chạm đất / chạm stack, vẫn hiện khối + ghost thêm bấy nhiêu giây (mọi lần vẽ đều tính — kể cả redraw từ onPieceMoved).
     */
    INVISIBILITY_ACTIVE_GRACE_AFTER_TOUCH_SECONDS: 0.25,
    /** Normal mode: scoring uses this level multiplier only (no progression). */
    NORMAL_MODE_FIXED_SCORE_LEVEL: 1,
    /** Invisibility chỉ mở khi best Marathon > ngưỡng này (<= ngưỡng = khóa). */
    INVISIBILITY_UNLOCK_MARATHON_BEST: 500,

    /** @deprecated Old Marathon step (lines / 10); kept for reference only. */
    LINES_PER_LEVEL: 10,

    // ----- Local storage keys -----
    STORAGE: {
        /** Best score riêng từng chế độ — không dùng chung key để tránh trùng bảng xếp hạng. */
        BEST_SCORE_NORMAL: 'tetris_pp_best_score_normal_v1',
        BEST_SCORE_MARATHON: 'tetris_pp_best_score_marathon_v1',
        BEST_SCORE_INVISIBILITY: 'tetris_pp_best_score_invisibility_v1',
        /** Nhạc nền bật (1) / tắt (0) — tách khỏi SFX. */
        PREF_AUDIO_MUSIC_ON: 'tetris_pp_pref_audio_music_on_v1',
        /** SFX bật (1) / tắt (0). */
        PREF_AUDIO_SFX_ON: 'tetris_pp_pref_audio_sfx_on_v1',
        /** Ngôn giao diện: `en` | `vi`. */
        PREF_LOCALE: 'tetris_pp_pref_locale_v1',
        /**
         * Lần vào loadingScene **kế tiếp** bỏ bước Đang tải + Continue (về từ Normal/Marathon).
         * GameMain ghi `'1'` trước `loadScene`; LoadingScene đọc rồi xóa.
         */
        LOADING_FROM_GAME_HOME: 'tetris_pp_loading_from_game_home_v1',
    },

    // ----- Input gesture -----
    GESTURE: {
        TAP_MAX_TIME_MS: 220,
        TAP_MAX_DIST_PX: 18,
        SWIPE_MIN_DIST_PX: 36,
        SWIPE_MAX_TIME_MS: 350,
        DOUBLE_TAP_MAX_GAP_MS: 280,
        SOFT_DROP_DRAG_THRESHOLD_PX: 24,
        /** Vuốt xuống: px/ms (nhân scale Y) — từ tốc độ này trở lên coi là flick hard drop. */
        HARD_DROP_SWIPE_MIN_VELOCITY_PX_PER_MS: 0.38,
    },

    // ----- Animation -----
    ANIM: {
        LINE_CLEAR_DURATION: 0.28,
        LOCK_PULSE_DURATION: 0.12,
        SPAWN_FLASH_DURATION: 0.12,
        OVERLAY_FADE_DURATION: 0.18,
        SCORE_TWEEN_DURATION: 0.22,
    },

    /** Ghost — khối preview chỗ đặt (trắng, không dùng texture). */
    GHOST: {
        /** 0–1 opacity (0.6 = 60%). */
        OPACITY: 0.6,
    },

    /** Hard / soft drop — một vệt liền, màu khối, gradient mờ lên trên. */
    DROP_TRAIL: {
        FADE_SECONDS: 0.38,
        SOFT_TRAIL_HEIGHT_CELLS: 3,
        HARD_TRAIL_HEIGHT_CELLS: 6,
        GRADIENT_STEPS: 18,
        RIM_ALPHA: 255,
        GRADIENT_MAX_ALPHA: 255,
        GRADIENT_TOP_BLEND: 0.12,
        GLOW_LIGHTEN: 0.35,
        GRADIENT_BASE_ALPHA_MUL: 1.25,
    },
};

export function getBoardPixelSize(): { width: number; height: number } {
    return { width: GameConstants.BOARD_WIDTH, height: GameConstants.BOARD_HEIGHT };
}

export function getBlockCellSize(): { width: number; height: number } {
    return { width: GameConstants.BLOCK_WIDTH, height: GameConstants.BLOCK_HEIGHT };
}

/** Đọc best score đã lưu cho một chế độ (0 nếu chưa có / lỗi parse). */
export function loadPersistedBestScore(mode: GameMode): number {
    try {
        const raw = cc.sys.localStorage.getItem(storageBestScoreKey(mode));
        if (raw != null && raw !== '') {
            const n = parseInt(raw, 10);
            if (!isNaN(n) && n >= 0) {
                return n;
            }
        }
    } catch (_e) {
        // ignore
    }
    return 0;
}

/** Chế độ Invisibility: cần best Marathon > INVISIBILITY_UNLOCK_MARATHON_BEST. */
export function isInvisibilityModeUnlocked(): boolean {
    return loadPersistedBestScore(GameMode.Marathon) > GameConstants.INVISIBILITY_UNLOCK_MARATHON_BEST;
}

export function storageBestScoreKey(mode: GameMode): string {
    if (mode === GameMode.Normal) {
        return GameConstants.STORAGE.BEST_SCORE_NORMAL;
    }
    if (mode === GameMode.Invisibility) {
        return GameConstants.STORAGE.BEST_SCORE_INVISIBILITY;
    }
    return GameConstants.STORAGE.BEST_SCORE_MARATHON;
}

/** Mọi key localStorage lưu điểm cao (3 chế độ + legacy). */
export function allBestScoreStorageKeys(): string[] {
    return [
        GameConstants.STORAGE.BEST_SCORE_NORMAL,
        GameConstants.STORAGE.BEST_SCORE_MARATHON,
        GameConstants.STORAGE.BEST_SCORE_INVISIBILITY,
        'high_score',
    ];
}

/** Xóa toàn bộ best score đã lưu (không đụng nhạc / locale / setting khác). */
export function clearAllPersistedBestScores(): void {
    const keys = allBestScoreStorageKeys();
    for (let i = 0; i < keys.length; i++) {
        try {
            cc.sys.localStorage.removeItem(keys[i]);
        } catch (_e) {
            // ignore
        }
    }
    cc.log('[Storage] Đã xóa best score:', keys.join(', '));
}

/**
 * Convenience helpers for color parsing — Cocos 2.4 cc.Color accepts hex via fromHEX.
 */
export function hexToColor(hex: string, alpha?: number): cc.Color {
    const c = new cc.Color();
    c.fromHEX(hex);
    if (typeof alpha === 'number') {
        c.setA(alpha);
    }
    return c;
}
