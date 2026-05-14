/**
 * UIHierarchy — stable node names for marathonScene / UIBuilder.
 *
 * Cây tham chiếu (chỉnh trong Hierarchy, giữ đúng tên node):
 *
 * Canvas
 * ├── TopHUD
 * │   ├── ScorePanel → Crown, BestCap, BestVal
 * │   └── StatsStrip → LinesPanel, ScoreStripPanel, LevelPanel (mỗi panel: cap, val)
 * ├── gameComponents
 * │   ├── BoardRoot → BoardTouch, BoardGraphics
 * │   ├── HoldPanel → header, HoldGraphics
 * │   └── NextPanel → header, NextSlot0..2 → NextSlotG0..2
 * ├── PauseButton
 * ├── AdBannerPlaceholder
 * └── OverlayRoot → PauseOverlay, GameOverOverlay (StartOverlay / homescreen: loadingScene)
 */

import { GameConstants } from './GameConstants';

/** When false (default after reset), ensureChild only sets localPos for newly created nodes — keeps Editor transforms on Play. */
let applyUILayoutPositionsFromCode = true;

export function setUILayoutPositionsFromCode(v: boolean): void {
    applyUILayoutPositionsFromCode = v;
}

export function getUILayoutPositionsFromCode(): boolean {
    return applyUILayoutPositionsFromCode;
}

/** Get child by name or create empty node under parent. */
export function ensureChild(parent: cc.Node, name: string, localPos?: cc.Vec2): cc.Node {
    let created = false;
    let n = parent.getChildByName(name);
    if (!n) {
        n = new cc.Node(name);
        parent.addChild(n);
        created = true;
    }
    if (localPos !== undefined && (created || applyUILayoutPositionsFromCode)) {
        n.setPosition(localPos);
    }
    return n;
}

function depthUnder(ancestor: cc.Node, node: cc.Node): number {
    let d = 0;
    let cur: cc.Node | null = node;
    while (cur && cur !== ancestor) {
        d++;
        cur = cur.parent;
    }
    return cur === ancestor ? d : 0;
}

function collectDescendantsNamed(parent: cc.Node, name: string, out: cc.Node[]): void {
    for (let i = 0; i < parent.children.length; i++) {
        const c = parent.children[i];
        if (c.name === name) {
            out.push(c);
        }
        collectDescendantsNamed(c, name, out);
    }
}

function scoreHudCandidate(parent: cc.Node, n: cc.Node): number {
    const hasLabel = !!n.getComponent(cc.Label);
    const d = depthUnder(parent, n);
    const area = n.width * n.height;
    return (hasLabel ? 500000 : 0) + d * 1000 + area;
}

function pickPreferredCandidate(parent: cc.Node, candidates: cc.Node[]): cc.Node {
    let best = candidates[0];
    let bestS = scoreHudCandidate(parent, best);
    for (let i = 1; i < candidates.length; i++) {
        const s = scoreHudCandidate(parent, candidates[i]);
        if (s > bestS) {
            bestS = s;
            best = candidates[i];
        }
    }
    return best;
}

/**
 * Like {@link ensureChild}, but if `name` exists only nested under `parent` (editor mistake),
 * reparents one matching node to be a **direct** child — avoids duplicate ScoreVal / wrong label target.
 */
export function ensurePreferredChild(parent: cc.Node, name: string, localPos?: cc.Vec2): cc.Node {
    let created = false;
    let n = parent.getChildByName(name);
    if (!n) {
        const candidates: cc.Node[] = [];
        collectDescendantsNamed(parent, name, candidates);
        if (candidates.length === 0) {
            n = new cc.Node(name);
            parent.addChild(n);
            created = true;
        } else {
            if (candidates.length > 1 && typeof cc !== 'undefined' && cc.warn) {
                cc.warn('[UIHierarchy] Multiple "' + name + '" under "' + parent.name + '"; lifting preferred one. Flatten in Editor when possible.');
            }
            n = pickPreferredCandidate(parent, candidates);
            if (n.parent !== parent) {
                const keepWorld = !applyUILayoutPositionsFromCode;
                const wpos = keepWorld ? n.convertToWorldSpaceAR(cc.v2(0, 0)) : null;
                n.removeFromParent(false);
                parent.addChild(n);
                if (wpos) {
                    const lp = parent.convertToNodeSpaceAR(wpos);
                    n.setPosition(lp);
                }
            }
        }
    }
    if (localPos !== undefined && (created || applyUILayoutPositionsFromCode)) {
        n.setPosition(localPos);
    }
    return n;
}

/** Remove every cc.Graphics on this node only (not recursive). */
export function stripGraphicsOnNode(node: cc.Node): void {
    let g: cc.Graphics | null;
    while ((g = node.getComponent(cc.Graphics))) {
        node.removeComponent(g);
    }
}

