import { act, adjacent, BUILDINGS, canKill, GROUPS, MOTIVES, occupants, QUESTIONS } from './game.js';

export function roleToAct(game) {
  if (!game || game.phase === 'waiting' || game.phase === 'finished') return null;
  if (game.pending) return 'killer';
  if (['setup_support', 'killer_intimidate', 'killer_murder', 'city_killer'].includes(game.phase)) return 'killer';
  if (['setup_detective', 'evacuate', 'detective', 'city_detective', 'round_end'].includes(game.phase)) return 'detective';
  return null;
}

function distance(a, b) {
  return Math.abs(Math.floor(a / 4) - Math.floor(b / 4)) + Math.abs(a % 4 - b % 4);
}

function presentGroups(game) {
  return GROUPS.filter(group => game.civilians.some(c => !c.dead && c.group === group));
}

function largestGroup(game, options = presentGroups(game)) {
  return [...options].sort((a, b) => {
    const count = group => game.civilians.filter(c => !c.dead && c.group === group).length;
    return count(b) - count(a) || a.localeCompare(b, 'zh-CN');
  })[0];
}

function validCivilianDestinations(game, from) {
  return Array.from({ length: 16 }, (_, block) => block)
    .filter(block => adjacent(from, block))
    .filter(block => !game.scenes.some(scene => scene.block === block))
    .filter(block => occupants(game, block).length < 3);
}

function chooseCivilianMove(game, ids, role) {
  const rankedSuspects = new Map(candidateScores(game).map((item, index) => [item.candidate.id, index]));
  const options = ids.flatMap(id => {
    const civilian = game.civilians.find(c => !c.dead && c.id === id);
    if (!civilian) return [];
    return validCivilianDestinations(game, civilian.block).map(block => ({ civilian, block }));
  });
  return options.sort((a, b) => {
    if (role === 'detective') {
      const suspectOrder = (rankedSuspects.get(a.civilian.id) ?? 99) - (rankedSuspects.get(b.civilian.id) ?? 99);
      return suspectOrder || distance(a.block, game.detectiveBlock) - distance(b.block, game.detectiveBlock)
        || occupants(game, a.block).length - occupants(game, b.block).length;
    }
    const aIsKiller = a.civilian.id === game.secret.killerId;
    const bIsKiller = b.civilian.id === game.secret.killerId;
    if (aIsKiller !== bIsKiller) return aIsKiller ? -1 : 1;
    return distance(b.block, game.detectiveBlock) - distance(a.block, game.detectiveBlock)
      || occupants(game, a.block).length - occupants(game, b.block).length;
  })[0];
}

function computerTestimony(game, pending) {
  if (!pending.mayLie) return pending.truthful;
  let decoy = game.civilians.find(c => !c.dead && c.id === game.ai.decoyId);
  if (!decoy || decoy.id === game.secret.killerId) {
    const killer = game.civilians.find(c => c.id === game.secret.killerId);
    const traits = ['sex', 'age', 'build', 'height'];
    decoy = game.civilians
      .filter(c => !c.dead && c.id !== game.secret.killerId)
      .sort((a, b) => traits.filter(key => b[key] !== killer[key]).length - traits.filter(key => a[key] !== killer[key]).length || a.id - b.id)[0];
    game.ai.decoyId = decoy?.id;
  }
  const question = QUESTIONS[pending.questionIndex];
  return question && decoy ? decoy[question[0]] === question[1] : pending.truthful;
}

function evacuationDestination(game, from) {
  const adjacentBlocks = validCivilianDestinations(game, from);
  if (adjacentBlocks.length) return adjacentBlocks.sort((a, b) => occupants(game, a).length - occupants(game, b).length)[0];
  return Array.from({ length: 16 }, (_, block) => block)
    .filter(block => !game.scenes.some(scene => scene.block === block))
    .filter(block => occupants(game, block).length < 3)
    .sort((a, b) => distance(from, a) - distance(from, b) || occupants(game, a).length - occupants(game, b).length)[0];
}

