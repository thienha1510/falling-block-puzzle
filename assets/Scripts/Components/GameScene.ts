/**
 * Title: Game Scene Component
 * Description: It contains all game components including block, tetrimino, grid viewer,
 * event handlers(button, keyboard, and node), popups etc.
 * Author: Md. Faizul Islam (faizul7cse@gmail.com)
 * Date: 18-05-2023 14:07
 */

import Block from './Block';
import GridViewComponent from './/GridViewComponent';
import PopupsContainerComponent from './PopupsContainerComponent';
import ScoreHudComponent from './ScoreHudComponent';
import GameOverPopupComponent from './popups/GameOverPopupComponent';
import PlayGamePopupComponent from './popups/PlayGamePopupComponent';
import { Config } from '../Configs/Config';
import { Constants, MoveDirection, GameState } from '../Constants';
import { Helper } from '../Generic/Helper';
import { Logger } from '../Generic/Logger';
import RenderFlowDebugger from '../Generic/RenderFlowDebugger';
import { Player } from '../Models/Player';
import PersistentComponent from './PersistentComponent';
import Tetrimino from './Tetrimino';

const { ccclass, property } = cc._decorator;

@ccclass
export default class GameScene extends cc.Component {
    @property(ScoreHudComponent)
    private mScoreHudComponent: ScoreHudComponent = null;
    @property(PopupsContainerComponent)
    private mPopupsContainer: PopupsContainerComponent = null;
    @property(cc.Node)
    private mGameComponentsHolder: cc.Node = null;
    @property(cc.Node)
    private mButtonRotate: cc.Node = null;
    @property(cc.Node)
    private mButtonAccelerate: cc.Node = null;
    @property(cc.Node)
    private mButtonLeft: cc.Node = null;
    @property(cc.Node)
    private mButtonRight: cc.Node = null;
    @property(cc.Prefab)
    private mTetriminoPrefab: cc.Prefab = null;
    @property(cc.Prefab)
    private mGridViewPrefab: cc.Prefab = null;
    @property(cc.Prefab)
    private mBlockPrefab: cc.Prefab = null;

    private mPersistentComponent: PersistentComponent = null;
    private mGameOver: boolean = false;
    private mNextTetrimino: cc.Node = null;
    private mPlayer: Player = null;
    private mLogger: Logger = null;
    private mNextTetriminoHolder: cc.Node = null;
    private mEmptyGrid: cc.Node = null;
    private mBlocksHolder: cc.Node = null;
    private mTetriMovingLayer: cc.Node = null;
    private mVisibilityChangeCallback: (event: {}) => void;

    private mUiRoot: cc.Node = null;
    private mHudRoot: cc.Node = null;
    private mPlayfieldRoot: cc.Node = null;
    private mSidePanelRoot: cc.Node = null;

    private mGestureTouchStartPos: cc.Vec2 = null;
    private mGestureTouchLastPos: cc.Vec2 = null;
    private mGestureTouchStartTimeMs: number = 0;
    private mGestureAccumulatedX: number = 0;
    private mGestureSoftDropActive: boolean = false;

    // LIFE-CYCLE CALLBACKS:
    onLoad() {
        this.mPersistentComponent = cc.find('PersistantNode').getComponent(PersistentComponent);
        this.mLogger = Logger.create('GameScene', false);
        this.mPersistentComponent.setGameScene(this);
        this.mPlayer = this.mPersistentComponent.getPlayer();
        this.mGameOver = false;

        if (typeof CC_DEBUG !== 'undefined' && CC_DEBUG && !this.node.getComponent(RenderFlowDebugger)) {
            this.node.addComponent(RenderFlowDebugger);
        }

        this.ensureSceneNodes();

        this.addKeyEventHandlers();
        // Buttons are optional now (mobile uses swipe/drag). If they exist, we still wire them.
        this.addButtonTouchEventHandlers();
        this.addPersistentNodeEventHandlers();

        this.mVisibilityChangeCallback = this.onVisibilityChange.bind(this);
        document.addEventListener('visibilitychange', this.mVisibilityChangeCallback);
    }

    onDestroy() {
        this.removeKeyEventHandlers();
        this.removeButtonTouchEventHandlers();
        this.removePersistentNodeEventHandlers();
        document.removeEventListener('visibilitychange', this.mVisibilityChangeCallback);
    }

