/**
 * Title: Renderer
 * Description: Single cc.Graphics-based renderer for the board.
 *              drawAll() rebuilds board + active graphics: grid, locked blocks,
 *              active piece (ghost = GhostPieceView sprites),
 *              and optional line-clear blink overlay.
 *
 *              The same module also exposes drawPiecePreview() to render the
 *              hold/next previews into an external Graphics node.
 */

import { Board, EMPTY } from './Board';
import { DropTrailSegment } from './DropTrailFx';
import { GameConstants, PieceKind, hexToColor } from './GameConstants';
import { PieceState, Tetromino } from './Tetromino';

const GFX_LINE_WIDTH = 1;
const BLOCK_PAD = 2;
const BLOCK_OUTLINE_WIDTH = 5;
/** Che đường lưới nền tại mép chung giữa hai ô cùng cụm. */
const BLOCK_SEAM_OVERLAP = 1;

/** true = cạnh này tiếp giáp ô cùng màu (không vẽ viền/bevel nội bộ). */
type CellInteriorEdges = { top: boolean; bottom: boolean; left: boolean; right: boolean };

export class Renderer {
    private board: Board;
    private g: cc.Graphics;
    private gActive: cc.Graphics;
    private blockW: number;
    private blockH: number;

    /**
     * @param board         The shared Board instance
     * @param graphics      Grid + locked blocks (BoardGraphics node)
     * @param activeGraphics Falling piece layer (above ghost sprites)
     * @param blockW        Pixel width of each cell
     * @param blockH        Pixel height of each cell
     */
    constructor(
        board: Board,
        graphics: cc.Graphics,
        activeGraphics: cc.Graphics,
        blockW: number,
        blockH: number
    ) {
        this.board = board;
        this.g = graphics;
        this.gActive = activeGraphics;
        this.blockW = blockW;
        this.blockH = blockH;
    }

