/**
 * Áp chuỗi đã dịch lên HUD / overlay gameplay và prefab Setting.
 */

import { I18n } from './I18n';
import { UIRefs, UIBuilder } from '../Game/UIBuilder';

function labelOn(node: cc.Node | null): cc.Label | null {
    if (!node || !node.isValid) {
        return null;
    }
    return node.getComponent(cc.Label) || node.getComponentInChildren(cc.Label);
}

function setStatCaption(valLabel: cc.Label | null, key: string): void {
    if (!valLabel || !valLabel.node || !valLabel.node.isValid) {
        return;
    }
    const parent = valLabel.node.parent;
    if (!parent) {
        return;
    }
    const cap = parent.getChildByName('cap');
    const lab = cap && cap.getComponent(cc.Label);
    if (lab) {
        lab.string = I18n.t(key);
    }
}

function setBestCaption(bestValueLabel: cc.Label): void {
    const bestVal = bestValueLabel.node.parent;
    if (!bestVal || !bestVal.isValid) {
        return;
    }
    const scorePanel = bestVal.parent;
    if (!scorePanel || !scorePanel.isValid) {
        return;
    }
    const bestCap = scorePanel.getChildByName('BestCap');
    const lab = bestCap && bestCap.getComponent(cc.Label);
    if (lab) {
        lab.string = I18n.t('HUD_BEST');
    }
}

function setPanelTitle(panel: cc.Node | null, titleNodeName: string, key: string): void {
    if (!panel || !panel.isValid) {
        return;
    }
    const titleN = UIBuilder.findRootDeep(panel, titleNodeName);
    const lab = labelOn(titleN);
    if (lab) {
        lab.string = I18n.t(key);
    }
}

function setOverlayButtonByName(panel: cc.Node, btnEnglishName: string, key: string): void {
    const btn = UIBuilder.findRootDeep(panel, 'Btn_' + btnEnglishName);
    if (!btn || !btn.isValid) {
        return;
    }
    const labN = btn.getChildByName('lab');
    const lab = labelOn(labN);
    if (lab) {
        lab.string = I18n.t(key);
    }
}

function setGameOverStaticLabels(panel: cc.Node | null): void {
    if (!panel || !panel.isValid) {
        return;
    }
    setPanelTitle(panel, 'title', 'GAME_OVER_TITLE');
    const scoreCap = UIBuilder.findRootDeep(panel, 'scoreCap');
    const sc = labelOn(scoreCap);
    if (sc) {
        sc.string = I18n.t('GO_SCORE_CAP');
    }
    const bestCap = UIBuilder.findRootDeep(panel, 'bestCap');
    const bc = labelOn(bestCap);
    if (bc) {
        bc.string = I18n.t('GO_BEST_CAP');
    }
    setOverlayButtonByName(panel, 'RESTART', 'BTN_RESTART');
}

/** Prefab GameOver (Title / High Score / Score caption). */
function applyGameOverPrefabStaticStrings(overlayRoot: cc.Node): void {
    const tryRoot = function (root: cc.Node | null): void {
        if (!root || !root.isValid) {
            return;
        }
        const titleN = UIBuilder.findRootDeep(root, 'Title');
        const titleLab = labelOn(titleN);
        if (titleLab) {
            titleLab.string = I18n.t('GO_PREFAB_TITLE');
        }
        const hs = UIBuilder.findRootDeep(root, 'highScore');
        if (hs && hs.isValid) {
            for (let i = 0; i < hs.children.length; i++) {
                const lab = hs.children[i].getComponent(cc.Label);
                if (lab) {
                    lab.string = I18n.t('GO_PREFAB_HIGH_SCORE');
                    break;
                }
            }
        }
        const cur = UIBuilder.findRootDeep(root, 'curentScore');
        if (cur && cur.isValid) {
            const labs = cur.getComponentsInChildren(cc.Label);
            for (let j = 0; j < labs.length; j++) {
                const s = labs[j].string.replace(/\s/g, '');
                if (s.length > 0 && !/^\d+$/.test(s) && s.length < 20) {
                    labs[j].string = I18n.t('GO_PREFAB_SCORE_LABEL');
                    break;
                }
            }
        }
    };
    tryRoot(overlayRoot);
    if (overlayRoot.children && overlayRoot.children.length > 0) {
        tryRoot(overlayRoot.children[0]);
    }
}