    protected onEnable(): void {
        this.addGameEmptyGrid();
        this.addNextTetriminoViewer();
        this.addBlocksHolder();
        this.addTetriMovingLayer();
        this.addSwipeGestureEventHandlers();
        if (this.mPopupsContainer) {
            const playPopup = this.mPopupsContainer.getPlayGamePopupComponent();
            if (playPopup) {
                playPopup.showPopup();
                const comp = playPopup.getComponent(PlayGamePopupComponent);
                if (comp) comp.initialize();
            }
        }
    }

    protected onDisable(): void {
        this.removeSwipeGestureEventHandlers();
    }

    start() {
        if (this.mScoreHudComponent) {
            this.mScoreHudComponent.updateScoreHudInfos();
        }
    }

    private addGameEmptyGrid(): void {
        this.mEmptyGrid = cc.instantiate(this.mGridViewPrefab);
        this.mEmptyGrid.getComponent(GridViewComponent).initialize(Config.GRID_SIZE);
        let posX = -this.mEmptyGrid.width / 2 - (cc.winSize.width / 2 - this.mEmptyGrid.width / 2);
        let posY =
            -this.mEmptyGrid.height / 2 - -(cc.winSize.height / 2 - this.mEmptyGrid.height / 2);
        this.mEmptyGrid.setPosition(posX, posY);
        (this.mPlayfieldRoot || this.mGameComponentsHolder).addChild(this.mEmptyGrid, 1);
        this.mLogger.Log('x: ' + posX + ' y: ' + posY);

        // Ensure the playfield can receive touch events for swipe/drag controls
        this.mEmptyGrid.setContentSize(this.mEmptyGrid.getContentSize());
        this.mEmptyGrid.opacity = this.mEmptyGrid.opacity; // keep current visuals, but ensure node exists
    }

    private addNextTetriminoViewer(): void {
        this.mNextTetriminoHolder = cc.instantiate(this.mGridViewPrefab);
        this.mNextTetriminoHolder
            .getComponent(GridViewComponent)
            .initialize(
                cc.size(Constants.TETRIMINO_TEMPLATE_SIZE, Constants.TETRIMINO_TEMPLATE_SIZE)
            );
        let gridPosition = this.mEmptyGrid.position;
        let middle = cc.winSize.width - this.mEmptyGrid.width;
        let viewerPosition = cc.v2(
            gridPosition.x +
                this.mEmptyGrid.width +
                middle / 2 -
                this.mNextTetriminoHolder.width / 2,
            gridPosition.y
        );
        this.mNextTetriminoHolder.setPosition(viewerPosition);
        (this.mSidePanelRoot || this.mGameComponentsHolder).addChild(this.mNextTetriminoHolder, 2);
        this.mLogger.Log('viwer x: ' + viewerPosition.x + ' y: ' + viewerPosition.y);
    }

    private addBlocksHolder(): void {
        this.mBlocksHolder = new cc.Node('BlocksStatic');
        this.mBlocksHolder.setAnchorPoint(cc.v2(0, 0));
        this.mBlocksHolder.setContentSize(this.mEmptyGrid.getContentSize());
        this.mBlocksHolder.setPosition(this.mEmptyGrid.getPosition());
        (this.mPlayfieldRoot || this.mGameComponentsHolder).addChild(this.mBlocksHolder, 3);
    }

    private startGame(): void {
        this.mGameOver = false;
        if (this.mPopupsContainer) {
            const go = this.mPopupsContainer.getGameOverPopupComponent();
            if (go) go.hidePopup();
        }
        this.mPlayer.reset();
        this.mPersistentComponent.getGameController().gameStart();
    }

    private addTetriMovingLayer(): void {
        this.mTetriMovingLayer = new cc.Node('TetriminoMoving');
        this.mTetriMovingLayer.setAnchorPoint(cc.v2(0, 0));
        this.mTetriMovingLayer.setContentSize(this.mEmptyGrid.getContentSize());
        this.mTetriMovingLayer.setPosition(this.mEmptyGrid.getPosition());
        (this.mPlayfieldRoot || this.mGameComponentsHolder).addChild(this.mTetriMovingLayer, 4);
    }

    public removeAllBlocksFromBlockHolder(): void {
        this.mBlocksHolder.removeAllChildren();
    }

    public addBlockToBlocksHolder(position: cc.Vec2, colorIndex: number): void {
        let block = cc.instantiate(this.mBlockPrefab);
        block.setPosition(position);
        block.getComponent(Block).setSpriteFrame(colorIndex);
        this.mBlocksHolder.addChild(block, 1);
    }