    public drawAll(opts: {
        active?: PieceState | null;
        ghostY?: number | null;
        /** 0..1: vẽ khối đang rơi lệch xuống theo tiến độ trong chu kỳ gravity (ô logic vẫn nguyên). */
        activeFallLerp?: number;
        flashRows?: number[];
        flashAlpha?: number;
        /** Chế độ tàng hình: vẽ lưới ô nét mỏng dễ nhìn hơn. */
        invisibilityThinGrid?: boolean;
        /** GameMode.Invisibility: vẽ các ô đã khóa (false = tàng hình). */
        invisLockedVisible?: boolean;
        /** GameMode.Invisibility: vẽ ghost + khối đang rơi (false khi đã “đậu” và không trong cửa sổ hiện). */
        invisActiveGhostVisible?: boolean;
        /** Vệt hard drop đang mờ dần. */
        dropTrails?: ReadonlyArray<DropTrailSegment>;
        /** Vệt soft drop (cùng màu khối). */
        softDropTrailActive?: boolean;
    }): void {
        const g = this.g;
        const gActive = this.gActive;
        g.clear();
        gActive.clear();

        const cols = this.board.cols;
        const rows = this.board.visibleRows;
        const bw = cols * this.blockW;
        const bh = rows * this.blockH;

        // IMPORTANT: Board background/frame are now editor-authored (sprite/layout nodes).
        // To avoid covering them, the renderer only draws gameplay blocks/overlays here.
        // Keep grid lines ON so the board "layout" matches what you see in the editor.
        // Make grid clearer (editor-like) on top of background sprite/layout.
        const thinInvis = opts.invisibilityThinGrid === true;
        if (thinInvis) {
            g.strokeColor = hexToColor(GameConstants.COLOR.BOARD_GRID, GameConstants.INVISIBILITY_GRID_STROKE_ALPHA);
            g.lineWidth = GameConstants.INVISIBILITY_GRID_LINE_WIDTH;
        } else {
            g.strokeColor = hexToColor(GameConstants.COLOR.BOARD_GRID, 165);
            g.lineWidth = 0;
        }
        for (let x = 1; x < cols; x++) {
            g.moveTo(x * this.blockW, 0);
            g.lineTo(x * this.blockW, bh);
        }
        for (let y = 1; y < rows; y++) {
            g.moveTo(0, y * this.blockH);
            g.lineTo(bw, y * this.blockH);
        }
        g.stroke();

        const invisOn =
            typeof opts.invisLockedVisible === 'boolean' ||
            typeof opts.invisActiveGhostVisible === 'boolean';
        const lockedVisible = !invisOn || opts.invisLockedVisible !== false;

        // Locked blocks — ô kề nhau không vẽ viền giữa (chỉ viền ngoài stack)
        if (lockedVisible) {
            this.drawAllLockedBlocks(0);
        }

        const floatVisible = !invisOn || opts.invisActiveGhostVisible !== false;

        const fallLerp = Math.max(0, Math.min(1, opts.activeFallLerp != null ? opts.activeFallLerp : 0));

        // Drop trails — lớp active, một vệt liền phía trên khối
        if (opts.dropTrails && opts.dropTrails.length > 0) {
            for (let ti = 0; ti < opts.dropTrails.length; ti++) {
                const seg = opts.dropTrails[ti];
                const trailCells: [number, number][] = [];
                for (let ci = 0; ci < seg.cells.length; ci++) {
                    if (seg.cells[ci][1] < rows) {
                        trailCells.push(seg.cells[ci]);
                    }
                }
                if (trailCells.length > 0) {
                    this.drawClusterDropTrail(
                        gActive,
                        trailCells,
                        seg.kind,
                        seg.heightCells * this.blockH,
                        seg.life,
                        0
                    );
                }
            }
        }
        if (opts.softDropTrailActive && floatVisible && opts.active) {
            const softH = GameConstants.DROP_TRAIL.SOFT_TRAIL_HEIGHT_CELLS * this.blockH;
            const cells = Tetromino.cells(opts.active);
            const trailCells: [number, number][] = [];
            for (let i = 0; i < cells.length; i++) {
                if (cells[i][1] < rows) {
                    trailCells.push([cells[i][0], cells[i][1]]);
                }
            }
            if (trailCells.length > 0) {
                this.drawClusterDropTrail(gActive, trailCells, opts.active.kind, softH, 1, fallLerp);
            }
        }

        // Active piece (ghost = GhostPieceView, zIndex above board graphics)
        if (floatVisible && opts.active) {
            const cells = Tetromino.cells(opts.active);
            const visibleCells: [number, number][] = [];
            for (let i = 0; i < cells.length; i++) {
                if (cells[i][1] < rows) {
                    visibleCells.push([cells[i][0], cells[i][1]]);
                }
            }
            this.drawBlockClusterOn(gActive, visibleCells, opts.active.kind, 1.0, fallLerp);
        }

        // Line-clear blink overlay
        if (opts.flashRows && opts.flashRows.length > 0) {
            const a = Math.max(0, Math.min(255, Math.floor((opts.flashAlpha || 0) * 255)));
            g.fillColor = hexToColor('#FFFFFF', a);
            for (let i = 0; i < opts.flashRows.length; i++) {
                const ry = opts.flashRows[i];
                if (ry < 0 || ry >= rows) continue;
                g.rect(0, ry * this.blockH, bw, this.blockH);
                g.fill();
            }
        }

        // Border/frame is handled by editor layout now.
    }

    private static cellKey(cx: number, cy: number): string {
        return cx + ',' + cy;
    }

    private static buildCellSet(cells: ReadonlyArray<[number, number]>): Set<string> {
        const set = new Set<string>();
        for (let i = 0; i < cells.length; i++) {
            set.add(Renderer.cellKey(cells[i][0], cells[i][1]));
        }
        return set;
    }

    private static readonly NO_INTERIOR_EDGES: CellInteriorEdges = {
        top: false,
        bottom: false,
        left: false,
        right: false,
    };

    private drawAllLockedBlocks(fallLerpCells: number): void {
        const cols = this.board.cols;
        const rows = this.board.visibleRows;

        for (let y = 0; y < rows; y++) {
            for (let x = 0; x < cols; x++) {
                const kind = this.board.getCell(x, y);
                if (kind === EMPTY || kind < 0) {
                    continue;
                }
                this.drawBlockCell(
                    x,
                    y,
                    kind as PieceKind,
                    1.0,
                    fallLerpCells,
                    Renderer.NO_INTERIOR_EDGES,
                    true
                );
            }
        }
    }

