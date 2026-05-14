/**
 * Title: GameplayRules
 * Description: Mode-specific rules (gravity curve, score level) kept out of GameMain
 *              so tuning and future modes stay in one place.
 */

import { GameConstants, GameMode } from './GameConstants';

/** Hàng/giây ở “level 1” sau khi áp dụng INITIAL_GRAVITY_SECONDS + GRAVITY_BASE_EXTRA_ROWS_PER_SEC. */
export function level1BaseRowsPerSec(): number {
    return (
        1 / GameConstants.INITIAL_GRAVITY_SECONDS + GameConstants.GRAVITY_BASE_EXTRA_ROWS_PER_SEC
    );
}

/** Normal: gravity cố định = nền level 1 (đã + extra). */
export function normalGravitySeconds(): number {
    const r = level1BaseRowsPerSec();
    if (r <= 1e-6) {
        return GameConstants.MIN_GRAVITY_SECONDS;
    }
    return Math.max(GameConstants.MIN_GRAVITY_SECONDS, 1 / r);
}

/** Marathon: fall speed = base rows/sec at level 1 + (level - 1) * increment → seconds per row, clamped. */
export function marathonGravitySecondsForLevel(level: number): number {
    const lv = Math.max(1, level | 0);
    const rowsPerSec =
        level1BaseRowsPerSec() + (lv - 1) * GameConstants.MARATHON_SPEED_INCREMENT_ROWS_PER_SEC;
    if (rowsPerSec <= 1e-6) {
        return GameConstants.MIN_GRAVITY_SECONDS;
    }
    return Math.max(GameConstants.MIN_GRAVITY_SECONDS, 1 / rowsPerSec);
}

/** Invisibility: cùng công thức Marathon nhưng bước tăng tốc mỗi level nhỏ hơn (mặc định một nửa). */
export function invisibilityGravitySecondsForLevel(level: number): number {
    const lv = Math.max(1, level | 0);
    const rowsPerSec =
        level1BaseRowsPerSec() +
        (lv - 1) * GameConstants.INVISIBILITY_SPEED_INCREMENT_ROWS_PER_SEC;
    if (rowsPerSec <= 1e-6) {
        return GameConstants.MIN_GRAVITY_SECONDS;
    }
    return Math.max(GameConstants.MIN_GRAVITY_SECONDS, 1 / rowsPerSec);
}

/** Level used as multiplier for lock / line-clear score. Normal ignores progression. */
export function scoreMultiplierLevel(mode: GameMode, displayLevel: number): number {
    if (mode === GameMode.Normal) {
        return GameConstants.NORMAL_MODE_FIXED_SCORE_LEVEL;
    }
    return Math.max(1, displayLevel | 0);
}
