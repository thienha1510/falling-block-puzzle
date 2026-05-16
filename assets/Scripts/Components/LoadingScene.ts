/**
 * Title: Loading Scene
 * Description: (1) `labelLoading` — Đang tải + chấm trong `loadingDisplaySeconds` (mặc định 4), rồi **Continue**.
 *              (2) Bấm Continue → chọn Marathon / Normal / Invisibility (nếu có nút trong scene).
 *              — Về từ chơi (GameMain): bỏ (1)(2), vào thẳng chọn chế độ (`markEnterLoadingFromGameHome`).
 */

import { GameConstants, hexToColor, isInvisibilityModeUnlocked } from '../Game/GameConstants';
import MusicBg from '../Game/MusicBg';
import { AudioMgr } from '../Game/AudioMgr';
import SettingPanelController from './SettingPanelController';
import { I18n } from '../I18n/I18n';
import { applyLoadingHomescreenLocale, applyLoadingSceneModeLabels, applyLoadingSceneTitleLocale } from '../I18n/GameplayLocaleApply';
import { ensureBgBhBlurOnCanvas } from '../Generic/BgBhBlurSprite';
import GuidePanelController from './GuidePanelController';
import ToastController from './ToastController';

/** Letterbox gần màu sprite `bg` (RGB 34,80,200). */
const LOADING_PANEL_BLUE = '#2250C8';

/**
 * Tên truyền vào `cc.director.loadScene` / `preloadScene` phải trùng **tên scene**
 * (thường là tên file `assets/Scenes/<tên>.fire`, không có khoảng thừa trong tên file).
 */
const SCENE_MARATHON = 'marathonScene';
const SCENE_NORMAL = 'normalScene';
const SCENE_INVISIBILITY = 'invisibilityScene';

/** Cỡ chữ nút Continue (nhấp nháy). */
const CONTINUE_FONT_MIN = 35;
const CONTINUE_FONT_MAX = 40;
/** Một vòng phóng → thu (giây). Sóng cos — đạo hậu bằng 0 ở cực đại/cực tiểu, tránh giật so với sóng tam giác tuyến tính. */
const CONTINUE_PULSE_PERIOD_SEC = 1.45;
/** Toast khi bấm Invisibility chưa đủ điều kiện mở khóa. */
const INVISIBILITY_LOCKED_TOAST_SECONDS = 2;

const { ccclass, property } = cc._decorator;

@ccclass
export default class LoadingScene extends cc.Component {
    /** Gọi từ GameMain trước `loadScene('loadingScene')` khi về Home từ chơi. */
    public static markEnterLoadingFromGameHome(): void {
        try {
            cc.sys.localStorage.setItem(GameConstants.STORAGE.LOADING_FROM_GAME_HOME, '1');
        } catch (_e) {
            // ignore
        }
    }

    /** `true` một lần nếu đã mark — đồng thời xóa cờ trong storage. */
    public static consumeEnterLoadingFromGameHome(): boolean {
        try {
            const k = GameConstants.STORAGE.LOADING_FROM_GAME_HOME;
            if (cc.sys.localStorage.getItem(k) === '1') {
                cc.sys.localStorage.removeItem(k);
                return true;
            }
        } catch (_e) {
            // ignore
        }
        return false;
    }

    @property({
        type: cc.Label,
        tooltip: 'Tùy chọn: gán Label của **labelLoading**. Trống = tìm node tên `labelLoading`.',
    })
    private mLabelLoading: cc.Label = null;

    @property({
        type: cc.Node,
        tooltip: 'Tùy chọn: node **Play** (con của `btn_play`) hoặc cả **btn_play**. Trống = tìm `btn_play` rồi `Play`.',
    })
    private mPlayNode: cc.Node = null;

    @property({
        type: cc.Node,
        tooltip:
            'Tùy chọn: node **PlayNor** (con của `btn_play_nor`) hoặc **btn_play_nor**. Trống = tìm `btn_play_nor` rồi `PlayNor`.',
    })
    private mPlayNorNode: cc.Node = null;

    @property({
        type: cc.Node,
        tooltip:
            'Tùy chọn: **PlayInv** (con `btn_Invisibility`) hoặc `btn_Invisibility`. Trống = tìm theo tên trong scene.',
    })
    private mPlayInvisibleNode: cc.Node = null;

    @property({
        tooltip: 'Thời gian hiển thị labelLoading (Đang tải + chấm) trước khi bật nút Continue (giây).',
    })
    private loadingDisplaySeconds = 4;

    @property({
        tooltip:
            'Sau khi bấm Play / PlayNor / Invisibility: hiện lại Đang tải + chấm trong khoảng thời gian này, rồi load scene tương ứng.',
    })
    private delayAfterPlaySeconds = 2;

