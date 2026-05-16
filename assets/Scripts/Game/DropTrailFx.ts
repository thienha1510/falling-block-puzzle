/**
 * Fading drop-trail segments after a hard drop (soft drop uses live trails in Renderer).
 */

import { GameConstants, PieceKind } from './GameConstants';
import { PieceState, Tetromino } from './Tetromino';

export interface DropTrailSegment {
    /** Các ô của khối tại vị trí hạ cánh (vẽ vệt liền một cụm). */
    cells: [number, number][];
    kind: PieceKind;
    /** Chiều cao vệt (ô lưới). */
    heightCells: number;
    /** 1 → 0 khi mờ dần. */
    life: number;
}

export class DropTrailFx {
    private segments: DropTrailSegment[] = [];

    public clear(): void {
        this.segments = [];
    }

    public update(dt: number): void {
        const fade = GameConstants.DROP_TRAIL.FADE_SECONDS;
        if (fade <= 1e-6 || this.segments.length === 0) {
            return;
        }
        const decay = dt / fade;
        const next: DropTrailSegment[] = [];
        for (let i = 0; i < this.segments.length; i++) {
            const s = this.segments[i];
            const life = s.life - decay;
            if (life > 0.02) {
                next.push({ cells: s.cells, kind: s.kind, heightCells: s.heightCells, life });
            }
        }
        this.segments = next;
    }

    /** Một vệt liền cho cả khối sau hard drop. */
    public spawnHardDrop(active: PieceState, startY: number, endY: number): void {
        const dropRows = startY - endY;
        if (dropRows <= 0) {
            return;
        }
        const landed: PieceState = {
            kind: active.kind,
            rotation: active.rotation,
            x: active.x,
            y: endY,
        };
        const cells = Tetromino.cells(landed);
        const packed: [number, number][] = [];
        for (let i = 0; i < cells.length; i++) {
            packed.push([cells[i][0], cells[i][1]]);
        }
        this.segments.push({
            cells: packed,
            kind: active.kind,
            heightCells: GameConstants.DROP_TRAIL.HARD_TRAIL_HEIGHT_CELLS,
            life: 1,
        });
    }

    public getSegments(): ReadonlyArray<DropTrailSegment> {
        return this.segments;
    }
}
