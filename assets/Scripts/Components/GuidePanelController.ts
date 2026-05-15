/**
 * Prefab Guide: mô tả chế độ (Normal / Marathon / Invisible + Desc).
 * Hiện khi điểm cao (best) của chế độ đó < GUIDE_SHOW_BELOW_SCORE.
 */

import { GameConstants, GameMode, storageBestScoreKey } from '../Game/GameConstants';
import { I18n } from '../I18n/I18n';
import { UIBuilder } from '../Game/UIBuilder';

const PANEL_BY_MODE: { [mode: number]: string } = {
    [GameMode.Normal]: 'Normal',
    [GameMode.Marathon]: 'Marathon',
    [GameMode.Invisibility]: 'Invisible',
};

const DESC_KEY_BY_MODE: { [mode: number]: string } = {
    [GameMode.Normal]: 'GUIDE_DESC_NORMAL',
    [GameMode.Marathon]: 'GUIDE_DESC_MARATHON',
    [GameMode.Invisibility]: 'GUIDE_DESC_INVISIBILITY',
};

const ALL_PANELS = ['Normal', 'Marathon', 'Invisible'];

/** Prefab Guide gốc có `Ui` + panel Normal/Marathon/Invisible (không phải node Guide cũ 3 Label). */
export function isGuidePrefabRoot(node: cc.Node | null): boolean {
    if (!node || !node.isValid) {
        return false;
    }
    const ui = node.getChildByName('Ui');
    if (!ui) {
        return false;
    }
    for (let i = 0; i < ALL_PANELS.length; i++) {
        if (ui.getChildByName(ALL_PANELS[i])) {
            return true;
        }
    }
    return !!(UIBuilder.findRootDeep(node, 'Normal') || UIBuilder.findRootDeep(node, 'Marathon'));
}

/** Tìm instance Guide prefab (ưu tiên root có Ui + panel mode). */
export function findGuidePrefabRoot(canvas: cc.Node): cc.Node | null {
    const stack: cc.Node[] = canvas.children.slice();
    let fallback: cc.Node | null = null;
    while (stack.length > 0) {
        const cur = stack.pop() as cc.Node;
        if (cur.name === 'Guide') {
            if (isGuidePrefabRoot(cur)) {
                return cur;
            }
            if (!fallback) {
                fallback = cur;
            }
        }
        for (let i = 0; i < cur.children.length; i++) {
            stack.push(cur.children[i]);
        }
    }
    return fallback;
}

export function shouldShowGuideForBestScore(bestScore: number, forceShow = false): boolean {
    return forceShow || bestScore < GameConstants.GUIDE_SHOW_BELOW_SCORE;
}

const { ccclass, property } = cc._decorator;

export function loadPersistedBestScore(mode: GameMode): number {
    try {
        const raw = cc.sys.localStorage.getItem(storageBestScoreKey(mode));
        if (raw != null && raw !== '') {
            const n = parseInt(raw, 10);
            if (!isNaN(n)) {
                return Math.max(0, n);
            }
        }
    } catch (_e) {
        // ignore
    }
    return 0;
}

function labelOn(node: cc.Node | null): cc.Label | null {
    if (!node || !node.isValid) {
        return null;
    }
    return node.getComponent(cc.Label) || node.getComponentInChildren(cc.Label);
}

@ccclass
export default class GuidePanelController extends cc.Component {
    @property({ tooltip: 'Nút đóng Guide (tên node trong prefab).' })
    public closeButtonName = 'btnClose';

    private onCloseCb: (() => void) | null = null;
    private closeBound = false;

    protected onLoad(): void {
        this.bindCloseButton();
        this.applyDescAndGestureLocale();
    }

    public setOnClose(cb: (() => void) | null): void {
        this.onCloseCb = cb;
    }

    /** Scene chơi: chỉ hiện panel đúng chế độ. Trả về true nếu Guide đang mở. */
    public applyForPlayScene(mode: GameMode, bestScore: number, forceShow = false): boolean {
        const shouldShow = shouldShowGuideForBestScore(bestScore, forceShow);
        if (!shouldShow) {
            this.node.active = false;
            return false;
        }
        this.presentOverlay();
        this.bindCloseButton();
        this.setPanelsForSingleMode(mode);
        this.applyDescAndGestureLocale();
        return true;
    }

    private presentOverlay(): void {
        this.node.active = true;
        this.node.zIndex = 10000;
        const layout = this.node.getChildByName('New Layout');
        const ui = this.node.getChildByName('Ui');
        if (layout) {
            layout.active = true;
        }
        if (ui) {
            ui.active = true;
        }
        let p: cc.Node | null = this.node.parent;
        while (p) {
            if (!p.active) {
                p.active = true;
            }
            p = p.parent;
        }
    }