    public generateUpcomingTetrimino(): Tetrimino {
        if (this.mNextTetrimino && this.mNextTetrimino.isValid) {
            this.mNextTetrimino.destroy();
            this.mNextTetrimino = null;
        }

        let spriteFrameIndex = Helper.getNextColorIndex() + 1;

        let tetrimino = cc.instantiate(this.mTetriminoPrefab);
        let tetriComponent = tetrimino.getComponent(Tetrimino);
        tetriComponent.setTetriminoColorIndex(spriteFrameIndex);
        tetriComponent.movable = false;

        this.mNextTetriminoHolder.addChild(tetrimino);
        this.mNextTetrimino = tetrimino;

        return tetriComponent;
    }

    public addMovingTerimino(component: Tetrimino): Tetrimino {
        let newTetrimino = cc.instantiate(this.mTetriminoPrefab);
        let tetriminoComponent = newTetrimino.getComponent(Tetrimino);
        tetriminoComponent.initializeWithTetrimino(component);
        this.mTetriMovingLayer.addChild(newTetrimino);
        return tetriminoComponent;
    }

    public onRowClearComplete(rowClearedCount: number): void {
        this.mPlayer.setRowClearedCount(this.mPlayer.getRowClearedCount() + rowClearedCount);
        this.mScoreHudComponent.updateScoreHudInfos();
    }

    public gameOver() {
        this.mGameOver = true;
        if (this.mPopupsContainer) {
            const go = this.mPopupsContainer.getGameOverPopupComponent();
            if (go) {
                go.showPopup();
                const comp = go.getComponent(GameOverPopupComponent);
                if (comp) comp.initialize();
            }
        }
    }

    private onVisibilityChange() {
        let visibleStatus = !document.hidden;
        this.mLogger.Warn('game visibility: ' + (visibleStatus ? 'visible' : 'not visible'));
        let gameController = this.mPersistentComponent.getGameController();
        let oldState = gameController.getGameState();
        if (!this.mGameOver && (oldState == GameState.Running || oldState == GameState.Paused)) {
            let newState = visibleStatus ? GameState.Running : GameState.Paused;
            gameController.setGameState(newState);
        }
    }

    private addKeyEventHandlers() {
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.on(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
    }

    private removeKeyEventHandlers() {
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_DOWN, this.onKeyDown, this);
        cc.systemEvent.off(cc.SystemEvent.EventType.KEY_UP, this.onKeyUp, this);
    }

    private addButtonTouchEventHandlers() {
        if (!this.mButtonRotate || !this.mButtonAccelerate || !this.mButtonLeft || !this.mButtonRight) {
            return;
        }
        this.mButtonRotate.on(cc.Node.EventType.TOUCH_START, this.onButtonTouchBegan, this);
        this.mButtonAccelerate.on(cc.Node.EventType.TOUCH_START, this.onButtonTouchBegan, this);
        this.mButtonLeft.on(cc.Node.EventType.TOUCH_START, this.onButtonTouchBegan, this);
        this.mButtonRight.on(cc.Node.EventType.TOUCH_START, this.onButtonTouchBegan, this);

        this.mButtonRotate.on(cc.Node.EventType.TOUCH_END, this.onButtonTouchEnd, this);
        this.mButtonAccelerate.on(cc.Node.EventType.TOUCH_END, this.onButtonTouchEnd, this);
        this.mButtonLeft.on(cc.Node.EventType.TOUCH_END, this.onButtonTouchEnd, this);
        this.mButtonRight.on(cc.Node.EventType.TOUCH_END, this.onButtonTouchEnd, this);
    }

    private removeButtonTouchEventHandlers() {
        if (!this.mButtonRotate || !this.mButtonAccelerate || !this.mButtonLeft || !this.mButtonRight) {
            return;
        }
        this.mButtonRotate.off(cc.Node.EventType.TOUCH_START, this.onButtonTouchBegan, this);
        this.mButtonAccelerate.off(cc.Node.EventType.TOUCH_START, this.onButtonTouchBegan, this);
        this.mButtonLeft.off(cc.Node.EventType.TOUCH_START, this.onButtonTouchBegan, this);
        this.mButtonRight.off(cc.Node.EventType.TOUCH_START, this.onButtonTouchBegan, this);

        this.mButtonRotate.off(cc.Node.EventType.TOUCH_END, this.onButtonTouchEnd, this);
        this.mButtonAccelerate.off(cc.Node.EventType.TOUCH_END, this.onButtonTouchEnd, this);
        this.mButtonLeft.off(cc.Node.EventType.TOUCH_END, this.onButtonTouchEnd, this);
        this.mButtonRight.off(cc.Node.EventType.TOUCH_END, this.onButtonTouchEnd, this);
    }