    private drawBlockClusterOn(
        target: cc.Graphics,
        cells: ReadonlyArray<[number, number]>,
        kind: PieceKind,
        alphaMul: number,
        fallLerpCells: number
    ): void {
        const prev = this.g;
        this.g = target;
        const set = Renderer.buildCellSet(cells);
        for (let i = 0; i < cells.length; i++) {
            const cx = cells[i][0];
            const cy = cells[i][1];
            const interior = this.interiorEdgesForSet(cx, cy, set);
            this.drawBlockCell(cx, cy, kind, alphaMul, fallLerpCells, interior, false);
        }
        this.drawClusterOutline(cells, fallLerpCells, alphaMul, set, kind);
        this.g = prev;
    }

    private interiorEdgesForSet(cx: number, cy: number, set: Set<string>): CellInteriorEdges {
        const has = (x: number, y: number): boolean => set.has(Renderer.cellKey(x, y));
        return {
            top: has(cx, cy + 1),
            bottom: has(cx, cy - 1),
            left: has(cx - 1, cy),
            right: has(cx + 1, cy),
        };
    }

    private drawBlockCell(
        cx: number,
        cy: number,
        kind: PieceKind,
        alphaMul: number,
        fallLerpCells: number,
        interior: CellInteriorEdges,
        drawOutline: boolean
    ): void {
        const g = this.g;
        const w = this.blockW;
        const h = this.blockH;
        const x = cx * w;
        const y = (cy - fallLerpCells) * h;
        const pad = BLOCK_PAD;
        const seam = BLOCK_SEAM_OVERLAP;
        const padL = interior.left ? -seam : pad;
        const padR = interior.right ? -seam : pad;
        const padB = interior.bottom ? -seam : pad;
        const padT = interior.top ? -seam : pad;
        const ix = x + padL;
        const iy = y + padB;
        const innerW = w - padL - padR;
        const innerH = h - padB - padT;
        if (innerW <= 0 || innerH <= 0) {
            return;
        }
        const baseColor = hexToColor(GameConstants.PIECE_COLORS[kind], Math.floor(255 * alphaMul));

        g.fillColor = baseColor;
        g.lineWidth = 0;
        g.rect(ix, iy, innerW, innerH);
        g.fill();

        const hl = new cc.Color(255, 255, 255, Math.floor(110 * alphaMul));
        const hlH = Math.floor(h * 0.18);
        const hlW = Math.floor(w * 0.18);
        if (!interior.top) {
            g.fillColor = hl;
            g.rect(ix, iy + innerH - hlH, innerW, hlH);
            g.fill();
        }
        if (!interior.left) {
            g.fillColor = hl;
            g.rect(ix, iy, hlW, innerH);
            g.fill();
        }

        const sh = new cc.Color(0, 0, 0, Math.floor(90 * alphaMul));
        const shH = Math.floor(h * 0.16);
        const shW = Math.floor(w * 0.16);
        if (!interior.bottom) {
            g.fillColor = sh;
            g.rect(ix, iy, innerW, shH);
            g.fill();
        }
        if (!interior.right) {
            g.fillColor = sh;
            g.rect(ix + innerW - shW, iy, shW, innerH);
            g.fill();
        }

        if (!drawOutline) {
            return;
        }

        g.strokeColor = new cc.Color(baseColor.r, baseColor.g, baseColor.b, Math.floor(255 * alphaMul));
        g.lineWidth = BLOCK_OUTLINE_WIDTH;
        if (!interior.top) {
            g.moveTo(ix, iy + innerH);
            g.lineTo(ix + innerW, iy + innerH);
        }
        if (!interior.bottom) {
            g.moveTo(ix, iy);
            g.lineTo(ix + innerW, iy);
        }
        if (!interior.left) {
            g.moveTo(ix, iy);
            g.lineTo(ix, iy + innerH);
        }
        if (!interior.right) {
            g.moveTo(ix + innerW, iy);
            g.lineTo(ix + innerW, iy + innerH);
        }
        g.stroke();
    }

