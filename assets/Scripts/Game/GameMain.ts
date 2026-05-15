/**
 * Title: GameMain
 * Description: cc.Component entry point for the falling-block puzzle game.
 *              Attached to the Canvas of marathonScene / normalScene / invisibilityScene. On load it builds the
 *              entire UI (HUD, board, side panels, overlays, ad placeholder)
 *              programmatically via UIBuilder, wires gameplay (Board,
 *              Tetromino, 7-bag) and input (gestures + keyboard), and runs
 *              the gravity / lock-delay / line-clear loop in update(dt).
 *
 *              `gameMode` (Editor): Marathon / Invisibility use line-based levels + speed curve; Invisibility adds
 *              stack visibility cycling. Normal uses fixed gravity, flat scoring, and hides the level panel.
 *
 *              No prefab, sprite, or font asset is required.
 */

import { AudioMgr } from './AudioMgr';
import MusicBg from './MusicBg';
import SettingPanelController from '../Components/SettingPanelController';
import LoadingScene from '../Components/LoadingScene';
import { Bag } from './Bag';
import { Board } from './Board';
import { GameConstants, GameMode, GameState, PieceKind, hexToColor, storageBestScoreKey } from './GameConstants';
import { marathonGravitySecondsForLevel, invisibilityGravitySecondsForLevel, normalGravitySeconds, scoreMultiplierLevel } from './GameplayRules';
import { applyMarathonScenePlaceholderLayout } from './MarathonSceneLayout';
import { InputCtrl, InputHandlers } from './InputCtrl';
import { Renderer } from './Renderer';
import { Tetromino, PieceState } from './Tetromino';
import { UIBuilder, UIRefs } from './UIBuilder';
import { seedShellForPlayableCanvas, setUILayoutPositionsFromCode } from './UIHierarchy';
import { ensureBgBhBlurOnCanvas } from '../Generic/BgBhBlurSprite';
import { I18n } from '../I18n/I18n';
import { applyGameplayLocale, applyPlaySceneEditorLocale } from '../I18n/GameplayLocaleApply';
import GuidePanelController, { findGuidePrefabRoot, isGuidePrefabRoot } from '../Components/GuidePanelController';

const { ccclass, property, executeInEditMode } = cc._decorator;

@ccclass
@executeInEditMode
export default class GameMain extends cc.Component {

    @property({ tooltip: 'Show ad banner placeholder at the bottom of the screen' })
    public showAdBanner: boolean = true;

    @property({ tooltip: 'Auto start the game shortly after scene load' })
    public autoStart: boolean = false;

    @property({ tooltip: 'Delay (seconds) before auto-start when enabled' })
    public autoStartDelay: number = 1.0;

    @property({
        displayName: 'Script overrides Editor UI layout',
        tooltip:
            'Leave OFF (default): Play keeps Transform / Anchor / Size from the Hierarchy.\n' +
            'Turn ON if you want MarathonSceneLayout + UIBuilder to force positions each Play (old behaviour).',
    })
    public applyUILayoutFromCode: boolean = false;

    @property({
        type: cc.Enum(GameMode),
        tooltip:
            'Marathon / Invisibility: level every ' +
            String(GameConstants.MARATHON_LINES_PER_LEVEL) +
            ' lines; speed curve differs per mode. Normal: fixed fall speed, no level in scoring, level panel hidden.',
    })
    public gameMode: GameMode = GameMode.Marathon;

    @property({
        type: cc.AudioClip,
        tooltip:
            'Nhạc nền cho scene chơi này (gán khác nhau trên marathon / normal / invisibility trong Inspector). Trống = không phát.',
    })
    public backgroundMusic: cc.AudioClip | null = null;

    @property({ range: [0, 1, 0.01], tooltip: 'Âm lượng nhạc nền (0–1).' })
    public backgroundMusicVolume = 0.55;

    @property({ type: cc.AudioClip, tooltip: 'Drop.mp3 — khi khóa gạch (đáy / chồng).' })
    private sfxDrop: cc.AudioClip | null = null;

    @property({ type: cc.AudioClip, tooltip: 'C1l.mp3 — xoá 1 hàng.' })
    private sfxC1l: cc.AudioClip | null = null;
    @property({ type: cc.AudioClip, tooltip: 'C2l.mp3 — xoá 2 hàng.' })
    private sfxC2l: cc.AudioClip | null = null;
    @property({ type: cc.AudioClip, tooltip: 'C3l.mp3 — xoá 3 hàng.' })
    private sfxC3l: cc.AudioClip | null = null;
    @property({ type: cc.AudioClip, tooltip: 'C4l.mp3 — xoá 4 hàng; xoá ≥5 hàng một lần cũng dùng clip này.' })
    private sfxC4l: cc.AudioClip | null = null;
    /** @deprecated Không gán — không còn clip riêng cho 5 hàng. */
    @property({ type: cc.AudioClip, tooltip: '(Không dùng) Trước đây C5l.' })
    private sfxC5l: cc.AudioClip | null = null;

    @property({ type: cc.AudioClip, tooltip: 'EvaluationGood.mp3 — (tuỳ chỉnh sau, hiện không gọi từ streak mới).' })
    private sfxEvalGood: cc.AudioClip | null = null;
    @property({ type: cc.AudioClip, tooltip: 'EvaluationGreat.mp3 — (tuỳ chỉnh sau).' })
    private sfxEvalGreat: cc.AudioClip | null = null;
    @property({ type: cc.AudioClip, tooltip: 'EvaluationExcellect.mp3 (Excellent) — (tuỳ chỉnh sau).' })
    private sfxEvalExcellent: cc.AudioClip | null = null;
    @property({ type: cc.AudioClip, tooltip: 'EvaluationAmazing.mp3 — (tuỳ chỉnh sau).' })
    private sfxEvalAmazing: cc.AudioClip | null = null;
    @property({ type: cc.AudioClip, tooltip: 'EvaluationUnbelievable.mp3 — sau 5 lần liên tiếp xoá ≥2 hàng (mọi chế độ).' })
    private sfxEvalUnbelievable: cc.AudioClip | null = null;

    @property({ type: cc.AudioClip, tooltip: 'Lose.mp3 — khi thua.' })
    private sfxLose: cc.AudioClip | null = null;

