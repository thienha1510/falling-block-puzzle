/**
 * Title: SettingPanelController
 * Description: Gắn lên root prefab **Setting** — btnClose, btnNewGame, hàng Music / SFX (toggle On/Off).
 *              `AudioMgr.playUiButtonClick` khi bấm các nút trên; mở Setting từ HUD dùng `playSettingOpenClick` (GameMain / LoadingScene).
 *              Gọi `wire(...)` sau khi `instantiate` + `addChild` (trước khi bật active).
 */

import { AudioMgr } from '../Game/AudioMgr';
import MusicBg from '../Game/MusicBg';
import { I18n } from '../I18n/I18n';
import { applySettingPrefabLocale } from '../I18n/GameplayLocaleApply';

const { ccclass } = cc._decorator;

export type SettingPanelWireOptions = {
    onClose: () => void;
    /** Ván mới — caller quyết định (restart scene / restart game) và có thể bật lại BGM. */
    onNewGame: () => void;
    /** Nút **btnHome** — về Loading (caller có thể delay / lưu điểm). Trống = không gắn. */
    onHome?: () => void;
    /** Mặc định true. Loading scene: false để ẩn nút New Game. */
    showNewGameButton?: boolean;
    /** Mặc định true. Loading scene: false để ẩn nút Home. */
    showHomeButton?: boolean;
};

@ccclass
export default class SettingPanelController extends cc.Component {
    private _wired = false;
    private _opts: SettingPanelWireOptions | null = null;
    private _musicTapAt = 0;
    private _sfxTapAt = 0;
    private _localeUnsub: (() => void) | null = null;

    public wire(opts: SettingPanelWireOptions): void {
        this._opts = opts;
        if (this.node && this.node.activeInHierarchy) {
            this.applyWire();
        }
    }

    /** Gọi khi mở panel để đồng bộ giao diện Switch với prefs / AudioMgr. */
    public refreshVisuals(): void {
        AudioMgr.instance().loadAudioPrefs();
        applySettingPrefabLocale(this.node);
        const rowMusic = this.findDeep(this.node, 'Music');
        const rowSfx = this.findDeep(this.node, 'SFX');
        if (rowMusic) {
            SettingPanelController.ensureToggleRowHitArea(rowMusic);
            SettingPanelController.applyMusicRowVisual(rowMusic, AudioMgr.instance().musicEnabled);
        }
        if (rowSfx) {
            SettingPanelController.ensureToggleRowHitArea(rowSfx);
            SettingPanelController.applyMusicRowVisual(rowSfx, AudioMgr.instance().sfxEnabled);
        }
    }

    protected onDestroy(): void {
        if (this._localeUnsub) {
            this._localeUnsub();
            this._localeUnsub = null;
        }
    }

    protected onLoad(): void {
        if (this._opts) {
            this.applyWire();
        }
    }

    protected onEnable(): void {
        if (this._opts && !this._wired) {
            this.applyWire();
        }
    }

    private applyWire(): void {
        if (this._wired || !this._opts) {
            return;
        }
        this._wired = true;
        const opts = this._opts;

        AudioMgr.instance().loadAudioPrefs();

        const btnClose = this.findDeep(this.node, 'btnClose');
        const btnNew = this.findDeep(this.node, 'btnNewGame');
        const btnHome = this.findDeep(this.node, 'btnHome');
        const rowMusic = this.findDeep(this.node, 'Music');
        const rowSfx = this.findDeep(this.node, 'SFX');

        if (btnClose) {
            this.bindTap(btnClose, this.wrapUiClick(function () {
                opts.onClose();
            }));
        }
        const showNew = opts.showNewGameButton !== false;
        const showHome = opts.showHomeButton !== false;
        if (btnNew) {
            btnNew.active = showNew;
            if (showNew) {
                this.bindTap(btnNew, this.wrapUiClick(function () {
                    opts.onNewGame();
                }));
            }
        }
        if (btnHome && opts.onHome) {
            btnHome.active = showHome;
            if (showHome) {
                this.bindTap(btnHome, this.wrapUiClick(function () {
                    opts.onHome!();
                }));
            }
        }

        if (rowMusic) {
            SettingPanelController.ensureToggleRowHitArea(rowMusic);
            const self = this;
            this.bindTapUnderRow(rowMusic, function () {
                const now = performance.now();
                if (now - self._musicTapAt < 320) {
                    return;
                }
                self._musicTapAt = now;
                AudioMgr.instance().playUiButtonClick();
                const a = AudioMgr.instance();
                a.musicEnabled = !a.musicEnabled;
                a.saveAudioPrefs();
                SettingPanelController.applyMusicRowVisual(rowMusic, a.musicEnabled);
                SettingPanelController.syncSceneMusic();
            });
            SettingPanelController.applyMusicRowVisual(rowMusic, AudioMgr.instance().musicEnabled);
        }
        if (rowSfx) {
            SettingPanelController.ensureToggleRowHitArea(rowSfx);
            const self = this;
            this.bindTapUnderRow(rowSfx, function () {
                const now = performance.now();
                if (now - self._sfxTapAt < 320) {
                    return;
                }
                self._sfxTapAt = now;
                AudioMgr.instance().playUiButtonClick();
                const a = AudioMgr.instance();
                a.sfxEnabled = !a.sfxEnabled;
                a.saveAudioPrefs();
                SettingPanelController.applyMusicRowVisual(rowSfx, a.sfxEnabled);
            });
            SettingPanelController.applyMusicRowVisual(rowSfx, AudioMgr.instance().sfxEnabled);
        }

        const btnEng = this.findDeep(this.node, 'btn_LangEng');
        const btnVn = this.findDeep(this.node, 'btn_LangVN');
        if (btnEng) {
            this.bindTap(btnEng, this.wrapUiClick(function () {
                I18n.setLocale('en');
            }));
        }
        if (btnVn) {
            this.bindTap(btnVn, this.wrapUiClick(function () {
                I18n.setLocale('vi');
            }));
        }

        applySettingPrefabLocale(this.node);
        const self = this;
        this._localeUnsub = I18n.subscribe(function () {
            applySettingPrefabLocale(self.node);
            const rm = self.findDeep(self.node, 'Music');
            const rs = self.findDeep(self.node, 'SFX');
            if (rm) {
                SettingPanelController.applyMusicRowVisual(rm, AudioMgr.instance().musicEnabled);
            }
            if (rs) {
                SettingPanelController.applyMusicRowVisual(rs, AudioMgr.instance().sfxEnabled);
            }
        });
    }

