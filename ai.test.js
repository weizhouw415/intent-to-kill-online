import test from 'node:test';
import assert from 'node:assert/strict';
import { advanceAI, rememberHumanAnswer, roleToAct } from './ai.js';
import { act, adjacent, canKill, createGame, GROUPS, joinGame, MOTIVES, occupants, viewFor } from './game.js';

function singleGame(humanRole) {
  const computerRole = humanRole === 'killer' ? 'detective' : 'killer';
  const game = createGame('SOLO01', humanRole, 'human-token');
  game.mode = 'single';
  game.ai = { role: computerRole, humanRole, answers: [] };
  joinGame(game, computerRole, 'computer-token');
  advanceAI(game);
  return game;
}

test('computer killer performs setup and a legal first murder for a human detective', () => {
  const game = singleGame('detective');
  assert.equal(game.phase, 'setup_detective');
  assert.ok(game.secret.supporter);
  assert.equal(viewFor(game, 'detective').secret, undefined);

  act(game, 'detective', 'choose_start', { block: 5 });
  advanceAI(game);
  assert.equal(game.victims.length, 1);
  assert.ok(['evacuate', 'detective'].includes(game.phase));
  assert.equal(roleToAct(game), 'detective');
});

test('computer detective chooses a start and asks the human killer for testimony', () => {
  const game = singleGame('killer');
  assert.equal(game.phase, 'setup_support');
  act(game, 'killer', 'choose_support', { group: game.supporterOptions[0] });
  advanceAI(game);
  assert.equal(game.phase, 'killer_intimidate');
  assert.ok(Number.isInteger(game.detectiveBlock));

  for (let count = 0; count < 2; count++) {
    const target = game.civilians.find(c => !c.dead && !c.intimidated && c.block !== game.detectiveBlock);
    act(game, 'killer', 'intimidate', { id: target.id });
  }
  const victim = game.civilians.find(c => canKill(game, c.id));
  assert.ok(victim);
  act(game, 'killer', 'murder', { id: victim.id });
  advanceAI(game);

  assert.equal(game.phase, 'detective');
  assert.ok(game.pending);
  assert.equal(roleToAct(game), 'killer');
  const pending = structuredClone(game.pending);
  act(game, 'killer', 'answer', { answer: pending.truthful });
  rememberHumanAnswer(game, pending, pending.truthful);
  assert.equal(game.ai.answers.length, 1);
  advanceAI(game);
  assert.ok(game.phase === 'detective' || game.phase === 'city_killer');
});

test('online and local games are ignored by the computer turn runner', () => {
  const game = createGame('ONLINE', 'killer', 'killer-token');
  const before = structuredClone(game);
  advanceAI(game);
  assert.deepEqual(game, before);
});

test('a complete human-detective solo game advances without a stuck computer turn', () => {
  const game = singleGame('detective');
  act(game, 'detective', 'choose_start', { block: 5 });
  advanceAI(game);

  for (let step = 0; step < 300 && game.phase !== 'finished'; step++) {
    assert.equal(roleToAct(game), 'detective');
    if (game.phase === 'evacuate') {
      const civilian = occupants(game, game.detectiveBlock)[0];
      const block = Array.from({ length: 16 }, (_, index) => index).find(index =>
        adjacent(civilian.block, index) && !game.scenes.some(scene => scene.block === index) && occupants(game, index).length < 3)
        ?? Array.from({ length: 16 }, (_, index) => index).find(index =>
          !game.scenes.some(scene => scene.block === index) && occupants(game, index).length < 3);
      act(game, 'detective', 'evacuate', { id: civilian.id, block });
    } else if (game.phase === 'detective') {
      act(game, 'detective', 'end_detective');
    } else if (game.phase === 'city_detective') {
      if (game.chooseCityGroup) {
        const group = GROUPS.find(value => game.civilians.some(c => !c.dead && c.group === value));
        act(game, 'detective', 'city_choose_group', { group });
      } else {
        act(game, 'detective', 'city_done');
      }
    } else if (game.phase === 'round_end') {
      if (game.victims.length >= 5) {
        const suspect = game.civilians.find(c => !c.dead);
        act(game, 'detective', 'accuse', { id: suspect.id, motive: MOTIVES[0].id });
      } else {
        act(game, 'detective', 'next_round');
      }
    } else {
      assert.fail(`unexpected human phase: ${game.phase}`);
    }
    advanceAI(game);
  }

  assert.equal(game.phase, 'finished');
  assert.ok(['killer', 'detective'].includes(game.winner));
});

