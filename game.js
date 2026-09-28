import { randomBytes } from 'node:crypto';

export const GROUPS = ['权威', '媒体', '边缘人', '医疗', '政府', '劳工', '罪犯', '名流', '移民'];
export const MOTIVES = [
  { id: 'maniac', name: '狂人', rule: '所有受害者的性别必须相同。' },
  { id: 'sadist', name: '施虐者', rule: '不能谋杀受恐吓的市民。' },
  { id: 'cutthroat', name: '割喉者', rule: '不能在城市中央的四个街区谋杀。' },
  { id: 'vigilante', name: '私刑者', rule: '不能在侦探所在街区及其周围八个街区谋杀。' },
  { id: 'killer', name: '独行杀手', rule: '只能谋杀所在街区没有其他市民的人。' },
  { id: 'terrorist', name: '恐怖分子', rule: '每名受害者必须来自不同的社会群体。' },
];

const PROFESSIONS = [
  '护士','检察官','演员','夜店守卫','编辑','记者','音乐家','调度员','女招待','邮差','出租车司机','医生','法官','摄影师','消防员','警员','教授','教会职员',
  '码头工','面包师','电工','画家','律师','外交官','裁缝','咖啡师','广播员','园丁','售票员','机械师','理发师','侍者','银行家','学生','退伍军人','邮局职员',
  '舞者','药剂师','清洁工','商人','保安','作家','船员','会计师','店主','牧师','建筑师','小提琴手','剧作家','厨师','司机','工会代表','花商','钟表匠'
];
export const CIVILIAN_DECK = PROFESSIONS.map((name, id) => ({
  id, name, group: GROUPS[(id * 5 + Math.floor(id / 9)) % 9], sex: id % 2 ? '男' : '女',
  age: ['青年', '中年', '老年'][Math.floor(id / 2) % 3],
  build: ['瘦', '中等', '壮'][Math.floor(id / 6) % 3],
  height: ['矮', '中等', '高'][Math.floor(id / 18) % 3],
  block: -1, intimidated: false, dead: false,
}));

export const BUILDINGS = {
  1: '警局', 14: '警局', 2: '餐馆', 13: '餐馆',
  4: '医院', 11: '医院', 7: '消防局', 8: '消防局',
};
export const QUESTIONS = [
  ['sex', '男', '凶手是男性吗？'], ['sex', '女', '凶手是女性吗？'],
  ['age', '青年', '凶手是青年吗？'], ['age', '中年', '凶手是中年吗？'], ['age', '老年', '凶手是老年吗？'],
  ['build', '瘦', '凶手的体型偏瘦吗？'], ['build', '中等', '凶手的体型中等吗？'], ['build', '壮', '凶手的体型健壮吗？'],
  ['height', '矮', '凶手身材矮小吗？'], ['height', '中等', '凶手身高中等吗？'], ['height', '高', '凶手身材高大吗？'],
];
export const BLOCK_NAMES = ['旧城区','商业中心','中央公园','格林山','里士满','市政广场','大学区','东区','码头','南商业街','剧院区','圣玛利亚','西区','唐人街','体育场','河岸'];