/** Prefab GameOver: nút btnNewGame / btnClose / btnHome — cập nhật nhãn nếu có Label con. */
function applyGameOverPrefabExtraLabels(overlayRoot: cc.Node): void {
    const tryBtn = function (nodeName: string, key: string): void {
        const n = UIBuilder.findRootDeep(overlayRoot, nodeName);
        if (!n || !n.isValid) {
            return;
        }
        const lab = n.getComponentInChildren(cc.Label);
        if (lab && lab.node !== n) {
            lab.string = I18n.t(key);
        }
    };
    tryBtn('btnNewGame', 'SETTING_NEW_GAME');
    tryBtn('btnClose', 'BTN_HOME');
    tryBtn('btnHome', 'BTN_HOME');
}

/**
 * Cập nhật mọi label gameplay được tạo / tham chiếu qua UIRefs.
 */
export function applyGameplayLocale(ui: UIRefs): void {
    if (!ui) {
        return;
    }
    setStatCaption(ui.linesLabel, 'HUD_LINE');
    setStatCaption(ui.scoreLabel, 'HUD_SCORE');
    setStatCaption(ui.levelLabel, 'HUD_LEVEL');
    if (ui.bestLabel && ui.bestLabel.node && ui.bestLabel.node.isValid) {
        setBestCaption(ui.bestLabel);
    }

    const holdH = UIBuilder.findRootDeep(ui.holdRoot, 'header');
    let hl = labelOn(holdH);
    if (!hl && ui.holdRoot) {
        const holdNamed = UIBuilder.findRootDeep(ui.holdRoot, 'hold_Label');
        hl = labelOn(holdNamed);
    }
    if (hl) {
        hl.string = I18n.t('HUD_HOLD');
    }
    const nextH = UIBuilder.findRootDeep(ui.nextRoot, 'header');
    const nl = labelOn(nextH);
    if (nl) {
        nl.string = I18n.t('HUD_NEXT');
    }

    const pauseRoot = ui.pauseOverlay;
    if (pauseRoot && pauseRoot.isValid) {
        const panel = UIBuilder.findRootDeep(pauseRoot, 'panel') || pauseRoot;
        setPanelTitle(panel, 'title', 'PAUSE_TITLE');
        setOverlayButtonByName(panel, 'RESUME', 'BTN_RESUME');
        setOverlayButtonByName(panel, 'RESTART', 'BTN_RESTART');
        setOverlayButtonByName(panel, 'HOME', 'BTN_HOME');
    }

    const goRoot = ui.gameOverOverlay;
    if (goRoot && goRoot.isValid) {
        const panel = UIBuilder.findRootDeep(goRoot, 'panel') || goRoot;
        setGameOverStaticLabels(panel);
        applyGameOverPrefabExtraLabels(goRoot);
        applyGameOverPrefabStaticStrings(goRoot);
    }

    const startRoot = ui.startOverlay;
    if (startRoot && startRoot.isValid) {
        const panel = UIBuilder.findRootDeep(startRoot, 'panel') || startRoot;
        const titleN = UIBuilder.findRootDeep(startRoot, 'title');
        const t1 = labelOn(titleN);
        if (t1) {
            t1.string = I18n.t('HOMESCREEN_TITLE');
        }
        const subN = UIBuilder.findRootDeep(startRoot, 'sub');
        const t2 = labelOn(subN);
        if (t2) {
            t2.string = I18n.t('HOMESCREEN_SUB');
        }
        if (panel && panel.isValid) {
            setOverlayButtonByName(panel, 'PLAY', 'BTN_PLAY');
        }
    }
}

