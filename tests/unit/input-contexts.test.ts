import { afterEach, describe, expect, it, vi } from 'vitest';
import { InputManager } from '@/core/input/InputManager';
import { withBindingOverrides } from '@/core/input/Bindings';
import { BuildSession } from '@/building/BuildSession';

class FakeInput extends EventTarget {}
class FakeEditable extends EventTarget {
  isContentEditable = true;
}
function fixture() {
  const win = new EventTarget();
  const doc = new EventTarget() as EventTarget & { pointerLockElement?: unknown };
  vi.stubGlobal('window', win);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('HTMLInputElement', FakeInput);
  vi.stubGlobal('HTMLTextAreaElement', FakeInput);
  vi.stubGlobal('HTMLSelectElement', FakeInput);
  const canvas = new EventTarget() as HTMLCanvasElement & { requestPointerLock(): Promise<void> };
  canvas.requestPointerLock = async () => undefined;
  return { input: new InputManager(canvas, { bypassPointerLock: true }), win };
}
const key = (type: string, code: string, target?: EventTarget) => {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'code', { value: code });
  if (target) Object.defineProperty(event, 'target', { value: target });
  return event;
};
const mouse = (type: string, button: number) => {
  const event = new Event(type);
  Object.defineProperty(event, 'button', { value: button });
  return event;
};

afterEach(() => vi.unstubAllGlobals());

describe('contextual physical input', () => {
  it('rearms LMB after build interruption and does not leak placement into fire', () => {
    const { input, win } = fixture();
    input.setContext('build-placement');
    win.dispatchEvent(mouse('mousedown', 0));
    expect(input.consumePressed('fire')).toBe(true);
    input.setContext('play');
    expect(input.isDown('fire')).toBe(false);
    win.dispatchEvent(mouse('mouseup', 0));
    win.dispatchEvent(mouse('mousedown', 0));
    expect(input.consumePressed('fire')).toBe(true);
    input.dispose();
  });

  it('keeps sprint held while either alias remains down', () => {
    const { input, win } = fixture();
    win.dispatchEvent(key('keydown', 'ShiftLeft'));
    win.dispatchEvent(key('keydown', 'ShiftRight'));
    win.dispatchEvent(key('keyup', 'ShiftLeft'));
    expect(input.isDown('sprint')).toBe(true);
    win.dispatchEvent(key('keyup', 'ShiftRight'));
    expect(input.isDown('sprint')).toBe(false);
    input.dispose();
  });

  it('allows menu Escape while movement stays unavailable', () => {
    const { input, win } = fixture();
    input.setContext('menu');
    win.dispatchEvent(key('keydown', 'KeyW'));
    win.dispatchEvent(key('keydown', 'Escape'));
    expect(input.isDown('forward')).toBe(false);
    expect(input.consumePressed('cancel')).toBe(true);
    input.dispose();
  });

  it('applies remapped keys and suppresses a key held during remapping', () => {
    const { input, win } = fixture();
    win.dispatchEvent(key('keydown', 'KeyB'));
    input.setBindings(withBindingOverrides({ 'play:build': 'KeyN' }));
    expect(input.isDown('build')).toBe(false);
    win.dispatchEvent(key('keyup', 'KeyB'));
    win.dispatchEvent(key('keydown', 'KeyN'));
    expect(input.consumePressed('build')).toBe(true);
    input.dispose();
  });

  it('does not emit movement from a catalog text field', () => {
    const { input, win } = fixture();
    input.setContext('catalog');
    const field = new FakeInput();
    win.dispatchEvent(key('keydown', 'KeyW', field));
    expect(input.isDown('forward')).toBe(false);
    input.dispose();
  });

  it('leaves editable menu controls to their own keyboard handling', () => {
    const { input, win } = fixture();
    input.setContext('menu');
    const editableTargets = [new FakeInput(), new FakeEditable()];
    for (const target of editableTargets) {
      const event = key('keydown', 'Escape', target);
      win.dispatchEvent(event);
      expect(input.consumePressed('cancel')).toBe(false);
      expect(event.defaultPrevented).toBe(false);
    }

    const nonEditable = new EventTarget();
    input.setContext('play');
    const space = key('keydown', 'Space', nonEditable);
    win.dispatchEvent(space);
    expect(space.defaultPrevented).toBe(true);
    expect(input.consumePressed('jump')).toBe(true);
    input.dispose();
  });

  it('consumes one physical V press once and enters relocation in the same build tick', () => {
    const { input, win } = fixture();
    const session = new BuildSession();
    session.enter('rifle');
    session.selectPiece('crate');
    input.setContext('build-placement');
    win.dispatchEvent(key('keydown', 'KeyV'));
    if (input.consumePressed('relocate')) session.beginRelocation('crate-1');
    expect(session.current).toMatchObject({ state: 'relocation', selectedInstanceId: 'crate-1' });
    expect(input.consumePressed('relocate')).toBe(false);
    win.dispatchEvent(key('keyup', 'KeyV'));
    input.dispose();
  });
});