export function shuffle(items) {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomBytes(4).readUInt32BE() % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}
export function adjacent(a, b) {
  return Math.abs(Math.floor(a / 4) - Math.floor(b / 4)) + Math.abs(a % 4 - b % 4) === 1;
}
export function nearby(a, b) {
  return Math.max(Math.abs(Math.floor(a / 4) - Math.floor(b / 4)), Math.abs(a % 4 - b % 4)) <= 1;
}
export function inCity(game, id) { return game.civilians.find(c => c.id === id && !c.dead); }
export function occupants(game, block) { return game.civilians.filter(c => !c.dead && c.block === block); }
export function canKill(game, id) {
  const c = inCity(game, id);
  if (!c || id === game.secret.killerId || c.block === game.detectiveBlock) return false;
  const victims = game.victims.map(v => game.civilians.find(c => c.id === v.id));
  switch (game.secret.motive) {
    case 'maniac': return !victims.length || victims[0].sex === c.sex;
    case 'sadist': return !c.intimidated;
    case 'cutthroat': return ![5, 6, 9, 10].includes(c.block);
    case 'vigilante': return !nearby(c.block, game.detectiveBlock);
    case 'killer': return occupants(game, c.block).length === 1;
    case 'terrorist': return victims.every(v => v.group !== c.group);
    default: return false;
  }
}
function fail(message) { throw Object.assign(new Error(message), { status: 400 }); }
function assert(condition, message) { if (!condition) fail(message); }
function randomItem(items) { return shuffle(items)[0]; }
function log(game, text) { game.log.unshift({ round: game.round, text, at: Date.now() }); game.log = game.log.slice(0, 90); }
function otherRole(role) { return role === 'killer' ? 'detective' : 'killer'; }
function winner(game, role, why) {
  game.phase = 'finished'; game.winner = role; game.endReason = why;
  log(game, `${role === 'killer' ? '凶手' : '侦探'}获胜：${why}`);
}

export function createGame(code, firstRole, firstToken) {
  return { code, createdAt: Date.now(), players: { [firstRole]: firstToken }, phase: 'waiting', round: 1,
    civilians: [], detectiveBlock: null, victims: [], scenes: [], intimidations: 0, skipped: 0,
    actions: [], moves: 2, questionBlock: null, questionClosed: false, questioned: [], pending: null,
    surveillance: null, groupPool: [], heldGroups: [], moveGroup: null, moveRemaining: [], chooseCityGroup: false,
    fireGroup: null, fireRemaining: [], firePick: false,
    secret: null, supporterOptions: [], winner: null, endReason: '', log: [] };
}

export function joinGame(game, role, token) {
  assert(game.phase === 'waiting', '对局已经开始');
  assert(!game.players[role], '该角色已被占用');
  game.players[role] = token;
  if (game.players.killer && game.players.detective) startGame(game);
}

function startGame(game) {
  const chosen = shuffle(CIVILIAN_DECK).slice(0, 20).map(c => ({ ...c }));
  const blocks = shuffle([0,0,3,3,12,12,15,15,...[1,2,4,5,6,7,8,9,10,11,13,14]]);
  chosen.forEach((c, i) => { c.block = blocks[i]; });
  game.civilians = chosen;
  game.secret = {
    killerId: randomItem(chosen).id,
    interestId: null,
    motive: randomItem(MOTIVES).id,
    supporter: null,
  };
  game.secret.interestId = randomItem(chosen.filter(c => c.id !== game.secret.killerId)).id;
  game.supporterOptions = shuffle(GROUPS).slice(0, 3);
  game.phase = 'setup_support';
  log(game, '案件档案已建立。凶手先秘密选择支持者群体。');
}

function enterDetective(game) {
  game.phase = 'detective'; game.actions = []; game.moves = 2;
  game.questionBlock = null; game.questionClosed = false; game.questioned = []; game.pending = null;
  if (game.scenes.length && game.scenes.at(-1).round === game.round) {
    game.detectiveBlock = game.scenes.at(-1).block;
    const people = occupants(game, game.detectiveBlock);
    if (people.length) {
      game.phase = 'evacuate';
      log(game, '侦探抵达新案发街区，须先疏散现场市民。');
    }
  }
  if (game.phase === 'detective') log(game, '侦探开始调查。');
}