    /**
     * Hit-test lấy node lá (On/btn_on, Label…) — gắn cùng handler lên toàn bộ cây con của hàng
     * (chỉ trong row, không ảnh hưởng nút khác trong prefab).
     */
    private bindTapUnderRow(row: cc.Node, fn: () => void): void {
        const self = this;
        const walk = function (node: cc.Node): void {
            self.bindTap(node, fn);
            for (let i = 0; i < node.children.length; i++) {
                walk(node.children[i]);
            }
        };
        walk(row);
    }

    /**
     * Prefab Setting: hàng Music/SFX thường có contentSize 0×0 → engine không hit-test được.
     * Đặt vùng chạm rộng + ưu tiên node Switch (nếu vẫn nhỏ) để tap toggle ổn định.
     */
    private static ensureToggleRowHitArea(row: cc.Node): void {
        const w = row.width;
        const h = row.height;
        if (w < 8 || h < 8) {
            row.setContentSize(520, 76);
        }
        const sw = row.getChildByName('Switch');
        if (!sw) {
            return;
        }
        const swW = sw.width;
        const swH = sw.height;
        if (swW < 8 || swH < 8) {
            sw.setContentSize(160, 56);
        }
    }

    /** Cập nhật trạng thái On/Off theo node con `Switch/On` và `Switch/Off` của prefab. */
    public static applyMusicRowVisual(row: cc.Node, enabled: boolean): void {
        const sw = row.getChildByName('Switch');
        if (!sw) {
            return;
        }
        const onN = sw.getChildByName('On');
        const offN = sw.getChildByName('Off');
        if (onN) {
            onN.active = enabled;
        }
        if (offN) {
            offN.active = !enabled;
        }
    }

    public static syncSceneMusic(): void {
        const a = AudioMgr.instance();
        if (!a.musicEnabled) {
            MusicBg.stopEngineMusic();
            return;
        }
        const scene = cc.director.getScene();
        const canvas = scene ? scene.getChildByName('Canvas') : null;
        const host = canvas || scene;
        if (!host) {
            return;
        }
        const mb = host.getComponent(MusicBg) || host.getComponentInChildren(MusicBg);
        if (mb && mb.musicClip) {
            mb.tryPlay();
        }
    }

    private wrapUiClick(fn: () => void): () => void {
        return function () {
            AudioMgr.instance().playUiButtonClick();
            fn();
        };
    }

    private findDeep(root: cc.Node, name: string): cc.Node | null {
        if (root.name === name) {
            return root;
        }
        for (let i = 0; i < root.children.length; i++) {
            const f = this.findDeep(root.children[i], name);
            if (f) {
                return f;
            }
        }
        return null;
    }

    private bindTap(n: cc.Node, fn: () => void): void {
        n.off(cc.Node.EventType.TOUCH_END);
        n.on(cc.Node.EventType.TOUCH_END, function (e: cc.Event.EventTouch) {
            e.stopPropagation();
            fn();
        });
    }
}
