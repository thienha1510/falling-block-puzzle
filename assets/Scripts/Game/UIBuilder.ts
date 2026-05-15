/**
 * Title: UIBuilder
 * Description: Builds / refreshes UI with cc.Graphics + cc.Label on a **stable node tree**
 *              (`UIHierarchy.ts`, `marathonScene.fire`). Shell nodes (TopHUD, BoardRoot, …) keep
 *              editor hierarchy; Background & PauseButton are cleared and redrawn each load.
 *
 *              Public API:
 *                - build(canvas)                         => UIRefs (handles to all important nodes)
 *                - updateScore / updateBest / updateLines / updateLevel
 *                - setHoldPiece / setNextPieces
 *                - showStartOverlay / hideStartOverlay
 *                - showPauseOverlay / hidePauseOverlay
 *                - showGameOverOverlay / hideGameOverOverlay
 */

import { GameConstants, PieceKind, hexToColor } from './GameConstants';
import { ensureChild, ensurePreferredChild, seedShellForPlayableCanvas, setUILayoutPositionsFromCode, stripGraphicsOnNode } from './UIHierarchy';
import { getMarathonScenePlaceholderLayouts } from './MarathonSceneLayout';
import { Renderer } from './Renderer';

const SYSTEM_FONT_FAMILY = 'Helvetica, Arial, sans-serif';

export interface UIRefs {
    bgRoot: cc.Node;
    boardRoot: cc.Node;        // BoardRoot, anchored at center
    boardGraphics: cc.Graphics; // child of boardRoot, positioned at (-w/2, -h/2)
    boardTouchNode: cc.Node;   // catches gameplay gestures
    holdRoot: cc.Node;
    holdGraphics: cc.Graphics;
    nextRoot: cc.Node;
    nextSlots: { node: cc.Node; graphics: cc.Graphics; size: cc.Size }[];
    pauseButton: cc.Node;
    holdHitArea: cc.Node;
    adBanner: cc.Node;

    linesLabel: cc.Label;
    levelLabel: cc.Label;
    /**
     * Primary level stat panel (legacy). Prefer {@link levelHudRoots} for show/hide in Normal mode.
     */
    levelPanelRoot: cc.Node | null;
    /** All HUD chunks that should be hidden in Normal mode (e.g. `LevelPanel` + `Level` when siblings). */
    levelHudRoots: cc.Node[];
    scoreLabel: cc.Label;
    bestLabel: cc.Label;

    startOverlay: cc.Node;
    pauseOverlay: cc.Node;
    gameOverOverlay: cc.Node;
    goScoreLabel: cc.Label;
    goBestLabel: cc.Label;
}

export interface UICallbacks {
    onPause(): void;
    onResume(): void;
    onRestart(): void;
    onHome(): void;
    onPlay(): void;
    onHoldTap(): void;
}

/** Pass `{ layoutFromCode: true }` to restore old behaviour: MarathonSceneLayout + scripted positions/sizes each Play. */
export interface UIBuildOptions {
    layoutFromCode?: boolean;
    /** When true, do not build StartOverlay (homescreen lives on loadingScene). */
    skipStartOverlay?: boolean;
}

const PANEL_BORDER_WIDTH = 2;
const PANEL_CORNER_RADIUS = 14;

export class UIBuilder {
    /** Mirrors last build: false = respect Editor Transform/size on HUD nodes where supported. */
    private static _layoutFromCode = false;
    private static calcPreviewBlockSize(panelW: number, panelH: number): number {
        // Tetromino preview max bounding box is 4×4 blocks.
        // Keep a small margin so it never touches the slot edges.
        const minDim = Math.max(0, Math.min(panelW, panelH));
        const bs = Math.floor((minDim - 10) / 4);
        const clamped = Math.max(6, Math.min(GameConstants.PREVIEW_BLOCK_SIZE, bs));
        return clamped;
    }

    /**
     * Legacy helper (kept for compatibility).
     * IMPORTANT: we no longer clear children / sprites here because marathonScene is now editor-authored.
     */
    public static prepareRoot(node: cc.Node): void {
        // Previously we wiped dynamic UI and redrew with Graphics.
        // Now we keep editor hierarchy intact; callers should target specific children instead.
    }

