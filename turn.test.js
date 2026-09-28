import test from 'node:test';
import assert from 'node:assert/strict';
import { turnOwner, nextHandoff } from './public/turn.js';

test('local handoff follows setup, murder, and city phase owners', () => {
  const session = { mode:'local', activeRole:'killer' };
  assert.equal(turnOwner({ phase:'setup_support' }), 'killer');
  assert.equal(nextHandoff(session, { phase:'setup_detective' }), 'detective');
  assert.equal(nextHandoff(session, { phase:'killer_murder' }), null);
  session.activeRole = 'detective';
  assert.equal(nextHandoff(session, { phase:'city_killer' }), 'killer');
  assert.equal(nextHandoff(session, { phase:'city_detective' }), null);
});

test('question transfer goes to murderer, then back to detective', () => {
  const session = { mode:'local', activeRole:'detective' };
  assert.equal(turnOwner({ phase:'detective', pending:{id:1} }), 'killer');
  assert.equal(nextHandoff(session, { phase:'detective', pending:{id:1} }), 'killer');
  session.activeRole = 'killer';
  assert.equal(nextHandoff(session, { phase:'detective', pending:null }), 'detective');
});

test('online rooms do not trigger pass-and-play curtain', () => {
  assert.equal(nextHandoff({ mode:'online', activeRole:'killer' }, { phase:'detective' }), null);
  assert.equal(turnOwner({ phase:'finished' }), null);
});
