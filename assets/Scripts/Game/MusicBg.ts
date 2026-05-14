/**
 * Title: MusicBg
 * Description: Nhạc nền theo từng scene — gắn lên Canvas (hoặc node sống suốt scene).
 *              Dùng kênh Music của `cc.audioEngine`; mặc định lặp khi hết. Khi component
 *              bị destroy (đổi scene), nhạc được dừng — không cần kéo nhạc xuyên scene.
 *              Trước `loadScene` và trước mỗi lần **bắt đầu** track mới: `stopMusic` để tránh chồng
 *              khi scene cũ / mới chồng nhau (đặc biệt web). Nếu **cùng clip đang phát**,
 *              `tryPlay(false)` chỉ cập nhật volume — không restart từ đầu (tránh lặp sau gesture
 *              hoặc bật Setting trùng trạng thái).
 *
 *              Web / H5: trình duyệt chặn autoplay âm thanh tới khi có thao tác người dùng.
 *              `MusicBg` vẫn gọi `tryPlay()` lúc `start()`, đồng thời đăng ký một lần
 *              (pointer/touch/click/phím) để phát lại sau khi mở khóa — build native không
 *              bị ảnh hưởng.
 */

import { AudioMgr } from './AudioMgr';

const { ccclass, property } = cc._decorator;

/** Clip mà engine Music đang / vừa phát (đồng bộ sau `playMusic` / `stopMusic`). */
let engineBgmClip: cc.AudioClip | null = null;

/** Sự kiện thường được chấp nhận để “mở” audio trên Chrome / Safari / Firefox. */
const WEB_AUDIO_UNLOCK_EVENTS = ['pointerdown', 'touchstart', 'touchend', 'click', 'keydown'] as const;

type WebUnlockListener = {
    target: EventTarget;
    type: string;
    fn: EventListener;
    opts: AddEventListenerOptions;
};

function stopGlobalMusicChannel(): void {
    try {
        cc.audioEngine.stopMusic();
    } catch (_e) {
        // ignore
    }
    engineBgmClip = null;
}

@ccclass
export default class MusicBg extends cc.Component {
    @property({
        type: cc.AudioClip,
        tooltip: 'Clip nhạc nền. Có thể gán trong Inspector hoặc từ LoadingScene / GameMain.',
    })
    public musicClip: cc.AudioClip | null = null;

    @property({ range: [0, 1, 0.01], tooltip: 'Âm lượng nhạc nền (0–1).' })
    public volume = 0.55;

    @property({ tooltip: 'Bật để tự phát lại khi clip chạy hết.' })
    public loop = true;

    @property({
        tooltip: 'Nếu bật: khi AudioMgr.musicEnabled === false hoặc muted thì không phát nhạc nền lúc vào scene.',
    })
    public respectAudioMgrMute = true;

    @property({
        tooltip:
            'Web / mini-game (không phải app native): sau cú chạm / click / phím đầu tiên mới phát nhạc ổn định. Tắt nếu bạn tự xử lý unlock.',
    })
    public waitForUserGestureOnWeb = true;

    private static _directorHooked = false;

    private _webUnlockListeners: WebUnlockListener[] = [];

    /** Dừng kênh Music + xóa trạng thái clip (dùng khi tắt nhạc trong Setting, v.v.). */
    public static stopEngineMusic(): void {
        stopGlobalMusicChannel();
    }

    protected onLoad(): void {
        MusicBg.ensureStopMusicBeforeSceneChange();
    }

    protected start(): void {
        this.tryPlay(false);
        if (this.waitForUserGestureOnWeb && !cc.sys.isNative && this.musicClip) {
            this.bindWebAutoplayUnlock();
        }
    }

    protected onDestroy(): void {
        this.unbindWebAutoplayUnlock();
        this.stopMusicChannel();
    }

    /**
     * @param forceRestart true = luôn stop + play từ đầu (vd. New Game muốn BGM lại từ đầu).
     *                     false = nếu đang phát đúng `musicClip` thì chỉ cập nhật volume.
     */
    public tryPlay(forceRestart: boolean = false): void {
        if (!this.musicClip) {
            return;
        }
        if (this.respectAudioMgrMute && (!AudioMgr.instance().musicEnabled || AudioMgr.instance().muted)) {
            return;
        }
        try {
            if (
                !forceRestart &&
                engineBgmClip === this.musicClip &&
                cc.audioEngine.isMusicPlaying()
            ) {
                cc.audioEngine.setMusicVolume(Math.max(0, Math.min(1, this.volume)));
                return;
            }
            stopGlobalMusicChannel();
            cc.audioEngine.setMusicVolume(Math.max(0, Math.min(1, this.volume)));
            cc.audioEngine.playMusic(this.musicClip, this.loop);
            engineBgmClip = this.musicClip;
        } catch (_e) {
            // Bỏ qua lỗi audio khi clip / engine không sẵn sàng.
        }
    }

    public stopMusicChannel(): void {
        stopGlobalMusicChannel();
    }

    /** Một lần: trước mỗi lần `loadScene`, dừng nhạc nền scene trước (kênh Music dùng chung). */
    private static ensureStopMusicBeforeSceneChange(): void {
        if (MusicBg._directorHooked) {
            return;
        }
        MusicBg._directorHooked = true;
        cc.director.on(cc.Director.EVENT_BEFORE_SCENE_LAUNCH, stopGlobalMusicChannel);
    }

    /**
     * Trình duyệt: sau gesture, resume context + phát lại nhạc; gỡ listener để không rò rỉ.
     */
    private bindWebAutoplayUnlock(): void {
        this.unbindWebAutoplayUnlock();
        const opts: AddEventListenerOptions = { capture: true, passive: true };
        const handler: EventListener = (): void => {
            if (!this.node || !this.node.isValid) {
                return;
            }
            try {
                cc.audioEngine.resumeAll();
            } catch (_e) {
                // ignore
            }
            this.tryPlay(false);
            this.unbindWebAutoplayUnlock();
        };
        const addAll = (target: EventTarget | null | undefined): void => {
            if (!target) {
                return;
            }
            for (let i = 0; i < WEB_AUDIO_UNLOCK_EVENTS.length; i++) {
                const type = WEB_AUDIO_UNLOCK_EVENTS[i];
                target.addEventListener(type, handler, opts);
                this._webUnlockListeners.push({ target, type, fn: handler, opts });
            }
        };
        if (typeof window !== 'undefined') {
            addAll(window as EventTarget);
        }
        addAll(cc.game && cc.game.canvas ? (cc.game.canvas as EventTarget) : null);
    }

    private unbindWebAutoplayUnlock(): void {
        for (let i = 0; i < this._webUnlockListeners.length; i++) {
            const L = this._webUnlockListeners[i];
            L.target.removeEventListener(L.type, L.fn, L.opts);
        }
        this._webUnlockListeners.length = 0;
    }
}