    @property({ type: cc.AudioClip, tooltip: 'UI — On/Off, Close, New Game, Home, Lang (prefab Setting / GameOver).' })
    private sfxUiButton: cc.AudioClip | null = null;
    @property({ type: cc.AudioClip, tooltip: 'Click.mp3 — mở Setting (btn_setting / bth_Setting).' })
    private sfxSettingOpen: cc.AudioClip | null = null;
    @property({ type: cc.AudioClip, tooltip: 'GameStart.mp3 — ván mới / chơi lại.' })
    private sfxGameStart: cc.AudioClip | null = null;

    @property({
        type: cc.Prefab,
        tooltip: 'Prefab Setting — gán trong Inspector (marathonScene / normalScene). Trống = không mở được.',
    })
    private settingPrefab: cc.Prefab | null = null;

    @property({
        type: cc.Prefab,
        tooltip:
            'Prefab GameOver (label **cs** = điểm ván, **hc** = điểm cao). Trống = dùng overlay code UIBuilder.',
    })
    private gameOverPrefab: cc.Prefab | null = null;

    @property({
        type: cc.Prefab,
        tooltip:
            'Prefab Guide (Normal / Marathon / Invisible + Desc). Trống = dùng node Guide có sẵn trong scene.',
    })
    private guidePrefab: cc.Prefab | null = null;

    @property({
        tooltip:
            'Bật để luôn hiện Guide khi test (bỏ qua điều kiện best < 50). Tắt khi build release.',
    })
    public forceShowGuide = false;

    private mLocaleUnsub: (() => void) | null = null;
    private mGuideController: GuidePanelController | null = null;
    private mSettingsRoot: cc.Node | null = null;
    /** Đang mở bảng Setting (khác PauseOverlay). */
    private mSettingsPanelActive = false;
    /** Sau thua / từ Setting — phát lại BGM từ đầu ở lần startGame kế tiếp. */
    private mReopenMusicAfterRestart = false;
    private ui: UIRefs = null as any;
    private board: Board = null as any;
    private renderer: Renderer = null as any;
    private bag: Bag = null as any;
    private input: InputCtrl = null as any;

    private state: GameState = GameState.Boot;
    private active: PieceState | null = null;
    private holdKind: PieceKind | null = null;
    private holdUsedThisDrop: boolean = false;

    private gravityTimer: number = 0;
    private gravitySeconds: number = normalGravitySeconds();
    private softDropActive: boolean = false;

    private lockTimer: number = 0;
    private lockResets: number = 0;
    private lockArmed: boolean = false;

    private clearAnimTimer: number = 0;
    private clearAnimRows: number[] = [];
    private postClearAction: (() => void) | null = null;

    private score: number = 0;
    private displayScore: number = 0;
    private bestScore: number = 0;
    private linesTotal: number = 0;
    private level: number = 1;

    private ghostY: number | null = null;

    /** 0 .. (hidden+reveal): chế độ Invisibility — chỉ tăng khi Running. */
    private mInvisPhaseTimer = 0;
    /** Invisibility (pha ẩn): `Date.now()` lúc khối bắt đầu “đậu” — dùng grace hiển thị; null khi đang lơ lửng. */
    private mInvisGroundTouchStartMs: number | null = null;

    /** Chuỗi xoá ≥ MULTI_LINE_STREAK_MIN_LINES hàng liên tiếp (mọi chế độ) — đủ MULTI_LINE_STREAK_FOR_UNBELIEVABLE → Unbelievable. */
    private mMultiLineClearStreak = 0;

    /**
     * Sau `loadScene` từ Loading, chạy UIBuilder / destroy / prefab trong cùng frame với onLoad của
     * toàn cây scene dễ gây lỗi engine 5000 (_destroyImmediate null). Hoãn sang frame kế.
     */
    private bootstrapGameplayAfterSceneReady = (): void => {
        if (!this.isValid) {
            return;
        }

        // Remove stray nodes only; keep Main Camera + named UI roots from marathonScene.fire
        // (organizers + panels: gameComponents, buttonLayer, Background, TopHUD, BoardRoot, …).
        const preservedUiRoots = new Set<string>([
            'Main Camera',
            'gameComponents',
            'buttonLayer',
            'Background',
            'bg-bh',
            'TopHUD',
            'BoardRoot',
            'Board',
            'HoldPanel',
            'Hold',
            'NextPanel',
            'Next',
            'PauseButton',
            'AdBannerPlaceholder',
            'OverlayRoot',
            'Guide',
        ]);
        const oldChildren = this.node.children.slice();
        for (let i = 0; i < oldChildren.length; i++) {
            const ch = oldChildren[i];
            if (!ch || !ch.isValid) {
                continue;
            }
            if (ch.getComponent(cc.Camera)) {
                continue;
            }
            if (preservedUiRoots.has(ch.name)) {
                continue;
            }
            ch.destroy();
        }

        // Normal vs Marathon: derive from scene name so HUD/rules stay correct if Inspector `gameMode` is wrong.
        this.gameMode = this.resolveGameModeFromSceneName();

        AudioMgr.instance().loadAudioPrefs();
        I18n.initFromStorage();
        this.ensureBackgroundMusic();
        this.bindGameplaySfx();

        this.bestScore = this.loadPersistedBestScore();

        // Build all UI
        const self = this;
        ensureBgBhBlurOnCanvas(this.node);

        this.ui = UIBuilder.build(this.node, {
            onPause: function () { self.pauseGame(); },
            onResume: function () { self.resumeGame(); },
            onRestart: function () { self.restartGame(); },
            onHome: function () { self.goHome(); },
            onPlay: function () { self.startGame(); },
            onHoldTap: function () { self.tryHold(); },
        }, { layoutFromCode: this.applyUILayoutFromCode === true, skipStartOverlay: true });

        this.mountGameOverPrefabIfNeeded();
        this.ensureSettingsPanel();
        this.bindSettingButton();

        const selfForLocale = this;
        this.mLocaleUnsub = I18n.subscribe(function () {
            if (selfForLocale.ui) {
                applyGameplayLocale(selfForLocale.ui);
            }
            applyPlaySceneEditorLocale(selfForLocale.node);
            if (selfForLocale.mGuideController && selfForLocale.mGuideController.isValid) {
                selfForLocale.mGuideController.applyDescAndGestureLocale();
            }
        });
        applyGameplayLocale(this.ui);
        applyPlaySceneEditorLocale(this.node);

        if (!this.showAdBanner) {
            this.ui.adBanner.active = false;
        }

        this.applyGameModePresentation();

        // Initialize board + bag + renderer
        this.board = new Board();
        this.bag = new Bag();
        this.renderer = new Renderer(
            this.board,
            this.ui.boardGraphics,
            GameConstants.BLOCK_WIDTH,
            GameConstants.BLOCK_HEIGHT
        );

        // Wire input
        const handlers: InputHandlers = {
            moveLeft: function () { self.tryMove(-1); },
            moveRight: function () { self.tryMove(+1); },
            rotateCW: function () { self.tryRotate(); },
            softDropStart: function () { self.softDropActive = true; },
            softDropStop: function () { self.softDropActive = false; },
            hardDrop: function () { self.tryHardDrop(); },
            holdPiece: function () { self.tryHold(); },
            togglePause: function () { self.togglePause(); },
            restart: function () {
                if (self.state === GameState.GameOver) self.restartGame();
            },
        };
        this.input = new InputCtrl(this.ui.boardTouchNode, handlers);
        this.input.attach();
        this.input.setGameplayInputEnabled(false);

        // Initial render and HUD
        this.refreshHUD();
        this.drawGameplayFrame({ active: null, ghostY: null });
        UIBuilder.drawHoldPreview(this.ui, null);
        UIBuilder.drawNextPreview(this.ui, []);

        this.state = GameState.Ready;
        this.tryShowGuideThenStart();
    };

