// ONE-SHOT: do not run twice on the same marathonScene.fire (duplicates Overlay children).
const fs = require('fs');
const path = require('path');
const firePath = path.join(__dirname, '..', 'assets', 'Scenes', 'marathonScene.fire');
const j = JSON.parse(fs.readFileSync(firePath, 'utf8'));
const nid = (id) => ({ __id__: id });

function emptyNode(name, parentId, childrenIds, pos, uuid) {
    return {
        __type__: 'cc.Node',
        _name: name,
        _objFlags: 0,
        _parent: { __id__: parentId },
        _children: childrenIds.map((c) => nid(c)),
        _active: true,
        _components: [],
        _prefab: null,
        _opacity: 255,
        _color: { __type__: 'cc.Color', r: 255, g: 255, b: 255, a: 255 },
        _contentSize: { __type__: 'cc.Size', width: 0, height: 0 },
        _anchorPoint: { __type__: 'cc.Vec2', x: 0.5, y: 0.5 },
        _trs: { __type__: 'TypedArray', ctor: 'Float64Array', array: pos },
        _eulerAngles: { __type__: 'cc.Vec3', x: 0, y: 0, z: 0 },
        _skewX: 0,
        _skewY: 0,
        _is3DNode: false,
        _groupIndex: 0,
        groupIndex: 0,
        _id: uuid,
    };
}

const I = { TopHUD: 6, BoardRoot: 8, HoldPanel: 9, NextPanel: 10, OverlayRoot: 20 };
let next = j.length;
const alloc = () => next++;
const u = () =>
    'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        const v = c === 'x' ? r : (r & 0x3) | 0x8;
        return v.toString(16);
    });

const scorePanel = alloc();
const crown = alloc(),
    bestCap = alloc(),
    bestVal = alloc(),
    scoreCap = alloc(),
    scoreVal = alloc();
const linesPanel = alloc();
const capL = alloc(),
    valL = alloc();
const levelPanel = alloc();
const capLv = alloc(),
    valLv = alloc();
const topChildren = [scorePanel, linesPanel, levelPanel];

const boardTouch = alloc(),
    boardG = alloc();
const holdHeader = alloc(),
    holdG = alloc();
const nextHeader = alloc();
const ns0 = alloc(),
    ns0g = alloc();
const ns1 = alloc(),
    ns1g = alloc();
const ns2 = alloc(),
    ns2g = alloc();
const so = alloc(),
    po = alloc(),
    go = alloc();

const Z = [0, 0, 0, 0, 0, 0, 1, 1, 1, 1];
const newObjs = [];

newObjs.push(emptyNode('ScorePanel', I.TopHUD, [crown, bestCap, bestVal, scoreCap, scoreVal], Z, u()));
newObjs.push(emptyNode('Crown', scorePanel, [], Z, u()));
newObjs.push(emptyNode('BestCap', scorePanel, [], Z, u()));
newObjs.push(emptyNode('BestVal', scorePanel, [], Z, u()));
newObjs.push(emptyNode('ScoreCap', scorePanel, [], Z, u()));
newObjs.push(emptyNode('ScoreVal', scorePanel, [], Z, u()));

newObjs.push(emptyNode('LinesPanel', I.TopHUD, [capL, valL], Z, u()));
newObjs.push(emptyNode('cap', linesPanel, [], Z, u()));
newObjs.push(emptyNode('val', linesPanel, [], Z, u()));

newObjs.push(emptyNode('LevelPanel', I.TopHUD, [capLv, valLv], Z, u()));
newObjs.push(emptyNode('cap', levelPanel, [], Z, u()));
newObjs.push(emptyNode('val', levelPanel, [], Z, u()));

newObjs.push(emptyNode('BoardTouch', I.BoardRoot, [], Z, u()));
newObjs.push(emptyNode('BoardGraphics', I.BoardRoot, [], Z, u()));

newObjs.push(emptyNode('header', I.HoldPanel, [], Z, u()));
newObjs.push(emptyNode('HoldGraphics', I.HoldPanel, [], Z, u()));

newObjs.push(emptyNode('header', I.NextPanel, [], Z, u()));
newObjs.push(emptyNode('NextSlot0', I.NextPanel, [ns0g], Z, u()));
newObjs.push(emptyNode('NextSlotG0', ns0, [], Z, u()));
newObjs.push(emptyNode('NextSlot1', I.NextPanel, [ns1g], Z, u()));
newObjs.push(emptyNode('NextSlotG1', ns1, [], Z, u()));
newObjs.push(emptyNode('NextSlot2', I.NextPanel, [ns2g], Z, u()));
newObjs.push(emptyNode('NextSlotG2', ns2, [], Z, u()));

newObjs.push(emptyNode('StartOverlay', I.OverlayRoot, [], Z, u()));
newObjs.push(emptyNode('PauseOverlay', I.OverlayRoot, [], Z, u()));
newObjs.push(emptyNode('GameOverOverlay', I.OverlayRoot, [], Z, u()));

j[I.TopHUD]._children = topChildren.map(nid);
j[I.BoardRoot]._children = [nid(boardTouch), nid(boardG)];
j[I.HoldPanel]._children = [nid(holdHeader), nid(holdG)];
j[I.NextPanel]._children = [nid(nextHeader), nid(ns0), nid(ns1), nid(ns2)];
const existingOverlayKids = (j[I.OverlayRoot]._children || []).map((c) => c.__id__);
j[I.OverlayRoot]._children = [...existingOverlayKids.map(nid), nid(so), nid(po), nid(go)];

j.push(...newObjs);
fs.writeFileSync(firePath, JSON.stringify(j, null, 2), 'utf8');
console.log('OK: appended', newObjs.length, 'nodes; scene object count', j.length);