    /** Viền ngoài cụm — màu trùng khối (không viền đen). */
    private drawClusterOutline(
        cells: ReadonlyArray<[number, number]>,
        fallLerpCells: number,
        alphaMul: number,
        set: Set<string>,
        clusterKind: PieceKind | null
    ): void {
        const g = this.g;
        const w = this.blockW;
        const h = this.blockH;
        const pad = BLOCK_PAD;
        g.lineWidth = BLOCK_OUTLINE_WIDTH;

        for (let i = 0; i < cells.length; i++) {
            const cx = cells[i][0];
            const cy = cells[i][1];
            const cellKind =
                clusterKind != null
                    ? clusterKind
                    : (this.board.getCell(cx, cy) as PieceKind);
            const strokeBase = hexToColor(GameConstants.PIECE_COLORS[cellKind], Math.floor(255 * alphaMul));
            g.strokeColor = strokeBase;

            const interior = this.interiorEdgesForSet(cx, cy, set);
            const x0 = cx * w;
            const y0 = (cy - fallLerpCells) * h;
            const x1 = x0 + w;
            const y1 = y0 + h;
            const insetL = interior.left ? 0 : pad;
            const insetR = interior.right ? 0 : pad;
            const insetB = interior.bottom ? 0 : pad;
            const insetT = interior.top ? 0 : pad;

            if (!interior.top) {
                g.moveTo(x0 + insetL, y1 - insetT);
                g.lineTo(x1 - insetR, y1 - insetT);
            }
            if (!interior.bottom) {
                g.moveTo(x0 + insetL, y0 + insetB);
                g.lineTo(x1 - insetR, y0 + insetB);
            }
            if (!interior.left) {
                g.moveTo(x0 + insetL, y0 + insetB);
                g.lineTo(x0 + insetL, y1 - insetT);
            }
            if (!interior.right) {
                g.moveTo(x1 - insetR, y0 + insetB);
                g.lineTo(x1 - insetR, y1 - insetT);
            }
            g.stroke();
        }
    }

    /** Một vệt dọc liền, xuất phát đáy khối, gradient kéo lên trên. */
    private drawClusterDropTrail(
        target: cc.Graphics,
        cells: ReadonlyArray<[number, number]>,
        kind: PieceKind,
        heightPx: number,
        alphaMul: number,
        fallLerpCells: number
    ): void {
        if (heightPx <= 0 || alphaMul <= 0.01 || cells.length === 0) {
            return;
        }
        const w = this.blockW;
        const h = this.blockH;
        const pad = BLOCK_PAD;
        const dt = GameConstants.DROP_TRAIL;
        const steps = dt.GRADIENT_STEPS;
        const base = hexToColor(GameConstants.PIECE_COLORS[kind]);
        const glow = Renderer.lightenColor(base, dt.GLOW_LIGHTEN);
        const segH = heightPx / steps;
        const baseMul = dt.GRADIENT_BASE_ALPHA_MUL;

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
            const bottomY = (cy - fallLerpCells) * h + pad;
            if (bottomY < minBottomY) {
                minBottomY = bottomY;
            }
        }

        const trailLeft = minCx * w + pad;
        const trailWidth = Math.max(1, (maxCx + 1) * w - pad - trailLeft);
        const trailAttachY = minBottomY;
        const minFrac = dt.GRADIENT_MIN_ALPHA_FRACTION != null ? dt.GRADIENT_MIN_ALPHA_FRACTION : 0.5;
        const underlayA = Math.floor(minFrac * 0.85 * dt.GRADIENT_MAX_ALPHA * alphaMul * baseMul);
        if (underlayA >= 4) {
            target.fillColor = new cc.Color(glow.r, glow.g, glow.b, underlayA);
            target.rect(trailLeft, trailAttachY, trailWidth, heightPx);
            target.fill();
        }

        for (let si = 0; si < steps; si++) {
            const t = si / (steps - 1 || 1);
            const alphaT = minFrac + (1 - minFrac) * (1 - t);
            const a = Math.floor(alphaT * dt.GRADIENT_MAX_ALPHA * alphaMul * baseMul);
            if (a < 4) {
                continue;
            }
            const color = si === 0 ? base : Renderer.blendColors(glow, base, t * dt.GRADIENT_TOP_BLEND, a);
            target.fillColor = color;
            target.rect(trailLeft, trailAttachY + segH * si, trailWidth, segH + 1);
        }
        target.fill();

