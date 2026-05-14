/**
 * Title: InputCtrl
 * Description: Touch gesture + keyboard input for the falling-block puzzle.
 *
 *              Gestures (handled on the playfield touch node):
 *                - tap / click                   => rotate clockwise
 *                - swipe / drag left–right       => move one cell that direction
 *                - swipe down (fast flick)       => hard drop
 *                - swipe down (slow drag)        => continuous soft drop while dragging
 *                - double tap / double click      => hold piece
 *
 *              Desktop (Windows/Mac exe, web trên PC): engine thường **không** đưa chuột vào
 *              `TOUCH_*` — dùng `MOUSE_*` trên cùng node. Mobile vẫn chỉ dùng `TOUCH_*`.
 *
 *              Keyboard (always enabled while game is running):
 *                - LEFT / A    => move left  (with auto-repeat)
 *                - RIGHT / D   => move right (with auto-repeat)
 *                - DOWN / S    => soft drop (held)
 *                - UP / W      => hard drop (one-shot)
 *                - Z           => rotate clockwise
 *                - SHIFT / C   => hold
 *                - SPACE       => hard drop
 *                - P / ESC     => pause toggle
 *                - R           => restart (when game over)
 */

import { GameConstants } from './GameConstants';

export interface InputHandlers {
    moveLeft(): void;
    moveRight(): void;
    rotateCW(): void;
    softDropStart(): void;
    softDropStop(): void;
    hardDrop(): void;
    holdPiece(): void;
    togglePause(): void;
    restart(): void;
}

export class InputCtrl {
    private handlers: InputHandlers;
    private touchNode: cc.Node;

    // Touch gesture state
    private touchStartPos: cc.Vec2 | null = null;
    private touchLastPos: cc.Vec2 | null = null;
    private touchStartTime: number = 0;
    private softDropActive: boolean = false;
    private lastTapTime: number = 0;
    private softDropDragStartY: number = 0;
    private touchDidSwipe: boolean = false;
    private touchHorizAccum: number = 0;

    // Keyboard auto-repeat state
    private heldDir: number = 0; // -1 left, 1 right, 0 none
    private dasTimer: number = 0;
    private dasFiring: boolean = false;
    private dasRepeatTimer: number = 0;
    private softDropHeld: boolean = false;

    private keyDownBound: (e: cc.Event.EventKeyboard) => void;
    private keyUpBound: (e: cc.Event.EventKeyboard) => void;
    private touchStartBound: (e: cc.Event.EventTouch) => void;
    private touchMoveBound: (e: cc.Event.EventTouch) => void;
    private touchEndBound: (e: cc.Event.EventTouch) => void;

    private mouseDownBound: (e: cc.Event.EventMouse) => void;
    private mouseMoveBound: (e: cc.Event.EventMouse) => void;
    private mouseUpBound: (e: cc.Event.EventMouse) => void;
    private mouseLeaveBound: (e: cc.Event.EventMouse) => void;

    private enabledFlag: boolean = true;

    constructor(touchNode: cc.Node, handlers: InputHandlers) {
        this.touchNode = touchNode;
        this.handlers = handlers;

        this.keyDownBound = this.onKeyDown.bind(this);
        this.keyUpBound = this.onKeyUp.bind(this);
        this.touchStartBound = this.onTouchStart.bind(this);
        this.touchMoveBound = this.onTouchMove.bind(this);
        this.touchEndBound = this.onTouchEnd.bind(this);
        this.mouseDownBound = this.onMouseDown.bind(this);
        this.mouseMoveBound = this.onMouseMove.bind(this);
        this.mouseUpBound = this.onMouseUp.bind(this);
        this.mouseLeaveBound = this.onMouseLeave.bind(this);
    }

    /** Mobile / thiết bị cảm ứng: `TOUCH_*`. Desktop: `MOUSE_*` (bản native & nhiều bản web PC). */
    private useTouchGesturesOnBoard(): boolean {
        return !!cc.sys.isMobile;
    }