    addPersistentNodeEventHandlers() {
        this.mPersistentComponent.node.on(Constants.EVENTS.PLAY_TETRIS, this.startGame, this);
    }

    removePersistentNodeEventHandlers() {
        this.mPersistentComponent.node.off(Constants.EVENTS.PLAY_TETRIS, this.startGame, this);
    }

    onKeyDown(event: cc.Event.EventKeyboard) {
        if (this.mPersistentComponent.getGameController().getGameState() !== GameState.Running) {
            return;
        }

        switch (event.keyCode) {
            case cc.macro.KEY.w:
            case cc.macro.KEY.up:
                this.mPersistentComponent
                    .getGameController()
                    .onDirectionChange(MoveDirection.Rotate);
                break;

            case cc.macro.KEY.s:
            case cc.macro.KEY.down:
                this.mPersistentComponent.getGameController().onDirectionChange(MoveDirection.Down);
                break;

            case cc.macro.KEY.a:
            case cc.macro.KEY.left:
                this.mPersistentComponent.getGameController().onDirectionChange(MoveDirection.Left);
                break;

            case cc.macro.KEY.d:
            case cc.macro.KEY.right:
                this.mPersistentComponent
                    .getGameController()
                    .onDirectionChange(MoveDirection.Right);
                break;
        }
    }

    onKeyUp(event: cc.Event.EventKeyboard) {
        if (this.mPersistentComponent.getGameController().getGameState() !== GameState.Running) {
            return;
        }

        switch (event.keyCode) {
            default:
                // Other keys are unified to cancel the movement direction
                this.mPersistentComponent.getGameController().onDirectionCancel();
                break;
        }
    }

    onButtonTouchBegan(event: cc.Event.EventTouch) {
        if (this.mGameOver) {
            return;
        }

        let direction = MoveDirection.None;

        if (this.mButtonRotate === event.target) {
            direction = MoveDirection.Rotate;
        } else if (this.mButtonAccelerate === event.target) {
            direction = MoveDirection.Down;
        } else if (this.mButtonLeft === event.target) {
            direction = MoveDirection.Left;
        } else if (this.mButtonRight === event.target) {
            direction = MoveDirection.Right;
        }

        if (direction !== MoveDirection.None) {
            this.mPersistentComponent.getGameController().onDirectionChange(direction);
        }
    }

    onButtonTouchEnd(event: cc.Event.EventTouch) {
        if (this.mGameOver) {
            return;
        }

        this.mPersistentComponent.getGameController().onDirectionCancel();
    }

    private addSwipeGestureEventHandlers(): void {
        if (!this.mEmptyGrid) {
            return;
        }

        this.mEmptyGrid.on(cc.Node.EventType.TOUCH_START, this.onSwipeTouchStart, this);
        this.mEmptyGrid.on(cc.Node.EventType.TOUCH_MOVE, this.onSwipeTouchMove, this);
        this.mEmptyGrid.on(cc.Node.EventType.TOUCH_END, this.onSwipeTouchEnd, this);
        this.mEmptyGrid.on(cc.Node.EventType.TOUCH_CANCEL, this.onSwipeTouchEnd, this);
    }

    private removeSwipeGestureEventHandlers(): void {
        if (!this.mEmptyGrid) {
            return;
        }

        this.mEmptyGrid.off(cc.Node.EventType.TOUCH_START, this.onSwipeTouchStart, this);
        this.mEmptyGrid.off(cc.Node.EventType.TOUCH_MOVE, this.onSwipeTouchMove, this);
        this.mEmptyGrid.off(cc.Node.EventType.TOUCH_END, this.onSwipeTouchEnd, this);
        this.mEmptyGrid.off(cc.Node.EventType.TOUCH_CANCEL, this.onSwipeTouchEnd, this);
    }

    private onSwipeTouchStart(event: cc.Event.EventTouch): void {
        if (this.mGameOver) {
            return;
        }
        if (this.mPersistentComponent.getGameController().getGameState() !== GameState.Running) {
            return;
        }

        const pos = event.getLocation();
        this.mGestureTouchStartPos = pos;
        this.mGestureTouchLastPos = pos;
        this.mGestureTouchStartTimeMs = Date.now();
        this.mGestureAccumulatedX = 0;
        this.mGestureSoftDropActive = false;
    }