function startCity(game) {
  game.phase = 'city_killer';
  const c = occupants(game, game.detectiveBlock);
  for (const person of c) person.intimidated = false;
  if (c.length) log(game, '侦探安抚了同街区受恐吓的市民。');
  drawGroup(game, 'killer');
}
function drawGroup(game, role) {
  game.chooseCityGroup = false;
  const available = game.groupPool.filter(g => !game.heldGroups.includes(g));
  if (!available.length) { game.moveGroup = null; game.moveRemaining = []; return; }
  const group = randomItem(available);
  game.heldGroups.push(group);
  const members = game.civilians.filter(c => !c.dead && c.group === group);
  if (!members.length) {
    game.groupPool = game.groupPool.filter(g => g !== group);
    game.moveGroup = null;
    game.chooseCityGroup = true;
    log(game, `${role === 'killer' ? '凶手' : '侦探'}抽到了无人在场的${group}群体，可以自选一个在场群体移动。`);
  } else {
    game.moveGroup = group;
    log(game, `${role === 'killer' ? '凶手' : '侦探'}抽到了${group}群体。`);
  }
  game.moveRemaining = game.civilians.filter(c => !c.dead && c.group === game.moveGroup).map(c => c.id);
}
function endCityTurn(game) {
  if (game.phase === 'city_killer') {
    game.phase = 'city_detective'; drawGroup(game, 'detective');
  } else {
    game.heldGroups = []; game.moveGroup = null; game.moveRemaining = []; game.chooseCityGroup = false;
    game.phase = 'round_end';
    log(game, `第 ${game.round} 回合结束。`);
  }
}
function ensureDetectiveAction(game, kind) {
  assert(game.phase === 'detective', '当前不是侦探调查阶段');
  assert(kind === 'fire' || (!game.firePick && !(game.fireRemaining || []).length), '请先完成消防局移动');
  assert(game.actions.length < 2 || game.actions.includes(kind), '本回合已用完两项行动');
  assert(!game.actions.includes(kind) || kind === 'question', '每种行动每回合只能使用一次');
  if (!game.actions.includes(kind)) game.actions.push(kind);
  if (kind !== 'question' && game.actions.includes('question')) { game.questionBlock = null; game.questionClosed = true; }
}
function prepareQuestion(game, id, questionIndex, source) {
  const c = inCity(game, id);
  assert(c && !c.intimidated, '此市民不能接受讯问');
  assert(QUESTIONS[questionIndex], '无效问题');
  assert(!game.pending, '请等待凶手回答上一问题');
  const killer = game.civilians.find(x => x.id === game.secret.killerId);
  game.pending = { id, questionIndex, source, truthful: killer[QUESTIONS[questionIndex][0]] === QUESTIONS[questionIndex][1],
    mayLie: id === game.secret.killerId || id === game.secret.interestId || c.group === game.secret.supporter };
  log(game, `侦探讯问了${c.name}：${QUESTIONS[questionIndex][2]}`);
}

