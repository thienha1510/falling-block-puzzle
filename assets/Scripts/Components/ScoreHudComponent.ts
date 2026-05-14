/**
 * Title: Score Hud Component
 * Description: It is used to show required infos to the user
 * Author: Md. Faizul Islam (faizul7cse@gmail.com)
 * Date: 18-05-2023 13:18
 */

import { Config } from '../Configs//Config';
import { Logger } from '../Generic/Logger';
import { Player } from '../Models/Player';
import PersistentComponent from './PersistentComponent';

const { ccclass, property } = cc._decorator;

@ccclass
export default class ScoreHudComponent extends cc.Component {
    @property(cc.Label)
    labelHighScore: cc.Label = null;

    @property(cc.Label)
    labelCurrentScoreScore: cc.Label = null;

    @property(cc.Label)
    labelRowCleared: cc.Label = null;

    @property(cc.Label)
    labelGameLevel: cc.Label = null;
    private mPlayer: Player = null;
    private mLogger: Logger = null;

    protected onLoad() {
        this.mLogger = Logger.create('ScoreHudComponent', false);
        this.mPlayer = cc.find('PersistantNode').getComponent(PersistentComponent).getPlayer();

        // Auto-bind labels by child names so the scene hierarchy can be edited without
        // manually wiring every reference in the Inspector.
        this.labelHighScore = this.labelHighScore || this.findLabel(['HighScoreValue', 'LabelHighScore', 'HighScore']);
        this.labelCurrentScoreScore =
            this.labelCurrentScoreScore || this.findLabel(['ScoreValue', 'LabelScore', 'CurrentScoreValue']);
        this.labelRowCleared =
            this.labelRowCleared || this.findLabel(['LinesValue', 'LabelLines', 'RowClearedValue']);
        this.labelGameLevel =
            this.labelGameLevel || this.findLabel(['LevelValue', 'LabelLevel', 'GameLevelValue']);
    }

    private findLabel(names: string[]): cc.Label {
        for (let i = 0; i < names.length; i++) {
            const n = cc.find(names[i], this.node);
            if (n) {
                const lab = n.getComponent(cc.Label);
                if (lab) return lab;
            }
        }
        return null;
    }

    public updateScoreHudInfos(): void {
        let currentScore: number = this.mPlayer.getRowClearedCount() * Config.scorePerRow;
        if (currentScore > this.mPlayer.getHighScore()) {
            this.mPlayer.setHighScore(currentScore);
        }
        this.updateHighScore();
        this.updateCurrentScore(currentScore);
        this.updateRowClearedScore();
        this.updateGameLevel();
    }

    private updateHighScore(): void {
        if (!this.labelHighScore) return;
        this.labelHighScore.string = this.mPlayer.getHighScore() + '';
        this.mLogger.Log('High Score: ' + this.mPlayer.getHighScore());
    }

    private updateCurrentScore(currentScore: number): void {
        if (!this.labelCurrentScoreScore) return;
        this.labelCurrentScoreScore.string = currentScore + '';
        this.mLogger.Log('Current Score: ' + currentScore);
    }

    private updateRowClearedScore(): void {
        if (!this.labelRowCleared) return;
        this.labelRowCleared.string = this.mPlayer.getRowClearedCount() + '';
        this.mLogger.Log('Row Cleared: ' + this.mPlayer.getRowClearedCount());
    }

    private updateGameLevel(): void {
        if (!this.labelGameLevel) return;
        this.labelGameLevel.string = this.mPlayer.getGameLevel() + '';
    }
}
