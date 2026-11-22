'use strict';

const NO_INPUT = { up: false, down: false, left: false, right: false, hb: false };
const KEYMAP = { ArrowUp: 'up', KeyW: 'up', ArrowDown: 'down', KeyS: 'down', ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right', Space: 'hb' };

function createDrivingInput() {
  const keys = new Set();
  const state = { ...NO_INPUT };
  const refresh = () => {
    Object.assign(state, NO_INPUT);
    for (const code of keys) state[KEYMAP[code]] = true;
  };
  return {
    state,
    key(code, held) {
      if (held) keys.add(code); else keys.delete(code);
      refresh();
    },
    clear() {
      keys.clear();
      refresh();
    },
  };
}
