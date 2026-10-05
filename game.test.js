import test from 'node:test';
import assert from 'node:assert/strict';
import { act, canKill, CIVILIAN_DECK, createGame, GROUPS, joinGame, MOTIVES, occupants, viewFor } from './game.js';

function ready() {
  const game = createGame('ABCDEF', 'killer', 'killer-token');
  joinGame(game, 'detective', 'detective-token');
  act(game, 'killer', 'choose_support', { group: game.supporterOptions[0] });
  act(game, 'detective', 'choose_start', { block: 5 });
  return game;
}
test('54 civilians have balanced groups and unique physical descriptions', () => {
  assert.equal(CIVILIAN_DECK.length, 54);
  for (const group of GROUPS) assert.equal(CIVILIAN_DECK.filter(c => c.group === group).length, 6);
  assert.equal(new Set(CIVILIAN_DECK.map(c => [c.sex,c.age,c.build,c.height].join('|'))).size, 54);
});
test('detective state never includes hidden identity, motive, supporter, or answer truth', () => {
  const game = ready();
  assert.equal(viewFor(game, 'detective').secret, undefined);
  assert.equal(viewFor(game, 'detective').supporterOptions, undefined);
  const target = game.civilians.find(c => c.block !== game.detectiveBlock);
  act(game, 'killer', 'intimidate', { id: target.id });
  const target2 = game.civilians.find(c => c.block !== game.detectiveBlock && !c.intimidated);
  act(game, 'killer', 'intimidate', { id: target2.id });
  const victim = game.civilians.find(c => canKill(game, c.id));
  act(game, 'killer', 'murder', { id: victim.id });
  while (game.phase === 'evacuate') {
    const person = occupants(game, game.detectiveBlock)[0];
    const destination = Array.from({length:16},(_,i)=>i).find(i => Math.abs(Math.floor(i/4)-Math.floor(person.block/4))+Math.abs(i%4-person.block%4)===1 && !game.scenes.some(s=>s.block===i) && occupants(game,i).length<3);
    act(game, 'detective', 'evacuate', { id:person.id, block:destination });
  }
  const witness = occupants(game, game.detectiveBlock).find(c => !c.intimidated);
  if (witness) {
    act(game, 'detective', 'question', { id:witness.id, question:0 });
    const view = viewFor(game, 'detective');
    assert.equal(view.pending.truthful, undefined);
    assert.equal(view.pending.mayLie, undefined);
    assert.equal(view.secret, undefined);
  }
});
test('each of the six motives blocks an invalid target', () => {
  const game = ready();
  const target = game.civilians.find(c => c.block !== 5 && c.id !== game.secret.killerId);
  game.secret.motive = 'sadist'; target.intimidated = true;
  assert.equal(canKill(game, target.id), false);
  target.intimidated = false;
  game.secret.motive = 'cutthroat'; target.block = 6;
  assert.equal(canKill(game, target.id), false);
  game.secret.motive = 'vigilante'; target.block = 1;
  assert.equal(canKill(game, target.id), false);
  game.secret.motive = 'killer'; target.block = 0;
  const second = game.civilians.find(c => c.id !== target.id && c.id !== game.secret.killerId);
  second.block = 0;
  assert.equal(canKill(game, target.id), false);
  second.block = 15;
  game.secret.motive = 'maniac';
  game.victims = [{id:second.id,round:1}];
  if (second.sex !== target.sex) assert.equal(canKill(game, target.id), false);
  game.secret.motive = 'terrorist';
  second.group = target.group;
  assert.equal(canKill(game, target.id), false);
  assert.equal(MOTIVES.length, 6);
});
test('a legal murder enters detective investigation and the second skipped murder loses', () => {
  const game = ready();
  const available = () => game.civilians.find(c => !c.dead && !c.intimidated && c.block !== game.detectiveBlock);
  act(game, 'killer', 'intimidate', { id:available().id });
  act(game, 'killer', 'intimidate', { id:available().id });
  assert.equal(game.phase, 'killer_murder');
  const victim = game.civilians.find(c => canKill(game,c.id));
  assert.ok(victim);
  act(game, 'killer', 'murder', { id:victim.id });
  assert.equal(game.victims.length, 1);
  assert.ok(['evacuate','detective'].includes(game.phase));
  assert.equal(game.detectiveBlock, victim.block);
  game.phase = 'killer_murder';
  act(game, 'killer', 'skip_murder');
  game.phase = 'killer_murder';
  act(game, 'killer', 'skip_murder');
  assert.equal(game.winner, 'detective');
});
test('a drawn group with no civilians lets the active player choose a present group', () => {
  const game = ready();
  game.phase = 'detective';
  const empty = '医疗';
  for (const c of game.civilians) if (c.group === empty) c.group = '权威';
  game.groupPool = [empty];
  act(game, 'detective', 'end_detective');
  assert.equal(game.phase, 'city_killer');
  assert.equal(game.chooseCityGroup, true);
  const present = game.civilians[0].group;
  act(game, 'killer', 'city_choose_group', { group: present });
  assert.equal(game.moveGroup, present);
  assert.ok(game.moveRemaining.length > 0);
});
test('every game action adds a structured role-aware action record', () => {
  const game = createGame('LOG001', 'killer', 'killer-token');
  joinGame(game, 'detective', 'detective-token');
  assert.equal(game.actionLog.length, 0);

  act(game, 'killer', 'choose_support', { group:game.supporterOptions[0] });
  assert.deepEqual(
    { role:game.actionLog[0].role, type:game.actionLog[0].type, label:game.actionLog[0].label },
    { role:'killer', type:'choose_support', label:'完成秘密设定' },
  );

  act(game, 'detective', 'choose_start', { block:5 });
  assert.equal(game.actionLog.length, 2);
  assert.equal(game.actionLog[0].role, 'detective');
  assert.equal(game.actionLog[0].type, 'choose_start');
  assert.match(game.actionLog[0].text, /侦探从市政广场开始调查/);
  assert.equal(viewFor(game, 'killer').actionLog.length, 2);
  assert.equal(viewFor(game, 'detective').actionLog.length, 2);
});
test('action records prefer the action detail over automatic phase messages', () => {
  const game = ready();
  const available = () => game.civilians.find(c => !c.dead && !c.intimidated && c.block !== game.detectiveBlock);
  act(game, 'killer', 'intimidate', { id:available().id });
  act(game, 'killer', 'intimidate', { id:available().id });
  const victim = game.civilians.find(c => canKill(game, c.id));
  act(game, 'killer', 'murder', { id:victim.id });
  assert.equal(game.actionLog[0].type, 'murder');
  assert.match(game.actionLog[0].text, /命案发生/);
  assert.doesNotMatch(game.actionLog[0].text, /须先疏散/);
});