    @property({
        type: cc.AudioClip,
        tooltip: 'Nhạc nền scene Loading (khác marathon/normal). Trống = không phát.',
    })
    private backgroundMusic: cc.AudioClip | null = null;

    @property({ range: [0, 1, 0.01], tooltip: 'Âm lượng nhạc nền Loading.' })
    private backgroundMusicVolume = 0.8;

    @property({
        type: cc.Prefab,
        tooltip: 'Prefab Setting — gán trong Inspector. Trống = nút Setting không mở được.',
    })
    private settingPrefab: cc.Prefab | null = null;

    @property({ type: cc.AudioClip, tooltip: 'UI — On/Off, Close, Home, Lang trong prefab Setting (Loading).' })
    private sfxUiButton: cc.AudioClip | null = null;
    @property({ type: cc.AudioClip, tooltip: 'Click.mp3 — mở Setting trên màn Loading.' })
    private sfxSettingOpen: cc.AudioClip | null = null;

    @property({
        type: cc.Prefab,
        tooltip: 'Prefab Toast — hiện 2s khi bấm Invisibility khi chưa đạt kỉ lục Marathon > 500.',
    })
    private toastPrefab: cc.Prefab | null = null;

    private mLoadingDotsTimer: number = -1;
    private mLoadingDotsIndex = 0;
    private mLoadingStatusLabel: cc.Label | null = null;
    private mLoadingNode: cc.Node | null = null;
    private mEndLoadingScheduled = false;
    /** Đã bấm Play hoặc PlayNor — không xử lý lần hai. */
    private mSceneTransitionStarted = false;
    /** Đã bấm Continue và đã hiện bộ chọn chế độ. */
    private mContinueDismissed = false;
    /** Label chữ Continue (nhấp nháy cỡ chữ bằng schedule). */
    private mContinueTextLabel: cc.Label | null = null;
    private mContinuePulseTime = 0;
    private mSettingsHost: cc.Node | null = null;
    /** Nút mở Setting — giữ ref để onDestroy không duyệt cây khi node đã destroy. */
    private mSettingTapTarget: cc.Node | null = null;
    private mLocaleUnsub: (() => void) | null = null;
    private mToastCtrl: ToastController | null = null;

    protected onLoad(): void {
        this.mSettingTapTarget = null;
        this.mEndLoadingScheduled = false;
        this.mSceneTransitionStarted = false;
        this.mContinueDismissed = false;
        this.mContinueTextLabel = null;
        this.mContinuePulseTime = 0;
        this.unschedule(this.tickContinueLabelPulse);
        const canvas = this.node;
        canvas.setContentSize(GameConstants.DESIGN_WIDTH, GameConstants.DESIGN_HEIGHT);
        canvas.setAnchorPoint(0.5, 0.5);
        const canvasComp = this.getComponent(cc.Canvas);
        if (canvasComp) {
            canvasComp.designResolution = cc.size(GameConstants.DESIGN_WIDTH, GameConstants.DESIGN_HEIGHT);
            canvasComp.fitWidth = true;
            canvasComp.fitHeight = true;
        } else {
            cc.view.setDesignResolutionSize(
                GameConstants.DESIGN_WIDTH,
                GameConstants.DESIGN_HEIGHT,
                cc.ResolutionPolicy.SHOW_ALL,
            );
        }
        canvas.color = cc.color(255, 255, 255);
        ensureBgBhBlurOnCanvas(canvas);
        this.applyLoadingGuideVisibility(canvas);

        const camNode = this.findDescendantByName(canvas, 'Main Camera');
        if (camNode) {
            const cam = camNode.getComponent(cc.Camera);
            if (cam) {
                cam.backgroundColor = hexToColor(LOADING_PANEL_BLUE, 255);
            }
        }

        const legacyBg = this.findDescendantByName(canvas, 'bg');
        if (legacyBg) {
            legacyBg.active = true;
        }

        if (this.mLabelLoading && this.mLabelLoading.node && this.mLabelLoading.node.name === 'labelGameName') {
            cc.warn(
                '[LoadingScene] Property "mLabelLoading" đang trỏ vào **labelGameName** — dùng node **labelLoading** theo tên.',
            );
        }

        this.mLoadingNode = this.findDescendantByName(canvas, 'labelLoading');
        this.mLoadingStatusLabel = this.resolveLoadingStatusLabel(canvas);

        if (this.mLoadingDotsTimer >= 0) {
            clearInterval(this.mLoadingDotsTimer);
            this.mLoadingDotsTimer = -1;
        }

        cc.director.preloadScene(SCENE_MARATHON, function () {}, function () {});
        cc.director.preloadScene(SCENE_NORMAL, function () {}, function () {});
        cc.director.preloadScene(SCENE_INVISIBILITY, function () {}, function () {});

        this.hidePlayUi(canvas);
        this.hideContinueUi(canvas);

        AudioMgr.instance().loadAudioPrefs();
        this.bindLoadingUiSfxToAudioMgr();
        I18n.initFromStorage();
        const skipIntro = LoadingScene.consumeEnterLoadingFromGameHome();
        if (skipIntro) {
            this.applyHomeReturnFromGameLayout(canvas);
        } else {
            this.beginMainLoadingFlow();
        }
        this.ensureBackgroundMusic();
        this.ensureLoadingSettingsPanel();
        this.bindLoadingSettingButton();

        const selfLoad = this;
        this.mLocaleUnsub = I18n.subscribe(function () {
            selfLoad.applyLoadingLocalizedStrings();
            selfLoad.applyLoadingGuideVisibility(canvas);
        });
        this.applyLoadingLocalizedStrings();
    }

