/**
 * Vệt sáng drop — dùng 1–2 cc.Sprite (bg_block.png), không vẽ Graphics mỗi frame.
 */

import { DropTrailSegment } from './DropTrailFx';
import { GameConstants, PieceKind, hexToColor } from './GameConstants';
import { PieceState, Tetromino } from './Tetromino';

const PAD = 2;

export type TrailBounds = {
    centerX: number;
    bottomY: number;
    width: number;
};

export function computeTrailBounds(
    cells: ReadonlyArray<[number, number]>,
    blockW: number,
    blockH: number,
    fallLerpCells: number
): TrailBounds | null {
    if (cells.length === 0) {
        return null;
    }
    let minCx = Infinity;
    let maxCx = -Infinity;
    let minBottomY = Infinity;
    for (let i = 0; i < cells.length; i++) {
        const cx = cells[i][0];
        const cy = cells[i][1];
        if (cx < minCx) {
            minCx = cx;
        }
        if (cx > maxCx) {
            maxCx = cx;
        }
        const bottomY = (cy - fallLerpCells) * blockH + PAD;
        if (bottomY < minBottomY) {
            minBottomY = bottomY;
        }
    }
    const left = minCx * blockW + PAD;
    const right = (maxCx + 1) * blockW - PAD;
    return {
        centerX: (left + right) * 0.5,
        bottomY: minBottomY,
        width: Math.max(1, right - left),
    };
}

type GlowPair = { root: cc.Node; bottom: cc.Node; top: cc.Node };

export class DropTrailView {
    private readonly blockW: number;
    private readonly blockH: number;
    private readonly frame: cc.SpriteFrame;
    private readonly layer: cc.Node;
    private softGlow: GlowPair | null = null;
    private readonly hardGlows: GlowPair[] = [];
    private readonly hardPool: GlowPair[] = [];

    constructor(boardGraphicsNode: cc.Node, spriteFrame: cc.SpriteFrame, blockW: number, blockH: number) {
        this.frame = spriteFrame;
        this.blockW = blockW;
        this.blockH = blockH;
        this.layer = new cc.Node('DropTrailLayer');
        this.layer.setAnchorPoint(0, 0);
        this.layer.setPosition(0, 0);
        boardGraphicsNode.addChild(this.layer);
        this.layer.zIndex = -1;
    }

    public clear(): void {
        this.hideSoft();
        for (let i = 0; i < this.hardGlows.length; i++) {
            this.recycleHard(this.hardGlows[i]);
        }
        this.hardGlows.length = 0;
    }

    public sync(opts: {
        soft: { cells: [number, number][]; kind: PieceKind; fallLerp: number } | null;
        hard: ReadonlyArray<DropTrailSegment>;
    }): void {
        const dt = GameConstants.DROP_TRAIL;

        if (opts.soft) {
            const b = computeTrailBounds(
                opts.soft.cells,
                this.blockW,
                this.blockH,
                opts.soft.fallLerp
            );
            if (b) {
                const h = dt.SOFT_TRAIL_HEIGHT_CELLS * this.blockH;
                this.showSoft(b, opts.soft.kind, h, dt.SOFT_OPACITY);
            } else {
                this.hideSoft();
            }
        } else {
            this.hideSoft();
        }

        while (this.hardGlows.length > opts.hard.length) {
            this.recycleHard(this.hardGlows.pop()!);
        }
        while (this.hardGlows.length < opts.hard.length) {
            this.hardGlows.push(this.obtainHard());
        }

        for (let i = 0; i < opts.hard.length; i++) {
            const seg = opts.hard[i];
            const b = computeTrailBounds(seg.cells, this.blockW, this.blockH, 0);
            if (!b) {
                this.hardGlows[i].root.active = false;
                continue;
            }
            const opacity = Math.floor(dt.HARD_OPACITY * seg.life);
            this.layoutGlow(
                this.hardGlows[i],
                b,
                seg.kind,
                seg.heightCells * this.blockH,
                opacity
            );
        }
    }