test('a pending testimony blocks the detective from moving or checking surveillance', () => {
  const game = ready();
  game.phase = 'detective';
  game.detectiveBlock = 5;
  game.surveillance = game.civilians[0].id;
  game.pending = { id: game.civilians[1].id, questionIndex: 0, source: 'question', truthful: true, mayLie: true };

  assert.throws(() => act(game, 'detective', 'move_detective', { block: 4 }), /请等待凶手回答/);
  assert.throws(() => act(game, 'detective', 'surveil_check'), /请等待凶手回答/);
  act(game, 'killer', 'answer', { answer: true });
  act(game, 'detective', 'move_detective', { block: 4 });
  assert.equal(game.detectiveBlock, 4);
});

test('fire station movement must finish before any other detective operation', () => {
  const game = ready();
  game.phase = 'detective';
  game.detectiveBlock = 7;
  game.groupPool = [game.civilians[0].group];
  game.surveillance = game.civilians[1].id;
  act(game, 'detective', 'fire');
  assert.ok(game.fireGroup);

  // Even after every selected civilian has been handled, the action remains open
  // until the player explicitly finishes it.
  game.fireRemaining = [];
  assert.throws(() => act(game, 'detective', 'move_detective', { block: 6 }), /请先完成消防局移动/);
  assert.throws(() => act(game, 'detective', 'surveil_check'), /请先完成消防局移动/);
  assert.throws(() => act(game, 'detective', 'end_detective'), /请先完成消防局移动/);

  act(game, 'detective', 'fire_done');
  act(game, 'detective', 'move_detective', { block: 6 });
  assert.equal(game.detectiveBlock, 6);
});

test('early accusation is unlocked by completed round count, not victim count', () => {
  const game = ready();
  game.phase = 'round_end';
  game.round = 3;
  game.victims = game.civilians.slice(0, 2).map(c => ({ id: c.id, round: 1 }));
  act(game, 'detective', 'accuse', { id: game.secret.killerId, motive: game.secret.motive });
  assert.equal(game.winner, 'detective');
});

test('three victims do not allow an accusation before the end of round three', () => {
  const game = ready();
  game.phase = 'round_end';
  game.round = 2;
  game.victims = game.civilians.slice(0, 3).map(c => ({ id: c.id, round: 1 }));
  assert.throws(
    () => act(game, 'detective', 'accuse', { id: game.secret.killerId, motive: game.secret.motive }),
    /至少完成三回合/,
  );
});

test('the state machine never starts a seventh round', () => {
  const game = ready();
  game.phase = 'round_end';
  game.round = 6;
  game.victims = game.civilians.slice(0, 4).map(c => ({ id: c.id, round: 1 }));
  assert.throws(() => act(game, 'detective', 'next_round'), /第六回合结束后不能继续/);
});

test('an empty fire station draw follows city movement semantics', () => {
  const game = ready();
  game.phase = 'detective';
  game.detectiveBlock = 7;
  const empty = GROUPS.find(group => !game.civilians.some(c => !c.dead && c.group === group));
  const group = empty || GROUPS[0];
  if (!empty) for (const civilian of game.civilians) if (civilian.group === group) civilian.group = GROUPS[1];
  game.groupPool = [group];

  act(game, 'detective', 'fire');
  assert.equal(game.firePick, true);
  assert.equal(game.groupPool.includes(group), false);
  const present = game.civilians[0].group;
  act(game, 'detective', 'fire_choose_group', { group: present });
  assert.equal(game.fireGroup, present);
});
