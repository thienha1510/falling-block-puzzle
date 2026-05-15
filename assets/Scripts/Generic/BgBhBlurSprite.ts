/**
 * Gaussian-style box blur for the decorative `bg-bh` sprite (behind Background).
 * Loads `resources/effects/bg-bh-blur` or uses an assigned EffectAsset in the Inspector.
 */

import { GameConstants } from '../Game/GameConstants';

const EFFECT_PATH = 'effects/bg-bh-blur';

const { ccclass, property } = cc._decorator;

function findNodeDeep(root: cc.Node, name: string): cc.Node | null {
    if (root.name === name) {
        return root;
    }
    const stack: cc.Node[] = root.children.slice();
    while (stack.length > 0) {
        const cur = stack.pop() as cc.Node;
        if (cur.name === name) {
            return cur;
        }
        for (let i = 0; i < cur.children.length; i++) {
            stack.push(cur.children[i]);
        }
    }
    return null;
}

@ccclass
export default class BgBhBlurSprite extends cc.Component {
  private static sharedEffect: cc.EffectAsset | null = null;
  private static loadingEffect = false;
  private static pending: BgBhBlurSprite[] = [];

  @property({
      tooltip: 'Độ mờ theo UV (0.003–0.012). Tăng = blur mạnh hơn.',
  })
  public blurSize = GameConstants.BG_BH_BLUR_SIZE;

  @property({
      type: cc.EffectAsset,
      tooltip: 'Tùy chọn — trống thì load `resources/effects/bg-bh-blur`.',
  })
  public blurEffect: cc.EffectAsset = null;

  protected onLoad(): void {
      this.applyBlur();
  }

  public applyBlur(): void {
      const sprite = this.getComponent(cc.Sprite);
      if (!sprite || !sprite.spriteFrame) {
          return;
      }

      const effect = this.blurEffect || BgBhBlurSprite.sharedEffect;
      if (effect) {
          this.applyMaterial(sprite, effect);
          return;
      }

      if (BgBhBlurSprite.loadingEffect) {
          BgBhBlurSprite.pending.push(this);
          return;
      }

      BgBhBlurSprite.loadingEffect = true;
      cc.resources.load(EFFECT_PATH, cc.EffectAsset, (err: Error | null, asset: cc.EffectAsset) => {
          BgBhBlurSprite.loadingEffect = false;
          if (err || !asset) {
              cc.warn('[BgBhBlur] Không load được effect:', EFFECT_PATH, err);
              BgBhBlurSprite.pending.length = 0;
              return;
          }
          BgBhBlurSprite.sharedEffect = asset;
          const queue = BgBhBlurSprite.pending.slice();
          BgBhBlurSprite.pending.length = 0;
          for (let i = 0; i < queue.length; i++) {
              const inst = queue[i];
              if (inst && inst.isValid) {
                  inst.applyBlur();
              }
          }
          if (this.isValid) {
              this.applyBlur();
          }
      });
      BgBhBlurSprite.pending.push(this);
  }

  private applyMaterial(sprite: cc.Sprite, effect: cc.EffectAsset): void {
      const mat = cc.Material.create(effect, 0);
      mat.setProperty('blurSize', this.blurSize);
      const variant = cc.MaterialVariant.create(mat, sprite);
      if (variant) {
          variant.setProperty('blurSize', this.blurSize);
          sprite.setMaterial(0, variant);
      } else {
          sprite.setMaterial(0, mat);
      }
  }
}

/** Gắn blur lên node `bg-bh` dưới Canvas (4 scene). */
export function ensureBgBhBlurOnCanvas(canvas: cc.Node, blurSize?: number): void {
    const node = findNodeDeep(canvas, 'bg-bh');
    if (!node) {
        return;
    }
    let comp = node.getComponent(BgBhBlurSprite);
    if (!comp) {
        comp = node.addComponent(BgBhBlurSprite);
    }
    if (typeof blurSize === 'number') {
        comp.blurSize = blurSize;
    }
    comp.applyBlur();
}
