/**
 * RenderFlowDebugger
 * Logs the first enabled RenderComponent that has a null/undefined _assembler.
 * This helps pinpoint "Cannot read properties of null (reading '_assembler')" in render-flow.
 *
 * Attach to any always-on node (e.g. Canvas) during debugging.
 */
const { ccclass, property } = cc._decorator;

@ccclass
export default class RenderFlowDebugger extends cc.Component {
    @property({ tooltip: 'Enable one-shot scan and log', visible: true })
    enabledScan: boolean = true;

    @property({ tooltip: 'Scan delay after scene load (seconds)', visible: true })
    delaySeconds: number = 0.0;

    @property({ tooltip: 'Keep scanning every frame until found', visible: true })
    continuous: boolean = true;

    private mLogged: boolean = false;
    private mHooked: boolean = false;

    onLoad(): void {
        if (!this.enabledScan) return;
        this.scheduleOnce(() => this.hookAndScan(), Math.max(0, this.delaySeconds));
    }

    onDestroy(): void {
        if (!this.mHooked) return;
        const dir: any = cc.director as any;
        const evt = (cc as any).Director && (cc as any).Director.EVENT_BEFORE_DRAW
            ? (cc as any).Director.EVENT_BEFORE_DRAW
            : (cc as any).Director && (cc as any).Director.EVENT_AFTER_UPDATE
                ? (cc as any).Director.EVENT_AFTER_UPDATE
                : null;
        if (evt && dir && typeof dir.off === 'function') {
            dir.off(evt, this.scanOnce, this);
        }
        this.mHooked = false;
    }

    private hookAndScan(): void {
        if (this.mHooked) return;
        const dir: any = cc.director as any;
        const evt = (cc as any).Director && (cc as any).Director.EVENT_BEFORE_DRAW
            ? (cc as any).Director.EVENT_BEFORE_DRAW
            : (cc as any).Director && (cc as any).Director.EVENT_AFTER_UPDATE
                ? (cc as any).Director.EVENT_AFTER_UPDATE
                : null;
        if (evt && dir && typeof dir.on === 'function') {
            dir.on(evt, this.scanOnce, this);
            this.mHooked = true;
        }
        this.scanOnce();
    }

    private scanOnce(): void {
        if (this.mLogged || !this.enabledScan) return;
        const scene = cc.director.getScene();
        if (!scene) return;

        const hit = this.findFirstAssemblerNull(scene);
        if (hit) {
            this.mLogged = true;
            // eslint-disable-next-line no-console
            console.error(
                '[RenderFlowDebugger] Found RenderComponent with null _assembler:',
                '\n- nodePath:', hit.nodePath,
                '\n- node:', hit.node.name,
                '\n- component:', hit.compName,
                '\n- activeInHierarchy:', hit.activeInHierarchy
            );
        } else if (!this.continuous) {
            this.mLogged = true;
        }
    }

    private findFirstAssemblerNull(root: cc.Node): {
        node: cc.Node;
        nodePath: string;
        compName: string;
        activeInHierarchy: boolean;
    } | null {
        const stack: { n: cc.Node; path: string }[] = [{ n: root, path: root.name || 'Scene' }];
        while (stack.length) {
            const cur = stack.pop()!;
            const n = cur.n;
            const path = cur.path;

            // Check likely render components on this node
            const comps = n.getComponents(cc.Component);
            for (let i = 0; i < comps.length; i++) {
                const c: any = comps[i] as any;
                if (!c) continue;
                // In Creator 2.x: Sprite/Label/Graphics/Mask inherit from RenderComponent, but
                // avoid relying on instanceof in case of engine transpilation differences.
                const isRenderLike =
                    (cc as any).RenderComponent ? (c instanceof (cc as any).RenderComponent) : false;
                const hasAssemblerField = Object.prototype.hasOwnProperty.call(c, '_assembler') || '_assembler' in c;
                if (isRenderLike || hasAssemblerField) {
                    const asm = c._assembler;
                    const enabled = (c.enabledInHierarchy !== undefined) ? !!c.enabledInHierarchy : !!c.enabled;
                    if (n.activeInHierarchy && enabled && (asm === null || asm === undefined)) {
                        return {
                            node: n,
                            nodePath: path,
                            compName: c.constructor ? c.constructor.name : String(c),
                            activeInHierarchy: n.activeInHierarchy,
                        };
                    }
                }
            }

            // DFS
            const children = n.children;
            for (let i = 0; i < children.length; i++) {
                const ch = children[i];
                stack.push({ n: ch, path: path + '/' + ch.name });
            }
        }
        return null;
    }
}

