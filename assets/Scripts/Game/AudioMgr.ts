/**
 * Title: AudioMgr
 * Description: Global SFX hooks. Assign clips from GameMain on load (Inspector) or elsewhere.
 *              If a clip is null the call is a no-op. Calls go through AudioMgr.instance().
 *              `musicEnabled` / `sfxEnabled` tách nhạc nền (MusicBg) và hiệu ứng — lưu localStorage.
 */

import { GameConstants } from './GameConstants';

export class AudioMgr {
    private static _instance: AudioMgr | null = null;

    /** @deprecated Giữ tương thích: nếu true thì coi như tắt cả SFX (cộng thêm với sfxEnabled). */
    public muted: boolean = false;

    /** Nhạc nền — MusicBg đọc qua `musicEnabled`. */
    public musicEnabled: boolean = true;
    /** Hiệu ứng (playEffect). */
    public sfxEnabled: boolean = true;

    private _prefsLoaded = false;

    public moveClip: cc.AudioClip | null = null;
    public rotateClip: cc.AudioClip | null = null;
    /** Drop.mp3 — khi khóa gạch (chạm đáy / chồng khối). */
    public dropClip: cc.AudioClip | null = null;
    /** @deprecated Dùng playLineClear; giữ tương thích nếu còn gán trong project cũ. */
    public clearClip: cc.AudioClip | null = null;
    public gameOverClip: cc.AudioClip | null = null;
    /** Lose.mp3 — khi thua (ưu tiên hơn gameOverClip nếu cả hai được gán). */
    public loseClip: cc.AudioClip | null = null;

    /** Index 0 = C1l … index 3 = C4l (xoá 5 hàng dùng clip C4l). */
    private clearLineClips: (cc.AudioClip | null)[] = [null, null, null, null];

    public evalGoodClip: cc.AudioClip | null = null;
    public evalGreatClip: cc.AudioClip | null = null;
    /** File gốc có thể tên EvaluationExcellect.mp3 */
    public evalExcellentClip: cc.AudioClip | null = null;
    public evalAmazingClip: cc.AudioClip | null = null;
    public evalUnbelievableClip: cc.AudioClip | null = null;

    /** Nút UI trong Setting (On/Off, Close, New Game, Home, Lang…). */
    public uiButtonClickClip: cc.AudioClip | null = null;
    /** Click.mp3 — mở Setting (`btn_setting` / `bth_Setting`). Trống = dùng `uiButtonClickClip` nếu có. */
    public settingMenuOpenClickClip: cc.AudioClip | null = null;
    /** GameStart.mp3 — ván mới / chơi lại (`startGame`). */
    public gameStartClip: cc.AudioClip | null = null;

    public static instance(): AudioMgr {
        if (!AudioMgr._instance) {
            AudioMgr._instance = new AudioMgr();
            AudioMgr._instance.loadAudioPrefs();
        }
        return AudioMgr._instance;
    }

    public loadAudioPrefs(): void {
        if (this._prefsLoaded) {
            return;
        }
        this._prefsLoaded = true;
        try {
            const m = cc.sys.localStorage.getItem(GameConstants.STORAGE.PREF_AUDIO_MUSIC_ON);
            this.musicEnabled = m !== '0';
            const s = cc.sys.localStorage.getItem(GameConstants.STORAGE.PREF_AUDIO_SFX_ON);
            this.sfxEnabled = s !== '0';
        } catch (_e) {
            // ignore
        }
    }

    public saveAudioPrefs(): void {
        try {
            cc.sys.localStorage.setItem(
                GameConstants.STORAGE.PREF_AUDIO_MUSIC_ON,
                this.musicEnabled ? '1' : '0',
            );
            cc.sys.localStorage.setItem(
                GameConstants.STORAGE.PREF_AUDIO_SFX_ON,
                this.sfxEnabled ? '1' : '0',
            );
        } catch (_e) {
            // ignore
        }
    }

    public setClearLineClip(lines: number, clip: cc.AudioClip | null): void {
        if (lines >= 1 && lines <= 4) {
            this.clearLineClips[lines - 1] = clip;
        }
    }

    public playMove(): void { this.play(this.moveClip); }
    public playRotate(): void { this.play(this.rotateClip); }
    public playDrop(): void { this.play(this.dropClip); }

    /** C1l–C4l theo số hàng xoá (1..4); xoá ≥5 hàng một lần vẫn dùng clip C4l. */
    public playLineClear(lines: number): void {
        if (lines < 1) {
            return;
        }
        const idx = Math.min(lines, 4) - 1;
        this.play(this.clearLineClips[idx]);
    }

    public playClear(): void { this.play(this.clearClip); }

    /** lineTier 1..5 → EvaluationGood … EvaluationUnbelievable (GameMain chỉ gọi tier 5 cho streak). */
    public playEvaluation(lineTier: number): void {
        let clip: cc.AudioClip | null = null;
        switch (lineTier) {
            case 1: clip = this.evalGoodClip; break;
            case 2: clip = this.evalGreatClip; break;
            case 3: clip = this.evalExcellentClip; break;
            case 4: clip = this.evalAmazingClip; break;
            case 5: clip = this.evalUnbelievableClip; break;
            default: return;
        }
        this.play(clip);
    }

    public playLose(): void { this.play(this.loseClip); }

    public playGameOver(): void { this.play(this.gameOverClip); }

    /** Thua: phát Lose nếu có, không thì clip game over cũ. */
    public playGameOverOrLose(): void {
        if (this.loseClip) {
            this.play(this.loseClip);
        } else {
            this.play(this.gameOverClip);
        }
    }

    public playUiButtonClick(): void {
        this.play(this.uiButtonClickClip);
    }

    /** Mở menu Setting — ưu tiên `settingMenuOpenClickClip` (Click.mp3). */
    public playSettingOpenClick(): void {
        const c = this.settingMenuOpenClickClip || this.uiButtonClickClip;
        this.play(c);
    }

    /** Bắt đầu ván chơi (spawn mới / restart). */
    public playGameStart(): void {
        this.play(this.gameStartClip);
    }

    private play(clip: cc.AudioClip | null): void {
        if (this.muted || !this.sfxEnabled || !clip) return;
        try {
            cc.audioEngine.playEffect(clip, false);
        } catch (e) {
            // Ignore audio errors silently in placeholder mode.
        }
    }
}