    public attach(): void {
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.keyDownBound, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP, this.keyUpBound, this);
        if (this.useTouchGesturesOnBoard()) {
            this.touchNode.on(cc.Node.EventType.TOUCH_START, this.touchStartBound, this);
            this.touchNode.on(cc.Node.EventType.TOUCH_MOVE, this.touchMoveBound, this);
            this.touchNode.on(cc.Node.EventType.TOUCH_END, this.touchEndBound, this);
            this.touchNode.on(cc.Node.EventType.TOUCH_CANCEL, this.touchEndBound, this);
        } else {
            this.touchNode.on(cc.Node.EventType.MOUSE_DOWN, this.mouseDownBound, this);
            this.touchNode.on(cc.Node.EventType.MOUSE_MOVE, this.mouseMoveBound, this);
            this.touchNode.on(cc.Node.EventType.MOUSE_UP, this.mouseUpBound, this);
            this.touchNode.on(cc.Node.EventType.MOUSE_LEAVE, this.mouseLeaveBound, this);
        }
    }

    public detach(): void {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.keyDownBound, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP, this.keyUpBound, this);
        if (this.touchNode && this.touchNode.isValid) {
            if (this.useTouchGesturesOnBoard()) {
                this.touchNode.off(cc.Node.EventType.TOUCH_START, this.touchStartBound, this);
                this.touchNode.off(cc.Node.EventType.TOUCH_MOVE, this.touchMoveBound, this);
                this.touchNode.off(cc.Node.EventType.TOUCH_END, this.touchEndBound, this);
                this.touchNode.off(cc.Node.EventType.TOUCH_CANCEL, this.touchEndBound, this);
            } else {
                this.touchNode.off(cc.Node.EventType.MOUSE_DOWN, this.mouseDownBound, this);
                this.touchNode.off(cc.Node.EventType.MOUSE_MOVE, this.mouseMoveBound, this);
                this.touchNode.off(cc.Node.EventType.MOUSE_UP, this.mouseUpBound, this);
                this.touchNode.off(cc.Node.EventType.MOUSE_LEAVE, this.mouseLeaveBound, this);
            }
        }
    }

    public setGameplayInputEnabled(enabled: boolean): void {
        this.enabledFlag = enabled;
        if (!enabled) {
            this.heldDir = 0;
            this.dasFiring = false;
            this.dasTimer = 0;
            this.dasRepeatTimer = 0;
            if (this.softDropHeld || this.softDropActive) {
                this.softDropHeld = false;
                this.softDropActive = false;
                this.handlers.softDropStop();
            }
        }
    }

    public update(dt: number): void {
        if (!this.enabledFlag) return;

        if (this.heldDir !== 0) {
            if (!this.dasFiring) {
                this.dasTimer += dt;
                if (this.dasTimer >= GameConstants.DAS_DELAY_SECONDS) {
                    this.dasFiring = true;
                    this.dasRepeatTimer = 0;
                }
            } else {
                this.dasRepeatTimer += dt;
                while (this.dasRepeatTimer >= GameConstants.DAS_RATE_SECONDS) {
                    this.dasRepeatTimer -= GameConstants.DAS_RATE_SECONDS;
                    if (this.heldDir < 0) this.handlers.moveLeft();
                    else this.handlers.moveRight();
                }
            }
        }
    }

    // ----------------------- Keyboard -----------------------
    private onKeyDown(e: cc.Event.EventKeyboard): void {
        const KEY = cc.macro.KEY;
        switch (e.keyCode) {
            case KEY.p:
            case KEY.escape:
                this.handlers.togglePause();
                return;
            case KEY.r:
                this.handlers.restart();
                return;
        }

        if (!this.enabledFlag) return;

        switch (e.keyCode) {
            case KEY.left:
            case KEY.a:
                if (this.heldDir !== -1) {
                    this.heldDir = -1;
                    this.dasTimer = 0;
                    this.dasFiring = false;
                    this.handlers.moveLeft();
                }
                break;

            case KEY.right:
            case KEY.d:
                if (this.heldDir !== 1) {
                    this.heldDir = 1;
                    this.dasTimer = 0;
                    this.dasFiring = false;
                    this.handlers.moveRight();
                }
                break;

            case KEY.down:
            case KEY.s:
                if (!this.softDropHeld) {
                    this.softDropHeld = true;
                    this.handlers.softDropStart();
                }
                break;

            case KEY.up:
            case KEY.w:
            case KEY.space:
                this.handlers.hardDrop();
                break;

            case KEY.z:
                this.handlers.rotateCW();
                break;

            case KEY.shift:
            case KEY.c:
                this.handlers.holdPiece();
                break;
        }
    }

    private onKeyUp(e: cc.Event.EventKeyboard): void {
        const KEY = cc.macro.KEY;
        switch (e.keyCode) {
            case KEY.left:
            case KEY.a:
                if (this.heldDir === -1) {
                    this.heldDir = 0;
                    this.dasFiring = false;
                    this.dasTimer = 0;
                    this.dasRepeatTimer = 0;
                }
                break;
            case KEY.right:
            case KEY.d:
                if (this.heldDir === 1) {
                    this.heldDir = 0;
                    this.dasFiring = false;
                    this.dasTimer = 0;
                    this.dasRepeatTimer = 0;
                }
                break;
            case KEY.down:
            case KEY.s:
                if (this.softDropHeld) {
                    this.softDropHeld = false;
                    this.handlers.softDropStop();
                }
                break;
        }
    }

    // ----------------------- Touch + mouse (same gesture logic) -----------------------
    private onTouchStart(e: cc.Event.EventTouch): void {
        if (!this.enabledFlag) return;
        this.pointerGestureStart(e.getLocation());
    }

    private onMouseDown(e: cc.Event.EventMouse): void {
        if (e.getButton() !== cc.EventMouse.BUTTON_LEFT) {
            return;
        }
        if (!this.enabledFlag) return;
        this.pointerGestureStart(e.getLocation());
    }

    private pointerGestureStart(p: cc.Vec2): void {
        this.touchStartPos = p;
        this.touchLastPos = p;
        this.touchStartTime = Date.now();
        this.softDropActive = false;
        this.softDropDragStartY = p.y;
        this.touchDidSwipe = false;
        this.touchHorizAccum = 0;
    }

    private onTouchMove(e: cc.Event.EventTouch): void {
        if (!this.enabledFlag) return;
        if (!this.touchStartPos || !this.touchLastPos) return;

        const p = e.getLocation();
        this.pointerGestureMove(p);
    }

    private onMouseMove(e: cc.Event.EventMouse): void {
        if (!this.enabledFlag) return;
        if (!this.touchStartPos || !this.touchLastPos) return;
        this.pointerGestureMove(e.getLocation());
    }

    private pointerGestureMove(p: cc.Vec2): void {
        const dx = p.x - this.touchLastPos.x;
        this.touchLastPos = p;
        this.touchHorizAccum += dx;

        const cellPx = GameConstants.BLOCK_SIZE * cc.view.getScaleX();
        const stepThreshold = Math.max(18, cellPx * 0.6);
        if (Math.abs(this.touchHorizAccum) >= stepThreshold) {
            const steps = Math.trunc(this.touchHorizAccum / stepThreshold);
            this.touchHorizAccum -= steps * stepThreshold;
            const safeSteps = Math.max(-3, Math.min(3, steps));
            for (let i = 0; i < Math.abs(safeSteps); i++) {
                if (safeSteps > 0) this.handlers.moveRight();
                else this.handlers.moveLeft();
            }
            this.touchDidSwipe = true;
        }

        // Soft drop while dragging downward beyond threshold
        const dyFromStart = p.y - this.softDropDragStartY;
        const wantSoftDrop = dyFromStart <= -GameConstants.GESTURE.SOFT_DROP_DRAG_THRESHOLD_PX * cc.view.getScaleY();
        if (wantSoftDrop !== this.softDropActive) {
            this.softDropActive = wantSoftDrop;
            if (wantSoftDrop) this.handlers.softDropStart();
            else this.handlers.softDropStop();
            this.touchDidSwipe = true;
        }
    }

    private onTouchEnd(e: cc.Event.EventTouch): void {
        this.pointerGestureEnd(e.getLocation());
    }

    private onMouseUp(e: cc.Event.EventMouse): void {
        if (e.getButton() !== cc.EventMouse.BUTTON_LEFT) {
            return;
        }
        this.pointerGestureEnd(e.getLocation());
    }

    /** Chuột rời vùng bàn — coi như hủy kéo (tránh soft drop kẹt). */
    private onMouseLeave(_e: cc.Event.EventMouse): void {
        if (this.softDropActive) {
            this.softDropActive = false;
            this.handlers.softDropStop();
        }
        this.resetTouchState();
    }

    private pointerGestureEnd(endPos: cc.Vec2): void {
        if (this.softDropActive) {
            this.softDropActive = false;
            this.handlers.softDropStop();
        }

        if (!this.enabledFlag) {
            this.resetTouchState();
            return;
        }

        if (!this.touchStartPos || !this.touchLastPos) {
            this.resetTouchState();
            return;
        }

        const elapsed = Date.now() - this.touchStartTime;
        const totalDelta = endPos.sub(this.touchStartPos);
        const totalMag = totalDelta.mag();
        const tapMaxDistPx = GameConstants.GESTURE.TAP_MAX_DIST_PX * cc.view.getScaleX();

        if (!this.touchDidSwipe && elapsed <= GameConstants.GESTURE.TAP_MAX_TIME_MS && totalMag <= tapMaxDistPx) {
            // Tap: rotate, but check for double-tap to hold
            const now = Date.now();
            if (now - this.lastTapTime <= GameConstants.GESTURE.DOUBLE_TAP_MAX_GAP_MS) {
                this.handlers.holdPiece();
                this.lastTapTime = 0;
            } else {
                this.handlers.rotateCW();
                this.lastTapTime = now;
            }
        } else if (elapsed <= GameConstants.GESTURE.SWIPE_MAX_TIME_MS) {
            // Treat as swipe — direction by dominant axis
            const minSwipeX = GameConstants.GESTURE.SWIPE_MIN_DIST_PX * cc.view.getScaleX();
            const minSwipeY = GameConstants.GESTURE.SWIPE_MIN_DIST_PX * cc.view.getScaleY();
            if (Math.abs(totalDelta.x) >= minSwipeX || Math.abs(totalDelta.y) >= minSwipeY) {
                if (Math.abs(totalDelta.y) > Math.abs(totalDelta.x)) {
                    // Finger moved down => totalDelta.y < 0 in Cocos screen coords
                    const distDownPx = -totalDelta.y;
                    if (distDownPx >= minSwipeY) {
                        const vel = distDownPx / Math.max(elapsed, 1);
                        const minVel =
                            GameConstants.GESTURE.HARD_DROP_SWIPE_MIN_VELOCITY_PX_PER_MS * cc.view.getScaleY();
                        if (vel >= minVel) {
                            this.handlers.hardDrop();
                        }
                    }
                }
            }
        }

        this.resetTouchState();
    }

    private resetTouchState(): void {
        this.touchStartPos = null;
        this.touchLastPos = null;
        this.touchDidSwipe = false;
        this.touchHorizAccum = 0;
    }
}