        const rimBoost = dt.RIM_BRIGHTEN != null ? dt.RIM_BRIGHTEN : 65;
        target.fillColor = new cc.Color(
            Math.min(255, base.r + rimBoost),
            Math.min(255, base.g + rimBoost),
            Math.min(255, base.b + rimBoost),
            Math.floor(dt.RIM_ALPHA * alphaMul)
        );
        target.rect(trailLeft, trailAttachY - 1, trailWidth, 3);
        target.fill();
    }

    private static lightenColor(c: cc.Color, amount: number): cc.Color {
        const t = Math.max(0, Math.min(1, amount));
        return new cc.Color(
            Math.min(255, Math.floor(c.r + (255 - c.r) * t)),
            Math.min(255, Math.floor(c.g + (255 - c.g) * t)),
            Math.min(255, Math.floor(c.b + (255 - c.b) * t)),
            c.a
        );
    }

    private static blendColors(a: cc.Color, b: cc.Color, t: number, alpha: number): cc.Color {
        const u = Math.max(0, Math.min(1, t));
        return new cc.Color(
            Math.floor(a.r * (1 - u) + b.r * u),
            Math.floor(a.g * (1 - u) + b.g * u),
            Math.floor(a.b * (1 - u) + b.b * u),
            alpha
        );
    }

    /**
     * Draw a small, centered preview of a piece into the given Graphics.
     * `g` should be positioned at the panel's local (0,0) and panelSize gives the
     * usable square area. The piece is centered horizontally/vertically based on its filled cells.
     */
    public static drawPiecePreview(
        g: cc.Graphics,
        kind: PieceKind,
        rotation: number,
        panelSize: { width: number; height: number },
        blockSize: number
    ): void {
        g.clear();
        const offsets = Tetromino.offsets(kind, rotation);
        if (offsets.length === 0) return;

        // Compute bounding box
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (let i = 0; i < offsets.length; i++) {
            if (offsets[i][0] < minX) minX = offsets[i][0];
            if (offsets[i][0] > maxX) maxX = offsets[i][0];
            if (offsets[i][1] < minY) minY = offsets[i][1];
            if (offsets[i][1] > maxY) maxY = offsets[i][1];
        }
        const w = (maxX - minX + 1) * blockSize;
        const h = (maxY - minY + 1) * blockSize;
        const startX = Math.floor((panelSize.width - w) / 2);
        const startY = Math.floor((panelSize.height - h) / 2);
        const previewCells: [number, number][] = [];
        for (let i = 0; i < offsets.length; i++) {
            previewCells.push([offsets[i][0] - minX, offsets[i][1] - minY]);
        }
        const cellSet = Renderer.buildCellSet(previewCells);
        const pad = 1;
        const outlineW = 2;

        for (let i = 0; i < previewCells.length; i++) {
            const cx = previewCells[i][0];
            const cy = previewCells[i][1];
            const interior = {
                top: cellSet.has(Renderer.cellKey(cx, cy + 1)),
                bottom: cellSet.has(Renderer.cellKey(cx, cy - 1)),
                left: cellSet.has(Renderer.cellKey(cx - 1, cy)),
                right: cellSet.has(Renderer.cellKey(cx + 1, cy)),
            };
            const x = startX + cx * blockSize;
            const y = startY + cy * blockSize;
            const padL = interior.left ? 0 : pad;
            const padR = interior.right ? 0 : pad;
            const padB = interior.bottom ? 0 : pad;
            const padT = interior.top ? 0 : pad;
            const ix = x + padL;
            const iy = y + padB;
            const innerW = blockSize - padL - padR;
            const innerH = blockSize - padB - padT;
            if (innerW <= 0 || innerH <= 0) {
                continue;
            }

            g.fillColor = hexToColor(GameConstants.PIECE_COLORS[kind]);
            g.lineWidth = 0;
            g.rect(ix, iy, innerW, innerH);
            g.fill();

            const hl = new cc.Color(255, 255, 255, 110);
            const hlH = Math.floor(blockSize * 0.22);
            const hlW = Math.floor(blockSize * 0.22);
            if (!interior.top) {
                g.fillColor = hl;
                g.rect(ix, iy + innerH - hlH, innerW, hlH);
                g.fill();
            }
            if (!interior.left) {
                g.fillColor = hl;
                g.rect(ix, iy, hlW, innerH);
                g.fill();
            }

            const previewColor = hexToColor(GameConstants.PIECE_COLORS[kind]);
            g.strokeColor = new cc.Color(previewColor.r, previewColor.g, previewColor.b, 255);
            g.lineWidth = outlineW;
            if (!interior.top) {
                g.moveTo(ix, iy + innerH);
                g.lineTo(ix + innerW, iy + innerH);
            }
            if (!interior.bottom) {
                g.moveTo(ix, iy);
                g.lineTo(ix + innerW, iy);
            }
            if (!interior.left) {
                g.moveTo(ix, iy);
                g.lineTo(ix, iy + innerH);
            }
            if (!interior.right) {
                g.moveTo(ix + innerW, iy);
                g.lineTo(ix + innerW, iy + innerH);
            }
            g.stroke();
        }
    }
}