    private tryShowGuideThenStart(): void {
        const self = this;
        const ctrl = this.ensureGuidePanel();
        const showGuide =
            ctrl != null &&
            ctrl.applyForPlayScene(this.gameMode, this.bestScore, this.forceShowGuide);
        if (!showGuide && ctrl && !this.forceShowGuide) {
            cc.log(
                '[Guide] Ẩn — best score',
                this.bestScore,
                '>=',
                GameConstants.GUIDE_SHOW_BELOW_SCORE,
                '(bật forceShowGuide trên GameMain để test)',
            );
        }
        if (showGuide && ctrl) {
            this.input.setGameplayInputEnabled(false);
            ctrl.setOnClose(function () {
                ctrl.setOnClose(null);
                self.beginPlayAfterGuide();
            });
            return;
        }
        this.beginPlayAfterGuide();
    }

    private beginPlayAfterGuide(): void {
        const self = this;
        if (this.autoStart) {
            const delay = Math.max(0.05, this.autoStartDelay);
            this.scheduleOnce(function () {
                if (self.state === GameState.Ready) {
                    self.startGame();
                }
            }, delay);
        } else {
            this.startGame();
        }
    }

    private ensureGuidePanel(): GuidePanelController | null {
        if (this.mGuideController && this.mGuideController.isValid) {
            return this.mGuideController;
        }

        this.removeLegacySceneGuides();

        let root: cc.Node | null = null;
        if (this.guidePrefab) {
            root = cc.instantiate(this.guidePrefab);
            root.name = 'Guide';
            const host = UIBuilder.findRootDeep(this.node, 'OverlayRoot') || this.node;
            host.addChild(root);
            root.setSiblingIndex(host.childrenCount - 1);
            root.setPosition(0, 0);
        } else {
            root = findGuidePrefabRoot(this.node);
        }

        if (!root || !root.isValid) {
            return null;
        }
        let ctrl = root.getComponent(GuidePanelController);
        if (!ctrl) {
            ctrl = root.addComponent(GuidePanelController);
        }
        this.mGuideController = ctrl;
        return ctrl;
    }

    /** Node Guide cũ (3 Label, không có Ui/Desc) — gây lệch vị trí / không có mô tả mode. */
    private removeLegacySceneGuides(): void {
        const stack: cc.Node[] = [this.node];
        const remove: cc.Node[] = [];
        while (stack.length > 0) {
            const n = stack.pop() as cc.Node;
            if (n !== this.node && n.name === 'Guide' && !isGuidePrefabRoot(n)) {
                remove.push(n);
            }
            for (let i = 0; i < n.children.length; i++) {
                stack.push(n.children[i]);
            }
        }
        for (let i = 0; i < remove.length; i++) {
            remove[i].destroy();
        }
    }

    // ============================================================
    // Lifecycle
    // ============================================================
    onLoad(): void {
        // In scene editor only (not Play preview): create shell nodes so Hierarchy shows parents/children.
        if (typeof CC_EDITOR !== 'undefined' && CC_EDITOR && typeof CC_PREVIEW !== 'undefined' && !CC_PREVIEW) {
            this.node.setContentSize(GameConstants.DESIGN_WIDTH, GameConstants.DESIGN_HEIGHT);
            this.node.setAnchorPoint(0.5, 0.5);
            setUILayoutPositionsFromCode(this.applyUILayoutFromCode);
            if (this.applyUILayoutFromCode) {
                applyMarathonScenePlaceholderLayout(this.node);
            }
            seedShellForPlayableCanvas(this.node);
            setUILayoutPositionsFromCode(true);
            return;
        }

        // Configure canvas for portrait 9:16 design and SHOW_ALL fit.
        this.node.setContentSize(GameConstants.DESIGN_WIDTH, GameConstants.DESIGN_HEIGHT);
        this.node.setAnchorPoint(0.5, 0.5);
        const canvasComp = this.getComponent(cc.Canvas);
        if (canvasComp) {
            canvasComp.designResolution = cc.size(GameConstants.DESIGN_WIDTH, GameConstants.DESIGN_HEIGHT);
            // SHOW_ALL keeps gameplay scale consistent across devices.
            canvasComp.fitWidth = true;
            canvasComp.fitHeight = true;
        } else {
            cc.view.setDesignResolutionSize(
                GameConstants.DESIGN_WIDTH, GameConstants.DESIGN_HEIGHT,
                cc.ResolutionPolicy.SHOW_ALL
            );
        }

        // Canvas tint multiplies every child color — a dark tint made the in-game navy
        // look different from the camera clear / letterbox bars ("two blues"). Keep white.
        this.node.color = cc.color(255, 255, 255);

        if (this.applyUILayoutFromCode) {
            applyMarathonScenePlaceholderLayout(this.node);
        }

        const camNode = this.node.getChildByName('Main Camera');
        if (camNode) {
            const cam = camNode.getComponent(cc.Camera);
            if (cam) {
                cam.backgroundColor = hexToColor(GameConstants.COLOR.BG_DEEP);
            }
        }

        this.unschedule(this.bootstrapGameplayAfterSceneReady);
        this.scheduleOnce(this.bootstrapGameplayAfterSceneReady, 0);
    }