    /**
     * Find a descendant of `canvas` by node name (depth-first). Used so scene roots can live
     * under organizers like `gameComponents` while keeping stable names for code.
     */
    public static findRootDeep(canvas: cc.Node, name: string): cc.Node | null {
        const direct = canvas.getChildByName(name);
        if (direct) {
            return direct;
        }
        const stack: cc.Node[] = canvas.children.slice();
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

    private static findAnyRootDeep(canvas: cc.Node, names: string[]): cc.Node | null {
        for (let i = 0; i < names.length; i++) {
            const n = UIBuilder.findRootDeep(canvas, names[i]);
            if (n) return n;
        }
        return null;
    }

    /**
     * Prefab GameOver: label **cs** = điểm ván hiện tại, **hc** = điểm cao nhất.
     * Fallback tên cũ scoreVal / bestVal.
     */
    private static resolveExistingGameOverOverlay(gameOverExisting: cc.Node): {
        root: cc.Node;
        scoreLabel: cc.Label;
        bestLabel: cc.Label;
    } {
        const csNode = UIBuilder.findRootDeep(gameOverExisting, 'cs');
        const hcNode = UIBuilder.findRootDeep(gameOverExisting, 'hc');
        const scoreNode =
            csNode ||
            UIBuilder.findRootDeep(gameOverExisting, 'scoreVal') ||
            UIBuilder.findRootDeep(gameOverExisting, 'ScoreVal') ||
            gameOverExisting;
        const bestNode =
            hcNode ||
            UIBuilder.findRootDeep(gameOverExisting, 'bestVal') ||
            UIBuilder.findRootDeep(gameOverExisting, 'BestVal') ||
            gameOverExisting;
        const scoreLabel = scoreNode.getComponent(cc.Label) || (gameOverExisting.addComponent(cc.Label) as any);
        const bestLabel = bestNode.getComponent(cc.Label) || (gameOverExisting.addComponent(cc.Label) as any);
        return { root: gameOverExisting, scoreLabel: scoreLabel, bestLabel: bestLabel };
    }

    /**
     * Prefer a node named `name` under `canvas` (any depth, from marathonScene placeholders);
     * otherwise create it as a direct child of `canvas`.
     */
    private static getRoot(canvas: cc.Node, name: string, pos: cc.Vec2): cc.Node {
        const n = UIBuilder.findRootDeep(canvas, name);
        if (n) {
            if (UIBuilder._layoutFromCode) {
                n.setPosition(pos);
            }
            return n;
        }
        return UIBuilder.makeNode(name, canvas, pos);
    }

    /** Same as getRoot but keeps existing children (for editor-placed hierarchy under TopHUD, BoardRoot, …). */
    private static obtainShellRoot(canvas: cc.Node, name: string, pos: cc.Vec2): cc.Node {
        const n = UIBuilder.findRootDeep(canvas, name);
        if (n) {
            if (UIBuilder._layoutFromCode) {
                n.setPosition(pos);
            }
            return n;
        }
        return UIBuilder.makeNode(name, canvas, pos);
    }

    public static build(canvas: cc.Node, callbacks: UICallbacks, options?: UIBuildOptions): UIRefs {
        const layoutFromCode = options && options.layoutFromCode === true;
        const skipStartOverlay = options && options.skipStartOverlay === true;
        UIBuilder._layoutFromCode = layoutFromCode;
        setUILayoutPositionsFromCode(layoutFromCode);

        const cw = GameConstants.DESIGN_WIDTH;
        const ch = GameConstants.DESIGN_HEIGHT;
        // Visible size in design units under current resolution policy (SHOW_ALL adds extra space in one dimension).
        const vis = cc.view.getVisibleSize();
        const fullW = Math.max(cw, vis.width);
        const fullH = Math.max(ch, vis.height);
        const layout = GameConstants.LAYOUT;
        const boardW = GameConstants.BOARD_WIDTH;
        const boardH = GameConstants.BOARD_HEIGHT;
        const PL = getMarathonScenePlaceholderLayouts();

        try {
        // Ensure editor / scene shell nodes exist (idempotent; matches marathonScene.fire after tools/patch-mainscene-ui-shell.js).
        seedShellForPlayableCanvas(canvas);

        // ----- Background -----
        // Editor-authored: do NOT draw with Graphics.
        const bgRoot = UIBuilder.getRoot(canvas, 'Background', cc.v2(PL.Background.x, PL.Background.y));

        // ----- Top HUD -----
        const hud = UIBuilder.obtainShellRoot(canvas, 'TopHUD', cc.v2(PL.TopHUD.x, PL.TopHUD.y));
        const hudResult = UIBuilder.buildTopHUD(hud);

        // ----- Pause button -----
        const pauseBtn = UIBuilder.getRoot(canvas, 'PauseButton', cc.v2(PL.PauseButton.x, PL.PauseButton.y));
        UIBuilder.bindButton(pauseBtn, function () { callbacks.onPause(); });

        // ----- Board root + graphics (anchor center, graphics offset to bottom-left) -----
        // Backward-compat: some scenes name the board root "Board" instead of "BoardRoot".
        const boardRootExisting = UIBuilder.findAnyRootDeep(canvas, ['BoardRoot', 'Board']);
        const boardRoot = boardRootExisting
            ? boardRootExisting
            : UIBuilder.obtainShellRoot(canvas, 'BoardRoot', cc.v2(PL.BoardRoot.x, PL.BoardRoot.y));
        // Board coordinate space must match gameplay grid (cols*block, rows*block),
        // otherwise editor-authored board layout/sprites won't line up with block rendering.
        // We keep the editor's POSITION, but enforce size + anchor for consistent origin.
        boardRoot.setContentSize(boardW, boardH);
        boardRoot.setAnchorPoint(0.5, 0.5);

        // If the editor provides a board layout sprite/node, force it to match the board space.
        // Common name in the current scene: "layout".
        const boardLayout = boardRoot.getChildByName('layout');
        if (boardLayout) {
            boardLayout.active = true;
            boardLayout.setContentSize(boardW, boardH);
            boardLayout.setAnchorPoint(0.5, 0.5);
            boardLayout.setPosition(0, 0);
            // Ensure it renders (either behind or above blocks depending on desired effect).
            // Default: behind blocks but above any background.
            boardLayout.zIndex = 0;
        }

        // Touch listener overlay covers the whole board area (must be non-zero or gestures never fire)
        const boardTouchNode = ensureChild(boardRoot, 'BoardTouch', cc.v2(0, 0));
        boardTouchNode.active = true;
        boardTouchNode.setContentSize(boardW, boardH);
        boardTouchNode.setAnchorPoint(0.5, 0.5);

        const boardGraphicsNode = ensureChild(boardRoot, 'BoardGraphics', cc.v2(-boardW / 2, -boardH / 2));
        // Always reset the graphics origin to bottom-left of the board.
        boardGraphicsNode.active = true;
        boardGraphicsNode.setAnchorPoint(0, 0);
        boardGraphicsNode.setPosition(cc.v2(-boardW / 2, -boardH / 2));
        boardGraphicsNode.zIndex = 10;
        stripGraphicsOnNode(boardGraphicsNode);
        const boardGraphics = boardGraphicsNode.addComponent(cc.Graphics);

        // ----- Hold panel (left) -----
        // Scene may name this root "Hold" or "HoldPanel".
        const holdRoot =
            UIBuilder.findAnyRootDeep(canvas, ['HoldPanel', 'Hold']) ||
            UIBuilder.obtainShellRoot(canvas, 'HoldPanel', cc.v2(PL.HoldPanel.x, PL.HoldPanel.y));
        const holdSize = cc.size(layout.SIDE_PANEL_WIDTH, layout.SIDE_PANEL_WIDTH + 20);
        if (UIBuilder._layoutFromCode) {
            holdRoot.setContentSize(holdSize);
        } else {
            UIBuilder.ensureMinHitSize(holdRoot, holdSize.width, holdSize.height);
        }

        const holdGraphicsNode = ensureChild(holdRoot, 'HoldGraphics', cc.v2(-holdSize.width / 2, -holdSize.height / 2 + 6));
        holdGraphicsNode.active = true;
        // HoldGraphics is often the first child; editor "Holdpanel" sprite is drawn after and covers Graphics.
        holdGraphicsNode.zIndex = 50;

        let holdInnerW: number;
        let holdInnerH: number;
        let gfxOriginInHoldG: cc.Vec2;
        if (UIBuilder._layoutFromCode) {
            holdGraphicsNode.setAnchorPoint(0, 0);
            holdInnerW = holdSize.width;
            holdInnerH = holdSize.height - 30;
            holdGraphicsNode.setContentSize(holdInnerW, holdInnerH);
            gfxOriginInHoldG = cc.v2(0, 0);
        } else {
            const rw = holdRoot.width > 1 ? holdRoot.width : holdSize.width;
            const rh = holdRoot.height > 1 ? holdRoot.height : holdSize.height;
            holdInnerH = Math.max(60, rh - 36);
            holdInnerW = rw;
            holdGraphicsNode.setAnchorPoint(0.5, 0.5);
            holdGraphicsNode.setPosition(0, -14);
            holdGraphicsNode.setContentSize(holdInnerW, holdInnerH);
            gfxOriginInHoldG = cc.v2(-holdInnerW / 2, -holdInnerH / 2);
        }

        stripGraphicsOnNode(holdGraphicsNode);
        const gfxHold = ensureChild(holdGraphicsNode, 'Gfx', gfxOriginInHoldG);
        gfxHold.setAnchorPoint(0, 0);
        gfxHold.setContentSize(holdInnerW, holdInnerH);
        gfxHold.setPosition(gfxOriginInHoldG);
        gfxHold.active = true;
        stripGraphicsOnNode(gfxHold);
        const holdGraphics = gfxHold.addComponent(cc.Graphics);

        // Make the whole hold panel tappable
        UIBuilder.bindButton(holdRoot, function () { callbacks.onHoldTap(); });

        // ----- Next panel (right) - 3 piece previews -----
        const nextSlotH = layout.SIDE_PANEL_WIDTH;
        const nextHeader = 28;
        const slotGap = 8;
        const nextSize = cc.size(layout.SIDE_PANEL_WIDTH, nextHeader + nextSlotH * 3 + slotGap * 2 + 14);
        // Scene may name this root "Next" (editor) or "NextPanel" (shell seed). Prefer existing node.
        const nextRoot =
            UIBuilder.findAnyRootDeep(canvas, ['NextPanel', 'Next']) ||
            UIBuilder.obtainShellRoot(canvas, 'NextPanel', cc.v2(PL.NextPanel.x, PL.NextPanel.y));
        if (UIBuilder._layoutFromCode) {
            nextRoot.setContentSize(nextSize);
        }

        const nextSlots: { node: cc.Node; graphics: cc.Graphics; size: cc.Size }[] = [];
        for (let i = 0; i < 3; i++) {
            // Prefer editor-authored slot roots / gfx containers (supports both NextSlotG0 and NextSlotG_0 styles).
            const slot =
                UIBuilder.findAnyRootDeep(nextRoot, ['NextSlot' + i, 'NextSlot_' + i]) ||
                ensureChild(nextRoot, 'NextSlot' + i, cc.v2(0, 0));

            // Use actual slot size (Editor-authored) when available so preview fits cleanly.
            const editorSlotSize = slot.getContentSize();
            const slotW = (!UIBuilder._layoutFromCode && editorSlotSize.width > 1) ? editorSlotSize.width : (layout.SIDE_PANEL_WIDTH - 14);
            const slotH = (!UIBuilder._layoutFromCode && editorSlotSize.height > 1) ? editorSlotSize.height : nextSlotH;
            const slotSize = cc.size(slotW, slotH);
            if (UIBuilder._layoutFromCode) {
                slot.setContentSize(slotSize);
            }
            const startTopY = nextSize.height / 2 - nextHeader - slotSize.height / 2;
            if (UIBuilder._layoutFromCode) {
                slot.setPosition(cc.v2(0, startTopY - i * (slotSize.height + slotGap)));
            }

            // Some scenes place NextSlotG_* directly under NextPanel (not under each NextSlot).
            // Always prefer the editor node to avoid creating duplicates that overlap.
            const nameUnderscore = 'NextSlotG_' + i;
            const namePlain = 'NextSlotG' + i;
            const slotG =
                UIBuilder.findAnyRootDeep(nextRoot, [nameUnderscore, namePlain]) ||
                UIBuilder.findAnyRootDeep(slot, [nameUnderscore, namePlain]) ||
                ensureChild(slot, namePlain, cc.v2(-slotSize.width / 2, -slotSize.height / 2));

            // If both naming variants exist in the scene, disable the unused one to avoid double-render overlap.
            const altG =
                slotG.name === nameUnderscore
                    ? (UIBuilder.findAnyRootDeep(nextRoot, [namePlain]) || UIBuilder.findAnyRootDeep(slot, [namePlain]))
                    : (UIBuilder.findAnyRootDeep(nextRoot, [nameUnderscore]) || UIBuilder.findAnyRootDeep(slot, [nameUnderscore]));
            if (altG && altG !== slotG) {
                altG.active = false;
                stripGraphicsOnNode(altG);
                const altChild = altG.getChildByName('Gfx');
                if (altChild) {
                    stripGraphicsOnNode(altChild);
                }
            }

            // SlotG: clipping container (Mask). Gfx draws with origin bottom-left inside panelSize.
            // Editor slots use anchor (0.5,0.5); forcing anchor (0,0) without reposition shifts the rect → pieces hug a corner.
            slotG.setContentSize(slotSize);
            let gfxOriginInSlotG: cc.Vec2;
            if (UIBuilder._layoutFromCode) {
                slotG.setAnchorPoint(0, 0);
                slotG.setPosition(cc.v2(-slotSize.width / 2, -slotSize.height / 2));
                gfxOriginInSlotG = cc.v2(0, 0);
            } else {
                slotG.setAnchorPoint(0.5, 0.5);
                slotG.setPosition(cc.v2(0, 0));
                // Centered slotG: bottom-left of its rect in local space is (-w/2, -h/2).
                gfxOriginInSlotG = cc.v2(-slotSize.width / 2, -slotSize.height / 2);
            }

            // Prevent preview Graphics from bleeding into neighbouring slots.
            // In Cocos Creator 2.x, cc.Graphics is not automatically clipped by parent bounds.
            let m: cc.Mask | null;
            while ((m = slotG.getComponent(cc.Mask))) {
                slotG.removeComponent(m);
            }
            const mask = slotG.addComponent(cc.Mask);
            mask.type = cc.Mask.Type.RECT;

            const gfxNode = ensureChild(slotG, 'Gfx', gfxOriginInSlotG);
            gfxNode.setAnchorPoint(0, 0);
            gfxNode.setContentSize(slotSize);
            gfxNode.setPosition(gfxOriginInSlotG);
            stripGraphicsOnNode(gfxNode);
            const sg = gfxNode.addComponent(cc.Graphics);
            nextSlots.push({ node: slot, graphics: sg, size: cc.size(slotSize.width, slotSize.height) });
        }

        // ----- Ad banner placeholder (bottom) -----
        const adW = cw - 60;
        const adBanner = UIBuilder.obtainShellRoot(canvas, 'AdBannerPlaceholder', cc.v2(PL.AdBannerPlaceholder.x, PL.AdBannerPlaceholder.y));
        if (UIBuilder._layoutFromCode) {
            adBanner.setContentSize(adW, layout.AD_BANNER_HEIGHT);
        }
        // Editor-authored: do NOT draw with Graphics.

        // ----- Overlay root (separate so overlays sit on top of everything) -----
        const overlayRoot = UIBuilder.obtainShellRoot(canvas, 'OverlayRoot', cc.v2(PL.OverlayRoot.x, PL.OverlayRoot.y));
        overlayRoot.zIndex = 100;

        let startOverlay: cc.Node;
        if (skipStartOverlay) {
            startOverlay = new cc.Node('StartOverlay_placeholder');
            startOverlay.active = false;
            overlayRoot.addChild(startOverlay);
        } else {
            // Legacy: keep old behaviour only when start overlay is requested.
            startOverlay = UIBuilder.buildStartOverlay(overlayRoot, fullW, fullH, callbacks);
        }
        // Editor-authored overlays: prefer existing nodes; only fall back to procedural Graphics overlays if missing.
        const pauseOverlayExisting = UIBuilder.findRootDeep(overlayRoot, 'PauseOverlay');
        const pauseOverlay = pauseOverlayExisting ? pauseOverlayExisting : UIBuilder.buildPauseOverlay(overlayRoot, fullW, fullH, callbacks);

        const gameOverExisting = UIBuilder.findRootDeep(overlayRoot, 'GameOverOverlay');
        const goRefs = gameOverExisting
            ? UIBuilder.resolveExistingGameOverOverlay(gameOverExisting)
            : UIBuilder.buildGameOverOverlay(overlayRoot, fullW, fullH, callbacks);

        return {
            bgRoot: bgRoot,
            boardRoot: boardRoot,
            boardGraphics: boardGraphics,
            boardTouchNode: boardTouchNode,
            holdRoot: holdRoot,
            holdGraphics: holdGraphics,
            nextRoot: nextRoot,
            nextSlots: nextSlots,
            pauseButton: pauseBtn,
            holdHitArea: holdRoot,
            adBanner: adBanner,
            linesLabel: hudResult.linesLabel,
            levelLabel: hudResult.levelLabel,
            levelPanelRoot: hudResult.levelPanelRoot,
            levelHudRoots: hudResult.levelHudRoots,
            scoreLabel: hudResult.scoreLabel,
            bestLabel: hudResult.bestLabel,
            startOverlay: startOverlay,
            pauseOverlay: pauseOverlay,
            gameOverOverlay: goRefs.root,
            goScoreLabel: goRefs.scoreLabel,
            goBestLabel: goRefs.bestLabel,
        };
        } finally {
            UIBuilder._layoutFromCode = false;
            setUILayoutPositionsFromCode(true);
        }
    }

    /**
     * Fullscreen homescreen for loadingScene — same copy as StartOverlay but with explicit node names
     * under LoadingScene_HomescreenHost (created on the Canvas).
     * @param options.initiallyHidden When true, host node stays inactive (show a loading layer first, then activate).
     */
    public static buildLoadingHomescreen(
        canvas: cc.Node,
        onPlay: () => void,
        options?: UIBuildOptions & { initiallyHidden?: boolean },
    ): cc.Node {
        const layoutFromCode = options && options.layoutFromCode === true;
        const initiallyHidden = options && options.initiallyHidden === true;
        UIBuilder._layoutFromCode = layoutFromCode;
        setUILayoutPositionsFromCode(layoutFromCode);
        const cw = GameConstants.DESIGN_WIDTH;
        const ch = GameConstants.DESIGN_HEIGHT;
        const vis = cc.view.getVisibleSize();
        const fullW = Math.max(cw, vis.width);
        const fullH = Math.max(ch, vis.height);
        try {
            const host = ensureChild(canvas, 'LoadingScene_HomescreenHost', cc.v2(0, 0));
            host.zIndex = 500;
            host.active = !initiallyHidden;
            UIBuilder.prepareRoot(host);
            const root = UIBuilder.buildOverlayShell(host, 'LoadingHomescreenRoot', fullW, fullH, {
                active: true,
                dimNodeName: 'HomescreenDim',
                dimFillColor: GameConstants.COLOR.BG_DEEP,
                dimFillAlpha: 255,
            });
            UIBuilder.addHomescreenOverlayContent(root, onPlay, 'loading');
            return root;
        } finally {
            UIBuilder._layoutFromCode = false;
            setUILayoutPositionsFromCode(true);
        }
    }

    // ============================================================
    // helpers
    // ============================================================
    private static makeNode(name: string, parent: cc.Node, pos: cc.Vec2): cc.Node {
        const n = new cc.Node(name);
        n.setPosition(pos);
        if (parent) parent.addChild(n);
        return n;
    }

    /** Hit-testing skips 0×0 nodes; dim overlay then steals TOUCH_START — buttons feel dead. */
    private static ensureButtonHitArea(node: cc.Node, w: number, h: number): void {
        if (node.width >= 1 && node.height >= 1) return;
        node.setContentSize(w, h);
        node.setAnchorPoint(0.5, 0.5);
    }

    /** Same as {@link ensureButtonHitArea} but keeps anchor (panels edited in Hierarchy). */
    private static ensureMinHitSize(node: cc.Node, w: number, h: number): void {
        if (node.width >= 1 && node.height >= 1) return;
        node.setContentSize(w, h);
    }

    /** Overlay interiors are procedural — always apply coords so controls do not stack at (0,0) when Editor layout is respected. */
    private static layoutOverlayChild(parent: cc.Node, name: string, localPos: cc.Vec2): cc.Node {
        const n = ensureChild(parent, name, localPos);
        n.setPosition(localPos);
        return n;
    }

    private static drawBackground(node: cc.Node, w: number, h: number): void {
        let dw = w;
        let dh = h;
        if (UIBuilder._layoutFromCode) {
            node.setContentSize(w, h);
            node.setAnchorPoint(0.5, 0.5);
        } else {
            dw = node.width > 0 ? node.width : w;
            dh = node.height > 0 ? node.height : h;
        }
        stripGraphicsOnNode(node);
        const g = node.addComponent(cc.Graphics);
        g.fillColor = hexToColor(GameConstants.COLOR.BG_DEEP);
        g.rect(-dw / 2, -dh / 2, dw, dh);
        g.fill();

        // Dotted overlay (sparse)
        g.fillColor = hexToColor(GameConstants.COLOR.BG_DOT, 110);
        const step = 32;
        for (let x = -dw / 2; x < dw / 2; x += step) {
            for (let y = -dh / 2; y < dh / 2; y += step) {
                g.circle(x + step / 2, y + step / 2, 1.2);
                g.fill();
            }
        }
    }

    private static resolveLevelPanelRoot(labelNode: cc.Node, hudParent: cc.Node): cc.Node | null {
        let n: cc.Node | null = labelNode;
        while (n && n !== hudParent) {
            if (n.name === 'LevelPanel') {
                return n;
            }
            n = n.parent;
        }
        return labelNode.parent;
    }

    /** Nodes to hide for Normal mode: named panels + the TopHUD subtree that contains `lvl_Lab`. */
    private static collectLevelHudRoots(hudParent: cc.Node, levelLabel: cc.Label): {
        levelHudRoots: cc.Node[];
        levelPanelRoot: cc.Node | null;
    } {
        const roots: cc.Node[] = [];
        const add = function (node: cc.Node | null): void {
            if (!node || !node.isValid) {
                return;
            }
            if (roots.indexOf(node) >= 0) {
                return;
            }
            roots.push(node);
        };
        const lvlLab = UIBuilder.findRootDeep(hudParent, 'lvl_Lab');
        if (lvlLab) {
            let n: cc.Node | null = lvlLab;
            while (n && n.parent && n.parent !== hudParent) {
                n = n.parent;
            }
            if (n && n.parent === hudParent) {
                add(n);
            }
        }
        add(UIBuilder.findRootDeep(hudParent, 'LevelPanel'));
        add(UIBuilder.findRootDeep(hudParent, 'Level'));
        if (roots.length === 0) {
            add(UIBuilder.resolveLevelPanelRoot(levelLabel.node, hudParent));
        }
        const levelPanelRoot = UIBuilder.findRootDeep(hudParent, 'LevelPanel') || roots[0] || null;
        return { levelHudRoots: roots, levelPanelRoot: levelPanelRoot };
    }

    private static buildTopHUD(parent: cc.Node): {
        linesLabel: cc.Label;
        levelLabel: cc.Label;
        scoreLabel: cc.Label;
        bestLabel: cc.Label;
        levelPanelRoot: cc.Node | null;
        levelHudRoots: cc.Node[];
    } {
        // If marathonScene HUD was rebuilt in editor, prefer explicit node names the scene provides.
        // These names come from the user's marathonScene: Bestscore_label, lines_Lab, score_Lab, lvl_Lab.
        const bestLabelNode = UIBuilder.findRootDeep(parent, 'Bestscore_label');
        const linesLabelNode = UIBuilder.findRootDeep(parent, 'lines_Lab');
        const scoreLabelNode = UIBuilder.findRootDeep(parent, 'score_Lab');
        const levelLabelNode = UIBuilder.findRootDeep(parent, 'lvl_Lab');
        if (bestLabelNode && linesLabelNode && scoreLabelNode && levelLabelNode) {
            const bestLabel = bestLabelNode.getComponent(cc.Label) || bestLabelNode.addComponent(cc.Label);
            const linesLabel = linesLabelNode.getComponent(cc.Label) || linesLabelNode.addComponent(cc.Label);
            const scoreLabel = scoreLabelNode.getComponent(cc.Label) || scoreLabelNode.addComponent(cc.Label);
            const levelLabel = levelLabelNode.getComponent(cc.Label) || levelLabelNode.addComponent(cc.Label);
            const collected = UIBuilder.collectLevelHudRoots(parent, levelLabel);
            return {
                linesLabel,
                levelLabel,
                scoreLabel,
                bestLabel,
                levelPanelRoot: collected.levelPanelRoot,
                levelHudRoots: collected.levelHudRoots,
            };
        }

        const layout = GameConstants.LAYOUT;
        const cw = GameConstants.DESIGN_WIDTH;
        const hudW = cw - 40;
        const hudH = layout.TOP_HUD_HEIGHT;
        if (UIBuilder._layoutFromCode) {
            parent.setContentSize(hudW, hudH);
            parent.setAnchorPoint(0.5, 0.5);
        }

        // (No outer HUD frame — kept frameless per design.)

        // ----- Big score panel (top half, full HUD width inset) -----
        const scoreW = hudW - 24;
        const scoreH = 92;
        // Keep BEST block clearly separated from the StatsStrip below.
        const scoreRootPos = cc.v2(0, hudH / 2 - scoreH / 2 + 10);
        const scoreRoot = ensureChild(parent, 'ScorePanel', scoreRootPos);
        // Always place HUD internals (they are procedural; scene layout often drifts).
        scoreRoot.setPosition(scoreRootPos);
        if (UIBuilder._layoutFromCode) {
            scoreRoot.setContentSize(scoreW, scoreH);
        }
        // (No score panel frame — labels float on background.)

        // Crown icon used to be procedural Graphics. Leave it to the editor now (sprite, etc).

        // BEST value (left half, bottom)
        // Push BEST text right so it doesn't overlap the crown.
        const bestCapPos = cc.v2(-scoreW / 2 + 92, scoreH / 4 + 4);
        const bestCapN = ensurePreferredChild(scoreRoot, 'BestCap', bestCapPos);
        bestCapN.setPosition(bestCapPos);
        const bestCap = UIBuilder.buildLabel(bestCapN, 'BEST', 16, GameConstants.COLOR.TEXT_GOLD, cc.Label.HorizontalAlign.LEFT);
        if (UIBuilder._layoutFromCode) {
            bestCapN.setAnchorPoint(0, 0.5);
            bestCap.enableBold = true;
        }

        // Lift the best score number so it doesn't collide with the StatsStrip.
        const bestValPos = cc.v2(-scoreW / 2 + 92, -scoreH / 4 + 26);
        const bestN = ensurePreferredChild(scoreRoot, 'BestVal', bestValPos);
        bestN.setPosition(bestValPos);
        const bestLabel = UIBuilder.buildLabel(bestN, '0', 26, GameConstants.COLOR.TEXT_PRIMARY, cc.Label.HorizontalAlign.LEFT);
        if (UIBuilder._layoutFromCode) {
            bestN.setAnchorPoint(0, 0.5);
            bestLabel.enableBold = true;
        }

        // SCORE number lives in StatsStrip (bottom row with LINES / LEVEL).

        // ----- Bottom HUD: 3 separate boxes (Line | Score | Level) like the reference -----
        const smallY = -hudH / 2 + 36; // move up a bit
        const statsStripPos = cc.v2(0, smallY);
        const statsStrip = ensurePreferredChild(parent, 'StatsStrip', statsStripPos);
        statsStrip.setPosition(statsStripPos);

        const gap = 18;
        const sideW = 150;
        const sideH = 110;
        const midScoreW = 210;
        const midScoreH = 160;
        const scoreY = (midScoreH - sideH) / 2;
        const sideX = midScoreW / 2 + gap + sideW / 2;

        const linesPos = cc.v2(-sideX, 0);
        const scorePos = cc.v2(0, scoreY);
        const levelPos = cc.v2(sideX, 0);

        const linesNode = ensurePreferredChild(statsStrip, 'LinesPanel', linesPos);
        const scoreMidNode = ensurePreferredChild(statsStrip, 'ScoreStripPanel', scorePos);
        const levelNode = ensurePreferredChild(statsStrip, 'LevelPanel', levelPos);
        linesNode.setPosition(linesPos);
        scoreMidNode.setPosition(scorePos);
        levelNode.setPosition(levelPos);

        // Ensure hit area / sizing even when respecting Editor layout.
        if (UIBuilder._layoutFromCode || linesNode.width < 1 || linesNode.height < 1) linesNode.setContentSize(sideW, sideH);
        if (UIBuilder._layoutFromCode || scoreMidNode.width < 1 || scoreMidNode.height < 1) scoreMidNode.setContentSize(midScoreW, midScoreH);
        if (UIBuilder._layoutFromCode || levelNode.width < 1 || levelNode.height < 1) levelNode.setContentSize(sideW, sideH);

        // Panel outlines used to be procedural Graphics. Leave frames/backgrounds to editor.

        const linesLabel = UIBuilder.buildSmallStat(linesNode, 'Line', '0', sideW, sideH);
        const scoreLabelMid = UIBuilder.buildSmallStat(scoreMidNode, 'Score', '0', midScoreW, midScoreH);
        const levelLabel = UIBuilder.buildSmallStat(levelNode, 'Level', '1', sideW, sideH);

        return {
            linesLabel: linesLabel,
            levelLabel: levelLabel,
            scoreLabel: scoreLabelMid,
            bestLabel: bestLabel,
            levelPanelRoot: levelNode,
            levelHudRoots: [levelNode],
        };
    }

    private static buildSmallStat(parent: cc.Node, caption: string, valueDefault: string, w?: number, h?: number): cc.Label {
        const dw = typeof w === 'number' ? w : GameConstants.LAYOUT.SMALL_STAT_PANEL_WIDTH;
        const dh = typeof h === 'number' ? h : 84;
        if (UIBuilder._layoutFromCode) {
            parent.setContentSize(dw, dh);
            parent.setAnchorPoint(0.5, 0.5);
        } else if (parent.width < 1 || parent.height < 1) {
            parent.setContentSize(dw, dh);
        }
        // (No frame around LINES/LEVEL — text only.)

        // Title near top, value centered (reference layout).
        const capFont = dh >= 150 ? 28 : (dh >= 110 ? 22 : 18);
        const capY = dh / 2 - (capFont / 2) - 14;
        const capN = ensureChild(parent, 'cap', cc.v2(0, capY));
        capN.setPosition(cc.v2(0, capY));
        const cap = UIBuilder.buildLabel(capN, caption, capFont, GameConstants.COLOR.TEXT_CYAN, cc.Label.HorizontalAlign.CENTER);
        if (UIBuilder._layoutFromCode) {
            cap.enableBold = true;
        }

        const valFont = dh >= 150 ? 88 : (dh >= 110 ? 44 : 32);
        const valN = ensureChild(parent, 'val', cc.v2(0, -4));
        valN.setPosition(cc.v2(0, -4));
        const val = UIBuilder.buildLabel(valN, valueDefault, valFont, GameConstants.COLOR.TEXT_PRIMARY, cc.Label.HorizontalAlign.CENTER);
        if (UIBuilder._layoutFromCode) {
            val.enableBold = true;
        }
        return val;
    }

    private static drawPanel(node: cc.Node, size: cc.Size, headerText: string): void {
        UIBuilder.drawWhitePanelOutline(node, size.width, size.height);
        const headerH = 24;
        const labelN = ensureChild(node, 'header', cc.v2(0, size.height / 2 - headerH / 2 - 4));
        const lab = UIBuilder.buildLabel(labelN, headerText, 16, GameConstants.COLOR.TEXT_CYAN, cc.Label.HorizontalAlign.CENTER);
        if (UIBuilder._layoutFromCode) {
            lab.enableBold = true;
        }
    }

    private static drawAdBanner(node: cc.Node, w: number, h: number): void {
        let dw = w;
        let dh = h;
        if (UIBuilder._layoutFromCode) {
            node.setAnchorPoint(0.5, 0.5);
        } else {
            dw = node.width > 0 ? node.width : w;
            dh = node.height > 0 ? node.height : h;
        }
        stripGraphicsOnNode(node);
        const g = node.addComponent(cc.Graphics);
        // Opaque fill only: semi-transparent fill + tinted stroke read as muddy olive on some devices.
        UIBuilder.drawRoundedRect(g, -dw / 2, -dh / 2, dw, dh, 10,
            hexToColor(GameConstants.COLOR.PANEL_BG),
            null, 0);
    }

    private static drawPauseButton(node: cc.Node, size: number): void {
        if (UIBuilder._layoutFromCode) {
            node.setContentSize(size, size);
            node.setAnchorPoint(0.5, 0.5);
        } else {
            UIBuilder.ensureButtonHitArea(node, size, size);
        }
        stripGraphicsOnNode(node);
        const g = node.addComponent(cc.Graphics);

        // No frame — just two pause bars centered in the (still tappable) hit area.
        g.fillColor = hexToColor(GameConstants.COLOR.TEXT_CYAN);
        g.lineWidth = 0;
        const barW = 7;
        const barH = 26;
        g.rect(-10, -barH / 2, barW, barH);
        g.fill();
        g.rect(3, -barH / 2, barW, barH);
        g.fill();
    }

    private static drawCrown(g: cc.Graphics, color: cc.Color): void {
        g.fillColor = color;
        g.lineWidth = 0;
        // Base
        g.rect(-12, -8, 24, 6);
        g.fill();
        // Three peaks
        g.moveTo(-12, -2);
        g.lineTo(-7, 8);
        g.lineTo(-2, -2);
        g.lineTo(0, 8);
        g.lineTo(2, -2);
        g.lineTo(7, 8);
        g.lineTo(12, -2);
        g.close();
        g.fill();
        // Highlight dot
        g.fillColor = new cc.Color(255, 255, 255, 200);
        g.circle(0, 4, 1.5);
        g.fill();
    }

    /** White square stroke on full panel; child `_whiteOutline` renders behind other children. */
    private static drawWhitePanelOutline(target: cc.Node, defaultW: number, defaultH: number, lineWidth: number = 2): void {
        let w = defaultW;
        let h = defaultH;
        if (!UIBuilder._layoutFromCode && target.width >= 1 && target.height >= 1) {
            w = target.width;
            h = target.height;
        }
        let frame = target.getChildByName('_whiteOutline');
        if (!frame) {
            frame = new cc.Node('_whiteOutline');
            target.insertChild(frame, 0);
        }
        frame.setPosition(0, 0);
        stripGraphicsOnNode(frame);
        const g = frame.addComponent(cc.Graphics);
        const stroke = hexToColor(GameConstants.COLOR.HUD_OUTLINE_WHITE);
        g.lineWidth = lineWidth;
        g.strokeColor = stroke;
        g.rect(-w / 2, -h / 2, w, h);
        g.stroke();
    }

    private static drawRoundedRect(g: cc.Graphics, x: number, y: number, w: number, h: number, r: number,
        fill: cc.Color | null, stroke: cc.Color | null, strokeWidth: number): void {
        g.lineWidth = strokeWidth;
        if (fill) g.fillColor = fill;
        if (stroke) g.strokeColor = stroke;

        const right = x + w;
        const top = y + h;
        g.moveTo(x + r, y);
        g.lineTo(right - r, y);
        g.arc(right - r, y + r, r, -Math.PI / 2, 0, false);
        g.lineTo(right, top - r);
        g.arc(right - r, top - r, r, 0, Math.PI / 2, false);
        g.lineTo(x + r, top);
        g.arc(x + r, top - r, r, Math.PI / 2, Math.PI, false);
        g.lineTo(x, y + r);
        g.arc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
        g.close();
        if (fill) g.fill();
        if (stroke) g.stroke();
    }

    public static addOutline(node: cc.Node, colorHex: string, width: number): void {
        // cc.LabelOutline is a 2.x component; in newer typings it may be missing.
        // Access via the runtime to avoid hard compile errors.
        const ctor = (cc as any).LabelOutline;
        if (!ctor) return;
        const olds = node.getComponents(ctor);
        for (let i = 0; i < olds.length; i++) {
            node.removeComponent(olds[i]);
        }
        const outline = node.addComponent(ctor) as any;
        outline.color = hexToColor(colorHex);
        outline.width = width;
    }

    public static buildLabel(node: cc.Node, text: string, fontSize: number, colorHex: string, align: number): cc.Label {
        const had = !!node.getComponent(cc.Label);
        let lab = node.getComponent(cc.Label);
        if (!lab) {
            lab = node.addComponent(cc.Label);
        }
        lab.string = text;
        if (UIBuilder._layoutFromCode || !had) {
            lab.fontSize = fontSize;
            lab.lineHeight = fontSize + 4;
            lab.horizontalAlign = align;
            lab.verticalAlign = cc.Label.VerticalAlign.CENTER;
            lab.overflow = cc.Label.Overflow.NONE;
            // Force system font (avoids needing a TTF asset)
            try { (lab as any).useSystemFont = true; } catch (e) { /* ignore */ }
            (lab as any)._isSystemFontUsed = true;
            lab.fontFamily = SYSTEM_FONT_FAMILY;
            node.color = hexToColor(colorHex);
        }
        return lab;
    }

    private static bindButton(node: cc.Node, onClick: () => void): void {
        node.off(cc.Node.EventType.TOUCH_END);
        node.on(cc.Node.EventType.TOUCH_END, function (e: cc.Event.EventTouch) {
            onClick();
        });
    }

    // ----------------------- Overlays -----------------------
    private static buildOverlayShell(
        parent: cc.Node,
        name: string,
        cw: number,
        ch: number,
        opts?: {
            active?: boolean;
            dimNodeName?: string;
            /** When set, use this fill instead of default semi-transparent overlay dim. */
            dimFillColor?: string;
            dimFillAlpha?: number;
        },
    ): cc.Node {
        const root = ensureChild(parent, name, cc.v2(0, 0));
        // Overlays are always fullscreen (not meant to be hand-laid out).
        root.setContentSize(cw, ch);
        root.setAnchorPoint(0.5, 0.5);
        root.active = opts && opts.active === true;

        const dimName = opts && opts.dimNodeName ? opts.dimNodeName : 'dim';
        const dim = ensureChild(root, dimName, cc.v2(0, 0));
        dim.setContentSize(cw, ch);
        dim.setAnchorPoint(0.5, 0.5);
        stripGraphicsOnNode(dim);
        const dg = dim.addComponent(cc.Graphics);
        const fillHex = opts && opts.dimFillColor ? opts.dimFillColor : GameConstants.COLOR.OVERLAY_DIM;
        const fillAlpha = opts && opts.dimFillAlpha !== undefined ? opts.dimFillAlpha : 175;
        dg.fillColor = hexToColor(fillHex, fillAlpha);
        dg.rect(-cw / 2, -ch / 2, cw, ch);
        dg.fill();
        // Block input behind overlay
        dim.off(cc.Node.EventType.TOUCH_START);
        dim.on(cc.Node.EventType.TOUCH_START, function (e: cc.Event.EventTouch) { e.stopPropagation(); });

        return root;
    }

    /** Shared title / engine line / PLAY between marathonScene StartOverlay and loadingScene homescreen. */
    private static addHomescreenOverlayContent(root: cc.Node, onPlay: () => void, variant: 'main' | 'loading'): void {
        const titleName = variant === 'loading' ? 'HomescreenTitle' : 'title';
        const subName = variant === 'loading' ? 'HomescreenEngineInfo' : 'sub';
        // loadingScene: tighter vertical stack (less empty band between title / subtitle / button).
        const titleY = variant === 'loading' ? 92 : 220;
        const subY = variant === 'loading' ? 22 : 150;
        const btnY = variant === 'loading' ? -82 : 0;

        const titleN = UIBuilder.layoutOverlayChild(root, titleName, cc.v2(0, titleY));
        const tlab = UIBuilder.buildLabel(titleN, 'Falling block puzzle', 60, GameConstants.COLOR.TEXT_CYAN, cc.Label.HorizontalAlign.CENTER);
        if (UIBuilder._layoutFromCode) {
            tlab.enableBold = true;
        }
        UIBuilder.addOutline(titleN, '#0B1B3D', 4);

        const subN = UIBuilder.layoutOverlayChild(root, subName, cc.v2(0, subY));
        UIBuilder.buildLabel(subN, 'Engine: Cocos Creator 2.4.13', 24, '#9DBBE6', cc.Label.HorizontalAlign.CENTER);

        const btn = UIBuilder.buildButton(root, 'PLAY', 268, 82, onPlay);
        btn.setPosition(cc.v2(0, btnY));
        if (variant === 'loading') {
            btn.name = 'HomescreenPlayButton';
        }
    }

    private static buildStartOverlay(parent: cc.Node, cw: number, ch: number, callbacks: UICallbacks): cc.Node {
        const root = UIBuilder.buildOverlayShell(parent, 'StartOverlay', cw, ch);
        UIBuilder.addHomescreenOverlayContent(root, function () { callbacks.onPlay(); }, 'main');
        return root;
    }

    private static buildPauseOverlay(parent: cc.Node, cw: number, ch: number, callbacks: UICallbacks): cc.Node {
        const root = UIBuilder.buildOverlayShell(parent, 'PauseOverlay', cw, ch);

        const panelW = 420, panelH = 460;
        const panel = ensureChild(root, 'panel', cc.v2(0, 0));
        if (UIBuilder._layoutFromCode) {
            panel.setContentSize(panelW, panelH);
        }
        const pw = UIBuilder._layoutFromCode ? panelW : (panel.width > 0 ? panel.width : panelW);
        const ph = UIBuilder._layoutFromCode ? panelH : (panel.height > 0 ? panel.height : panelH);
        stripGraphicsOnNode(panel);
        const pg = panel.addComponent(cc.Graphics);
        // Square panel frame (no rounded / notched corners).
        pg.lineWidth = 3;
        pg.fillColor = hexToColor(GameConstants.COLOR.PANEL_BG, 245);
        pg.strokeColor = hexToColor(GameConstants.COLOR.PANEL_BORDER);
        pg.rect(-pw / 2, -ph / 2, pw, ph);
        pg.fill();
        pg.stroke();

        const titleN = UIBuilder.layoutOverlayChild(panel, 'title', cc.v2(0, ph / 2 - 60));
        const tlab = UIBuilder.buildLabel(titleN, 'PAUSED', 48, GameConstants.COLOR.TEXT_CYAN, cc.Label.HorizontalAlign.CENTER);
        if (UIBuilder._layoutFromCode) {
            tlab.enableBold = true;
        }

        const btnResume = UIBuilder.buildButton(panel, 'RESUME', 280, 70, function () { callbacks.onResume(); });
        btnResume.setPosition(cc.v2(0, 60));

        const btnRestart = UIBuilder.buildButton(panel, 'RESTART', 280, 70, function () { callbacks.onRestart(); });
        btnRestart.setPosition(cc.v2(0, -30));

        const btnHome = UIBuilder.buildButton(panel, 'HOME', 280, 70, function () { callbacks.onHome(); });
        btnHome.setPosition(cc.v2(0, -120));

        return root;
    }

    private static buildGameOverOverlay(parent: cc.Node, cw: number, ch: number, callbacks: UICallbacks):
        { root: cc.Node; scoreLabel: cc.Label; bestLabel: cc.Label } {
        const root = UIBuilder.buildOverlayShell(parent, 'GameOverOverlay', cw, ch);

        const panelW = 480, panelH = 500;
        const panel = ensureChild(root, 'panel', cc.v2(0, 0));
        if (UIBuilder._layoutFromCode) {
            panel.setContentSize(panelW, panelH);
        }
        const pw = UIBuilder._layoutFromCode ? panelW : (panel.width > 0 ? panel.width : panelW);
        const ph = UIBuilder._layoutFromCode ? panelH : (panel.height > 0 ? panel.height : panelH);
        stripGraphicsOnNode(panel);
        const pg = panel.addComponent(cc.Graphics);
        // Square panel frame (no rounded / notched corners).
        pg.lineWidth = 3;
        pg.fillColor = hexToColor(GameConstants.COLOR.PANEL_BG, 250);
        pg.strokeColor = hexToColor(GameConstants.COLOR.PANEL_BORDER);
        pg.rect(-pw / 2, -ph / 2, pw, ph);
        pg.fill();
        pg.stroke();

        const titleN = UIBuilder.layoutOverlayChild(panel, 'title', cc.v2(0, ph / 2 - 60));
        const tlab = UIBuilder.buildLabel(titleN, 'GAME OVER', 48, '#FF7B7B', cc.Label.HorizontalAlign.CENTER);
        if (UIBuilder._layoutFromCode) {
            tlab.enableBold = true;
        }
        UIBuilder.addOutline(titleN, '#3A0A0A', 3);

        const scoreCapN = UIBuilder.layoutOverlayChild(panel, 'scoreCap', cc.v2(0, 90));
        UIBuilder.buildLabel(scoreCapN, 'SCORE', 22, GameConstants.COLOR.TEXT_CYAN, cc.Label.HorizontalAlign.CENTER);

        const scoreN = UIBuilder.layoutOverlayChild(panel, 'scoreVal', cc.v2(0, 52));
        const scoreLabel = UIBuilder.buildLabel(scoreN, '0', 54, GameConstants.COLOR.TEXT_PRIMARY, cc.Label.HorizontalAlign.CENTER);
        if (UIBuilder._layoutFromCode) {
            scoreLabel.enableBold = true;
        }

        // Divider between SCORE and BEST
        const dividerN = UIBuilder.layoutOverlayChild(panel, 'scoreBestDivider', cc.v2(0, 8));
        stripGraphicsOnNode(dividerN);
        const dg = dividerN.addComponent(cc.Graphics);
        dg.lineWidth = 2;
        dg.strokeColor = hexToColor(GameConstants.COLOR.PANEL_BORDER);
        dg.moveTo(-90, 0);
        dg.lineTo(90, 0);
        dg.stroke();

        const bestCapN = UIBuilder.layoutOverlayChild(panel, 'bestCap', cc.v2(0, -54));
        UIBuilder.buildLabel(bestCapN, 'BEST', 22, GameConstants.COLOR.TEXT_GOLD, cc.Label.HorizontalAlign.CENTER);

        const bestN = UIBuilder.layoutOverlayChild(panel, 'bestVal', cc.v2(0, -92));
        const bestLabel = UIBuilder.buildLabel(bestN, '0', 40, GameConstants.COLOR.TEXT_PRIMARY, cc.Label.HorizontalAlign.CENTER);
        if (UIBuilder._layoutFromCode) {
            bestLabel.enableBold = true;
        }

        const restartY = Math.min(-160, -ph / 2 + 56);
        const btnRestart = UIBuilder.buildButton(panel, 'RESTART', 280, 72, function () { callbacks.onRestart(); });
        btnRestart.setPosition(cc.v2(0, restartY));

        return { root: root, scoreLabel: scoreLabel, bestLabel: bestLabel };
    }

    public static buildButton(parent: cc.Node, label: string, w: number, h: number, onClick: () => void): cc.Node {
        const btn = ensureChild(parent, 'Btn_' + label, cc.v2(0, 0));
        if (UIBuilder._layoutFromCode) {
            btn.setContentSize(w, h);
        } else {
            UIBuilder.ensureButtonHitArea(btn, w, h);
        }
        stripGraphicsOnNode(btn);
        const g = btn.addComponent(cc.Graphics);
        // Square button (no notched/rounded corners).
        g.lineWidth = 2;
        g.fillColor = hexToColor('#1A3068', 250);
        g.strokeColor = hexToColor(GameConstants.COLOR.PANEL_BORDER);
        g.rect(-w / 2, -h / 2, w, h);
        g.fill();
        g.stroke();

        const labN = ensureChild(btn, 'lab', cc.v2(0, 0));
        const lab = UIBuilder.buildLabel(labN, label, 28, GameConstants.COLOR.TEXT_PRIMARY, cc.Label.HorizontalAlign.CENTER);
        if (UIBuilder._layoutFromCode) {
            lab.enableBold = true;
        }

        btn.off(cc.Node.EventType.TOUCH_START);
        btn.off(cc.Node.EventType.TOUCH_END);
        btn.off(cc.Node.EventType.TOUCH_CANCEL);
        btn.on(cc.Node.EventType.TOUCH_START, function () {
            btn.scale = 0.96;
        });
        btn.on(cc.Node.EventType.TOUCH_END, function () {
            btn.scale = 1.0;
            onClick();
        });
        btn.on(cc.Node.EventType.TOUCH_CANCEL, function () {
            btn.scale = 1.0;
        });

        return btn;
    }

    /**
     * Update a hold panel's preview piece. kind=null clears.
     */
    public static drawHoldPreview(refs: UIRefs, kind: PieceKind | null): void {
        if (kind == null) {
            refs.holdGraphics.clear();
            return;
        }
        const gn = refs.holdGraphics.node;
        const sz = gn.getContentSize();
        const rw = refs.holdRoot.getContentSize().width;
        const rh = refs.holdRoot.getContentSize().height;
        const w = sz.width > 1 ? sz.width : rw;
        const h = sz.height > 1 ? sz.height : Math.max(60, rh - 36);
        const bs = UIBuilder.calcPreviewBlockSize(w, h);
        Renderer.drawPiecePreview(
            refs.holdGraphics, kind, 0,
            { width: w, height: h },
            bs
        );
    }

    public static drawNextPreview(refs: UIRefs, pieces: PieceKind[]): void {
        for (let i = 0; i < refs.nextSlots.length; i++) {
            if (i < pieces.length) {
                const size = refs.nextSlots[i].size;
                const bs = UIBuilder.calcPreviewBlockSize(size.width, size.height);
                Renderer.drawPiecePreview(
                    refs.nextSlots[i].graphics,
                    pieces[i], 0,
                    size,
                    bs
                );
            } else {
                refs.nextSlots[i].graphics.clear();
            }
        }
    }
}
