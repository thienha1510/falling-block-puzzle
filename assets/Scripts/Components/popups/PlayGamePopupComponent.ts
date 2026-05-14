/**
 * Title: Play Popup
 * Description: Enter into game from this popup
 * Author: Md. Faizul Islam (faizul7cse@gmail.com)
 * Date: 18-05-2023 13:44
 */

import { Constants } from '../../Constants';
import { Helper } from '../../Generic/Helper';
import PersistentComponent from '../PersistentComponent';
import PopupComponent from './PopupComponent';

const { ccclass, property } = cc._decorator;

@ccclass
export default class PlayGamePopupComponent extends cc.Component {
    @property(cc.Button)
    buttonPlay: cc.Button = null;

    private mPersistentComponent: PersistentComponent = null;

    protected onLoad(): void {
        this.mPersistentComponent = cc.find('PersistantNode').getComponent(PersistentComponent);

        // Auto-bind by child name to reduce Inspector wiring.
        this.buttonPlay =
            this.buttonPlay ||
            (cc.find('ButtonPlay', this.node) ? cc.find('ButtonPlay', this.node).getComponent(cc.Button) : null);

        if (!this.buttonPlay) {
            const btn = this.node.getComponent(cc.Button);
            if (btn) this.buttonPlay = btn;
        }

        if (!this.buttonPlay) {
            // Scene can be edited freely; popup stays functional only when a play button exists.
            return;
        }

        this.buttonPlay.clickEvents.push(
            Helper.getEventHandler(this.node, 'PlayGamePopupComponent', 'OnPlayPressed')
        );
        this.setPlayButtonInteractibility(false);
    }

    public initialize(): void {
        this.setPlayButtonInteractibility(true);
    }

    OnPlayPressed() {
        this.setPlayButtonInteractibility(false);
        this.mPersistentComponent.node.emit(Constants.EVENTS.PLAY_TETRIS);
        this.getComponent(PopupComponent).hidePopup();
    }

    setPlayButtonInteractibility(isInteractible: boolean): void {
        if (!this.buttonPlay) return;
        this.buttonPlay.interactable = isInteractible;
    }
}