    protected start(): void {
        const persistantNode = cc.find('PersistantNode');
        if (!persistantNode) {
            cc.warn('LoadingScene: PersistantNode not found (optional for this flow).');
        }
    }

    protected onDestroy(): void {
        if (this.mLoadingDotsTimer >= 0) {
            clearInterval(this.mLoadingDotsTimer);
            this.mLoadingDotsTimer = -1;
        }
        this.stopContinueLabelPulse();
        this.unschedule(this.deferredReloadLoadingSceneFromSettings);
        const tap = this.mSettingTapTarget;
        if (tap && tap.isValid) {
            tap.off(cc.Node.EventType.TOUCH_END, this.handleLoadingSettingTap, this);
        }
        this.mSettingTapTarget = null;
        if (this.mLocaleUnsub) {
            this.mLocaleUnsub();
            this.mLocaleUnsub = null;
        }
        if (this.mToastCtrl && this.mToastCtrl.isValid) {
            this.mToastCtrl.hide();
        }
        this.mToastCtrl = null;
    }

    /** Gắn clip UI cho AudioMgr trước khi vào marathonScene (Inspector trên LoadingScene). */
    private bindLoadingUiSfxToAudioMgr(): void {
        const a = AudioMgr.instance();
        if (this.sfxUiButton) {
            a.uiButtonClickClip = this.sfxUiButton;
        }
        if (this.sfxSettingOpen) {
            a.settingMenuOpenClickClip = this.sfxSettingOpen;
        }
    }

    /** Gắn MusicBg khi có clip — mỗi scene tự quản lý, không persist. */
    private ensureBackgroundMusic(): void {
        if (!this.backgroundMusic) {
            return;
        }
        let mb = this.getComponent(MusicBg);
        if (!mb) {
            mb = this.node.addComponent(MusicBg);
        }
        mb.musicClip = this.backgroundMusic;
        mb.volume = this.backgroundMusicVolume;
        mb.loop = true;
    }

    private ensureLoadingSettingsPanel(): void {
        if (!this.settingPrefab) {
            return;
        }
        if (this.mSettingsHost && this.mSettingsHost.isValid) {
            return;
        }
        const host = new cc.Node('SettingsPanelHost');
        host.zIndex = 400;
        host.active = false;
        const n = cc.instantiate(this.settingPrefab);
        host.addChild(n);
        const ctrl = n.addComponent(SettingPanelController);
        const self = this;
        ctrl.wire({
            onClose: function () {
                self.closeLoadingSettings();
            },
            onNewGame: function () {
                cc.director.loadScene('loadingScene');
            },
            showNewGameButton: false,
            showHomeButton: false,
            onHome: function () {
                self.onLoadingSettingsHomePressed();
            },
        });
        this.node.addChild(host);
        this.mSettingsHost = host;
    }

    private bindLoadingSettingButton(): void {
        this.ensureLoadingSettingsPanel();
        if (!this.mSettingsHost) {
            return;
        }
        const tap = this.findLoadingSettingTapTarget();
        if (!tap) {
            return;
        }
        this.mSettingTapTarget = tap;
        tap.off(cc.Node.EventType.TOUCH_END, this.handleLoadingSettingTap, this);
        tap.on(cc.Node.EventType.TOUCH_END, this.handleLoadingSettingTap, this);
    }

    private findLoadingSettingTapTarget(): cc.Node | null {
        const bth = this.findDescendantByName(this.node, 'bth_Setting');
        if (bth && bth.isValid) {
            const inner = bth.getChildByName('Setting');
            if (inner && inner.isValid) {
                return inner;
            }
            return bth;
        }
        const btnSt = this.findDescendantByName(this.node, 'btn_setting');
        if (btnSt && btnSt.isValid) {
            const inner = btnSt.getChildByName('Setting');
            if (inner && inner.isValid) {
                return inner;
            }
            return btnSt;
        }
        return this.findDescendantNamedSkipSubtree(this.node, 'Setting', 'SettingsPanelHost');
    }