    /** Nhạc nền riêng scene; `MusicBg` gọi `stopMusic` khi component destroy (đổi scene). */
    private bindGameplaySfx(): void {
        const a = AudioMgr.instance();
        if (this.sfxDrop) {
            a.dropClip = this.sfxDrop;
        }
        a.setClearLineClip(1, this.sfxC1l);
        a.setClearLineClip(2, this.sfxC2l);
        a.setClearLineClip(3, this.sfxC3l);
        a.setClearLineClip(4, this.sfxC4l);
        a.evalGoodClip = this.sfxEvalGood;
        a.evalGreatClip = this.sfxEvalGreat;
        a.evalExcellentClip = this.sfxEvalExcellent;
        a.evalAmazingClip = this.sfxEvalAmazing;
        a.evalUnbelievableClip = this.sfxEvalUnbelievable;
        a.loseClip = this.sfxLose;
        if (this.sfxUiButton) {
            a.uiButtonClickClip = this.sfxUiButton;
        }
        if (this.sfxSettingOpen) {
            a.settingMenuOpenClickClip = this.sfxSettingOpen;
        }
        if (this.sfxGameStart) {
            a.gameStartClip = this.sfxGameStart;
        }
    }

    private ensureBackgroundMusic(): void {
        if (!this.backgroundMusic) {
            return;
        }
        let mb = this.node.getComponent(MusicBg);
        if (!mb) {
            mb = this.node.addComponent(MusicBg);
        }
        mb.musicClip = this.backgroundMusic;
        mb.volume = this.backgroundMusicVolume;
        mb.loop = true;
    }

    onDestroy(): void {
        this.unschedule(this.deferredLoadLoadingSceneFromSettings);
        this.unschedule(this.bootstrapGameplayAfterSceneReady);
        this.unschedule(this.applyGameOverPrefabMountDeferred);
        if (this.mLocaleUnsub) {
            this.mLocaleUnsub();
            this.mLocaleUnsub = null;
        }
        if (this.input) this.input.detach();
    }

    /**
     * Xóa con của overlay rồi `instantiate` prefab — `destroy()` bị trì hoãn tới cuối frame.
     * Gắn prefab trong cùng stack với vòng destroy dễ gây lỗi nội bộ (5000 / _destroyImmediate) trên web.
     */
    private mountGameOverPrefabIfNeeded(): void {
        if (!this.gameOverPrefab || !this.ui) {
            return;
        }
        const host = this.ui.gameOverOverlay;
        if (!host || !host.isValid) {
            return;
        }
        this.unschedule(this.applyGameOverPrefabMountDeferred);
        const oldCh = host.children.slice();
        for (let i = 0; i < oldCh.length; i++) {
            const c = oldCh[i];
            if (c && c.isValid) {
                c.destroy();
            }
        }
        this.scheduleOnce(this.applyGameOverPrefabMountDeferred, 0);
    }

    private applyGameOverPrefabMountDeferred(): void {
        if (!this.isValid || !this.gameOverPrefab || !this.ui) {
            return;
        }
        const host = this.ui.gameOverOverlay;
        if (!host || !host.isValid) {
            return;
        }
        const inst = cc.instantiate(this.gameOverPrefab);
        host.addChild(inst);

        const csN = UIBuilder.findRootDeep(inst, 'cs');
        const hcN = UIBuilder.findRootDeep(inst, 'hc');
        if (csN) {
            const lab = csN.getComponent(cc.Label);
            if (lab) {
                this.ui.goScoreLabel = lab;
            }
        }
        if (hcN) {
            const lab = hcN.getComponent(cc.Label);
            if (lab) {
                this.ui.goBestLabel = lab;
            }
        }

        const self = this;
        const btnNew = UIBuilder.findRootDeep(inst, 'btnNewGame');
        if (btnNew) {
            btnNew.off(cc.Node.EventType.TOUCH_END);
            btnNew.on(cc.Node.EventType.TOUCH_END, function () {
                AudioMgr.instance().playUiButtonClick();
                self.mReopenMusicAfterRestart = true;
                self.restartGame();
            });
        }
        const btnClose = UIBuilder.findRootDeep(inst, 'btnClose');
        if (btnClose) {
            btnClose.off(cc.Node.EventType.TOUCH_END);
            btnClose.on(cc.Node.EventType.TOUCH_END, function () {
                AudioMgr.instance().playUiButtonClick();
                self.goHome();
            });
        }
        const btnHome = UIBuilder.findRootDeep(inst, 'btnHome');
        if (btnHome) {
            btnHome.off(cc.Node.EventType.TOUCH_END);
            btnHome.on(cc.Node.EventType.TOUCH_END, function () {
                AudioMgr.instance().playUiButtonClick();
                self.goHome();
            });
        }
        host.active = false;
    }

    private ensureSettingsPanel(): void {
        if (!this.settingPrefab) {
            return;
        }
        if (this.mSettingsRoot && this.mSettingsRoot.isValid) {
            return;
        }
        const host = new cc.Node('SettingsPanelHost');
        host.zIndex = 250;
        host.active = false;
        const n = cc.instantiate(this.settingPrefab);
        host.addChild(n);
        const ctrl = n.addComponent(SettingPanelController);
        const self = this;
        ctrl.wire({
            onClose: function () {
                self.closeSettings();
            },
            onNewGame: function () {
                self.mReopenMusicAfterRestart = true;
                self.restartGame();
            },
            onHome: function () {
                self.onSettingsHomePressed();
            },
        });
        this.node.addChild(host);
        this.mSettingsRoot = host;
    }