    private showSoft(bounds: TrailBounds, kind: PieceKind, heightPx: number, opacity: number): void {
        if (!this.softGlow) {
            this.softGlow = this.createGlowPair();
            this.layer.addChild(this.softGlow.root);
        }
        this.layoutGlow(this.softGlow, bounds, kind, heightPx, opacity);
    }

    private hideSoft(): void {
        if (this.softGlow) {
            this.softGlow.root.active = false;
        }
    }

    private layoutGlow(
        pair: GlowPair,
        bounds: TrailBounds,
        kind: PieceKind,
        heightPx: number,
        opacity: number
    ): void {
        const dt = GameConstants.DROP_TRAIL;
        const color = hexToColor(GameConstants.PIECE_COLORS[kind]);
        const bright = DropTrailView.lighten(color, dt.TINT_LIGHTEN);

        pair.root.active = true;
        pair.root.setPosition(bounds.centerX, bounds.bottomY);
        pair.root.setContentSize(bounds.width, heightPx);

        const botH = Math.max(4, heightPx * dt.GRADIENT_BOTTOM_RATIO);
        const topH = Math.max(1, heightPx - botH);

        pair.bottom.setPosition(0, 0);
        pair.bottom.setContentSize(bounds.width, botH);
        pair.bottom.color = bright;
        pair.bottom.opacity = Math.min(255, Math.floor(opacity * dt.GRADIENT_BOTTOM_OPACITY_MUL));

        pair.top.setPosition(0, botH);
        pair.top.setContentSize(bounds.width, topH);
        pair.top.color = bright;
        pair.top.opacity = Math.min(255, Math.floor(opacity * dt.GRADIENT_TOP_OPACITY_MUL));
    }

    private createGlowPair(): GlowPair {
        const root = new cc.Node('TrailGlow');
        root.setAnchorPoint(0.5, 0);
        const bottom = this.createSpriteNode('TrailBot');
        const top = this.createSpriteNode('TrailTop');
        bottom.setAnchorPoint(0.5, 0);
        top.setAnchorPoint(0.5, 0);
        root.addChild(bottom);
        root.addChild(top);
        return { root, bottom, top };
    }

    private createSpriteNode(name: string): cc.Node {
        const n = new cc.Node(name);
        const sp = n.addComponent(cc.Sprite);
        sp.spriteFrame = this.frame;
        sp.type = cc.Sprite.Type.SIMPLE;
        sp.sizeMode = cc.Sprite.SizeMode.CUSTOM;
        return n;
    }

    private obtainHard(): GlowPair {
        if (this.hardPool.length > 0) {
            return this.hardPool.pop()!;
        }
        const pair = this.createGlowPair();
        this.layer.addChild(pair.root);
        return pair;
    }

    private recycleHard(pair: GlowPair): void {
        pair.root.active = false;
        pair.root.removeFromParent(false);
        this.hardPool.push(pair);
    }

    private static lighten(c: cc.Color, amount: number): cc.Color {
        const t = Math.max(0, Math.min(1, amount));
        return new cc.Color(
            Math.min(255, Math.floor(c.r + (255 - c.r) * t)),
            Math.min(255, Math.floor(c.g + (255 - c.g) * t)),
            Math.min(255, Math.floor(c.b + (255 - c.b) * t)),
            255
        );
    }
}

/** Ô hiển thị từ PieceState (bỏ hàng ẩn). */
export function trailCellsFromPiece(
    active: PieceState,
    visibleRows: number
): [number, number][] {
    const cells = Tetromino.cells(active);
    const out: [number, number][] = [];
    for (let i = 0; i < cells.length; i++) {
        if (cells[i][1] < visibleRows) {
            out.push([cells[i][0], cells[i][1]]);
        }
    }
    return out;
}
