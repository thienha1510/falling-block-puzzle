/**
 * Title: Bag (7-bag randomizer)
 * Description: Standard "7-bag" tetromino randomizer. Each bag contains all 7
 *              piece kinds shuffled, ensuring fairness in distribution.
 *              The internal queue is replenished with a fresh bag whenever it
 *              runs low so callers can peek N pieces ahead.
 */

import { PieceKind } from './GameConstants';

export class Bag {
    private queue: PieceKind[] = [];

    constructor() {
        this.refill();
    }

    /**
     * Returns the next piece and removes it from the queue.
     */
    public next(): PieceKind {
        if (this.queue.length === 0) {
            this.refill();
        }
        const head = this.queue.shift() as PieceKind;
        // keep at least one full bag ready so peek(N) can look ahead
        if (this.queue.length < 7) {
            this.refill();
        }
        return head;
    }

    /**
     * Peek the upcoming N pieces without consuming them.
     */
    public peek(count: number): PieceKind[] {
        while (this.queue.length < count) {
            this.refill();
        }
        return this.queue.slice(0, count);
    }

    /**
     * Reset the bag (used on restart).
     */
    public reset(): void {
        this.queue.length = 0;
        this.refill();
    }

    private refill(): void {
        const bag: PieceKind[] = [
            PieceKind.I, PieceKind.O, PieceKind.T,
            PieceKind.S, PieceKind.Z, PieceKind.J, PieceKind.L,
        ];
        for (let i = bag.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = bag[i];
            bag[i] = bag[j];
            bag[j] = tmp;
        }
        for (let i = 0; i < bag.length; i++) {
            this.queue.push(bag[i]);
        }
    }
}
