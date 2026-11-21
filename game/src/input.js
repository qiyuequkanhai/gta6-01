// Keyboard and mouse input for Vice Bay. Held keys are read every frame; one-shot
// presses (pause, interact, mute, confirm) are queued as bit flags and taken once.
export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_MUTE = 8;

const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE']);
const MUTE = new Set(['KeyM']);

export function createInput(canvas) {
  const keys = new Set();
  let actions = 0;
  let mouseX = 0;
  let mouseY = 0;
  let mouseDown = false;
  let clicked = false;

  window.addEventListener('keydown', (event) => {
    if (CONFIRM.has(event.code)) {
      if (!event.repeat) actions |= ACTION_CONFIRM;
      event.preventDefault();
    } else if (PAUSE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_PAUSE;
      event.preventDefault();
    } else if (INTERACT.has(event.code)) {
      if (!event.repeat) actions |= ACTION_INTERACT;
    } else if (MUTE.has(event.code)) {
      if (!event.repeat) actions |= ACTION_MUTE;
    } else if (event.code.startsWith('Arrow')) {
      event.preventDefault();
    }
    keys.add(event.code);
  });
  window.addEventListener('keyup', (event) => keys.delete(event.code));
  window.addEventListener('blur', () => keys.clear());

  canvas.addEventListener('pointermove', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
  });
  canvas.addEventListener('pointerdown', (event) => {
    const rect = canvas.getBoundingClientRect();
    mouseX = event.clientX - rect.left;
    mouseY = event.clientY - rect.top;
    mouseDown = true;
    clicked = true;
  });
  window.addEventListener('pointerup', () => {
    mouseDown = false;
  });

  function held(...codes) {
    for (const code of codes) if (keys.has(code)) return true;
    return false;
  }

  return {
    held,
    up() { return held('KeyW', 'ArrowUp'); },
    down() { return held('KeyS', 'ArrowDown'); },
    left() { return held('KeyA', 'ArrowLeft'); },
    right() { return held('KeyD', 'ArrowRight'); },
    run() { return held('ShiftLeft', 'ShiftRight'); },
    mouse() { return { x: mouseX, y: mouseY, down: mouseDown }; },
    takeClick() {
      const c = clicked;
      clicked = false;
      return c;
    },
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