    private findDescendantNamedSkipSubtree(root: cc.Node, want: string, skipRootName: string): cc.Node | null {
        if (!root || !root.isValid) {
            return null;
        }
        if (root.name === skipRootName) {
            return null;
        }
        if (root.name === want) {
            return root;
        }
        const kids = root.children;
        if (!kids) {
            return null;
        }
        for (let i = 0; i < kids.length; i++) {
            const ch = kids[i];
            if (!ch || !ch.isValid) {
                continue;
            }
            if (ch.name === skipRootName) {
                continue;
            }
            const f = this.findDescendantNamedSkipSubtree(ch, want, skipRootName);
            if (f) {
                return f;
            }
        }
        return null;
    }

    private handleLoadingSettingTap(): void {
        this.openLoadingSettings();
    }

    /** btnHome trong Setting (Loading): đóng panel, 1s sau load lại loadingScene. */
    private onLoadingSettingsHomePressed(): void {
        this.closeLoadingSettings();
        this.unschedule(this.deferredReloadLoadingSceneFromSettings);
        this.scheduleOnce(this.deferredReloadLoadingSceneFromSettings, 1);
    }

    private deferredReloadLoadingSceneFromSettings(): void {
        cc.director.loadScene('loadingScene');
    }

    private openLoadingSettings(): void {
        if (!this.mSettingsHost || !this.mSettingsHost.isValid) {
            return;
        }
        if (this.mSettingsHost.active) {
            return;
        }
        AudioMgr.instance().playSettingOpenClick();
        const kids = this.mSettingsHost.children;
        const inner = kids && kids.length > 0 ? kids[0] : null;
        const sc = inner && inner.getComponent(SettingPanelController);
        if (sc) {
            sc.refreshVisuals();
        }
        this.mSettingsHost.active = true;
    }

    private closeLoadingSettings(): void {
        if (!this.mSettingsHost || !this.mSettingsHost.isValid) {
            return;
        }
        if (!this.mSettingsHost.active) {
            return;
        }
        this.mSettingsHost.active = false;
    }

    private applyLoadingGuideVisibility(canvas: cc.Node): void {
        const guideRoot = this.findDescendantByName(canvas, 'Guide');
        if (!guideRoot || !guideRoot.isValid) {
            return;
        }
        let ctrl = guideRoot.getComponent(GuidePanelController);
        if (!ctrl) {
            ctrl = guideRoot.addComponent(GuidePanelController);
        }
        ctrl.applyForLoadingScreen();
    }

    private findDescendantByName(root: cc.Node, name: string): cc.Node | null {
        if (!root || !root.isValid) {
            return null;
        }
        if (root.name === name) {
            return root;
        }
        const kids = root.children;
        if (!kids) {
            return null;
        }
        for (let i = 0; i < kids.length; i++) {
            const ch = kids[i];
            if (!ch || !ch.isValid) {
                continue;
            }
            const f = this.findDescendantByName(ch, name);
            if (f) {
                return f;
            }
        }
        return null;
    }

    private resolveLoadingStatusLabel(canvas: cc.Node): cc.Label | null {
        const byName = this.findDescendantByName(canvas, 'labelLoading');
        if (byName) {
            const lab = byName.getComponent(cc.Label);
            if (lab) {
                return lab;
            }
        }
        if (this.mLabelLoading && this.mLabelLoading.node && this.mLabelLoading.node.name !== 'labelGameName') {
            return this.mLabelLoading;
        }
        return null;
    }

    private applyLoadingLocalizedStrings(): void {
        applyLoadingHomescreenLocale(this.node);
        applyLoadingSceneTitleLocale(this.node);
        applyLoadingSceneModeLabels(this.node);
        const cont = this.mContinueTextLabel;
        if (cont && cont.node && cont.isValid) {
            cont.string = I18n.t('CONTINUE');
        }
    }

    /** Container marathon: `btn_play` (legacy) hoặc `btn_Marathon`. */
    private resolveBtnPlayRoot(canvas: cc.Node): cc.Node | null {
        const legacy = this.findDescendantByName(canvas, 'btn_play');
        if (legacy) {
            return legacy;
        }
        return this.findDescendantByName(canvas, 'btn_Marathon');
    }

    /**
     * Node lá marathon: ưu tiên property; `btn_play` / `btn_Marathon` → con `Play` hoặc `PlayMara`;
     * không property thì tìm theo tên.
     */
    private resolvePlayLeaf(canvas: cc.Node): cc.Node | null {
        if (this.mPlayNode && this.mPlayNode.isValid) {
            const n = this.mPlayNode.name;
            if (n === 'btn_play' || n === 'btn_Marathon') {
                const inner = this.mPlayNode.getChildByName('Play') || this.mPlayNode.getChildByName('PlayMara');
                return inner || this.mPlayNode;
            }
            return this.mPlayNode;
        }
        const root = this.resolveBtnPlayRoot(canvas);
        if (root) {
            const inner = root.getChildByName('Play') || root.getChildByName('PlayMara');
            return inner || root;
        }
        return this.findDescendantByName(canvas, 'Play') || this.findDescendantByName(canvas, 'PlayMara');
    }

