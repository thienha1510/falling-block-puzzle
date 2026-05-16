/**
 * Ghost (khối preview chỗ đặt) — fill trắng 60% opacity, không cần texture.
 */

import { GameConstants } from './GameConstants';

const PAD = 2;
const SEAM = 1;

type Interior = { top: boolean; bottom: boolean; left: boolean; right: boolean };

export class GhostPieceView {
    private readonly blockW: number;
    private readonly blockH: number;
    private readonly g: cc.Graphics;

    constructor(boardGraphicsNode: cc.Node, blockW: number, blockH: number) {
        this.blockW = blockW;
        this.blockH = blockH;
        const layer = new cc.Node('GhostPiece');
        layer.setAnchorPoint(0, 0);
        layer.setPosition(0, 0);
        boardGraphicsNode.addChild(layer);
        layer.zIndex = 1;
        this.g = layer.addComponent(cc.Graphics);
    }

    public hide(): void {
        this.g.clear();
    }

    public sync(cells: ReadonlyArray<[number, number]>): void {
        const g = this.g;
        g.clear();
        if (cells.length === 0) {
            return;
        }

        const alpha = Math.floor(255 * GameConstants.GHOST.OPACITY);
        g.fillColor = new cc.Color(255, 255, 255, alpha);
        g.lineWidth = 0;

        const set = GhostPieceView.buildSet(cells);
        for (let i = 0; i < cells.length; i++) {
            const cx = cells[i][0];
            const cy = cells[i][1];
            const interior = GhostPieceView.interiorFor(cx, cy, set);
            const x = cx * this.blockW;
            const y = cy * this.blockH;
            const padL = interior.left ? -SEAM : PAD;
            const padR = interior.right ? -SEAM : PAD;
            const padB = interior.bottom ? -SEAM : PAD;
            const padT = interior.top ? -SEAM : PAD;
            const innerW = this.blockW - padL - padR;
            const innerH = this.blockH - padB - padT;
            if (innerW <= 0 || innerH <= 0) {
                continue;
            }
            g.rect(x + padL, y + padB, innerW, innerH);
        }
        g.fill();
    }

    private static buildSet(cells: ReadonlyArray<[number, number]>): Set<string> {
        const set = new Set<string>();
        for (let i = 0; i < cells.length; i++) {
            set.add(cells[i][0] + ',' + cells[i][1]);
        }
        return set;
    }

    private static interiorFor(cx: number, cy: number, set: Set<string>): Interior {
        const has = (x: number, y: number): boolean => set.has(x + ',' + y);
        return {
            top: has(cx, cy + 1),
            bottom: has(cx, cy - 1),
            left: has(cx - 1, cy),
            right: has(cx + 1, cy),
        };
    }
}