export function act(game, role, type, payload = {}) {
  const id = Number(payload.id), block = Number(payload.block), questionIndex = Number(payload.question);
  if (game.phase === 'finished') fail('对局已经结束');
  switch (type) {
    case 'choose_support': {
      assert(role === 'killer' && game.phase === 'setup_support', '当前不能选择支持者');
      assert(game.supporterOptions.includes(payload.group), '群体不在候选中');
      game.secret.supporter = payload.group;
      game.groupPool = shuffle(GROUPS.filter(g => !game.supporterOptions.includes(g)));
      game.supporterOptions = [];
      game.phase = 'setup_detective';
      log(game, '凶手完成秘密设定。侦探选择起始街区。');
      break;
    }
    case 'choose_start': {
      assert(role === 'detective' && game.phase === 'setup_detective', '当前不能选择起点');
      assert(Number.isInteger(block) && block >= 0 && block < 16, '无效街区');
      game.detectiveBlock = block; game.phase = 'killer_intimidate';
      log(game, `侦探从${BLOCK_NAMES[block]}开始调查。第 1 回合开始。`);
      break;
    }
    case 'intimidate': {
      assert(role === 'killer' && game.phase === 'killer_intimidate', '当前不能恐吓市民');
      const c = inCity(game, id);
      assert(c && !c.intimidated && c.block !== game.detectiveBlock, '此市民不能被恐吓');
      c.intimidated = true; game.intimidations++;
      log(game, `一名${c.group}群体的市民受到恐吓。`);
      if (game.intimidations >= 2 || !game.civilians.some(x => !x.dead && !x.intimidated && x.block !== game.detectiveBlock)) game.phase = 'killer_murder';
      break;
    }
    case 'skip_intimidation': {
      assert(role === 'killer' && game.phase === 'killer_intimidate', '当前不能跳过恐吓');
      assert(!game.civilians.some(x => !x.dead && !x.intimidated && x.block !== game.detectiveBlock), '仍有可恐吓的市民');
      game.phase = 'killer_murder'; break;
    }
    case 'murder': {
      assert(role === 'killer' && game.phase === 'killer_murder', '当前不能谋杀');
      assert(canKill(game, id), '此目标不符合谋杀条件或真实动机');
      const c = inCity(game, id);
      c.dead = true;
      const number = game.victims.length + 1;
      game.victims.push({ id, round: game.round });
      game.scenes.push({ block: c.block, round: game.round, number });
      if (game.surveillance === id) game.surveillance = null;
      log(game, `第 ${number} 起命案发生在${BLOCK_NAMES[c.block]}，受害者是${c.name}。`);
      enterDetective(game);
      break;
    }
    case 'skip_murder': {
      assert(role === 'killer' && game.phase === 'killer_murder', '当前不能放弃谋杀');
      game.skipped++;
      if (game.skipped > 1) winner(game, 'detective', '凶手第二次放弃谋杀');
      else { log(game, '本回合没有命案。'); enterDetective(game); }
      break;
    }
    case 'evacuate': {
      assert(role === 'detective' && game.phase === 'evacuate', '当前无需疏散');
      const c = inCity(game, id);
      assert(c && c.block === game.detectiveBlock, '请选择案发现场的市民');
      assert(Number.isInteger(block) && block >= 0 && block < 16 && !game.scenes.some(s => s.block === block), '目标街区不可进入');
      assert(occupants(game, block).length < 3, '街区已满');
      const hasAdjacent = Array.from({ length: 16 }, (_, i) => i).some(i => adjacent(c.block, i) && !game.scenes.some(s => s.block === i) && occupants(game, i).length < 3);
      assert(!hasAdjacent || adjacent(c.block, block), '必须先进入相邻街区');
      c.block = block;
      log(game, `${c.name}撤离现场，前往${BLOCK_NAMES[block]}。`);
      if (!occupants(game, game.detectiveBlock).length) { game.phase = 'detective'; log(game, '现场疏散完成，侦探开始调查。'); }
      break;
    }
    case 'move_detective': {
      assert(role === 'detective' && game.phase === 'detective', '当前不能移动侦探');
      assert(game.moves > 0 && adjacent(game.detectiveBlock, block), '只能移动到相邻街区，且每回合最多两步');
      game.detectiveBlock = block; game.moves--;
      if (game.actions.includes('question')) { game.questionBlock = null; game.questionClosed = true; }
      log(game, `侦探移动到${BLOCK_NAMES[block]}。`);
      break;
    }
    case 'question': {
      assert(role === 'detective' && game.phase === 'detective', '当前不能讯问');
      const c = inCity(game, id);
      assert(c && c.block === game.detectiveBlock, '只能讯问同街区市民');
      assert(!game.questionClosed && (game.questionBlock === null || game.questionBlock === game.detectiveBlock), '讯问行动已结束');
      assert(!game.questioned.includes(id), '本次讯问已问过这名市民');
      ensureDetectiveAction(game, 'question'); game.questionBlock = game.detectiveBlock;
      game.questioned.push(id); prepareQuestion(game, id, questionIndex, 'question');
      break;
    }
    case 'diner': {
      assert(role === 'detective' && game.phase === 'detective' && BUILDINGS[game.detectiveBlock] === '餐馆', '侦探必须在餐馆');
      const c = inCity(game, id);
      assert(c && (c.block === game.detectiveBlock || adjacent(c.block, game.detectiveBlock)), '餐馆只能接触本街区或相邻街区市民');
      ensureDetectiveAction(game, 'diner'); prepareQuestion(game, id, questionIndex, 'diner');
      break;
    }
    case 'answer': {
      assert(role === 'killer' && game.pending, '没有待回答的讯问');
      assert(typeof payload.answer === 'boolean', '回答必须是是或否');
      assert(game.pending.mayLie || payload.answer === game.pending.truthful, '此证人必须说实话');
      const c = game.civilians.find(x => x.id === game.pending.id);
      log(game, `${c.name}回答：“${payload.answer ? '是' : '否'}”。`);
      game.pending = null;
      break;
    }
    case 'surveil_place': {
      assert(role === 'detective' && game.phase === 'detective' && BUILDINGS[game.detectiveBlock] === '警局', '侦探必须在警局');
      const c = inCity(game, id);
      assert(c && (c.block === game.detectiveBlock || adjacent(c.block, game.detectiveBlock)), '只能监视本街区或相邻街区市民');
      ensureDetectiveAction(game, 'police'); game.surveillance = id;
      log(game, `警方开始监视${c.name}。`);
      break;
    }
    case 'surveil_check': {
      assert(role === 'detective' && game.phase === 'detective' && game.surveillance !== null, '没有监视目标');
      const c = inCity(game, game.surveillance);
      assert(c, '监视目标已不在城中');
      const possible = canKill(game, c.id);
      log(game, `监视报告：凶手此刻${possible ? '可以' : '不能'}谋杀${c.name}。`);
      game.surveillance = null;
      break;
    }
    case 'comfort': {
      assert(role === 'detective' && game.phase === 'detective' && BUILDINGS[game.detectiveBlock] === '医院', '侦探必须在医院');
      const c = inCity(game, id);
      assert(c && c.intimidated && (c.block === game.detectiveBlock || adjacent(c.block, game.detectiveBlock)), '请选择本街区或相邻街区受恐吓的市民');
      ensureDetectiveAction(game, 'hospital'); c.intimidated = false;
      log(game, `${c.name}在医院获得安抚。`);
      break;
    }
    case 'fire': {
      assert(role === 'detective' && game.phase === 'detective' && BUILDINGS[game.detectiveBlock] === '消防局', '侦探必须在消防局');
      ensureDetectiveAction(game, 'fire');
      const drawn = randomItem(game.groupPool);
      game.firePick = !drawn || !game.civilians.some(c => !c.dead && c.group === drawn);
      if (drawn && game.firePick) game.groupPool = game.groupPool.filter(g => g !== drawn);
      game.fireGroup = game.firePick ? null : drawn;
      game.fireRemaining = game.civilians.filter(c => !c.dead && c.group === game.fireGroup).map(c => c.id);
      log(game, drawn ? `消防局抽到${drawn}群体。${game.firePick ? '该群体无人，侦探可自选在场群体。' : '可移动这些市民。'}` : '群体标记已用完，侦探可自选在场群体。');
      break;
    }
    case 'fire_choose_group': {
      assert(role === 'detective' && game.phase === 'detective' && game.firePick, '当前不能选择消防局群体');
      assert(GROUPS.includes(payload.group) && game.civilians.some(c => !c.dead && c.group === payload.group), '请选择在场群体');
      game.firePick = false; game.fireGroup = payload.group;
      game.fireRemaining = game.civilians.filter(c => !c.dead && c.group === game.fireGroup).map(c => c.id);
      log(game, `侦探选择移动${game.fireGroup}群体。`);
      break;
    }
    case 'fire_move': {
      assert(role === 'detective' && game.phase === 'detective' && game.fireRemaining?.includes(id), '此市民不在消防局行动中');
      moveCivilian(game, id, block); game.fireRemaining = game.fireRemaining.filter(x => x !== id);
      break;
    }
    case 'fire_done': {
      assert(role === 'detective' && game.phase === 'detective' && game.actions.includes('fire'), '没有消防局行动');
      game.fireRemaining = []; game.fireGroup = null; game.firePick = false; break;
    }
    case 'end_detective': {
      assert(role === 'detective' && game.phase === 'detective' && !game.pending, '当前不能结束调查');
      game.fireRemaining = []; game.fireGroup = null; game.firePick = false; startCity(game); break;
    }
    case 'city_choose_group': {
      assert((role === 'killer' && game.phase === 'city_killer') || (role === 'detective' && game.phase === 'city_detective'), '当前不能选择群体');
      assert(game.chooseCityGroup, '无需选择群体');
      assert(GROUPS.includes(payload.group) && game.civilians.some(c => !c.dead && c.group === payload.group), '请选择在场群体');
      game.moveGroup = payload.group; game.chooseCityGroup = false;
      game.moveRemaining = game.civilians.filter(c => !c.dead && c.group === game.moveGroup).map(c => c.id);
      log(game, `${role === 'killer' ? '凶手' : '侦探'}选择移动${game.moveGroup}群体。`);
      break;
    }
    case 'city_move': {
      assert((role === 'killer' && game.phase === 'city_killer') || (role === 'detective' && game.phase === 'city_detective'), '当前不是你的城市移动阶段');
      assert(!game.chooseCityGroup && game.moveRemaining.includes(id), '此市民已移动或不属于当前群体');
      moveCivilian(game, id, block); game.moveRemaining = game.moveRemaining.filter(x => x !== id);
      break;
    }
    case 'city_done': {
      assert((role === 'killer' && game.phase === 'city_killer') || (role === 'detective' && game.phase === 'city_detective'), '当前不能结束城市行动');
      endCityTurn(game); break;
    }
    case 'next_round': {
      assert(role === 'detective' && game.phase === 'round_end' && game.victims.length < 5, '当前不能进入下一回合');
      game.round++; game.phase = 'killer_intimidate'; game.intimidations = 0;
      log(game, `第 ${game.round} 回合开始。`); break;
    }
    case 'accuse': {
      assert(role === 'detective' && game.phase === 'round_end' && game.victims.length >= 3, '至少完成三回合后才可指认');
      assert(game.civilians.some(c => c.id === id) && MOTIVES.some(m => m.id === payload.motive), '请选择嫌疑人与动机');
      game.accusation = { id, motive: payload.motive };
      if (id === game.secret.killerId && payload.motive === game.secret.motive) winner(game, 'detective', '成功指认凶手和动机');
      else winner(game, 'killer', '侦探的最终指认有误');
      break;
    }
    default: fail('未知操作');
  }
  return game;
}

