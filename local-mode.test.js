import test from 'node:test';
import assert from 'node:assert/strict';
import { act, createGame, joinGame, occupants, viewFor } from './game.js';
import { nextHandoff } from './public/turn.js';

test('pass-and-play changes role on setup and witness answer while preserving private views', () => {
  const game = createGame('LOCAL1', 'killer', 'killer-secret-token');
  joinGame(game, 'detective', 'detective-secret-token');
  const session = { mode:'local', activeRole:'killer' };
  assert.ok(viewFor(game, 'killer').secret);
  assert.equal(viewFor(game, 'detective').secret, undefined);

  act(game, 'killer', 'choose_support', { group:game.supporterOptions[0] });
  assert.equal(nextHandoff(session, viewFor(game, 'killer')), 'detective');
  session.activeRole = 'detective';
  act(game, 'detective', 'choose_start', { block:5 });
  assert.equal(nextHandoff(session, viewFor(game, 'detective')), 'killer');
  session.activeRole = 'killer';

  game.phase = 'detective';
  const block = game.civilians[0].block;
  game.detectiveBlock = block;
  const witness = occupants(game, block)[0];
  act(game, 'detective', 'question', { id:witness.id, question:0 });
  assert.equal(nextHandoff({ mode:'local', activeRole:'detective' }, viewFor(game, 'detective')), 'killer');
  assert.equal(viewFor(game, 'detective').pending.truthful, undefined);
  const truth = viewFor(game, 'killer').pending.truthful;
  act(game, 'killer', 'answer', { answer:truth });
  assert.equal(nextHandoff(session, viewFor(game, 'killer')), 'detective');
  assert.equal(viewFor(game, 'detective').secret, undefined);
});
