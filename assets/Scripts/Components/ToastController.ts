/**
 * Title: ToastController
 * Description: Gắn lên root prefab **Toast** — node con `Desc` (Label) hiển thị nội dung tạm thời rồi tự ẩn.
 */

const { ccclass } = cc._decorator;

@ccclass
export default class ToastController extends cc.Component {
    private _descLabel: cc.Label | null = null;

    protected onLoad(): void {
        const desc = this.findDeep(this.node, 'Desc');
        if (desc) {
            this._descLabel = desc.getComponent(cc.Label) || desc.getComponentInChildren(cc.Label);
        }
        this.node.active = false;
    }

    /** Hiện toast `durationSec` giây (mặc định 2). Gọi lại sẽ reset hẹn giờ ẩn. */
    public show(message: string, durationSec = 2): void {
        if (this._descLabel) {
            this._descLabel.string = message;
        }
        this.node.active = true;
        this.unschedule(this.hide);
        this.scheduleOnce(this.hide, Math.max(0.05, durationSec));
    }

    public hide(): void {
        this.unschedule(this.hide);
        if (this.node && this.node.isValid) {
            this.node.active = false;
        }
    }

    private findDeep(root: cc.Node, name: string): cc.Node | null {
        if (!root || !root.isValid) {
            return null;
        }
        if (root.name === name) {
            return root;
        }
        const kids = root.children;
        if (!kids) {
            return null;
        }
        for (let i = 0; i < kids.length; i++) {
            const f = this.findDeep(kids[i], name);
            if (f) {
                return f;
            }
        }
        return null;
    }
}