function findNodeDeep(root: cc.Node, name: string): cc.Node | null {
    if (root.name === name) {
        return root;
    }
    const stack: cc.Node[] = root.children.slice();
    while (stack.length > 0) {
        const cur = stack.pop() as cc.Node;
        if (cur.name === name) {
            return cur;
        }
        for (let i = 0; i < cur.children.length; i++) {
            stack.push(cur.children[i]);
        }
    }
    return null;
}

/** Seed empty shell nodes so the scene matches UIBuilder; idempotent (safe every load). */
export function seedShellForPlayableCanvas(canvas: cc.Node): void {
    const layout = GameConstants.LAYOUT;
    const block = GameConstants.BLOCK_SIZE;
    const boardW = GameConstants.BOARD_COLS * block;
    const boardH = GameConstants.BOARD_ROWS * block;
    const nextSlotH = layout.SIDE_PANEL_WIDTH;
    const nextHeader = 28;
    const slotGap = 8;
    const nextSizeH = nextHeader + nextSlotH * 3 + slotGap * 2 + 14;
    const slotW = layout.SIDE_PANEL_WIDTH - 14;

    const find = (name: string) => findNodeDeep(canvas, name);
    const topHud = find('TopHUD');
    const boardRoot = find('BoardRoot') || find('Board');
    const holdRoot = find('HoldPanel') || find('Hold');
    const nextRoot = find('NextPanel') || find('Next');
    const overlayRoot = find('OverlayRoot');

    if (topHud) {
        const hudW = GameConstants.DESIGN_WIDTH - 40;
        const hudH = layout.TOP_HUD_HEIGHT;
        const scoreW = hudW - 24;
        const scoreH = 92;
        const smallY = -hudH / 2 + 52;
        const scoreRoot = ensureChild(topHud, 'ScorePanel', cc.v2(0, hudH / 2 - scoreH / 2 - 10));
        ensurePreferredChild(scoreRoot, 'Crown', cc.v2(-scoreW / 2 + 30, scoreH / 4));
        ensurePreferredChild(scoreRoot, 'BestCap', cc.v2(-scoreW / 2 + 56, scoreH / 4));
        ensurePreferredChild(scoreRoot, 'BestVal', cc.v2(-scoreW / 2 + 56, -scoreH / 4));
        const stripW = hudW - 28;
        const statsStrip = ensureChild(topHud, 'StatsStrip', cc.v2(0, smallY));
        const col = stripW / 3;
        const linesPanel = ensureChild(statsStrip, 'LinesPanel', cc.v2(-col, 0));
        const scoreStrip = ensureChild(statsStrip, 'ScoreStripPanel', cc.v2(0, 0));
        const levelPanel = ensureChild(statsStrip, 'LevelPanel', cc.v2(col, 0));
        const hStat = 84;
        ensureChild(linesPanel, 'cap', cc.v2(0, hStat / 4 + 2));
        ensureChild(linesPanel, 'val', cc.v2(0, -hStat / 4));
        ensureChild(scoreStrip, 'cap', cc.v2(0, hStat / 4 + 2));
        ensureChild(scoreStrip, 'val', cc.v2(0, -hStat / 4));
        ensureChild(levelPanel, 'cap', cc.v2(0, hStat / 4 + 2));
        ensureChild(levelPanel, 'val', cc.v2(0, -hStat / 4));
    }

    if (boardRoot) {
        ensureChild(boardRoot, 'BoardTouch', cc.v2(0, 0));
        ensureChild(boardRoot, 'BoardGraphics', cc.v2(-boardW / 2, -boardH / 2));
    }

    if (holdRoot) {
        const holdSize = cc.size(layout.SIDE_PANEL_WIDTH, layout.SIDE_PANEL_WIDTH + 20);
        const headerH = 24;
        ensureChild(holdRoot, 'header', cc.v2(0, holdSize.height / 2 - headerH / 2 - 4));
        ensureChild(holdRoot, 'HoldGraphics', cc.v2(-holdSize.width / 2, -holdSize.height / 2 + 6));
    }

    if (nextRoot) {
        const nextSize = cc.size(layout.SIDE_PANEL_WIDTH, nextSizeH);
        const headerH = 24;
        ensureChild(nextRoot, 'header', cc.v2(0, nextSize.height / 2 - headerH / 2 - 4));
        const startTopY = nextSize.height / 2 - nextHeader - nextSlotH / 2;
        for (let i = 0; i < 3; i++) {
            const slot = ensureChild(nextRoot, 'NextSlot' + i, cc.v2(0, startTopY - i * (nextSlotH + slotGap)));
            const gfxUnderscore = 'NextSlotG_' + i;
            const gfxPlain = 'NextSlotG' + i;
            if (!slot.getChildByName(gfxUnderscore) && !slot.getChildByName(gfxPlain)) {
                ensureChild(slot, gfxPlain, cc.v2(-slotW / 2, -nextSlotH / 2));
            }
        }
    }

    if (overlayRoot) {
        ensureChild(overlayRoot, 'PauseOverlay', cc.v2(0, 0));
        ensureChild(overlayRoot, 'GameOverOverlay', cc.v2(0, 0));
    }
}
