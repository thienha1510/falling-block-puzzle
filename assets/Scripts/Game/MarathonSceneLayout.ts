/**
 * Single source of truth for marathonScene placeholder roots (position + size in Canvas space).
 * Matches the layout math used at runtime so the editor hierarchy aligns with the running game.
 */

import { GameConstants } from './GameConstants';

export interface PlaceholderLayout {
    x: number;
    y: number;
    width?: number;
    height?: number;
}

/** DFS by node name (first match). */
export function findNodeDeep(root: cc.Node, name: string): cc.Node | null {
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

/**
 * Layout for named nodes under Canvas (coordinates relative to Canvas anchor = design center).
 */
export function getMarathonScenePlaceholderLayouts(): Record<string, PlaceholderLayout> {
    const cw = GameConstants.DESIGN_WIDTH;
    const ch = GameConstants.DESIGN_HEIGHT;
    const layout = GameConstants.LAYOUT;
    const block = GameConstants.BLOCK_SIZE;
    const cols = GameConstants.BOARD_COLS;
    const rows = GameConstants.BOARD_ROWS;
    const boardW = cols * block;
    const boardH = rows * block;
    const boardCenterY = layout.BOARD_VERTICAL_OFFSET;

    const hudW = cw - 40;
    const hudH = layout.TOP_HUD_HEIGHT;
    const hudY = ch / 2 - layout.TOP_HUD_TOP_MARGIN - hudH / 2;
    const pz = layout.PAUSE_BUTTON_SIZE;
    // Top-right inside HUD band — must clear LEVEL (UIBuilder: LevelPanel at +hudW/4, width 142) and not sit on the board edge row.
    const statW = layout.SMALL_STAT_PANEL_WIDTH;
    const pauseBtnX = hudW / 4 + statW / 2 + 22 + pz / 2;
    const pauseBtnY = hudY + hudH / 2 - pz / 2 - 10;

    const holdPanelX = -boardW / 2 - layout.SIDE_PANEL_GAP - layout.SIDE_PANEL_WIDTH / 2;
    const holdPanelY = boardCenterY + boardH / 2 - 70;
    const holdW = layout.SIDE_PANEL_WIDTH;
    const holdH = layout.SIDE_PANEL_WIDTH + 20;

    const nextSlotH = layout.SIDE_PANEL_WIDTH;
    const nextHeader = 28;
    const slotGap = 8;
    const nextW = layout.SIDE_PANEL_WIDTH;
    const nextH = nextHeader + nextSlotH * 3 + slotGap * 2 + 14;
    const nextPanelX = boardW / 2 + layout.SIDE_PANEL_GAP + layout.SIDE_PANEL_WIDTH / 2;
    const nextPanelY = holdPanelY + (holdH - nextH) / 2;

    const adW = cw - 60;
    const adY = -ch / 2 + layout.AD_BANNER_BOTTOM_MARGIN + layout.AD_BANNER_HEIGHT / 2;

    const boardBottom = boardCenterY - boardH / 2;
    const adTop = -ch / 2 + layout.AD_BANNER_BOTTOM_MARGIN + layout.AD_BANNER_HEIGHT;
    const buttonRowY = (boardBottom + adTop) / 2;

    return {
        Background: { x: 0, y: 0, width: cw, height: ch },
        TopHUD: { x: 0, y: hudY, width: cw - 40, height: layout.TOP_HUD_HEIGHT },
        BoardRoot: { x: 0, y: boardCenterY, width: boardW, height: boardH },
        HoldPanel: { x: holdPanelX, y: holdPanelY, width: holdW, height: holdH },
        NextPanel: { x: nextPanelX, y: nextPanelY, width: nextW, height: nextH },
        PauseButton: { x: pauseBtnX, y: pauseBtnY, width: layout.PAUSE_BUTTON_SIZE, height: layout.PAUSE_BUTTON_SIZE },
        AdBannerPlaceholder: { x: 0, y: adY, width: adW, height: layout.AD_BANNER_HEIGHT },
        OverlayRoot: { x: 0, y: 0, width: cw, height: ch },
        gameComponents: { x: 0, y: 0 },
        buttonLayer: { x: 0, y: 0 },
        buttonLeft: { x: -220, y: buttonRowY, width: 120, height: 120 },
        buttonRight: { x: 220, y: buttonRowY, width: 120, height: 120 },
        buttonRotate: { x: 0, y: buttonRowY, width: 120, height: 120 },
    };
}

export function applyMarathonScenePlaceholderLayout(canvas: cc.Node): void {
    const L = getMarathonScenePlaceholderLayouts();
    const names = Object.keys(L);
    for (let i = 0; i < names.length; i++) {
        const name = names[i];
        const spec = L[name];
        const n = findNodeDeep(canvas, name);
        if (!n) {
            continue;
        }
        n.setPosition(spec.x, spec.y);
        if (typeof spec.width === 'number' && typeof spec.height === 'number') {
            n.setContentSize(spec.width, spec.height);
        }
    }
}