    private resolveBtnPlayNorRoot(canvas: cc.Node): cc.Node | null {
        const legacy = this.findDescendantByName(canvas, 'btn_play_nor');
        if (legacy) {
            return legacy;
        }
        return this.findDescendantByName(canvas, 'btn_Normal');
    }

    private resolvePlayNorLeaf(canvas: cc.Node): cc.Node | null {
        if (this.mPlayNorNode && this.mPlayNorNode.isValid) {
            const n = this.mPlayNorNode.name;
            if (n === 'btn_play_nor' || n === 'btn_Normal') {
                const inner = this.mPlayNorNode.getChildByName('PlayNor');
                return inner || this.mPlayNorNode;
            }
            return this.mPlayNorNode;
        }
        const root = this.resolveBtnPlayNorRoot(canvas);
        if (root) {
            const inner = root.getChildByName('PlayNor');
            return inner || root;
        }
        return this.findDescendantByName(canvas, 'PlayNor');
    }

    private resolveBtnInvisibilityRoot(canvas: cc.Node): cc.Node | null {
        return this.findDescendantByName(canvas, 'btn_Invisibility');
    }

    private resolveInvisibilityLeaf(canvas: cc.Node): cc.Node | null {
        if (this.mPlayInvisibleNode && this.mPlayInvisibleNode.isValid) {
            const n = this.mPlayInvisibleNode.name;
            if (n === 'btn_Invisibility') {
                const inner = this.mPlayInvisibleNode.getChildByName('PlayInv');
                return inner || this.mPlayInvisibleNode;
            }
            return this.mPlayInvisibleNode;
        }
        const root = this.resolveBtnInvisibilityRoot(canvas);
        if (root) {
            const inner = root.getChildByName('PlayInv');
            return inner || root;
        }
        return null;
    }

    private hidePlayNorUi(canvas: cc.Node): void {
        const btnRoot = this.resolveBtnPlayNorRoot(canvas);
        const leaf = this.resolvePlayNorLeaf(canvas);
        if (btnRoot && btnRoot.isValid) {
            btnRoot.active = false;
        } else if (leaf && leaf.isValid) {
            leaf.active = false;
        }
    }

    private hidePlayInvUi(canvas: cc.Node): void {
        const btnRoot = this.resolveBtnInvisibilityRoot(canvas);
        const leaf = this.resolveInvisibilityLeaf(canvas);
        if (btnRoot && btnRoot.isValid) {
            btnRoot.active = false;
        } else if (leaf && leaf.isValid) {
            leaf.active = false;
        }
    }

    private hidePlayUi(canvas: cc.Node): void {
        const btnRoot = this.resolveBtnPlayRoot(canvas);
        const leaf = this.resolvePlayLeaf(canvas);
        if (btnRoot && btnRoot.isValid) {
            btnRoot.active = false;
        } else if (leaf && leaf.isValid) {
            leaf.active = false;
        }
        this.hidePlayNorUi(canvas);
        this.hidePlayInvUi(canvas);
    }

    private showPlayUi(canvas: cc.Node): cc.Node | null {
        const btnRoot = this.resolveBtnPlayRoot(canvas);
        const leaf = this.resolvePlayLeaf(canvas);
        if (btnRoot && btnRoot.isValid) {
            btnRoot.active = true;
        }
        if (leaf && leaf.isValid) {
            leaf.active = true;
        }
        const btnComp =
            (leaf && leaf.getComponent(cc.Button)) ||
            (btnRoot && btnRoot.getComponent(cc.Button)) ||
            null;
        if (btnComp) {
            btnComp.interactable = true;
        }
        const tapTarget = btnRoot || leaf;
        return tapTarget && tapTarget.isValid ? tapTarget : leaf;
    }

    private showPlayNorUi(canvas: cc.Node): cc.Node | null {
        const btnRoot = this.resolveBtnPlayNorRoot(canvas);
        const leaf = this.resolvePlayNorLeaf(canvas);
        if (btnRoot && btnRoot.isValid) {
            btnRoot.active = true;
        }
        if (leaf && leaf.isValid) {
            leaf.active = true;
        }
        const btnComp =
            (leaf && leaf.getComponent(cc.Button)) ||
            (btnRoot && btnRoot.getComponent(cc.Button)) ||
            null;
        if (btnComp) {
            btnComp.interactable = true;
        }
        const tapTarget = btnRoot || leaf;
        return tapTarget && tapTarget.isValid ? tapTarget : leaf;
    }

