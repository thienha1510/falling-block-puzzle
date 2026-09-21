/**
 * Vẽ ô khối bằng sprite block_*.png (không đụng Board / gravity / lock).
 */

import { Board, EMPTY } from './Board';
import { PieceKind } from './GameConstants';
import { PieceState, Tetromino } from './Tetromino';

const PAD = 2;

/** Sprite-frame UUID theo PieceKind: I,O,T,S,Z,J,L */
export const PIECE_BLOCK_FRAME_UUIDS: ReadonlyArray<string> = [
    'b85b4eb1-291b-44f3-b14c-20cbd30ac3ca', // I — light_blue
    'c480e9b0-2df9-4f88-80f7-e98a83b9a987', // O — yellow
    'bbc4a967-18e2-4ad9-8062-9f909a557fdd', // T — violet
    'e7f98a2d-5aec-4cf7-906e-67d0619df9ac', // S — green
    'a4ebd7d2-e02f-4efc-a538-2f253131199b', // Z — red
    '854488e9-051e-4e4a-82f1-e2b9f9aca689', // J — blue
    'a169580b-2e09-4a14-9513-eed5dd2c3d55', // L — orange
];

export function loadPieceBlockFrames(
    done: (frames: (cc.SpriteFrame | null)[]) => void
): void {
    const out: (cc.SpriteFrame | null)[] = new Array(7);
    let left = PIECE_BLOCK_FRAME_UUIDS.length;
    const finishOne = (): void => {
        left -= 1;
        if (left <= 0) {
            done(out);
        }
    };
    for (let i = 0; i < PIECE_BLOCK_FRAME_UUIDS.length; i++) {
        const idx = i;
        out[idx] = null;
        const uuid = PIECE_BLOCK_FRAME_UUIDS[i];
        cc.assetManager.loadAny(
            { uuid: uuid, type: cc.SpriteFrame },
            function (err: Error | null, asset: cc.Asset) {
                if (!err && asset instanceof cc.SpriteFrame) {
                    out[idx] = asset;
                } else {
                    // Fallback: uuid không type-hint
                    cc.assetManager.loadAny({ uuid: uuid }, function (err2: Error | null, asset2: cc.Asset) {
                        if (!err2 && asset2 instanceof cc.SpriteFrame) {
                            out[idx] = asset2;
                        }
                        finishOne();
                    });
                    return;
                }
                finishOne();
            }
        );
    }
}

type CellSprite = { node: cc.Node; sprite: cc.Sprite };

export class BlockSpriteView {
    private readonly blockW: number;
    private readonly blockH: number;
    private readonly frames: (cc.SpriteFrame | null)[];
    private readonly lockedLayer: cc.Node;
    private readonly activeLayer: cc.Node;
    private readonly lockedPool: CellSprite[] = [];
    private readonly activePool: CellSprite[] = [];
    private lockedUsed = 0;
    private activeUsed = 0;

    constructor(
        boardGraphicsNode: cc.Node,
        frames: (cc.SpriteFrame | null)[],
        blockW: number,
        blockH: number
    ) {
        this.frames = frames;
        this.blockW = blockW;
        this.blockH = blockH;

        this.lockedLayer = new cc.Node('LockedBlockSprites');
        this.lockedLayer.setAnchorPoint(0, 0);
        this.lockedLayer.setPosition(0, 0);
        boardGraphicsNode.addChild(this.lockedLayer);
        this.lockedLayer.zIndex = 0;

        this.activeLayer = new cc.Node('ActiveBlockSprites');
        this.activeLayer.setAnchorPoint(0, 0);
        this.activeLayer.setPosition(0, 0);
        boardGraphicsNode.addChild(this.activeLayer);
        this.activeLayer.zIndex = 3;
    }

    public get isReady(): boolean {
        for (let i = 0; i < this.frames.length; i++) {
            if (this.frames[i]) {
                return true;
            }
        }
        return false;
    }