function candidateScores(game) {
  const answers = game.ai?.answers || [];
  return game.civilians
    .filter(candidate => !candidate.dead)
    .map(candidate => {
      let score = 0;
      for (const evidence of answers) {
        const question = QUESTIONS[evidence.questionIndex];
        if (!question) continue;
        const matches = candidate[question[0]] === question[1];
        score += matches === evidence.answer ? 1 : -0.4;
      }
      return { candidate, score };
    })
    .sort((a, b) => b.score - a.score || a.candidate.id - b.candidate.id);
}

function bestQuestion(game) {
  const candidates = candidateScores(game);
  const used = new Set((game.ai?.answers || []).map(answer => answer.questionIndex));
  return QUESTIONS.map((question, index) => {
    const yes = candidates.filter(item => item.candidate[question[0]] === question[1]).length;
    const no = candidates.length - yes;
    return { index, quality: Math.abs(yes - no) + (used.has(index) ? 2 : 0) };
  }).sort((a, b) => a.quality - b.quality || a.index - b.index)[0]?.index ?? 0;
}

function bestSuspect(game, nearbyOnly = false) {
  const ranked = candidateScores(game).filter(item => {
    if (!nearbyOnly) return true;
    return item.candidate.block === game.detectiveBlock || adjacent(item.candidate.block, game.detectiveBlock);
  });
  return ranked[0]?.candidate;
}

function guessMotive(game) {
  const victims = game.victims.map(victim => game.civilians.find(c => c.id === victim.id)).filter(Boolean);
  let possible = MOTIVES.map(motive => motive.id);
  if (new Set(victims.map(victim => victim.sex)).size > 1) possible = possible.filter(id => id !== 'maniac');
  if (victims.some(victim => victim.intimidated)) possible = possible.filter(id => id !== 'sadist');
  if (victims.some(victim => [5, 6, 9, 10].includes(victim.block))) possible = possible.filter(id => id !== 'cutthroat');
  if (new Set(victims.map(victim => victim.group)).size < victims.length) possible = possible.filter(id => id !== 'terrorist');
  return possible[0] || MOTIVES[0].id;
}

function canUseAction(game, kind) {
  return (game.actions.length < 2 || game.actions.includes(kind)) && (!game.actions.includes(kind) || kind === 'question');
}

function detectiveStep(game) {
  if (game.firePick) {
    act(game, 'detective', 'fire_choose_group', { group: largestGroup(game) });
    return;
  }
  if (game.fireRemaining?.length) {
    const move = chooseCivilianMove(game, game.fireRemaining, 'detective');
    if (move) act(game, 'detective', 'fire_move', { id: move.civilian.id, block: move.block });
    else act(game, 'detective', 'fire_done');
    return;
  }
  if (game.fireGroup !== null) {
    act(game, 'detective', 'fire_done');
    return;
  }
  if (game.surveillance !== null) {
    act(game, 'detective', 'surveil_check');
    return;
  }

  const witnesses = occupants(game, game.detectiveBlock)
    .filter(c => !c.intimidated && !game.questioned.includes(c.id));
  if (!game.questionClosed && canUseAction(game, 'question') && witnesses.length) {
    act(game, 'detective', 'question', { id: witnesses[0].id, question: bestQuestion(game) });
    return;
  }

  const building = BUILDINGS[game.detectiveBlock];
  if (building === '餐馆' && canUseAction(game, 'diner')) {
    const witness = game.civilians.find(c => !c.dead && !c.intimidated && (c.block === game.detectiveBlock || adjacent(c.block, game.detectiveBlock)));
    if (witness) {
      act(game, 'detective', 'diner', { id: witness.id, question: bestQuestion(game) });
      return;
    }
  }
  if (building === '警局' && canUseAction(game, 'police')) {
    const suspect = bestSuspect(game, true);
    if (suspect) {
      act(game, 'detective', 'surveil_place', { id: suspect.id });
      return;
    }
  }
  if (building === '医院' && canUseAction(game, 'hospital')) {
    const frightened = game.civilians.find(c => !c.dead && c.intimidated && (c.block === game.detectiveBlock || adjacent(c.block, game.detectiveBlock)));
    if (frightened) {
      act(game, 'detective', 'comfort', { id: frightened.id });
      return;
    }
  }
  if (building === '消防局' && canUseAction(game, 'fire')) {
    act(game, 'detective', 'fire');
    return;
  }

  if (game.moves > 0 && !game.actions.includes('question')) {
    const destinations = Array.from({ length: 16 }, (_, block) => block)
      .filter(block => adjacent(game.detectiveBlock, block))
      .sort((a, b) => {
        const useful = block => occupants(game, block).filter(c => !c.intimidated).length;
        return useful(b) - useful(a) || occupants(game, b).length - occupants(game, a).length;
      });
    if (destinations.length && occupants(game, destinations[0]).some(c => !c.intimidated)) {
      act(game, 'detective', 'move_detective', { block: destinations[0] });
      return;
    }
  }

  act(game, 'detective', 'end_detective');
}