function setRowTitleLabel(row: cc.Node | null, key: string): void {
    if (!row || !row.isValid) {
        return;
    }
    const labN = row.getChildByName('Label');
    const lab = labelOn(labN);
    if (lab) {
        lab.string = I18n.t(key);
    }
}

function setTitleNode(root: cc.Node): void {
    const t = UIBuilder.findRootDeep(root, 'Title');
    const lab = labelOn(t);
    if (lab) {
        lab.string = I18n.t('SETTING_TITLE');
    }
}

function setButtonRowLabel(root: cc.Node, btnName: string, key: string): void {
    const btn = UIBuilder.findRootDeep(root, btnName);
    if (!btn || !btn.isValid) {
        return;
    }
    const labN = btn.getChildByName('Label');
    const lab = labelOn(labN);
    if (lab) {
        lab.string = I18n.t(key);
    }
}

/** Gọi trên root prefab Setting (sau instantiate). */
export function applySettingPrefabLocale(root: cc.Node): void {
    if (!root || !root.isValid) {
        return;
    }
    setTitleNode(root);
    setRowTitleLabel(UIBuilder.findRootDeep(root, 'Music'), 'SETTING_MUSIC');
    setRowTitleLabel(UIBuilder.findRootDeep(root, 'SFX'), 'SETTING_SFX');
    setButtonRowLabel(root, 'btnNewGame', 'SETTING_NEW_GAME');
    setButtonRowLabel(root, 'btnHome', 'SETTING_HOME');
}

function setLabelOnNamedNode(root: cc.Node, nodeName: string, key: string): void {
    const n = UIBuilder.findRootDeep(root, nodeName);
    const lab = labelOn(n);
    if (lab) {
        lab.string = I18n.t(key);
    }
}

function setHeaderOnHoldNextPanels(canvas: cc.Node): void {
    // Prefer roots that contain hold_Label (editor scenes) before nested "Holdpanel" sprites.
    const holdNames = ['Hold', 'HoldPanel', 'Holdpanel'];
    for (let i = 0; i < holdNames.length; i++) {
        const p = UIBuilder.findRootDeep(canvas, holdNames[i]);
        if (!p || !p.isValid) {
            continue;
        }
        const h = p.getChildByName('header');
        let lab = labelOn(h);
        if (!lab) {
            const named = UIBuilder.findRootDeep(p, 'hold_Label');
            lab = labelOn(named);
        }
        if (lab) {
            lab.string = I18n.t('HUD_HOLD');
            break;
        }
    }
    const nextNames = ['NextPanel', 'Next'];
    for (let j = 0; j < nextNames.length; j++) {
        const p = UIBuilder.findRootDeep(canvas, nextNames[j]);
        if (!p || !p.isValid) {
            continue;
        }
        const h = p.getChildByName('header');
        const lab = labelOn(h);
        if (lab) {
            lab.string = I18n.t('HUD_NEXT');
            break;
        }
    }
    const nextLbl = UIBuilder.findRootDeep(canvas, 'nextLabel');
    const nl = labelOn(nextLbl);
    if (nl) {
        nl.string = I18n.t('HUD_NEXT');
    }
}

function setGuideLabels(canvas: cc.Node): void {
    const guide = UIBuilder.findRootDeep(canvas, 'Guide');
    if (!guide || !guide.isValid) {
        return;
    }
    const keys = ['HELP_GESTURE_1', 'HELP_GESTURE_2', 'HELP_GESTURE_3'];
    let ki = 0;
    for (let c = 0; c < guide.children.length && ki < keys.length; c++) {
        const ch = guide.children[c];
        const lab = ch.getComponent(cc.Label) || ch.getComponentInChildren(cc.Label);
        if (lab) {
            lab.string = I18n.t(keys[ki]);
            ki += 1;
        }
    }
}