    public clear(): void {
        this.hideFrom(this.lockedPool, this.lockedUsed);
        this.lockedUsed = 0;
        this.hideFrom(this.activePool, this.activeUsed);
        this.activeUsed = 0;
    }

    public sync(opts: {
        board: Board;
        active: PieceState | null;
        fallLerp: number;
        lockedVisible: boolean;
        activeVisible: boolean;
    }): void {
        this.hideFrom(this.lockedPool, this.lockedUsed);
        this.lockedUsed = 0;
        this.hideFrom(this.activePool, this.activeUsed);
        this.activeUsed = 0;

        if (!this.isReady) {
            return;
        }

        const rows = opts.board.visibleRows;
        if (opts.lockedVisible) {
            for (let y = 0; y < rows; y++) {
                for (let x = 0; x < opts.board.cols; x++) {
                    const kind = opts.board.getCell(x, y);
                    if (kind === EMPTY || kind < 0) {
                        continue;
                    }
                    this.placeLocked(x, y, kind as PieceKind, 0);
                }
            }
        }

        if (opts.activeVisible && opts.active) {
            const cells = Tetromino.cells(opts.active);
            for (let i = 0; i < cells.length; i++) {
                const cx = cells[i][0];
                const cy = cells[i][1];
                if (cy >= rows) {
                    continue;
                }
                this.placeActive(cx, cy, opts.active.kind, opts.fallLerp);
            }
        }
    }

    /** Preview hold/next — pool sprite, scale RAW (tránh cắt mặt / chồng chéo). */
    public static drawPreview(
        parent: cc.Node,
        frames: (cc.SpriteFrame | null)[],
        kind: PieceKind,
        rotation: number,
        panelSize: { width: number; height: number },
        blockSize: number
    ): void {
        const frame = frames[kind];
        const root = BlockSpriteView.ensurePreviewRoot(parent);
        BlockSpriteView.hidePreviewChildren(root);
        if (!frame) {
            return;
        }
        const offsets = Tetromino.offsets(kind, rotation);
        if (offsets.length === 0) {
            return;
        }
        let minX = Infinity;
        let maxX = -Infinity;
        let minY = Infinity;
        let maxY = -Infinity;
        for (let i = 0; i < offsets.length; i++) {
            if (offsets[i][0] < minX) minX = offsets[i][0];
            if (offsets[i][0] > maxX) maxX = offsets[i][0];
            if (offsets[i][1] < minY) minY = offsets[i][1];
            if (offsets[i][1] > maxY) maxY = offsets[i][1];
        }
        const cols = maxX - minX + 1;
        const rows = maxY - minY + 1;
        // Chừa lề trong slot; I (4 ô) phải vừa panel.
        const maxCell = Math.floor(Math.min(panelSize.width / cols, panelSize.height / rows) - 1);
        const cell = Math.max(8, Math.min(blockSize, maxCell));
        const gap = 1;
        const step = cell + gap;
        const w = cols * step - gap;
        const h = rows * step - gap;
        const startX = Math.floor((panelSize.width - w) * 0.5);
        const startY = Math.floor((panelSize.height - h) * 0.5);
        const texW = Math.max(1, frame.getRect().width);
        const scale = cell / texW;

        for (let i = 0; i < offsets.length; i++) {
            const lx = offsets[i][0] - minX;
            const ly = offsets[i][1] - minY;
            const n = BlockSpriteView.obtainPreviewChild(root, i);
            n.active = true;
            n.setAnchorPoint(0.5, 0.5);
            n.setPosition(
                startX + lx * step + cell * 0.5,
                startY + ly * step + cell * 0.5
            );
            n.setScale(scale, scale);
            n.setContentSize(texW, texW);
            const sp = n.getComponent(cc.Sprite);
            sp.spriteFrame = frame;
            sp.sizeMode = cc.Sprite.SizeMode.RAW;
            sp.type = cc.Sprite.Type.SIMPLE;
            sp.trim = false;
        }
    }