    private showPlayInvUi(canvas: cc.Node): cc.Node | null {
        const btnRoot = this.resolveBtnInvisibilityRoot(canvas);
        const leaf = this.resolveInvisibilityLeaf(canvas);
        if (btnRoot && btnRoot.isValid) {
            btnRoot.active = true;
            btnRoot.opacity = 255;
        }
        if (leaf && leaf.isValid) {
            leaf.active = true;
            if (!btnRoot || !btnRoot.isValid) {
                leaf.opacity = 255;
            }
        }
        const btnComp =
            (leaf && leaf.getComponent(cc.Button)) ||
            (btnRoot && btnRoot.getComponent(cc.Button)) ||
            null;
        if (btnComp) {
            btnComp.interactable = true;
        }
        this.applyInvisibilityModeLabel(canvas);
        const tapTarget = btnRoot || leaf;
        return tapTarget && tapTarget.isValid ? tapTarget : leaf;
    }

    /** Nhãn nút Invisibility — luôn tên chế độ; điều kiện mở khóa chỉ hiện trong Toast. */
    private applyInvisibilityModeLabel(canvas: cc.Node): void {
        const leaf = this.resolveInvisibilityLeaf(canvas);
        const root = this.resolveBtnInvisibilityRoot(canvas);
        const text = I18n.t('LOADING_MODE_INVISIBILITY');
        const nodes: cc.Node[] = [];
        if (leaf && leaf.isValid) {
            nodes.push(leaf);
        }
        if (root && root.isValid && nodes.indexOf(root) < 0) {
            nodes.push(root);
        }
        for (let i = 0; i < nodes.length; i++) {
            const lab = nodes[i].getComponent(cc.Label) || nodes[i].getComponentInChildren(cc.Label);
            if (lab) {
                lab.string = text;
            }
        }
    }

    /** Chế độ tàng hình khóa: chạm nút → Toast 2s, không load scene. */
    private bindInvisibilityLockedTap(_canvas: cc.Node, tapTarget: cc.Node, leaf: cc.Node | null): void {
        const self = this;
        const targets: cc.Node[] = [];
        if (tapTarget && tapTarget.isValid) {
            targets.push(tapTarget);
        }
        if (leaf && leaf.isValid && targets.indexOf(leaf) < 0) {
            targets.push(leaf);
        }
        const onTap = function (): void {
            self.showInvisibilityLockedToast();
        };
        for (let i = 0; i < targets.length; i++) {
            const n = targets[i];
            n.off(cc.Node.EventType.TOUCH_END);
            n.on(cc.Node.EventType.TOUCH_END, onTap);
        }
    }

    private ensureToastController(): ToastController | null {
        if (this.mToastCtrl && this.mToastCtrl.isValid) {
            return this.mToastCtrl;
        }
        if (!this.toastPrefab) {
            return null;
        }
        let host = this.node.getChildByName('ToastHost');
        if (!host || !host.isValid) {
            host = new cc.Node('ToastHost');
            host.zIndex = 400;
            this.node.addChild(host);
        }
        const inst = cc.instantiate(this.toastPrefab);
        host.addChild(inst);
        this.mToastCtrl = inst.addComponent(ToastController);
        return this.mToastCtrl;
    }

    private showInvisibilityLockedToast(): void {
        const msg = I18n.t('TOAST_INVISIBILITY_LOCKED');
        const ctrl = this.ensureToastController();
        if (ctrl) {
            ctrl.show(msg, INVISIBILITY_LOCKED_TOAST_SECONDS);
            return;
        }
        cc.warn('[LoadingScene] toastPrefab chưa gán —', msg);
    }

    private resolveBtnContinueRoot(canvas: cc.Node): cc.Node | null {
        return this.findDescendantByName(canvas, 'btn_Continue');
    }

    /** Label chữ trong `btn_Continue` → `Continue` → `Label`. */
    private resolveContinueTextLabel(canvas: cc.Node): cc.Label | null {
        const btn = this.resolveBtnContinueRoot(canvas);
        if (!btn) {
            return null;
        }
        const cont = btn.getChildByName('Continue');
        if (!cont) {
            return null;
        }
        const labelNode = cont.getChildByName('Label');
        if (labelNode) {
            const c = labelNode.getComponent(cc.Label);
            if (c) {
                return c;
            }
        }
        return cont.getComponent(cc.Label) || cont.getComponentInChildren(cc.Label);
    }

    private hideContinueUi(canvas: cc.Node): void {
        const root = this.resolveBtnContinueRoot(canvas);
        if (root && root.isValid) {
            root.active = false;
        }
    }

    private stopContinueLabelPulse(): void {
        this.unschedule(this.tickContinueLabelPulse);
        if (this.mContinueTextLabel && this.mContinueTextLabel.isValid) {
            cc.Tween.stopAllByTarget(this.mContinueTextLabel);
        }
    }