function setLabelUnderPlayBranch(canvas: cc.Node, btnNames: string[], childNames: string[], key: string): void {
    for (let b = 0; b < btnNames.length; b++) {
        const root = UIBuilder.findRootDeep(canvas, btnNames[b]);
        if (!root || !root.isValid) {
            continue;
        }
        for (let s = 0; s < childNames.length; s++) {
            const sub = root.getChildByName(childNames[s]);
            const target = sub || root;
            const lab = target.getComponentInChildren(cc.Label);
            if (lab) {
                lab.string = I18n.t(key);
                return;
            }
        }
    }
}

/**
 * Scene chơi (marathon / normal / invisibility): HUD chỉnh trong Editor + Guide + Hold/Next.
 * Gọi với node Canvas.
 */
export function applyPlaySceneEditorLocale(canvas: cc.Node): void {
    if (!canvas || !canvas.isValid) {
        return;
    }
    setLabelOnNamedNode(canvas, 'lines_Label', 'HUD_LINE');
    setLabelOnNamedNode(canvas, 'lvl_Label', 'HUD_LEVEL');
    setLabelOnNamedNode(canvas, 'score_Label', 'HUD_SCORE');
    setGuideLabels(canvas);
    setHeaderOnHoldNextPanels(canvas);
}

/** Tiêu đề game trên loadingScene (node `labelGameName` trong scene). */
export function applyLoadingSceneTitleLocale(canvas: cc.Node): void {
    if (!canvas || !canvas.isValid) {
        return;
    }
    const n = UIBuilder.findRootDeep(canvas, 'labelGameName');
    const lab = labelOn(n);
    if (lab) {
        lab.string = I18n.t('HOMESCREEN_TITLE');
    }
}

/** loadingScene: nhãn chế độ trên nút Play / Normal / Invisibility. */
export function applyLoadingSceneModeLabels(canvas: cc.Node): void {
    if (!canvas || !canvas.isValid) {
        return;
    }
    setLabelUnderPlayBranch(canvas, ['btn_play_nor', 'btn_Normal'], ['PlayNor'], 'LOADING_MODE_NORMAL');
    setLabelUnderPlayBranch(canvas, ['btn_play', 'btn_Marathon'], ['PlayMara', 'Play'], 'LOADING_MODE_MARATHON');
    setLabelUnderPlayBranch(canvas, ['btn_Invisibility'], ['PlayInvisibility'], 'LOADING_MODE_INVISIBILITY');
}

/** LoadingScene: overlay được code tạo dưới Canvas. */
export function applyLoadingHomescreenLocale(canvas: cc.Node): void {
    if (!canvas || !canvas.isValid) {
        return;
    }
    const host = UIBuilder.findRootDeep(canvas, 'LoadingScene_HomescreenHost');
    if (!host || !host.isValid) {
        return;
    }
    const root = UIBuilder.findRootDeep(host, 'LoadingHomescreenRoot');
    if (!root || !root.isValid) {
        return;
    }
    const titleN = UIBuilder.findRootDeep(root, 'HomescreenTitle');
    const t1 = labelOn(titleN);
    if (t1) {
        t1.string = I18n.t('HOMESCREEN_TITLE');
    }
    const subN = UIBuilder.findRootDeep(root, 'HomescreenEngineInfo');
    const t2 = labelOn(subN);
    if (t2) {
        t2.string = I18n.t('HOMESCREEN_SUB');
    }
    const playBtn = UIBuilder.findRootDeep(root, 'HomescreenPlayButton');
    if (playBtn && playBtn.isValid) {
        const labN = playBtn.getChildByName('lab');
        const lab = labelOn(labN);
        if (lab) {
            lab.string = I18n.t('BTN_PLAY');
        }
    }
}
