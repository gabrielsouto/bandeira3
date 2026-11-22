'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');

const createInput = vm.runInNewContext(
  readFileSync(join(__dirname, '..', 'js', 'input.js'), 'utf8') + '\ncreateDrivingInput'
);

test('W e seta podem acelerar juntas e uma pausa libera todas as teclas', () => {
  const input = createInput();
  input.key('KeyW', true);
  input.key('ArrowUp', true);
  input.key('KeyW', false);
  assert.equal(input.state.up, true);
  input.key('ArrowUp', false);
  assert.equal(input.state.up, false);
  input.key('KeyD', true);
  input.clear();
  assert.equal(Object.values(input.state).some(Boolean), false);
});