test('a complete human-killer solo game handles computer questions and final accusation', () => {
  const game = singleGame('killer');
  act(game, 'killer', 'choose_support', { group: game.supporterOptions[0] });
  advanceAI(game);

  for (let step = 0; step < 400 && game.phase !== 'finished'; step++) {
    assert.equal(roleToAct(game), 'killer');
    if (game.pending) {
      const pending = structuredClone(game.pending);
      act(game, 'killer', 'answer', { answer: pending.truthful });
      rememberHumanAnswer(game, pending, pending.truthful);
    } else if (game.phase === 'killer_intimidate') {
      const target = game.civilians.find(c => !c.dead && !c.intimidated && c.block !== game.detectiveBlock);
      act(game, 'killer', target ? 'intimidate' : 'skip_intimidation', target ? { id: target.id } : {});
    } else if (game.phase === 'killer_murder') {
      const victim = game.civilians.find(c => canKill(game, c.id));
      act(game, 'killer', victim ? 'murder' : 'skip_murder', victim ? { id: victim.id } : {});
    } else if (game.phase === 'city_killer') {
      if (game.chooseCityGroup) {
        const group = GROUPS.find(value => game.civilians.some(c => !c.dead && c.group === value));
        act(game, 'killer', 'city_choose_group', { group });
      } else {
        act(game, 'killer', 'city_done');
      }
    } else {
      assert.fail(`unexpected human phase: ${game.phase}`);
    }
    advanceAI(game);
  }

  assert.equal(game.phase, 'finished');
  assert.ok(['killer', 'detective'].includes(game.winner));
  assert.ok(game.ai.answers.length > 0);
});

test('computer killer gives a consistent decoy profile instead of always inverting answers', () => {
  const game = createGame('DECOY1', 'detective', 'human-token');
  game.mode = 'single';
  game.ai = { role: 'killer', humanRole: 'detective', answers: [] };
  joinGame(game, 'killer', 'computer-token');
  game.phase = 'detective';

  const witness = game.civilians[0];
  game.pending = { id: witness.id, questionIndex: 0, source: 'question', truthful: false, mayLie: true };
  advanceAI(game);
  const maleAnswer = /“是”/.test(game.log[0].text);

  game.pending = { id: witness.id, questionIndex: 1, source: 'question', truthful: true, mayLie: true };
  advanceAI(game);
  const femaleAnswer = /“是”/.test(game.log[0].text);

  assert.notEqual(maleAnswer, femaleAnswer);
  assert.ok(Number.isInteger(game.ai.decoyId));
});

test('computer uses legal city movement instead of immediately skipping it', () => {
  const game = singleGame('detective');
  const civilian = game.civilians[0];
  const before = civilian.block;
  game.phase = 'city_killer';
  game.chooseCityGroup = false;
  game.moveGroup = civilian.group;
  game.moveRemaining = [civilian.id];

  advanceAI(game);
  assert.notEqual(civilian.block, before);
  assert.equal(game.phase, 'city_detective');
});

test('computer detective uses legal fire station movement', () => {
  const game = createGame('FIREAI', 'killer', 'human-token');
  game.mode = 'single';
  game.ai = { role: 'detective', humanRole: 'killer', answers: [] };
  joinGame(game, 'detective', 'computer-token');
  const civilian = game.civilians[0];
  const before = civilian.block;
  game.phase = 'detective';
  game.detectiveBlock = 7;
  game.actions = ['fire'];
  game.fireGroup = civilian.group;
  game.fireRemaining = [civilian.id];

  advanceAI(game);
  assert.notEqual(civilian.block, before);
  assert.ok(game.phase === 'detective' || game.phase === 'city_killer');
});