    public static clearPreviewChildren(parent: cc.Node): void {
        const root = parent.getChildByName('BlockPreviewRoot');
        if (root) {
            BlockSpriteView.hidePreviewChildren(root);
        }
        // Dọn bản cũ (tên PreviewBlock) nếu còn sót từ phiên trước.
        const kids = parent.children.slice();
        for (let i = 0; i < kids.length; i++) {
            if (kids[i].name === 'PreviewBlock') {
                kids[i].removeFromParent(true);
                kids[i].destroy();
            }
        }
    }

    private static ensurePreviewRoot(parent: cc.Node): cc.Node {
        let root = parent.getChildByName('BlockPreviewRoot');
        if (!root) {
            root = new cc.Node('BlockPreviewRoot');
            root.setAnchorPoint(0, 0);
            root.setPosition(0, 0);
            parent.addChild(root);
            root.zIndex = 20;
        }
        return root;
    }

    private static hidePreviewChildren(root: cc.Node): void {
        const kids = root.children;
        for (let i = 0; i < kids.length; i++) {
            kids[i].active = false;
        }
    }

    private static obtainPreviewChild(root: cc.Node, index: number): cc.Node {
        if (index < root.childrenCount) {
            return root.children[index];
        }
        const n = new cc.Node('PreviewBlock');
        const sp = n.addComponent(cc.Sprite);
        sp.type = cc.Sprite.Type.SIMPLE;
        sp.sizeMode = cc.Sprite.SizeMode.RAW;
        sp.trim = false;
        root.addChild(n);
        return n;
    }

    private placeLocked(cx: number, cy: number, kind: PieceKind, fallLerp: number): void {
        const cell = this.obtain(this.lockedPool, this.lockedLayer, this.lockedUsed);
        this.lockedUsed += 1;
        this.layoutCell(cell, cx, cy, kind, fallLerp);
    }

    private placeActive(cx: number, cy: number, kind: PieceKind, fallLerp: number): void {
        const cell = this.obtain(this.activePool, this.activeLayer, this.activeUsed);
        this.activeUsed += 1;
        this.layoutCell(cell, cx, cy, kind, fallLerp);
    }

    private layoutCell(
        cell: CellSprite,
        cx: number,
        cy: number,
        kind: PieceKind,
        fallLerp: number
    ): void {
        const frame = this.frames[kind];
        if (!frame) {
            cell.node.active = false;
            return;
        }
        const cellW = Math.max(1, this.blockW - PAD * 2);
        const cellH = Math.max(1, this.blockH - PAD * 2);
        cell.node.active = true;
        cell.node.setAnchorPoint(0.5, 0.5);
        cell.node.setPosition(
            cx * this.blockW + this.blockW * 0.5,
            (cy - fallLerp) * this.blockH + this.blockH * 0.5
        );
        const texW = Math.max(1, frame.getRect().width);
        const scale = Math.min(cellW, cellH) / texW;
        cell.node.setScale(scale, scale);
        cell.node.setContentSize(texW, texW);
        cell.sprite.spriteFrame = frame;
        cell.sprite.sizeMode = cc.Sprite.SizeMode.RAW;
        cell.sprite.trim = false;
        cell.node.opacity = 255;
    }

    private obtain(pool: CellSprite[], layer: cc.Node, used: number): CellSprite {
        if (used < pool.length) {
            return pool[used];
        }
        const node = new cc.Node('BlockCell');
        node.setAnchorPoint(0.5, 0.5);
        const sprite = node.addComponent(cc.Sprite);
        sprite.type = cc.Sprite.Type.SIMPLE;
        sprite.sizeMode = cc.Sprite.SizeMode.RAW;
        sprite.trim = false;
        layer.addChild(node);
        const cell: CellSprite = { node, sprite };
        pool.push(cell);
        return cell;
    }

    private hideFrom(pool: CellSprite[], used: number): void {
        for (let i = 0; i < used; i++) {
            pool[i].node.active = false;
        }
    }
}