    private bindSettingButton(): void {
        this.ensureSettingsPanel();
        if (!this.mSettingsRoot) {
            return;
        }
        const setTap = this.findSettingTapTarget();
        if (!setTap) {
            return;
        }
        const self = this;
        setTap.off(cc.Node.EventType.TOUCH_END);
        setTap.on(cc.Node.EventType.TOUCH_END, function () {
            self.openSettings();
        });
    }

    private openSettings(): void {
        if (this.state !== GameState.Running) {
            return;
        }
        if (!this.mSettingsRoot) {
            return;
        }
        AudioMgr.instance().playSettingOpenClick();
        this.mSettingsPanelActive = true;
        this.state = GameState.Paused;
        this.input.setGameplayInputEnabled(false);
        const inner =
            this.mSettingsRoot.children && this.mSettingsRoot.children.length > 0
                ? this.mSettingsRoot.children[0]
                : null;
        const sc = inner && inner.getComponent(SettingPanelController);
        if (sc) {
            sc.refreshVisuals();
        }
        this.mSettingsRoot.active = true;
    }

    private closeSettings(): void {
        if (!this.mSettingsPanelActive) {
            return;
        }
        this.mSettingsPanelActive = false;
        if (this.mSettingsRoot && this.mSettingsRoot.isValid) {
            this.mSettingsRoot.active = false;
        }
        if (this.state === GameState.Paused) {
            this.state = GameState.Running;
            this.input.setGameplayInputEnabled(true);
        }
    }

