/**
 * Title: Board
 * Description: 10-column x (BOARD_ROWS + HIDDEN_ROWS) playfield grid. Stores
 *              the locked block colors per cell. Provides collision checks,
 *              piece locking, full-line detection, and line-removal logic.
 *
 *              Cell coordinate system:
 *                  x: 0 .. (cols - 1) left to right
 *                  y: 0 .. (rows - 1) bottom to top (row 0 is bottom)
 *              Each cell stores -1 if empty, otherwise a PieceKind index used
 *              for color lookup.
 */

import { GameConstants, PieceKind } from './GameConstants';
import { PieceState, Tetromino } from './Tetromino';

export const EMPTY = -1;

export class Board {
    public readonly cols: number;
    public readonly rows: number;          // total rows including hidden buffer
    public readonly visibleRows: number;   // visible portion (drawn)
    private grid: Int8Array;               // length = cols * rows; values: -1 or PieceKind
    private completedRowsCache: number[] = [];

    constructor() {
        this.cols = GameConstants.BOARD_COLS;
        this.visibleRows = GameConstants.BOARD_ROWS;
        this.rows = this.visibleRows + GameConstants.HIDDEN_ROWS;
        this.grid = new Int8Array(this.cols * this.rows);
        this.clear();
    }

    public clear(): void {
        for (let i = 0; i < this.grid.length; i++) {
            this.grid[i] = EMPTY;
        }
    }

    public getCell(x: number, y: number): number {
        if (x < 0 || x >= this.cols || y < 0 || y >= this.rows) {
            return -2; // sentinel for "wall"
        }
        return this.grid[y * this.cols + x];
    }

    public isCellEmpty(x: number, y: number): boolean {
        if (x < 0 || x >= this.cols) return false;
        if (y < 0) return false;
        if (y >= this.rows) return true; // above-buffer is treated as empty (won't normally reach)
        return this.grid[y * this.cols + x] === EMPTY;
    }

    public canPlace(state: PieceState): boolean {
        const cells = Tetromino.cells(state);
        for (let i = 0; i < cells.length; i++) {
            const x = cells[i][0];
            const y = cells[i][1];
            if (!this.isCellEmpty(x, y)) {
                return false;
            }
        }
        return true;
    }

    /**
     * Lock the given piece into the grid using its kind as color index.
     * Returns the y-coordinates of any rows that became fully filled.
     */
    public lockPiece(state: PieceState): number[] {
        const cells = Tetromino.cells(state);
        for (let i = 0; i < cells.length; i++) {
            const x = cells[i][0];
            const y = cells[i][1];
            if (x >= 0 && x < this.cols && y >= 0 && y < this.rows) {
                this.grid[y * this.cols + x] = state.kind;
            }
        }

        const filled: number[] = [];
        for (let i = 0; i < cells.length; i++) {
            const y = cells[i][1];
            if (filled.indexOf(y) !== -1) continue;
            if (y < 0 || y >= this.rows) continue;
            if (this.isRowFull(y)) {
                filled.push(y);
            }
        }
        filled.sort(function (a, b) { return a - b; });
        this.completedRowsCache = filled;
        return filled;
    }

    /**
     * Returns rows reported by the most recent lockPiece() call.
     * Used by the renderer for the line-clear blink animation.
     */
    public consumePendingClearedRows(): number[] {
        const r = this.completedRowsCache;
        this.completedRowsCache = [];
        return r;
    }

    /**
     * Remove the given row indices from the grid and shift remaining rows down.
     */
    public removeRows(rowIndices: number[]): void {
        if (rowIndices.length === 0) return;
        const sorted = rowIndices.slice().sort(function (a, b) { return a - b; });

        // Build a new grid by skipping the cleared rows.
        const newGrid = new Int8Array(this.cols * this.rows);
        for (let i = 0; i < newGrid.length; i++) newGrid[i] = EMPTY;
        let writeY = 0;
        for (let y = 0; y < this.rows; y++) {
            if (sorted.indexOf(y) !== -1) continue;
            for (let x = 0; x < this.cols; x++) {
                newGrid[writeY * this.cols + x] = this.grid[y * this.cols + x];
            }
            writeY++;
        }
        this.grid = newGrid;
    }

    /**
     * Check if the piece's spawn position is blocked (=> game over).
     */
    public isSpawnBlocked(state: PieceState): boolean {
        return !this.canPlace(state);
    }

    /**
     * Hard-drop helper: returns the lowest valid y the piece can fall to.
     */
    public computeDropY(state: PieceState): number {
        let y = state.y;
        while (true) {
            const test: PieceState = { kind: state.kind, rotation: state.rotation, x: state.x, y: y - 1 };
            if (!this.canPlace(test)) break;
            y -= 1;
        }
        return y;
    }

    /**
     * Helpful for "stack" detection — true if any cell at or above the visible top is filled.
     */
    public hasBlocksInHiddenZone(): boolean {
        for (let y = this.visibleRows; y < this.rows; y++) {
            for (let x = 0; x < this.cols; x++) {
                if (this.grid[y * this.cols + x] !== EMPTY) return true;
            }
        }
        return false;
    }

    private isRowFull(y: number): boolean {
        for (let x = 0; x < this.cols; x++) {
            if (this.grid[y * this.cols + x] === EMPTY) return false;
        }
        return true;
    }

    /**
     * Iterate all visible filled cells (for rendering).
     * cb(x, y, kind)
     */
    public forEachVisibleFilled(cb: (x: number, y: number, kind: PieceKind) => void): void {
        for (let y = 0; y < this.visibleRows; y++) {
            for (let x = 0; x < this.cols; x++) {
                const v = this.grid[y * this.cols + x];
                if (v !== EMPTY) cb(x, y, v as PieceKind);
            }
        }
    }
}
