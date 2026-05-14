/**
 * Title: Game Over popup
 * Description: Game Over popup. Player can play again from this popup as well.
 * Author: Md. Faizul Islam (faizul7cse@gmail.com)
 * Date: 18-05-2023 13:45
 */

import { Config } from '../../Configs/Config';
import { Constants } from '../../Constants';
import { Helper } from '../../Generic/Helper';
import PersistentComponent from '../PersistentComponent';
import PopupComponent from './PopupComponent';

const { ccclass, property } = cc._decorator;

@ccclass
export default class GameOverPopupComponent extends cc.Component {
    @property(cc.Label)
    labelHighScore: cc.Label = null;

    @property(cc.Label)
    labelCurrentScore: cc.Label = null;

    @property(cc.Button)
    buttonPlayAgain: cc.Button = null;

    private mPersistentComponent: PersistentComponent = null;

    protected onLoad(): void {
        this.mPersistentComponent = cc.find('PersistantNode').getComponent(PersistentComponent);

        // Auto-bind by child name to reduce Inspector wiring.
        this.labelHighScore =
            this.labelHighScore ||
            (cc.find('HighScoreValue', this.node)
                ? cc.find('HighScoreValue', this.node).getComponent(cc.Label)
                : null);
        this.labelCurrentScore =
            this.labelCurrentScore ||
            (cc.find('ScoreValue', this.node) ? cc.find('ScoreValue', this.node).getComponent(cc.Label) : null);
        this.buttonPlayAgain =
            this.buttonPlayAgain ||
            (cc.find('ButtonPlayAgain', this.node)
                ? cc.find('ButtonPlayAgain', this.node).getComponent(cc.Button)
                : null);

        if (!this.buttonPlayAgain) {
            const btn = this.node.getComponent(cc.Button);
            if (btn) this.buttonPlayAgain = btn;
        }

        if (!this.buttonPlayAgain) {
            // Scene can be edited freely; popup stays functional only when a play-again button exists.
            return;
        }

        this.buttonPlayAgain.clickEvents.push(
            Helper.getEventHandler(this.node, 'GameOverPopupComponent', 'OnPlayAgainPressed')
        );
        this.setPlayButtonInteractibility(false);
    }

    public initialize(): void {
        let player = this.mPersistentComponent.getPlayer();
        if (this.labelHighScore) this.labelHighScore.string = player.getHighScore() + '';
        if (this.labelCurrentScore)
            this.labelCurrentScore.string = player.getRowClearedCount() * Config.scorePerRow + '';
        this.setPlayButtonInteractibility(true);
    }

    OnPlayAgainPressed() {
        console.log('OnPlayAgainPressed');
        this.setPlayButtonInteractibility(false);
        this.mPersistentComponent.node.emit(Constants.EVENTS.PLAY_TETRIS);
        this.getComponent(PopupComponent).hidePopup();
    }

    setPlayButtonInteractibility(isInteractible: boolean): void {
        if (!this.buttonPlayAgain) return;
        this.buttonPlayAgain.interactable = isInteractible;
    }
}
