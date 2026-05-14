/**
 * Title: Renderer
 * Description: Single cc.Graphics-based renderer for the board.
 *              drawAll() rebuilds the graphics: grid, locked blocks, ghost,
 *              active piece (optional fractional fall offset for smooth descent),
 *              and optional line-clear blink overlay.
 *
 *              The same module also exposes drawPiecePreview() to render the
 *              hold/next previews into an external Graphics node.
 */

import { Board, EMPTY } from './Board';
import { GameConstants, PieceKind, hexToColor } from './GameConstants';
import { PieceState, Tetromino } from './Tetromino';

const GFX_LINE_WIDTH = 1;

export class Renderer {
    private board: Board;
    private g: cc.Graphics;
    private blockSize: number;

    /**
     * @param board     The shared Board instance
     * @param graphics  cc.Graphics used to draw the board (its node should be
     *                  positioned at the bottom-left corner of the board).
     * @param blockSize Pixel size of each cell.
     */
    constructor(board: Board, graphics: cc.Graphics, blockSize: number) {
        this.board = board;
        this.g = graphics;
        this.blockSize = blockSize;
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
    }): void {
        const g = this.g;
        g.clear();

        const cols = this.board.cols;
        const rows = this.board.visibleRows;
        const bw = cols * this.blockSize;
        const bh = rows * this.blockSize;

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
            g.moveTo(x * this.blockSize, 0);
            g.lineTo(x * this.blockSize, bh);
        }
        for (let y = 1; y < rows; y++) {
            g.moveTo(0, y * this.blockSize);
            g.lineTo(bw, y * this.blockSize);
        }
        g.stroke();

        const invisOn =
            typeof opts.invisLockedVisible === 'boolean' ||
            typeof opts.invisActiveGhostVisible === 'boolean';
        const lockedVisible = !invisOn || opts.invisLockedVisible !== false;

        // Locked blocks
        const renderer = this;
        if (lockedVisible) {
            this.board.forEachVisibleFilled(function (x, y, kind) {
                renderer.drawBlock(x, y, kind, 1.0);
            });
        }

        const floatVisible = !invisOn || opts.invisActiveGhostVisible !== false;

        // Ghost piece
        if (floatVisible && opts.active && typeof opts.ghostY === 'number') {
            const ghostState: PieceState = {
                kind: opts.active.kind,
                rotation: opts.active.rotation,
                x: opts.active.x,
                y: opts.active.y,
            };
            ghostState.y = opts.ghostY;
            const ghostCells = Tetromino.cells(ghostState);
            for (let i = 0; i < ghostCells.length; i++) {
                const cx = ghostCells[i][0];
                const cy = ghostCells[i][1];
                if (cy >= rows) continue;
                this.drawGhostCell(cx, cy);
            }
        }

        // Active piece (skip cells in hidden zone)
        if (floatVisible && opts.active) {
            const fall = Math.max(0, Math.min(1, opts.activeFallLerp != null ? opts.activeFallLerp : 0));
            const cells = Tetromino.cells(opts.active);
            for (let i = 0; i < cells.length; i++) {
                const cx = cells[i][0];
                const cy = cells[i][1];
                if (cy >= rows) continue;
                this.drawBlock(cx, cy, opts.active.kind, 1.0, fall);
            }
        }

        // Line-clear blink overlay
        if (opts.flashRows && opts.flashRows.length > 0) {
            const a = Math.max(0, Math.min(255, Math.floor((opts.flashAlpha || 0) * 255)));
            g.fillColor = hexToColor('#FFFFFF', a);
            for (let i = 0; i < opts.flashRows.length; i++) {
                const ry = opts.flashRows[i];
                if (ry < 0 || ry >= rows) continue;
                g.rect(0, ry * this.blockSize, bw, this.blockSize);
                g.fill();
            }
        }

        // Border/frame is handled by editor layout now.
    }

    private drawBlock(cx: number, cy: number, kind: PieceKind, alphaMul: number, fallLerpCells = 0): void {
        const g = this.g;
        const s = this.blockSize;
        const x = cx * s;
        const y = (cy - fallLerpCells) * s;
        const pad = 2;
        const inner = s - pad * 2;
        const baseColor = hexToColor(GameConstants.PIECE_COLORS[kind], Math.floor(255 * alphaMul));

        // Main block fill
        g.fillColor = baseColor;
        g.lineWidth = 0;
        g.rect(x + pad, y + pad, inner, inner);
        g.fill();

        // Top + left highlight (lighter)
        const hl = new cc.Color(255, 255, 255, Math.floor(110 * alphaMul));
        g.fillColor = hl;
        g.rect(x + pad, y + s - pad - Math.floor(s * 0.18), inner, Math.floor(s * 0.18));
        g.fill();
        g.rect(x + pad, y + pad, Math.floor(s * 0.18), inner);
        g.fill();

        // Bottom + right shadow (darker)
        const sh = new cc.Color(0, 0, 0, Math.floor(90 * alphaMul));
        g.fillColor = sh;
        g.rect(x + pad, y + pad, inner, Math.floor(s * 0.16));
        g.fill();
        g.rect(x + s - pad - Math.floor(s * 0.16), y + pad, Math.floor(s * 0.16), inner);
        g.fill();

        // Subtle outline
        g.strokeColor = new cc.Color(0, 0, 0, Math.floor(255 * alphaMul));
        g.lineWidth = 5;
        g.rect(x + pad, y + pad, inner, inner);
        g.stroke();
    }

    private drawGhostCell(cx: number, cy: number): void {
        const g = this.g;
        const s = this.blockSize;
        const x = cx * s;
        const y = cy * s;
        const pad = 3;
        // Ghost (landing preview) should be clearly visible on top of editor-authored board layout.
        g.strokeColor = hexToColor('#ff0000', 255);
        g.lineWidth = 5;
        g.rect(x + pad, y + pad, s - pad * 2, s - pad * 2);
        g.stroke();
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
        const baseColor = hexToColor(GameConstants.PIECE_COLORS[kind]);

        for (let i = 0; i < offsets.length; i++) {
            const cx = offsets[i][0] - minX;
            const cy = offsets[i][1] - minY;
            const x = startX + cx * blockSize;
            const y = startY + cy * blockSize;
            const pad = 1;
            const inner = blockSize - pad * 2;

            g.fillColor = baseColor;
            g.lineWidth = 0;
            g.rect(x + pad, y + pad, inner, inner);
            g.fill();

            const hl = new cc.Color(255, 255, 255, 110);
            g.fillColor = hl;
            g.rect(x + pad, y + blockSize - pad - Math.floor(blockSize * 0.22), inner, Math.floor(blockSize * 0.22));
            g.fill();
            g.rect(x + pad, y + pad, Math.floor(blockSize * 0.22), inner);
            g.fill();

            g.strokeColor = new cc.Color(0, 0, 0, 140);
            g.strokeColor = new cc.Color(0, 0, 0, 255);
            g.lineWidth = 2;
            g.rect(x + pad, y + pad, inner, inner);
            g.stroke();
        }
    }
}