function moveCivilian(game, id, block) {
  const c = inCity(game, id);
  assert(c && Number.isInteger(block) && block >= 0 && block < 16, '无效移动');
  assert(adjacent(c.block, block), '市民只能移动到相邻街区');
  assert(!game.scenes.some(s => s.block === block), '不能进入案发街区');
  assert(occupants(game, block).length < 3, '目标街区已有三名市民');
  c.block = block;
  log(game, `${c.name}移动到${BLOCK_NAMES[block]}。`);
}

export function viewFor(game, role) {
  const out = {
    code: game.code, role, players: { killer: !!game.players.killer, detective: !!game.players.detective },
    phase: game.phase, round: game.round, civilians: game.civilians, detectiveBlock: game.detectiveBlock,
    victims: game.victims, scenes: game.scenes, intimidations: game.intimidations, skipped: game.skipped,
    actions: game.actions, moves: game.moves, questionBlock: game.questionBlock, questionClosed: game.questionClosed, questioned: game.questioned,
    surveillance: game.surveillance, moveGroup: game.moveGroup, moveRemaining: game.moveRemaining,
    fireGroup: game.fireGroup || null, fireRemaining: game.fireRemaining || [], firePick: game.firePick || false,
    chooseCityGroup: game.chooseCityGroup || false,
    winner: game.winner, endReason: game.endReason, accusation: game.accusation || null, log: game.log,
    buildings: BUILDINGS, blockNames: BLOCK_NAMES, groups: GROUPS, motives: MOTIVES, questions: QUESTIONS.map(q => q[2]),
  };
  if (game.pending) out.pending = role === 'killer' ? game.pending : { id: game.pending.id, questionIndex: game.pending.questionIndex, source: game.pending.source };
  if (role === 'killer' || game.phase === 'finished') {
    out.secret = game.secret;
    if (role === 'killer') out.supporterOptions = game.supporterOptions;
  }
  return out;
}

export function roleForToken(game, token) {
  if (game.players.killer === token) return 'killer';
  if (game.players.detective === token) return 'detective';
  return null;
}
export function other(role) { return otherRole(role); }