function aiStep(game) {
  const role = game.ai.role;
  if (game.pending) {
    const answer = computerTestimony(game, game.pending);
    act(game, 'killer', 'answer', { answer });
    return;
  }
  if (game.phase === 'setup_support') {
    act(game, 'killer', 'choose_support', { group: largestGroup(game, game.supporterOptions) });
    return;
  }
  if (game.phase === 'setup_detective') {
    const block = Array.from({ length: 16 }, (_, index) => index).sort((a, b) => {
      const score = value => occupants(game, value).length * 5 + (BUILDINGS[value] ? 2 : 0)
        - Math.min(...[5, 6, 9, 10].map(center => distance(value, center)));
      return score(b) - score(a);
    })[0];
    act(game, 'detective', 'choose_start', { block });
    return;
  }
  if (game.phase === 'killer_intimidate') {
    const target = game.civilians
      .filter(c => !c.dead && !c.intimidated && c.block !== game.detectiveBlock)
      .sort((a, b) => distance(a.block, game.detectiveBlock) - distance(b.block, game.detectiveBlock))[0];
    act(game, 'killer', target ? 'intimidate' : 'skip_intimidation', target ? { id: target.id } : {});
    return;
  }
  if (game.phase === 'killer_murder') {
    const target = game.civilians
      .filter(c => canKill(game, c.id))
      .sort((a, b) => {
        const score = c => distance(c.block, game.detectiveBlock) * 3 + occupants(game, c.block).length - (game.surveillance === c.id ? 20 : 0);
        return score(b) - score(a) || a.id - b.id;
      })[0];
    act(game, 'killer', target ? 'murder' : 'skip_murder', target ? { id: target.id } : {});
    return;
  }
  if (game.phase === 'evacuate') {
    const civilian = occupants(game, game.detectiveBlock)[0];
    const block = civilian && evacuationDestination(game, civilian.block);
    if (civilian && Number.isInteger(block)) {
      act(game, 'detective', 'evacuate', { id: civilian.id, block });
      return;
    }
    throw new Error('电脑无法找到合法的疏散位置');
  }
  if (game.phase === 'detective') {
    detectiveStep(game);
    return;
  }
  if (game.phase === 'city_killer' || game.phase === 'city_detective') {
    if (game.chooseCityGroup) act(game, role, 'city_choose_group', { group: largestGroup(game) });
    else {
      const move = chooseCivilianMove(game, game.moveRemaining || [], role);
      if (move) act(game, role, 'city_move', { id: move.civilian.id, block: move.block });
      else act(game, role, 'city_done');
    }
    return;
  }
  if (game.phase === 'round_end') {
    if (game.victims.length >= 5) {
      const suspect = bestSuspect(game) || game.civilians.find(c => !c.dead);
      act(game, 'detective', 'accuse', { id: suspect.id, motive: guessMotive(game) });
    } else {
      act(game, 'detective', 'next_round');
    }
  }
}

export function advanceAI(game) {
  if (game.mode !== 'single' || !game.ai) return game;
  for (let step = 0; step < 160; step++) {
    if (game.phase === 'finished' || roleToAct(game) !== game.ai.role) return game;
    aiStep(game);
  }
  throw new Error('电脑回合执行步数过多');
}

export function rememberHumanAnswer(game, pending, answer) {
  if (game.mode !== 'single' || game.ai?.role !== 'detective' || !pending || typeof answer !== 'boolean') return;
  game.ai.answers ||= [];
  game.ai.answers.push({ id: pending.id, questionIndex: pending.questionIndex, answer, round: game.round });
}