    private tickContinueLabelPulse(dt: number): void {
        const lab = this.mContinueTextLabel;
        if (!lab || !lab.node || !lab.isValid || !lab.node.activeInHierarchy) {
            this.unschedule(this.tickContinueLabelPulse);
            return;
        }
        this.mContinuePulseTime += dt;
        const T = Math.max(0.2, CONTINUE_PULSE_PERIOD_SEC);
        // u: 0 → 1 → 0 mượt trong một chu kỳ (cosine ease)
        const u = 0.5 - 0.5 * Math.cos((2 * Math.PI * this.mContinuePulseTime) / T);
        const fs = CONTINUE_FONT_MIN + u * (CONTINUE_FONT_MAX - CONTINUE_FONT_MIN);
        lab.fontSize = fs;
        lab.lineHeight = fs * 1.12;
    }

    private startContinueLabelPulse(): void {
        const lab = this.mContinueTextLabel;
        if (!lab || !lab.node || !lab.isValid) {
            return;
        }
        this.stopContinueLabelPulse();
        this.mContinuePulseTime = 0;
        lab.fontSize = CONTINUE_FONT_MIN;
        lab.lineHeight = CONTINUE_FONT_MIN * 1.12;
        this.schedule(this.tickContinueLabelPulse, 0);
    }

    /** Về từ Marathon/Normal: không Đang tải, không Continue — vào thẳng chọn chế độ. */
    private applyHomeReturnFromGameLayout(canvas: cc.Node): void {
        this.mEndLoadingScheduled = true;
        this.mContinueDismissed = true;
        if (this.mLoadingDotsTimer >= 0) {
            clearInterval(this.mLoadingDotsTimer);
            this.mLoadingDotsTimer = -1;
        }
        if (this.mLoadingNode && this.mLoadingNode.isValid) {
            this.mLoadingNode.active = false;
        }
        if (this.mLoadingStatusLabel && this.mLoadingStatusLabel.node && this.mLoadingStatusLabel.node.isValid) {
            if (!this.mLoadingNode || this.mLoadingStatusLabel.node !== this.mLoadingNode) {
                this.mLoadingStatusLabel.node.active = false;
            }
        }
        this.hideContinueUi(canvas);
        this.mContinueTextLabel = null;
        this.stopContinueLabelPulse();
        this.revealModePickersAndBind(canvas);
    }

    /** (1) labelLoading + chấm; sau `loadingDisplaySeconds` → (2) bật Continue. */
    private beginMainLoadingFlow(): void {
        this.mEndLoadingScheduled = false;
        this.mLoadingDotsIndex = 0;
        if (this.mLoadingNode && this.mLoadingNode.isValid) {
            this.mLoadingNode.active = true;
        }
        if (this.mLoadingDotsTimer >= 0) {
            clearInterval(this.mLoadingDotsTimer);
            this.mLoadingDotsTimer = -1;
        }
        this.mLoadingDotsTimer = setInterval(this.tickLoadingDots.bind(this), 450) as unknown as number;

        const delay = Math.max(0.05, this.loadingDisplaySeconds);
        this.scheduleOnce(this.endLoadingPhase.bind(this), delay);
    }

    private tickLoadingDots(): void {
        if (this.mEndLoadingScheduled) {
            return;
        }
        const lab = this.mLoadingStatusLabel;
        if (!lab || !lab.node || !lab.node.activeInHierarchy) {
            return;
        }
        if (lab.node.name === 'labelGameName') {
            return;
        }
        const base = I18n.t('LOADING');
        const bases = [base, base + '.', base + '..', base + '...'];
        lab.string = bases[this.mLoadingDotsIndex % bases.length];
        this.mLoadingDotsIndex += 1;
    }

    private endLoadingPhase(): void {
        if (this.mEndLoadingScheduled) {
            return;
        }
        this.mEndLoadingScheduled = true;
        if (this.mLoadingDotsTimer >= 0) {
            clearInterval(this.mLoadingDotsTimer);
            this.mLoadingDotsTimer = -1;
        }
        if (this.mLoadingNode && this.mLoadingNode.isValid) {
            this.mLoadingNode.active = false;
        }

        const canvas = this.node;
        this.showContinuePhase(canvas);
    }

    /** Sau khi hết thời gian loading: hiện Continue + tween cỡ chữ. */
    private showContinuePhase(canvas: cc.Node): void {
        this.hidePlayUi(canvas);

        const btnContinue = this.resolveBtnContinueRoot(canvas);
        const continueNode = btnContinue ? btnContinue.getChildByName('Continue') : null;
        if (btnContinue && btnContinue.isValid) {
            btnContinue.active = true;
        }
        if (continueNode && continueNode.isValid) {
            continueNode.active = true;
        }

        this.mContinueTextLabel = this.resolveContinueTextLabel(canvas);
        if (this.mContinueTextLabel && this.mContinueTextLabel.node && this.mContinueTextLabel.isValid) {
            this.mContinueTextLabel.string = I18n.t('CONTINUE');
        }
        this.startContinueLabelPulse();

        if (btnContinue && btnContinue.isValid) {
            btnContinue.off(cc.Node.EventType.TOUCH_END, this.handleContinueTap, this);
            btnContinue.on(cc.Node.EventType.TOUCH_END, this.handleContinueTap, this);
        } else {
            cc.warn('[LoadingScene] Không tìm thấy btn_Continue — hiển thị luôn chọn chế độ.');
            this.mContinueDismissed = true;
            this.revealModePickersAndBind(canvas);
        }
    }