    /** Điểm ván hiện tại > best theo chế độ → cập nhật localStorage (dùng khi Home từ Setting). */
    private maybePersistBestScoreFromCurrentRun(): void {
        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            try {
                cc.sys.localStorage.setItem(storageBestScoreKey(this.gameMode), String(this.bestScore));
            } catch (e) {
                /* ignore */
            }
        }
        this.refreshHUD();
    }

    /** btnHome trong Setting: lưu high score nếu vượt, đóng panel, 1s sau về Loading. */
    private onSettingsHomePressed(): void {
        this.maybePersistBestScoreFromCurrentRun();
        this.mSettingsPanelActive = false;
        if (this.mSettingsRoot && this.mSettingsRoot.isValid) {
            this.mSettingsRoot.active = false;
        }
        // Không gọi closeSettings() — tránh bật lại input; vẫn Paused tới khi đổi scene.
        this.unschedule(this.deferredLoadLoadingSceneFromSettings);
        this.scheduleOnce(this.deferredLoadLoadingSceneFromSettings, 1);
    }

    private deferredLoadLoadingSceneFromSettings(): void {
        LoadingScene.markEnterLoadingFromGameHome();
        cc.director.loadScene('loadingScene');
    }

    /** Nút Setting: Marathon dùng `bth_Setting` (cha 0×0) + con `Setting` (có Button) — phải gắn lên con. Normal: `btn_setting` / `Setting`. */
    private findSettingTapTarget(): cc.Node | null {
        const bth = UIBuilder.findRootDeep(this.node, 'bth_Setting');
        if (bth && bth.isValid) {
            const inner = bth.getChildByName('Setting');
            if (inner && inner.isValid) {
                return inner;
            }
            return bth;
        }
        const btnSt = UIBuilder.findRootDeep(this.node, 'btn_setting');
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

    // ============================================================
    // Game lifecycle
    // ============================================================
    private startGame(): void {
        this.hideOverlay(this.ui.startOverlay);
        this.hideOverlay(this.ui.gameOverOverlay);
        this.hideOverlay(this.ui.pauseOverlay);
        AudioMgr.instance().playGameStart();
        this.mSettingsPanelActive = false;
        if (this.mSettingsRoot && this.mSettingsRoot.isValid) {
            this.mSettingsRoot.active = false;
        }
        if (this.mReopenMusicAfterRestart) {
            this.mReopenMusicAfterRestart = false;
            const mb = this.node.getComponent(MusicBg);
            if (mb) {
                mb.tryPlay(true);
            }
        }
        this.score = 0;
        this.displayScore = 0;
        this.linesTotal = 0;
        this.level = 1;
        this.mInvisPhaseTimer = 0;
        this.mInvisGroundTouchStartMs = null;
        if (this.gameMode === GameMode.Marathon) {
            this.gravitySeconds = marathonGravitySecondsForLevel(this.level);
        } else if (this.gameMode === GameMode.Invisibility) {
            this.gravitySeconds = invisibilityGravitySecondsForLevel(this.level);
        } else {
            this.gravitySeconds = normalGravitySeconds();
        }
        this.gravityTimer = 0;
        this.lockTimer = 0;
        this.lockResets = 0;
        this.lockArmed = false;
        this.holdKind = null;
        this.holdUsedThisDrop = false;
        this.clearAnimTimer = 0;
        this.clearAnimRows = [];
        this.postClearAction = null;
        this.mMultiLineClearStreak = 0;

        this.board.clear();
        this.bag.reset();

        this.refreshHUD();
        UIBuilder.drawHoldPreview(this.ui, null);

        this.spawnNext();
        this.state = GameState.Running;
        this.input.setGameplayInputEnabled(true);
        this.applyGameModePresentation();
    }

    private restartGame(): void {
        this.startGame();
    }

    private goHome(): void {
        this.hideOverlay(this.ui.pauseOverlay);
        this.hideOverlay(this.ui.gameOverOverlay);
        this.mSettingsPanelActive = false;
        if (this.mSettingsRoot && this.mSettingsRoot.isValid) {
            this.mSettingsRoot.active = false;
        }
        this.input.setGameplayInputEnabled(false);
        LoadingScene.markEnterLoadingFromGameHome();
        cc.director.loadScene('loadingScene');
    }

    private pauseGame(): void {
        if (this.mSettingsPanelActive) {
            return;
        }
        if (this.state !== GameState.Running) return;
        this.state = GameState.Paused;
        this.mInvisGroundTouchStartMs = null;
        this.input.setGameplayInputEnabled(false);
        this.showOverlay(this.ui.pauseOverlay);
    }

    private resumeGame(): void {
        if (this.mSettingsPanelActive) {
            return;
        }
        if (this.state !== GameState.Paused) return;
        this.hideOverlay(this.ui.pauseOverlay);
        this.state = GameState.Running;
        this.input.setGameplayInputEnabled(true);
    }

    private togglePause(): void {
        if (this.mSettingsPanelActive) {
            return;
        }
        if (this.state === GameState.Running) this.pauseGame();
        else if (this.state === GameState.Paused) this.resumeGame();
    }

    private endGame(): void {
        this.mSettingsPanelActive = false;
        if (this.mSettingsRoot && this.mSettingsRoot.isValid) {
            this.mSettingsRoot.active = false;
        }
        this.state = GameState.GameOver;
        this.mInvisGroundTouchStartMs = null;
        this.input.setGameplayInputEnabled(false);
        this.softDropActive = false;
        this.active = null;
        this.ghostY = null;

        if (this.score > this.bestScore) {
            this.bestScore = this.score;
            try {
                cc.sys.localStorage.setItem(storageBestScoreKey(this.gameMode), String(this.bestScore));
            } catch (e) { /* ignore */ }
        }
        this.refreshHUD();
        try {
            cc.audioEngine.stopMusic();
        } catch (_e) {
            // ignore
        }
        AudioMgr.instance().playGameOverOrLose();

        this.ui.goScoreLabel.string = String(this.score);
        this.ui.goBestLabel.string = String(this.bestScore);
        this.showOverlay(this.ui.gameOverOverlay);
    }

    // ============================================================
    // Spawn / hold
    // ============================================================
    private spawnNext(kind?: PieceKind): void {
        const pieceKind: PieceKind = (typeof kind === 'number') ? kind : this.bag.next();
        const cols = this.board.cols;
        // Place bbox so cells at y=1,2 are at the top of the visible field (y=19,20).
        // For 4-tall I (R1), bbox y range [18..21] still fits inside hidden buffer.
        const state: PieceState = {
            kind: pieceKind,
            rotation: 0,
            x: Tetromino.spawnX(cols),
            y: this.board.visibleRows - 2,
        };

        // Game over if spawn immediately collides
        if (!this.board.canPlace(state)) {
            this.active = state;
            this.refreshGhost();
            this.redrawGameplayBoard();
            this.endGame();
            return;
        }

        this.active = state;
        this.holdUsedThisDrop = false;
        this.lockTimer = 0;
        this.lockResets = 0;
        this.lockArmed = false;
        this.gravityTimer = 0;

        // Spawn flash effect
        this.flashSpawn();

        this.refreshGhost();
        this.refreshNextPreview();
        this.redrawGameplayBoard();
    }

    private tryHold(): void {
        if (this.state !== GameState.Running || !this.active) return;
        if (this.holdUsedThisDrop) return;

        const currentKind = this.active.kind;
        if (this.holdKind == null) {
            this.holdKind = currentKind;
            UIBuilder.drawHoldPreview(this.ui, this.holdKind);
            this.spawnNext();
            this.holdUsedThisDrop = true;
        } else {
            const swap = this.holdKind;
            this.holdKind = currentKind;
            UIBuilder.drawHoldPreview(this.ui, this.holdKind);
            this.spawnNext(swap);
            this.holdUsedThisDrop = true;
        }
        AudioMgr.instance().playDrop();
    }

    private refreshNextPreview(): void {
        const peek = this.bag.peek(3);
        UIBuilder.drawNextPreview(this.ui, peek);
    }

    // ============================================================
    // Movement
    // ============================================================
    private tryMove(dx: number): void {
        if (!this.canPlay() || !this.active) return;
        const test: PieceState = { kind: this.active.kind, rotation: this.active.rotation, x: this.active.x + dx, y: this.active.y };
        if (this.board.canPlace(test)) {
            this.active = test;
            this.onPieceMoved(true);
            AudioMgr.instance().playMove();
        }
    }

    private tryRotate(): void {
        if (!this.canPlay() || !this.active) return;
        const newRot = (this.active.rotation + 1) % 4;
        const kicks = Tetromino.kicksFor(this.active.kind);
        for (let i = 0; i < kicks.length; i++) {
            const test: PieceState = {
                kind: this.active.kind,
                rotation: newRot,
                x: this.active.x + kicks[i][0],
                y: this.active.y + kicks[i][1],
            };
            if (this.board.canPlace(test)) {
                this.active = test;
                this.onPieceMoved(true);
                AudioMgr.instance().playRotate();
                return;
            }
        }
    }

    private tryHardDrop(): void {
        if (!this.canPlay() || !this.active) return;
        const dropY = this.board.computeDropY(this.active);
        this.active.y = dropY;
        this.lockPieceNow();
    }

    private softDropTick(): boolean {
        if (!this.active) return false;
        const test: PieceState = { kind: this.active.kind, rotation: this.active.rotation, x: this.active.x, y: this.active.y - 1 };
        if (this.board.canPlace(test)) {
            this.active = test;
            this.onPieceMoved(false);
            return true;
        }
        return false;
    }

    private gravityTick(): boolean {
        if (!this.active) return false;
        const test: PieceState = { kind: this.active.kind, rotation: this.active.rotation, x: this.active.x, y: this.active.y - 1 };
        if (this.board.canPlace(test)) {
            this.active = test;
            this.onPieceMoved(false);
            return true;
        }
        return false;
    }

    private onPieceMoved(reset: boolean): void {
        this.refreshGhost();
        this.redrawGameplayBoard();

        // If the piece can fall again after a user-initiated move, clear lock arming.
        if (this.active && reset) {
            const test: PieceState = { kind: this.active.kind, rotation: this.active.rotation, x: this.active.x, y: this.active.y - 1 };
            if (this.board.canPlace(test)) {
                this.lockArmed = false;
                this.lockTimer = 0;
                return;
            }
        }

        // Otherwise allow a limited number of lock-delay resets when re-moved while armed.
        if (this.lockArmed && reset) {
            if (this.lockResets < GameConstants.LOCK_RESET_LIMIT) {
                this.lockTimer = 0;
                this.lockResets++;
            }
        }
    }

    private refreshGhost(): void {
        if (!this.active) {
            this.ghostY = null;
            return;
        }
        this.ghostY = this.board.computeDropY(this.active);
    }

    /**
     * Tiến độ rơi trực quan 0..1 trong chu kỳ gravity (chỉ khi còn chỗ xuống dưới).
     * Logic vẫn theo ô nguyên; Renderer dịch vẽ xuống từng pixel giữa các ô.
     */
    private computeActiveFallLerp(): number {
        if (!this.active || this.state !== GameState.Running) {
            return 0;
        }
        const test: PieceState = {
            kind: this.active.kind,
            rotation: this.active.rotation,
            x: this.active.x,
            y: this.active.y - 1,
        };
        if (!this.board.canPlace(test)) {
            return 0;
        }
        const interval = this.softDropActive
            ? Math.min(this.gravitySeconds, GameConstants.SOFT_DROP_GRAVITY_SECONDS)
            : this.gravitySeconds;
        if (interval <= 1e-8) {
            return 0;
        }
        return Math.max(0, Math.min(1, this.gravityTimer / interval));
    }

    private drawGameplayFrame(overrides?: {
        active?: PieceState | null;
        ghostY?: number | null;
        activeFallLerp?: number;
        flashRows?: number[];
        flashAlpha?: number;
    }): void {
        if (!this.renderer) {
            return;
        }
        const o = overrides || {};
        const hasActive = Object.prototype.hasOwnProperty.call(o, 'active');
        const hasGhost = Object.prototype.hasOwnProperty.call(o, 'ghostY');
        const active = hasActive ? o.active! : this.active;
        const ghostY = hasGhost ? o.ghostY! : this.ghostY;
        let invisLockedVisible: boolean | undefined;
        let invisActiveGhostVisible: boolean | undefined;
        if (this.gameMode === GameMode.Invisibility) {
            const H = GameConstants.INVISIBILITY_HIDDEN_SECONDS;
            const revealPhase =
                this.state === GameState.LineClear ||
                (this.state === GameState.Running && this.mInvisPhaseTimer >= H);
            invisLockedVisible = revealPhase;
            const belowFloating =
                !active ||
                this.board.canPlace({
                    kind: active.kind,
                    rotation: active.rotation,
                    x: active.x,
                    y: active.y - 1,
                });
            if (active && this.state === GameState.Running && !revealPhase) {
                if (belowFloating) {
                    this.mInvisGroundTouchStartMs = null;
                } else if (this.mInvisGroundTouchStartMs === null) {
                    this.mInvisGroundTouchStartMs = Date.now();
                }
            } else {
                this.mInvisGroundTouchStartMs = null;
            }
            const graceSec = GameConstants.INVISIBILITY_ACTIVE_GRACE_AFTER_TOUCH_SECONDS;
            const inTouchGrace =
                !!active &&
                this.state === GameState.Running &&
                !revealPhase &&
                this.mInvisGroundTouchStartMs !== null &&
                (Date.now() - this.mInvisGroundTouchStartMs) * 0.001 < graceSec;
            invisActiveGhostVisible = revealPhase || belowFloating || inTouchGrace;
        }
        this.renderer.drawAll({
            active,
            ghostY,
            activeFallLerp: o.activeFallLerp,
            flashRows: o.flashRows,
            flashAlpha: o.flashAlpha,
            invisibilityThinGrid: this.gameMode === GameMode.Invisibility,
            invisLockedVisible,
            invisActiveGhostVisible,
        });
    }

    private redrawGameplayBoard(): void {
        this.drawGameplayFrame({
            activeFallLerp: this.computeActiveFallLerp(),
        });
    }

    // ============================================================
    // Lock + line clear
    // ============================================================
    private lockPieceNow(): void {
        if (!this.active) return;
        const cleared = this.board.lockPiece(this.active);
        AudioMgr.instance().playDrop();

        const scoreLv = scoreMultiplierLevel(this.gameMode, this.level);
        this.score += GameConstants.SCORE_PER_LOCK_BASE * scoreLv;

        if (cleared.length > 0) {
            this.beginClearAnim(cleared);
        } else {
            this.mMultiLineClearStreak = 0;
            // Game over check
            if (this.board.hasBlocksInHiddenZone()) {
                this.active = null;
                this.drawGameplayFrame({ active: null, ghostY: null });
                this.endGame();
                return;
            }
            this.active = null;
            this.drawGameplayFrame({ active: null, ghostY: null });
            this.spawnNext();
        }
    }

    private beginClearAnim(rows: number[]): void {
        this.state = GameState.LineClear;
        this.input.setGameplayInputEnabled(false);
        this.clearAnimTimer = 0;
        this.clearAnimRows = rows;
        const lineCount = rows.length;
        const n = Math.min(lineCount, GameConstants.SCORE_MAX_LINES_FOR_CLEAR);
        const scoreLv = scoreMultiplierLevel(this.gameMode, this.level);
        const gained = n * GameConstants.SCORE_PER_LINE_CLEAR_STEP * scoreLv;
        this.score += gained;
        this.linesTotal += lineCount;

        if (this.gameMode === GameMode.Marathon || this.gameMode === GameMode.Invisibility) {
            const newLevel = 1 + Math.floor(this.linesTotal / GameConstants.MARATHON_LINES_PER_LEVEL);
            if (newLevel !== this.level) {
                this.level = newLevel;
                if (this.gameMode === GameMode.Marathon) {
                    this.gravitySeconds = marathonGravitySecondsForLevel(this.level);
                } else {
                    this.gravitySeconds = invisibilityGravitySecondsForLevel(this.level);
                }
            }
        } else {
            this.level = 1;
        }
        this.refreshHUD();
        const audio = AudioMgr.instance();
        audio.playLineClear(lineCount);
        if (lineCount >= GameConstants.MULTI_LINE_STREAK_MIN_LINES) {
            this.mMultiLineClearStreak++;
            if (this.mMultiLineClearStreak >= GameConstants.MULTI_LINE_STREAK_FOR_UNBELIEVABLE) {
                audio.playEvaluation(5);
                this.mMultiLineClearStreak = 0;
            }
        } else {
            this.mMultiLineClearStreak = 0;
        }

        const self = this;
        this.postClearAction = function () {
            self.board.removeRows(rows);
            if (self.board.hasBlocksInHiddenZone()) {
                self.active = null;
                self.drawGameplayFrame({ active: null, ghostY: null });
                self.endGame();
                return;
            }
            self.active = null;
            self.drawGameplayFrame({ active: null, ghostY: null });
            self.state = GameState.Running;
            self.input.setGameplayInputEnabled(true);
            self.spawnNext();
        };
    }

    // ============================================================
    // Update loop
    // ============================================================
    update(dt: number): void {
        if (this.state === GameState.Boot || this.state === GameState.Ready ||
            this.state === GameState.Paused || this.state === GameState.GameOver) {
            this.tweenScoreLabel(dt);
            return;
        }

        if (this.state === GameState.LineClear) {
            this.clearAnimTimer += dt;
            const t = Math.min(1, this.clearAnimTimer / GameConstants.ANIM.LINE_CLEAR_DURATION);
            const flashAlpha = (Math.sin(t * Math.PI * 4) + 1) * 0.5 * 0.6;
            this.drawGameplayFrame({
                active: null, ghostY: null,
                flashRows: this.clearAnimRows, flashAlpha: flashAlpha,
            });
            if (t >= 1) {
                const fn = this.postClearAction;
                this.postClearAction = null;
                if (fn) fn();
            }
            this.tweenScoreLabel(dt);
            return;
        }

        // Running
        if (this.input) this.input.update(dt);

        if (this.gameMode === GameMode.Invisibility && this.state === GameState.Running) {
            const hidden = GameConstants.INVISIBILITY_HIDDEN_SECONDS;
            const reveal = GameConstants.INVISIBILITY_REVEAL_SECONDS;
            const period = hidden + reveal;
            this.mInvisPhaseTimer += dt;
            while (this.mInvisPhaseTimer >= period) {
                this.mInvisPhaseTimer -= period;
            }
        }

        if (this.active) {
            this.gravityTimer += dt;
            const interval = this.softDropActive
                ? Math.min(this.gravitySeconds, GameConstants.SOFT_DROP_GRAVITY_SECONDS)
                : this.gravitySeconds;

            while (this.gravityTimer >= interval) {
                this.gravityTimer -= interval;
                let moved = false;
                if (this.softDropActive) {
                    moved = this.softDropTick();
                } else {
                    moved = this.gravityTick();
                }
                if (!moved) {
                    // Check for lock condition
                    if (!this.lockArmed) {
                        this.lockArmed = true;
                        this.lockTimer = 0;
                    }
                    break;
                } else {
                    this.lockArmed = false;
                    this.lockTimer = 0;
                }
            }

            if (this.lockArmed) {
                this.lockTimer += dt;
                if (this.lockTimer >= GameConstants.LOCK_DELAY_SECONDS) {
                    this.lockPieceNow();
                }
            }
        }

        if (this.state === GameState.Running) {
            this.redrawGameplayBoard();
        }

        this.tweenScoreLabel(dt);
    }

    // ============================================================
    // Helpers
    // ============================================================
    private loadPersistedBestScore(): number {
        try {
            const primary = cc.sys.localStorage.getItem(storageBestScoreKey(this.gameMode));
            if (primary != null && primary !== '') {
                const n = parseInt(primary, 10);
                if (!isNaN(n)) {
                    return Math.max(0, n);
                }
            }
        } catch (e) { /* ignore */ }
        return 0;
    }

    /** Prefer scene asset name so Normal/Marathon matches `normalScene` / `marathonScene` even if `gameMode` in .fire is wrong. */
    private resolveGameModeFromSceneName(): GameMode {
        const serial = this.gameMode;
        const sc = cc.director.getScene();
        const raw = sc && sc.name ? sc.name : '';
        const sn = raw.replace(/\s+/g, '');
        if (/normalscene/i.test(sn)) {
            return GameMode.Normal;
        }
        if (/invisibilityscene/i.test(sn)) {
            return GameMode.Invisibility;
        }
        if (/marathonscene/i.test(sn)) {
            return GameMode.Marathon;
        }
        return serial;
    }

    /** Normal mode: hide every level-related HUD chunk. Marathon: show all. */
    private applyGameModePresentation(): void {
        if (!this.ui) {
            return;
        }
        const show = this.gameMode !== GameMode.Normal;
        const roots =
            this.ui.levelHudRoots && this.ui.levelHudRoots.length > 0
                ? this.ui.levelHudRoots
                : this.ui.levelPanelRoot && this.ui.levelPanelRoot.isValid
                    ? [this.ui.levelPanelRoot]
                    : [];
        for (let i = 0; i < roots.length; i++) {
            const n = roots[i];
            if (n && n.isValid) {
                n.active = show;
            }
        }
    }

    private canPlay(): boolean {
        return this.state === GameState.Running;
    }

    private refreshHUD(): void {
        if (!this.ui) return;
        this.ui.linesLabel.string = String(this.linesTotal);
        if (this.gameMode !== GameMode.Normal) {
            this.ui.levelLabel.string = String(this.level);
        }
        // Score uses tween; just sync best
        this.ui.bestLabel.string = String(this.bestScore);
    }

    private tweenScoreLabel(dt: number): void {
        if (!this.ui) return;
        if (this.displayScore === this.score) {
            this.ui.scoreLabel.string = String(this.displayScore);
            return;
        }
        const diff = this.score - this.displayScore;
        const speed = Math.max(80, Math.abs(diff) / GameConstants.ANIM.SCORE_TWEEN_DURATION);
        const step = Math.ceil(speed * dt);
        if (Math.abs(diff) <= step) {
            this.displayScore = this.score;
        } else {
            this.displayScore += (diff > 0 ? 1 : -1) * step;
        }
        this.ui.scoreLabel.string = String(this.displayScore);
    }

    private flashSpawn(): void {
        if (!this.ui) return;
        // Flash only the gameplay graphics, not the whole board root (which includes editor layout sprites).
        const node = this.ui.boardGraphics.node;
        node.stopAllActions();
        node.opacity = 255;
        cc.tween(node)
            .to(GameConstants.ANIM.SPAWN_FLASH_DURATION / 2, { opacity: 200 })
            .to(GameConstants.ANIM.SPAWN_FLASH_DURATION / 2, { opacity: 255 })
            .start();
    }

    private showOverlay(node: cc.Node): void {
        node.active = true;
        node.opacity = 0;
        cc.tween(node)
            .to(GameConstants.ANIM.OVERLAY_FADE_DURATION, { opacity: 255 })
            .start();
    }

    private hideOverlay(node: cc.Node): void {
        if (!node.active) return;
        node.stopAllActions();
        node.active = false;
        node.opacity = 255;
    }
}