    /**
     * loadingScene: hiện từng panel Normal / Marathon / Invisible nếu best của chế độ đó < ngưỡng.
     * Ẩn cả Guide nếu cả 3 đều >= ngưỡng.
     */
    public applyForLoadingScreen(): boolean {
        const threshold = GameConstants.GUIDE_SHOW_BELOW_SCORE;
        let anyVisible = false;
        const uiRoot = this.findUiRoot();
        for (let i = 0; i < ALL_PANELS.length; i++) {
            const panelName = ALL_PANELS[i];
            const panel = this.findModePanel(uiRoot, panelName);
            if (!panel) {
                continue;
            }
            const mode = this.modeFromPanelName(panelName);
            const best = loadPersistedBestScore(mode);
            const show = best < threshold;
            panel.active = show;
            if (show) {
                anyVisible = true;
            }
        }
        if (!anyVisible) {
            this.node.active = false;
            return false;
        }
        this.presentOverlay();
        this.bindCloseButton();
        this.applyDescAndGestureLocale();
        return true;
    }

    public applyDescAndGestureLocale(): void {
        const uiRoot = this.findUiRoot();
        const titleNode = UIBuilder.findRootDeep(this.node, 'Title');
        const titleLab = labelOn(titleNode);
        if (titleLab) {
            titleLab.string = I18n.t('GUIDE_TITLE');
        }
        for (let m = 0; m < ALL_PANELS.length; m++) {
            const panelName = ALL_PANELS[m];
            const panel = this.findModePanel(uiRoot, panelName);
            if (!panel || !panel.active) {
                continue;
            }
            const mode = this.modeFromPanelName(panelName);
            const desc = panel.getChildByName('Desc');
            const lab = labelOn(desc);
            const key = DESC_KEY_BY_MODE[mode];
            if (lab && key) {
                lab.string = I18n.t(key);
            }
        }
        this.applyGestureLabels();
    }

    private applyGestureLabels(): void {
        const inner = this.findInnerGestureGuide();
        if (!inner) {
            return;
        }
        const keys = ['HELP_GESTURE_1', 'HELP_GESTURE_2', 'HELP_GESTURE_3'];
        let ki = 0;
        for (let c = 0; c < inner.children.length && ki < keys.length; c++) {
            const ch = inner.children[c];
            const lab = labelOn(ch);
            if (lab) {
                lab.string = I18n.t(keys[ki]);
                ki += 1;
            }
        }
    }

    private setPanelsForSingleMode(mode: GameMode): void {
        const activeName = PANEL_BY_MODE[mode] || 'Normal';
        const uiRoot = this.findUiRoot();
        for (let i = 0; i < ALL_PANELS.length; i++) {
            const name = ALL_PANELS[i];
            const panel = this.findModePanel(uiRoot, name);
            if (panel) {
                panel.active = name === activeName;
            }
        }
    }

    private findUiRoot(): cc.Node | null {
        const ui = this.node.getChildByName('Ui');
        return ui || this.node;
    }

    private findModePanel(uiRoot: cc.Node | null, panelName: string): cc.Node | null {
        if (!uiRoot) {
            return UIBuilder.findRootDeep(this.node, panelName);
        }
        const direct = uiRoot.getChildByName(panelName);
        if (direct) {
            return direct;
        }
        return UIBuilder.findRootDeep(uiRoot, panelName);
    }

    private findInnerGestureGuide(): cc.Node | null {
        const uiRoot = this.findUiRoot();
        if (!uiRoot) {
            return null;
        }
        const children = uiRoot.children;
        for (let i = 0; i < children.length; i++) {
            const ch = children[i];
            if (ch.name === 'Guide' && !ch.getChildByName('Desc')) {
                return ch;
            }
        }
        return UIBuilder.findRootDeep(this.node, 'Guide');
    }

    private modeFromPanelName(panelName: string): GameMode {
        if (panelName === 'Marathon') {
            return GameMode.Marathon;
        }
        if (panelName === 'Invisible') {
            return GameMode.Invisibility;
        }
        return GameMode.Normal;
    }

    private bindCloseButton(): void {
        if (this.closeBound) {
            return;
        }
        const btn = UIBuilder.findRootDeep(this.node, this.closeButtonName);
        if (!btn) {
            return;
        }
        btn.on(cc.Node.EventType.TOUCH_END, this.onCloseTapped, this);
        this.closeBound = true;
    }

    private onCloseTapped(): void {
        this.node.active = false;
        if (this.onCloseCb) {
            this.onCloseCb();
        }
    }
}