    private onSwipeTouchMove(event: cc.Event.EventTouch): void {
        if (this.mGameOver) {
            return;
        }
        if (this.mPersistentComponent.getGameController().getGameState() !== GameState.Running) {
            return;
        }
        if (!this.mGestureTouchLastPos) {
            return;
        }

        const pos = event.getLocation();
        const dx = pos.x - this.mGestureTouchLastPos.x;
        const dyFromStart = pos.y - this.mGestureTouchStartPos.y;
        this.mGestureTouchLastPos = pos;

        // Horizontal drag -> nudge per cell width
        this.mGestureAccumulatedX += dx;
        const cellW = Config.BLOCK_SIZE.width;
        let steps = 0;

        if (Math.abs(this.mGestureAccumulatedX) >= cellW) {
            steps = Math.trunc(this.mGestureAccumulatedX / cellW);
            this.mGestureAccumulatedX -= steps * cellW;
        }

        if (steps !== 0) {
            const gameController = this.mPersistentComponent.getGameController();
            const count = Math.min(6, Math.abs(steps));
            for (let i = 0; i < count; i++) {
                if (steps > 0) {
                    gameController.nudgeRightOnce();
                } else {
                    gameController.nudgeLeftOnce();
                }
            }
        }

        // Drag down -> soft drop while dragging downward enough
        const softDropThresholdPx = Math.max(24, Config.BLOCK_SIZE.height * 0.6);
        const wantSoftDrop = dyFromStart <= -softDropThresholdPx;
        if (wantSoftDrop !== this.mGestureSoftDropActive) {
            this.mGestureSoftDropActive = wantSoftDrop;
            this.mPersistentComponent.getGameController().setSoftDropEnabled(wantSoftDrop);
        }
    }

    private onSwipeTouchEnd(event: cc.Event.EventTouch): void {
        if (this.mGestureSoftDropActive) {
            this.mPersistentComponent.getGameController().setSoftDropEnabled(false);
        }
        this.mGestureSoftDropActive = false;

        if (!this.mGestureTouchStartPos || !this.mGestureTouchLastPos) {
            this.mGestureTouchStartPos = null;
            this.mGestureTouchLastPos = null;
            return;
        }

        // Tap to rotate (short & small movement)
        const elapsedMs = Date.now() - this.mGestureTouchStartTimeMs;
        const totalDelta = this.mGestureTouchLastPos.sub(this.mGestureTouchStartPos);
        const tapMaxTimeMs = 220;
        const tapMaxDistPx = Math.max(14, Config.BLOCK_SIZE.width * 0.35);

        if (elapsedMs <= tapMaxTimeMs && totalDelta.mag() <= tapMaxDistPx) {
            if (!this.mGameOver) {
                this.mPersistentComponent.getGameController().rotateOnce();
            }
        }

        this.mGestureTouchStartPos = null;
        this.mGestureTouchLastPos = null;
    }

    /**
     * marathonScene-style: prefer named placeholder nodes (easy to move in editor),
     * otherwise create them with clear names.
     */
    private ensureSceneNodes(): void {
        // Root containers
        this.mUiRoot = this.getOrCreateChild(this.node, 'GameUI');
        this.mUiRoot.setPosition(cc.v2(0, 0));

        this.mHudRoot = this.getOrCreateChild(this.mUiRoot, 'HUDRoot');
        this.mPlayfieldRoot = this.getOrCreateChild(this.mUiRoot, 'PlayfieldRoot');
        this.mSidePanelRoot = this.getOrCreateChild(this.mUiRoot, 'SidePanelRoot');

        // Game component holder = where playfield pieces live (kept for backward compat)
        this.mGameComponentsHolder = this.mGameComponentsHolder || this.getOrCreateChild(this.mPlayfieldRoot, 'GameRoot');

        // Auto-find required components if not wired in Inspector
        if (!this.mScoreHudComponent) {
            const hudNode = cc.find('ScoreHUD', this.mHudRoot) || this.mHudRoot;
            this.mScoreHudComponent = hudNode.getComponent(ScoreHudComponent);
        }
        if (!this.mPopupsContainer) {
            const popupsNode = cc.find('PopupsRoot', this.mUiRoot) || cc.find('PopupsContainer', this.mUiRoot);
            if (popupsNode) {
                this.mPopupsContainer = popupsNode.getComponent(PopupsContainerComponent);
            }
        }
    }

    private getOrCreateChild(parent: cc.Node, name: string): cc.Node {
        let n = parent.getChildByName(name);
        if (n) return n;
        n = new cc.Node(name);
        parent.addChild(n);
        return n;
    }
}