    private handleContinueTap(): void {
        if (this.mContinueDismissed) {
            return;
        }
        this.mContinueDismissed = true;

        const btnContinue = this.resolveBtnContinueRoot(this.node);
        if (btnContinue && btnContinue.isValid) {
            btnContinue.off(cc.Node.EventType.TOUCH_END, this.handleContinueTap, this);
        }

        this.stopContinueLabelPulse();
        this.hideContinueUi(this.node);
        this.revealModePickersAndBind(this.node);
    }

    private revealModePickersAndBind(canvas: cc.Node): void {
        const tapTarget = this.showPlayUi(canvas);
        const tapNor = this.showPlayNorUi(canvas);
        const tapInv = this.showPlayInvUi(canvas);
        if (tapTarget) {
            this.bindPlayLikeNavigation(canvas, tapTarget, this.resolvePlayLeaf(canvas), SCENE_MARATHON);
        }
        if (tapNor) {
            this.bindPlayLikeNavigation(canvas, tapNor, this.resolvePlayNorLeaf(canvas), SCENE_NORMAL);
        }
        if (tapInv) {
            if (isInvisibilityModeUnlocked()) {
                this.bindPlayLikeNavigation(canvas, tapInv, this.resolveInvisibilityLeaf(canvas), SCENE_INVISIBILITY);
            } else {
                this.bindInvisibilityLockedTap(canvas, tapInv, this.resolveInvisibilityLeaf(canvas));
            }
        }
        if (!tapTarget && !tapNor && !tapInv) {
            cc.warn(
                '[LoadingScene] Không tìm thấy nút marathon/normal/invisibility — tự chuyển marathonScene sau delay.',
            );
            const wait = Math.max(0, this.delayAfterPlaySeconds);
            const selfFallback = this;
            this.scheduleOnce(function () {
                if (selfFallback.mLoadingDotsTimer >= 0) {
                    clearInterval(selfFallback.mLoadingDotsTimer);
                    selfFallback.mLoadingDotsTimer = -1;
                }
                selfFallback.stopContinueLabelPulse();
                cc.director.loadScene(SCENE_MARATHON);
            }, wait);
        }
    }

    /**
     * Bấm Play / PlayNor → ẩn cả hai nút, bật lại labelLoading + chấm (`mEndLoadingScheduled = false`).
     * Gắn TOUCH_END lên `tapTarget` và `leaf` khi khác nhau (touch thường dừng ở node có Button).
     */
    private bindPlayLikeNavigation(
        canvas: cc.Node,
        tapTarget: cc.Node,
        leaf: cc.Node | null,
        sceneName: string,
    ): void {
        const self = this;
        const targets: cc.Node[] = [];
        if (tapTarget && tapTarget.isValid) {
            targets.push(tapTarget);
        }
        if (leaf && leaf.isValid && targets.indexOf(leaf) < 0) {
            targets.push(leaf);
        }

        const onTap = function (): void {
            if (self.mSceneTransitionStarted) {
                return;
            }
            self.mSceneTransitionStarted = true;
            self.hidePlayUi(canvas);

            if (self.mLoadingNode && self.mLoadingNode.isValid) {
                self.mLoadingNode.active = true;
            }
            self.mEndLoadingScheduled = false;
            self.mLoadingDotsIndex = 0;
            const lab = self.mLoadingStatusLabel;
            if (lab) {
                lab.string = I18n.t('LOADING');
            }
            if (self.mLoadingDotsTimer >= 0) {
                clearInterval(self.mLoadingDotsTimer);
                self.mLoadingDotsTimer = -1;
            }
            self.mLoadingDotsTimer = setInterval(self.tickLoadingDots.bind(self), 450) as unknown as number;

            const w = Math.max(0.05, self.delayAfterPlaySeconds);
            self.scheduleOnce(function () {
                if (self.mLoadingDotsTimer >= 0) {
                    clearInterval(self.mLoadingDotsTimer);
                    self.mLoadingDotsTimer = -1;
                }
                self.stopContinueLabelPulse();
                cc.director.loadScene(sceneName);
            }, w);
        };

        for (let i = 0; i < targets.length; i++) {
            const n = targets[i];
            n.off(cc.Node.EventType.TOUCH_END);
            n.on(cc.Node.EventType.TOUCH_END, onTap);
        }
    }
}
