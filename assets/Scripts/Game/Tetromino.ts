/**
 * Title: Tetromino definitions
 * Description: 7 standard tetrominoes (I, O, T, S, Z, J, L) with 4 rotation
 *              states each. Coordinates are cell offsets within a 4x4 box,
 *              measured from bottom-left (x, y), where +y is up. This matches
 *              the board's coordinate system (row 0 at bottom).
 *              Wall-kick offsets follow a simplified SRS-style scheme.
 */

import { PieceKind } from './GameConstants';

export type CellOffsets = ReadonlyArray<ReadonlyArray<[number, number]>>;

/**
 * Each piece has 4 rotation states (R0..R3), each a list of 4 [x,y] offsets.
 * y=0 is the bottom of the bounding box.
 */
const SHAPES: { [k: number]: CellOffsets } = {
    // I — horizontal in R0/R2, vertical in R1/R3 (4-wide bbox)
    [PieceKind.I]: [
        [[0, 2], [1, 2], [2, 2], [3, 2]],
        [[2, 0], [2, 1], [2, 2], [2, 3]],
        [[0, 1], [1, 1], [2, 1], [3, 1]],
        [[1, 0], [1, 1], [1, 2], [1, 3]],
    ],
    // O — never changes (2x2 within 4x4)
    [PieceKind.O]: [
        [[1, 1], [2, 1], [1, 2], [2, 2]],
        [[1, 1], [2, 1], [1, 2], [2, 2]],
        [[1, 1], [2, 1], [1, 2], [2, 2]],
        [[1, 1], [2, 1], [1, 2], [2, 2]],
    ],
    // T (3x3 bbox inside 4x4)
    [PieceKind.T]: [
        [[0, 1], [1, 1], [2, 1], [1, 2]],
        [[1, 0], [1, 1], [2, 1], [1, 2]],
        [[1, 0], [0, 1], [1, 1], [2, 1]],
        [[1, 0], [0, 1], [1, 1], [1, 2]],
    ],
    // S — canonical SRS, derived by rotating R0 by 90° CW around the center mino (1,1)
    // of the 3×3 active region. R0/R2 are horizontal, R1/R3 are vertical.
    [PieceKind.S]: [
        [[0, 1], [1, 1], [1, 2], [2, 2]],
        [[1, 1], [1, 2], [2, 0], [2, 1]],
        [[0, 0], [1, 0], [1, 1], [2, 1]],
        [[0, 1], [0, 2], [1, 0], [1, 1]],
    ],
    // Z — mirror of S across the vertical axis of the 3×3 active region (x → 2 - x).
    [PieceKind.Z]: [
        [[0, 2], [1, 1], [1, 2], [2, 1]],
        [[0, 0], [0, 1], [1, 1], [1, 2]],
        [[0, 1], [1, 0], [1, 1], [2, 0]],
        [[1, 0], [1, 1], [2, 1], [2, 2]],
    ],
    // J
    [PieceKind.J]: [
        [[0, 1], [1, 1], [2, 1], [0, 2]],
        [[1, 0], [1, 1], [1, 2], [2, 2]],
        [[2, 0], [0, 1], [1, 1], [2, 1]],
        [[0, 0], [1, 0], [1, 1], [1, 2]],
    ],
    // L
    [PieceKind.L]: [
        [[0, 1], [1, 1], [2, 1], [2, 2]],
        [[1, 0], [2, 0], [1, 1], [1, 2]],
        [[0, 0], [0, 1], [1, 1], [2, 1]],
        [[1, 0], [1, 1], [0, 2], [1, 2]],
    ],
};

/**
 * Simplified SRS wall-kick offsets to try when a rotation collides.
 * The first entry [0,0] is the "no kick" attempt (handled separately).
 */
const KICKS_DEFAULT: ReadonlyArray<[number, number]> = [
    [0, 0],
    [-1, 0], [1, 0],
    [-2, 0], [2, 0],
    [0, -1], [0, 1],
    [-1, -1], [1, -1],
    [-1, 1], [1, 1],
];

/**
 * The I-piece needs slightly larger horizontal kicks because its bounding box is wider.
 */
const KICKS_I: ReadonlyArray<[number, number]> = [
    [0, 0],
    [-1, 0], [1, 0],
    [-2, 0], [2, 0],
    [-3, 0], [3, 0],
    [0, -1], [0, 1],
    [0, -2],
];

export interface PieceState {
    kind: PieceKind;
    rotation: number; // 0..3
    x: number;        // grid x of bbox bottom-left
    y: number;        // grid y of bbox bottom-left (y up)
}

export class Tetromino {
    /**
     * Returns the absolute cell positions of a piece, given its state.
     */
    static cells(state: PieceState): Array<[number, number]> {
        const offsets = SHAPES[state.kind][state.rotation];
        const result: Array<[number, number]> = new Array(offsets.length);
        for (let i = 0; i < offsets.length; i++) {
            result[i] = [state.x + offsets[i][0], state.y + offsets[i][1]];
        }
        return result;
    }

    /**
     * Returns relative offsets for a piece in a given rotation (used by previews).
     */
    static offsets(kind: PieceKind, rotation: number): ReadonlyArray<[number, number]> {
        return SHAPES[kind][rotation % 4];
    }

    /**
     * Returns kick attempts (in order) to try when rotation collides.
     */
    static kicksFor(kind: PieceKind): ReadonlyArray<[number, number]> {
        return kind === PieceKind.I ? KICKS_I : KICKS_DEFAULT;
    }

    /**
     * Spawn x position so that the piece appears centered horizontally on a board of `cols` columns.
     */
    static spawnX(cols: number): number {
        // 4-wide bbox, center it
        return Math.floor((cols - 4) / 2);
    }
}
