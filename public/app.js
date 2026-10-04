import { turnOwner, nextHandoff } from './turn.js';

const app = document.querySelector('#app');
const toastEl = document.querySelector('#toast');
const saved = JSON.parse(localStorage.getItem('itk-session') || 'null');
const inviteCode = new URLSearchParams(location.search).get('room') || '';
let session = saved && (!inviteCode || inviteCode.toUpperCase() === saved.code) ? saved : null;
let state = null;
let handoff = session?.mode === 'local' ? { targetRole: session.activeRole, reason: 'resume' } : null;
let selectedId = null;
let mode = 'select';
let question = 0;
let motiveGuess = 'maniac';
let panelTab = 'actions';
let stream = null;
let busy = false;
let joinCode = inviteCode;
let inviteOrigin = location.origin;
let lobbyMode = inviteCode ? 'online' : 'offline';
let offlineType = 'ai';
const palette = ['#169472','#354caf','#db4387','#b84239','#d8ab34','#6c6f94','#c4793b','#3b8a91','#6d8743'];
const groupPalette = { '权威': 1, '媒体': 2, '边缘人': 5, '医疗': 0, '政府': 4, '劳工': 6, '罪犯': 3, '名流': 7, '移民': 8 };
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));
const person = id => state?.civilians.find(c => c.id === id);
const grouped = block => state.civilians.filter(c => !c.dead && c.block === block);
const roleName = role => role === 'killer' ? '凶手' : '侦探';
const otherRole = role => role === 'killer' ? '侦探' : '凶手';
const activeRole = phase => ['setup_support','killer_intimidate','killer_murder','city_killer'].includes(phase) ? 'killer' : ['setup_detective','evacuate','detective','city_detective','round_end'].includes(phase) ? 'detective' : null;
const noteKey = () => `itk-notes-${state.code}-${state.role}`;
const canSelect = id => !!person(id) && !person(id).dead;
const adjacent = (a,b) => Math.abs(Math.floor(a/4)-Math.floor(b/4)) + Math.abs(a%4-b%4) === 1;
const canMoveCivilianTo = (c, block) => !!c && adjacent(c.block, block) && !state.scenes.some(s => s.block === block) && grouped(block).length < 3;

function toast(message, isError = false) {
  toastEl.textContent = message;
  toastEl.className = isError ? 'show error' : 'show';
  clearTimeout(toastEl.timer);
  toastEl.timer = setTimeout(() => toastEl.className = '', 3400);
}
async function request(path, options = {}) {
  const authToken = session?.mode === 'local' ? session.tokens[session.activeRole] : session?.token;
  const response = await fetch(path, {
    ...options,
    headers: { 'Content-Type':'application/json', ...(authToken ? { Authorization:`Bearer ${authToken}` } : {}), ...(options.headers || {}) },
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '网络请求失败');
  return data;
}
function acceptState(next) {
  const nextRole = nextHandoff(session, next);
  if (nextRole) {
    session.activeRole = nextRole;
    localStorage.setItem('itk-session', JSON.stringify(session));
    handoff = { targetRole: nextRole, reason: 'switch' };
    state = null;
    selectedId = null; mode = 'select'; panelTab = 'actions';
  } else {
    state = next;
    if (selectedId !== null && !canSelect(selectedId)) selectedId = null;
  }
  render();
}
async function refresh() {
  if (!session || handoff) return;
  const currentSession = session;
  const currentRole = session.activeRole;
  try {
    const next = await request('/api/state');
    if (session !== currentSession || handoff || (session.mode === 'local' && session.activeRole !== currentRole)) return;
    acceptState(next);
  } catch (error) {
    if (session !== currentSession || handoff || (session.mode === 'local' && session.activeRole !== currentRole)) return;
    if (error.message.includes('失效')) { localStorage.removeItem('itk-session'); session = null; state = null; handoff = null; render(); }
    else toast(error.message, true);
  }
}
async function action(type, payload = {}) {
  if (busy) return;
  busy = true;
  const currentSession = session;
  try {
    const next = await request('/api/action', { method:'POST', body:JSON.stringify({ type, payload }) });
    if (session === currentSession) acceptState(next);
  } catch (error) { if (session === currentSession) toast(error.message, true); }
  finally { busy = false; }
}
function connect() {
  stream?.close();
  if (!session) return;
  if (session.mode === 'local' || session.mode === 'single') { stream = null; refresh(); return; }
  stream = new EventSource(`/api/events?token=${encodeURIComponent(session.token)}`);
  stream.addEventListener('update', refresh);
  stream.onerror = () => { /* EventSource reconnects automatically. */ };
  refresh();
}
function setSession(result) {
  session = result;
  localStorage.setItem('itk-session', JSON.stringify(result));
  history.replaceState({}, '', '/');
  state = null; handoff = null; selectedId = null; mode = 'select'; panelTab = 'actions';
  connect();
}
function portrait(c, large = false) {
  const skin = ['#dbc39e','#ae795f','#86624d','#d6aa76','#9c6b59'][c.id % 5];
  const hair = ['#242127','#4a322a','#6b4b30','#2e2c2b','#4f3b30'][Math.floor(c.id / 3) % 5];
  const pose = c.id % 3;
  const glasses = c.id % 11 === 0;
  return `<svg class="portrait ${large ? 'large' : ''}" viewBox="0 0 100 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <defs><linearGradient id="p${c.id}" x1="0" y1="0" x2="1" y2="1"><stop stop-color="${palette[groupPalette[c.group]]}"/><stop offset="1" stop-color="#151823"/></linearGradient><pattern id="grain${c.id}" width="8" height="8" patternUnits="userSpaceOnUse"><circle cx="2" cy="3" r=".6" fill="#fff" opacity=".19"/><circle cx="6" cy="7" r=".4" fill="#000" opacity=".2"/></pattern></defs>
    <rect width="100" height="120" fill="url(#p${c.id})"/>
    <path d="M0 104 L100 69 M-8 20 L55 0 M58 120 L105 45" fill="none" stroke="#fff" opacity=".1" stroke-width="7"/>
    <path d="M7 120 Q14 86 37 87 L63 87 Q88 90 94 120Z" fill="${pose === 1 ? '#342f37' : '#30343b'}"/>
    <path d="M37 89 L50 113 L63 89" fill="${pose === 2 ? '#dfd6c2' : '#c2c3bd'}"/>
    <rect x="44" y="71" width="13" height="22" rx="5" fill="${skin}"/>
    <ellipse cx="50" cy="51" rx="25" ry="33" fill="${skin}"/>
    <path d="M24 51 Q19 14 48 15 Q80 12 76 54 L70 40 Q55 36 37 37 L26 55Z" fill="${hair}"/>
    ${c.sex === '女' ? `<path d="M25 42 Q15 59 20 86 L32 90 L31 39 M73 38 Q85 67 80 89 L69 88 L71 39" fill="${hair}"/>` : ''}
    <path d="M34 50 Q40 47 46 50 M55 50 Q61 47 67 49" fill="none" stroke="#25202a" stroke-width="2"/>
    <circle cx="41" cy="53" r="1.6" fill="#25202a"/><circle cx="60" cy="53" r="1.6" fill="#25202a"/>
    <path d="M50 55 L47 67 L53 67 M42 76 Q50 79 58 75" fill="none" stroke="#61453e" stroke-width="1.4"/>
    ${glasses ? '<path d="M31 49 L47 48 L47 59 L32 60Z M53 48 L69 49 L68 60 L53 59Z M47 51 L53 51" fill="none" stroke="#292527" stroke-width="2"/>' : ''}
    <rect width="100" height="120" fill="url(#grain${c.id})"/>
  </svg>`;
}
function movementContext() {
  if (!state || state.role !== activeRole(state.phase)) return null;
  if (['city_killer', 'city_detective'].includes(state.phase) && !state.chooseCityGroup && state.moveGroup) {
    return { kind:'city', group:state.moveGroup, ids:state.moveRemaining || [] };
  }
  if (state.phase === 'detective' && state.fireGroup) {
    return { kind:'fire', group:state.fireGroup, ids:state.fireRemaining || [] };
  }
  return null;
}
function card(c, opts = {}) {
  const selected = selectedId === c.id;
  const watched = state.surveillance === c.id;
  const movement = movementContext();
  const movable = movement?.ids.includes(c.id);
  const dimmed = movement && !movable;
  return `<button class="person-card ${c.intimidated ? 'intimidated' : ''} ${selected ? 'selected' : ''} ${movable ? 'movable' : ''} ${dimmed ? 'movement-muted' : ''}" style="--person-color:${palette[groupPalette[c.group]]}" data-person="${c.id}" aria-label="${escapeHtml(c.name)}，${escapeHtml(c.group)}${movable ? '，可移动' : ''}">
    <div class="person-art">${portrait(c)}${c.intimidated ? '<span class="intimidated-mark">恐吓</span>' : ''}${watched ? '<span class="watch-mark">◎</span>' : ''}${movable ? '<span class="move-mark">可移动</span>' : ''}</div>
    <div class="person-name">${escapeHtml(c.name)}</div>
    <div class="person-meta">${escapeHtml(c.sex)} · ${escapeHtml(c.age)}</div>
  </button>`;
}
function phaseLabel() {
  return ({ waiting:'等待对手', setup_support:'秘密设定', setup_detective:'侦探入城', killer_intimidate:'凶手 · 恐吓', killer_murder:'凶手 · 谋杀', evacuate:'侦探 · 现场疏散', detective:'侦探 · 调查', city_killer:'城市 · 凶手移动', city_detective:'城市 · 侦探移动', round_end:'回合结算', finished:'案件结案' })[state.phase] || state.phase;
}
function renderLobby() {
  app.innerHTML = `<main class="lobby-shell">
    <div class="lobby-paper">
      <div class="lobby-top"><span class="eyebrow">1960s · Crime dossier</span><span class="paperclip">⌁</span></div>
      <div class="lobby-main">
        <section class="lobby-copy">
          <p class="case-no">CASE FILE 006 / 选择你的调查方式</p>
          <h1>暗藏<br><span>杀机</span></h1>
          <p class="en-title">INTENT TO KILL</p>
          <p class="lead">这座城里，每个人都有嫌疑。</p>
          <p class="sublead">一人制造案件、隐藏身份与动机；一人追踪证词、监视嫌疑人。五起命案之后，真相只允许一个答案。</p>
          <div class="rule-badges"><span>单机或联网</span><span>逻辑模式</span><span>约 45 分钟</span></div>
          <div class="lobby-form">
            <div class="play-mode-grid" role="tablist" aria-label="选择游戏模式">
              <button class="play-mode-card ${lobbyMode === 'offline' ? 'active' : ''}" data-ui="mode-offline" role="tab" aria-selected="${lobbyMode === 'offline'}">
                <span class="mode-icon">▰</span><span><b>单机模式</b><small>一台设备，立即开始</small></span><i>01</i>
              </button>
              <button class="play-mode-card ${lobbyMode === 'online' ? 'active' : ''}" data-ui="mode-online" role="tab" aria-selected="${lobbyMode === 'online'}">
                <span class="mode-icon">⌁</span><span><b>联网模式</b><small>创建或加入线上房间</small></span><i>02</i>
              </button>
            </div>
            ${lobbyMode === 'offline' ? `<section class="mode-panel" aria-label="单机模式设置">
              <div class="panel-heading"><span class="eyebrow">OFFLINE PLAY</span><b>选择对战方式</b></div>
              <div class="offline-options">
                <button class="offline-card ${offlineType === 'ai' ? 'active' : ''}" data-ui="offline-ai">
                  <span class="option-mark">AI</span><span><b>与 AI 对战</b><small>电脑自动扮演另一方</small></span><i>${offlineType === 'ai' ? '●' : '○'}</i>
                </button>
                <button class="offline-card ${offlineType === 'local' ? 'active' : ''}" data-ui="offline-local">
                  <span class="option-mark people">2P</span><span><b>双人对战</b><small>轮流操作，自动遮挡秘密</small></span><i>${offlineType === 'local' ? '●' : '○'}</i>
                </button>
              </div>
              ${offlineType === 'ai' ? `<div class="role-setting"><div><b>选择你的身份</b><small>AI 将自动扮演另一方</small></div><div class="role-row compact"><label><input type="radio" name="single-role" value="detective" checked><span>侦探</span></label><label><input type="radio" name="single-role" value="killer"><span>凶手</span></label></div></div>
              <button class="primary single-start launch-button" data-ui="create-single"><span>开始与 AI 对战</span><b>→</b></button>` : `<div class="local-note"><span>↔</span><p><b>交接屏幕，守住秘密</b><small>每次换人时会自动遮挡棋盘，确认身份后才显示内容。</small></p></div>
              <button class="primary launch-button" data-ui="create-local"><span>开始双人对战</span><b>→</b></button>`}
            </section>` : `<section class="mode-panel online-panel" aria-label="联网模式设置">
              <div class="panel-heading"><span class="eyebrow">ONLINE PLAY</span><b>创建新房间</b><small>选择身份后，将房间码发给好友</small></div>
              <div class="role-setting online-role"><div><b>我想扮演</b></div><div class="role-row compact"><label><input type="radio" name="role" value="killer" checked><span>凶手</span></label><label><input type="radio" name="role" value="detective"><span>侦探</span></label></div></div>
              <button class="primary launch-button" data-ui="create"><span>创建线上房间</span><b>↗</b></button>
              <div class="or-line"><span>已有房间码</span></div>
              <div class="join-row"><input id="join-code" maxlength="6" autocomplete="off" inputmode="text" placeholder="输入 6 位房间码" value="${escapeHtml(joinCode)}"><button class="secondary" data-ui="join">加入对局</button></div>
            </section>`}
          </div>
          <p class="credit">依据 Arthur Khodzhikov 桌游的双人逻辑模式制作 · 人物插画为本项目原创</p>
        </section>
        <aside class="box-aside"><div class="box-image"><img src="/assets/box-photo.jpg" alt="用户提供的《暗藏杀机》桌游盒面照片"></div><div class="box-caption">玩家提供的盒面照片 <span>↗</span></div></aside>
      </div>
    </div>
  </main>`;
}
function renderHandoff() {
  const target = handoff.targetRole;
  app.innerHTML = `<main class="handoff-shell"><section class="handoff-card ${target}">
    <div class="handoff-top"><span>INTENT TO KILL</span><span>PASS & PLAY</span></div>
    <div class="handoff-symbol">${target === 'killer' ? '◆' : '⌕'}</div>
    <span class="eyebrow">轮到下一位玩家</span>
    <h1>请交给${roleName(target)}</h1>
    <p>上一位玩家请先离开屏幕。接手后点击下方按钮，系统才会显示你的棋盘和秘密信息。</p>
    <button class="primary" data-ui="handoff-ready">我是${roleName(target)}，开始我的回合 <b>→</b></button>
    <div class="handoff-bottom"><span>案件档案已遮挡</span><button data-ui="leave">退出对局</button></div>
  </section></main>`;
}
function renderBoard() {
  const movement = movementContext();
  const blocks = Array.from({ length: 16 }, (_, i) => {
    const building = state.buildings[i];
    const scene = state.scenes.find(s => s.block === i);
    const people = grouped(i);
    const detective = state.detectiveBlock === i;
    let hint = '';
    if (mode === 'move' && state.phase === 'detective' && adjacent(state.detectiveBlock, i)) hint = 'target';
    const movingPerson = person(selectedId);
    if (mode === 'destination' && movement?.ids.includes(movingPerson?.id) && canMoveCivilianTo(movingPerson, i)) hint = 'target';
    if (state.phase === 'setup_detective' && state.role === 'detective') hint = 'target';
    return `<div class="block ${scene ? 'crime-block' : ''} ${detective ? 'detective-block' : ''} ${hint}" data-block="${i}">
      <div class="block-top"><span class="block-number">${String(i+1).padStart(2,'0')}</span><span class="block-title">${escapeHtml(state.blockNames[i])}</span></div>
      <div class="block-badges">${building ? `<span class="building badge-${building}">${({警局:'✦',餐馆:'☕',医院:'✚',消防局:'◆'})[building]} ${building}</span>` : ''}${detective ? '<span class="detective-badge">⌕ 侦探</span>' : ''}${scene ? `<span class="scene-badge">命案 ${scene.number}</span>` : ''}</div>
      <div class="block-people">${people.map(c => card(c)).join('') || '<div class="empty-street">···</div>'}</div>
    </div>`;
  }).join('');
  return `<section class="board-wrap"><div class="board-heading"><div><span class="eyebrow">CITY MAP / 01—16</span><h2>城市地图</h2></div>${movement ? `<div class="board-movement-notice" style="--group-color:${palette[groupPalette[movement.group]]}"><span>当前移动社群</span><b>${escapeHtml(movement.group)}</b><small>${movement.ids.length ? `${movement.ids.length} 人待移动 · 选择发光人物` : '该社群移动已完成'}</small></div>` : '<p>点击人物查看档案；需要移动时，先选人物，再点目标街区。</p>'}</div><div class="board ${movement ? 'movement-active' : ''}">${blocks}</div></section>`;
}
function selectedPanel() {
  const c = person(selectedId);
  if (!c) return `<div class="empty-selection"><div class="fingerprint">◎</div><h3>选择一位市民</h3><p>点击地图上的人物牌，查看其身份特征与可用行动。</p></div>`;
  return `<div class="selected-person"><div class="selected-portrait" style="--person-color:${palette[groupPalette[c.group]]}">${portrait(c, true)}</div><div class="selected-data"><span class="eyebrow">CIVILIAN / ${String(c.id+1).padStart(2,'0')}</span><h3>${escapeHtml(c.name)}</h3><p class="group-name">${escapeHtml(c.group)} · ${escapeHtml(state.blockNames[c.block])}</p><div class="traits"><span>性别 <b>${c.sex}</b></span><span>年龄 <b>${c.age}</b></span><span>体型 <b>${c.build}</b></span><span>身高 <b>${c.height}</b></span></div>${c.dead ? '<div class="person-alert deceased">† 已遇害 · 档案仅供查阅</div>' : c.intimidated ? '<div class="person-alert">此人受恐吓，无法接受讯问</div>' : ''}</div></div>`;
}
function questionSelect() { return `<select id="question-select">${state.questions.map((q,i) => `<option value="${i}" ${question === i ? 'selected' : ''}>${escapeHtml(q)}</option>`).join('')}</select>`; }
function actionButton(text, type, payload = {}, cls = 'secondary', disabled = false) {
  return `<button class="${cls}" data-action="${type}" data-payload="${escapeHtml(JSON.stringify(payload))}" ${disabled ? 'disabled' : ''}>${text}</button>`;
}
function groupChoiceButton(group, type) {
  return `<button class="choice group-choice" style="--group-color:${palette[groupPalette[group]]}" data-action="${type}" data-payload="${escapeHtml(JSON.stringify({ group }))}"><span class="group-swatch"></span>${escapeHtml(group)}</button>`;
}
function movementGuide(context) {
  const members = context.ids.map(person).filter(Boolean);
  return `<div class="movement-guide" style="--group-color:${palette[groupPalette[context.group]]}"><div class="movement-group"><span>${context.kind === 'fire' ? '消防局指定社群' : '本阶段移动社群'}</span><b>${escapeHtml(context.group)}</b><em>${members.length} 人待移动</em></div><p>先选择地图上带“可移动”标记的人物，再点击发光的相邻街区。</p>${members.length ? `<div class="movable-roster">${members.map(c => `<button data-person="${c.id}" class="${selectedId === c.id ? 'active' : ''}"><b>${escapeHtml(c.name)}</b><span>${escapeHtml(state.blockNames[c.block])}</span></button>`).join('')}</div>` : '<div class="movement-complete">✓ 该社群人员已处理完毕</div>'}</div>`;
}
function actionPanel() {
  const c = person(selectedId);
  const mine = state.role === activeRole(state.phase);
  if (c?.dead) return `<div class="instruction waiting"><b>死者档案</b><p>该市民已遇害，不能再执行调查或移动行动。其完整身份特征保留在上方档案中。</p></div>`;
  if (state.phase === 'waiting') return `<div class="instruction"><b>等待另一位玩家</b><p>把房间码或邀请链接发给对方。对方加入后自动开始。</p></div>`;
  if (state.phase === 'setup_support') {
    if (!mine) return waitingPanel('凶手正在秘密设定案件');
    return `<div class="instruction"><b>选择支持者群体</b><p>你抽到了三个群体标记，只能保留一个。其成员在讯问时可以说谎。</p></div><div class="choice-grid">${state.supporterOptions.map(g => groupChoiceButton(g, 'choose_support')).join('')}</div>`;
  }
  if (state.phase === 'setup_detective') return mine ? `<div class="instruction"><b>选择起点</b><p>点击地图上的任一街区，放置侦探标记。</p></div>` : waitingPanel('侦探正在选择起点');
  if (state.phase === 'killer_intimidate') return mine ? `<div class="instruction"><b>恐吓两名市民</b><p>选择侦探不在同一街区的市民。已恐吓 ${state.intimidations} / 2。</p></div>${c ? actionButton('恐吓这名市民', 'intimidate', { id:c.id }, 'primary wide', c.intimidated || c.block === state.detectiveBlock) : ''}` : waitingPanel('凶手正在恐吓市民');
  if (state.phase === 'killer_murder') return mine ? `<div class="instruction"><b>选择本回合受害者</b><p>目标必须符合你的真实动机，且不能是你自己或侦探所在街区的市民。</p></div>${c ? actionButton(`谋杀 ${escapeHtml(c.name)}`, 'murder', { id:c.id }, 'primary danger wide') : ''}${actionButton(`本回合放弃谋杀 ${state.skipped ? '（第二次将判负）' : '（仅可一次）'}`, 'skip_murder', {}, 'text-button wide')}` : waitingPanel('凶手正在选择目标');
  if (state.phase === 'evacuate') return mine ? `<div class="instruction"><b>疏散案发现场</b><p>选择现场仍在的市民，再点击相邻空位街区。每街区最多三人。</p></div><div class="hint-chip">当前模式：疏散</div>` : waitingPanel('侦探正在疏散现场');
  if (state.phase === 'detective') {
    if (!mine) return state.pending && state.role === 'killer' ? '<div class="instruction"><b>请回答证人的讯问</b><p>查看下方问题，并选择“是”或“否”。只有特定证人可以说谎。</p></div>' : waitingPanel('侦探正在调查');
    const building = state.buildings[state.detectiveBlock];
    const near = c && (c.block === state.detectiveBlock || adjacent(c.block, state.detectiveBlock));
    const used = kind => state.actions.includes(kind);
    const noAction = state.actions.length >= 2;
    const pending = !!state.pending;
    return `<div class="resources"><span>行动 <b>${2-state.actions.length} / 2</b></span><span>移动 <b>${state.moves} / 2</b></span><span>当前位置 <b>${escapeHtml(state.blockNames[state.detectiveBlock])}</b></span></div>
      ${pending ? '<div class="instruction waiting"><b>等待证词</b><p>凶手玩家正在回答讯问。</p></div>' : `<div class="action-stack">
        ${actionButton(mode === 'move' ? '取消移动侦探' : '移动侦探：点击相邻街区', 'ui_move', {}, mode === 'move' ? 'secondary active wide' : 'secondary wide', state.moves === 0)}
        <div class="action-divider">讯问与建筑行动</div>
        ${questionSelect()}
        ${c && c.block === state.detectiveBlock ? actionButton(`讯问 ${escapeHtml(c.name)}`, 'question', { id:c.id }, 'secondary wide', c.intimidated || state.questioned.includes(c.id) || (noAction && !used('question'))) : ''}
        ${building === '餐馆' && c && near ? actionButton(`餐馆：讯问 ${escapeHtml(c.name)}`, 'diner', { id:c.id }, 'secondary wide', c.intimidated || used('diner') || noAction) : ''}
        ${building === '警局' && c && near ? actionButton(`警局：监视 ${escapeHtml(c.name)}`, 'surveil_place', { id:c.id }, 'secondary wide', used('police') || noAction) : ''}
        ${state.surveillance !== null ? actionButton(`查看监视结果：${escapeHtml(person(state.surveillance)?.name)}`, 'surveil_check', {}, 'accent wide') : ''}
        ${building === '医院' && c && near ? actionButton(`医院：安抚 ${escapeHtml(c.name)}`, 'comfort', { id:c.id }, 'secondary wide', !c.intimidated || used('hospital') || noAction) : ''}
        ${building === '消防局' ? actionButton('消防局：抽群体移动', 'fire', {}, 'secondary wide', used('fire') || noAction) : ''}
        ${state.firePick ? `<div class="instruction"><b>消防局：自选群体</b><p>抽到的群体已不在城中，请选择一个在场群体。</p></div><div class="choice-grid">${state.groups.filter(g => state.civilians.some(c => !c.dead && c.group === g)).map(g => groupChoiceButton(g, 'fire_choose_group')).join('')}</div>` : ''}
        ${state.fireGroup ? `${movementGuide({ kind:'fire', group:state.fireGroup, ids:state.fireRemaining || [] })}${actionButton('结束消防局移动', 'fire_done', {}, 'text-button wide')}` : ''}
        ${actionButton('结束调查，进入城市阶段', 'end_detective', {}, 'primary wide')}
      </div>`}`;
  }
  if (state.phase === 'city_killer' || state.phase === 'city_detective') return mine ? `${state.chooseCityGroup ? `<div class="instruction"><b>自选在场群体</b><p>抽到的群体已离城，请选择另一个在场群体。</p></div><div class="choice-grid">${state.groups.filter(g => state.civilians.some(c => !c.dead && c.group === g)).map(g => groupChoiceButton(g, 'city_choose_group')).join('')}</div>` : state.moveGroup ? movementGuide({ kind:'city', group:state.moveGroup, ids:state.moveRemaining || [] }) : '<div class="instruction waiting"><b>没有可移动社群</b><p>社群标记已用完，可以直接完成城市行动。</p></div>'}${c && state.moveRemaining.includes(c.id) ? '<div class="hint-chip move-selected">✓ 已选中人物 · 地图上发光街区均可到达</div>' : ''}${actionButton('完成我的城市行动', 'city_done', {}, 'primary wide')}` : waitingPanel(`${otherRole(state.role)}正在移动市民`);
  if (state.phase === 'round_end') {
    if (!mine) return waitingPanel('侦探正在整理结论');
    const canAccuse = state.victims.length >= 3;
    return `<div class="instruction"><b>${state.victims.length === 5 ? '最终指认' : '本回合结束'}</b><p>${state.victims.length === 5 ? '五起命案结束后，必须指出凶手和动机。' : '可以继续调查；从第三回合起也可提前指认。'}</p></div>
      ${canAccuse ? `<div class="accuse-form"><label>嫌疑人</label><select id="suspect-select"><option value="">请选择</option>${state.civilians.map(x => `<option value="${x.id}" ${selectedId === x.id ? 'selected' : ''}>${escapeHtml(x.name)}</option>`).join('')}</select><label>真实动机</label><select id="motive-select">${state.motives.map(m => `<option value="${m.id}" ${motiveGuess === m.id ? 'selected' : ''}>${m.name}</option>`).join('')}</select>${actionButton('提交最终指认', 'accuse', {}, 'primary danger wide', selectedId === null)}</div>` : ''}
      ${state.victims.length < 5 ? actionButton('进入下一回合', 'next_round', {}, 'secondary wide') : ''}`;
  }
  if (state.phase === 'finished') return `<div class="verdict ${state.winner}"><span>CASE CLOSED</span><h3>${roleName(state.winner)}获胜</h3><p>${escapeHtml(state.endReason)}</p></div><div class="solution"><b>真实凶手</b><span>${escapeHtml(person(state.secret.killerId)?.name)}</span><b>真实动机</b><span>${escapeHtml(state.motives.find(m => m.id === state.secret.motive)?.name)}</span><b>支持者群体</b><span>${escapeHtml(state.secret.supporter)}</span></div>`;
  return '';
}
function waitingPanel(text) { return `<div class="instruction waiting"><b>${escapeHtml(text)}</b><p>棋盘会自动同步更新。</p><div class="loading-dots"><i></i><i></i><i></i></div></div>`; }
function secretPanel() {
  if (state.role !== 'killer' || !state.secret || state.phase === 'finished') return '';
  const killer = person(state.secret.killerId), interest = person(state.secret.interestId), motive = state.motives.find(m => m.id === state.secret.motive);
  return `<details class="secret-panel"><summary>🔒 我的秘密档案 <span>仅凶手可见</span></summary><div><p><b>凶手身份</b><strong>${escapeHtml(killer?.name)}</strong></p><p><b>相关人</b><strong>${escapeHtml(interest?.name)}</strong></p><p><b>动机</b><strong>${escapeHtml(motive?.name)}</strong></p><p class="secret-rule">${escapeHtml(motive?.rule)}</p><p><b>支持者</b><strong>${escapeHtml(state.secret.supporter || '待选择')}</strong></p></div></details>`;
}
function activityPanel() {
  const entries = state.actionLog || [];
  return `<div class="activity-panel"><span class="eyebrow">ACTION HISTORY</span><h3>行动记录</h3><p class="activity-intro">按时间记录侦探与凶手执行的全部行动。</p>${entries.length ? `<div class="activity-list">${entries.map(entry => `<article class="activity-entry ${entry.role}"><div class="activity-meta"><span class="activity-role">${roleName(entry.role)}</span><span>第 ${entry.round} 回合</span><time>${new Date(entry.at).toLocaleTimeString('zh-CN', { hour:'2-digit', minute:'2-digit' })}</time></div><b>${escapeHtml(entry.label)}</b><p>${escapeHtml(entry.text)}</p></article>`).join('')}</div>` : '<div class="activity-empty"><span>◎</span><b>暂无行动</b><p>双方执行行动后会自动记录在这里。</p></div>'}</div>`;
}
function renderGame() {
  const myTurn = state.role === turnOwner(state) || state.phase === 'finished';
  const invite = `${inviteOrigin}/?room=${encodeURIComponent(state.code)}`;
  const local = session?.mode === 'local';
  const single = session?.mode === 'single';
  app.innerHTML = `<div class="game-shell">
    <header class="game-header"><div class="brand"><span class="brand-mark">◆</span><div><strong>暗藏杀机</strong><small>INTENT TO KILL</small></div></div><div class="header-middle"><span class="case-label">CASE № ${state.code}</span><span class="phase-pill ${myTurn ? 'my-turn' : ''}">${phaseLabel()}</span><span class="round-label">第 ${state.round} 回合</span></div><div class="header-right"><span class="role-badge ${state.role}">我的身份 · ${roleName(state.role)}</span>${local ? '<button class="icon-button" data-ui="cover" title="遮挡棋盘">▦ 遮挡屏幕</button>' : single ? '<span class="ai-badge">◉ 电脑对手</span>' : '<button class="icon-button" data-ui="copy" title="复制邀请链接">⌁ 分享</button>'}</div></header>
    <div class="room-strip"><span>${local ? '同机双人 · 轮流操作' : single ? `单人模式 · 电脑扮演${roleName(session.computerRole)}` : `房间码 <b>${state.code}</b>`}</span><span>${state.players.killer ? '●' : '○'} 凶手 ${state.players.detective ? '●' : '○'} 侦探</span><span>已发生 <b>${state.victims.length} / 5</b> 起命案</span><button data-ui="leave">离开房间</button></div>
    <main class="game-main">${renderBoard()}<aside class="side-panel"><div class="side-tabs"><button data-ui="tab-actions" class="${panelTab === 'actions' ? 'active' : ''}">行动</button><button data-ui="tab-history" class="${panelTab === 'history' ? 'active' : ''}">记录</button><button data-ui="tab-notes" class="${panelTab === 'notes' ? 'active' : ''}">笔记</button><button data-ui="tab-rules" class="${panelTab === 'rules' ? 'active' : ''}">规则</button></div><div class="side-content">
      ${panelTab === 'actions' ? `${selectedPanel()}<div class="panel-section"><div class="section-title">当前阶段 <span>${phaseLabel()}</span></div>${actionPanel()}${state.pending && state.role === 'killer' ? `<div class="answer-box"><span class="eyebrow">WITNESS QUESTION</span><b>${escapeHtml(person(state.pending.id)?.name)}被问：${escapeHtml(state.questions[state.pending.questionIndex])}</b><p>${state.pending.mayLie ? '这名证人可以说谎。' : '这名证人必须说实话。'}真实答案为“${state.pending.truthful ? '是' : '否'}”。</p><div class="answer-row">${actionButton('回答：是', 'answer', { answer:true }, 'secondary', !state.pending.mayLie && !state.pending.truthful)}${actionButton('回答：否', 'answer', { answer:false }, 'secondary', !state.pending.mayLie && state.pending.truthful)}</div></div>` : ''}</div>${secretPanel()}` : ''}
      ${panelTab === 'history' ? activityPanel() : ''}
      ${panelTab === 'notes' ? `<div class="notes-panel"><span class="eyebrow">PRIVATE NOTEBOOK</span><h3>调查笔记</h3><p>${local ? '仅当前角色可在游戏界面看到自己的笔记。' : '仅保存在当前浏览器，不会共享给对手。'}</p><textarea id="notes" placeholder="记录嫌疑人、证词、动机推断……">${escapeHtml(localStorage.getItem(noteKey()) || '')}</textarea><div class="notes-footer">自动保存</div></div><div class="motive-list"><h4>可能动机</h4>${state.motives.map(m => `<div><b>${m.name}</b><span>${m.rule}</span></div>`).join('')}</div></div>` : ''}
      ${panelTab === 'rules' ? `<div class="rules-panel"><span class="eyebrow">QUICK REFERENCE</span><h3>双人逻辑模式</h3><ol><li>凶手每回合恐吓两名市民，然后按秘密动机谋杀一人。整局可放弃谋杀一次。</li><li>侦探抵达新案发街区，疏散其他市民；随后有 2 移动点和 2 种不同的调查行动。</li><li>讯问时，每名证人回答一个关于凶手外貌的是非题。凶手本人、相关人及支持者可说谎。</li><li>警局可放置监视标记。查看监视结果不消耗行动，可确认此刻能否谋杀目标。</li><li>城市阶段，双方依次按抽取的群体移动市民；现场不能进入，每街区最多三人。</li><li>第五起命案的回合结束后，侦探需同时猜中凶手身份与动机。</li></ol><a href="https://hobbyworldint.com/portfolio-item/intent-to-kill/" target="_blank" rel="noopener">查看发行方规则 ↗</a></div></div>` : ''}
    </div></aside></main>
    <section class="bottom-area"><div class="victim-row"><div class="bottom-title"><span class="eyebrow">VICTIM FILES</span><b>命案卷宗</b></div>${Array.from({length:5},(_,i) => { const v=state.victims[i]; const c=v && person(v.id); return c ? `<button class="victim-slot filled" data-victim="${c.id}" title="查看 ${escapeHtml(c.name)} 的完整档案"><span>${String(i+1).padStart(2,'0')} · 第 ${v.round} 回合</span><b>${escapeHtml(c.name)}</b><small>${escapeHtml(c.group)} · ${escapeHtml(c.sex)} · ${escapeHtml(c.age)}</small><small>${escapeHtml(c.build)} · ${escapeHtml(c.height)} · ${escapeHtml(state.blockNames[c.block])}</small></button>` : `<div class="victim-slot"><span>${String(i+1).padStart(2,'0')}</span><em>待发现</em></div>`; }).join('')}</div><div class="case-log"><div class="bottom-title"><span class="eyebrow">CASE LOG</span><b>案件日志</b></div><div class="log-scroll">${state.log.slice(0,6).map(entry => `<p><span>${String(entry.round).padStart(2,'0')}</span>${escapeHtml(entry.text)}</p>`).join('')}</div></div></section>
    <div class="game-footer"><span>本项目使用原创界面与人物图形 · 玩法参照《Intent to Kill》双人逻辑模式</span><span>${local ? '同机对战 · 换人时会自动遮挡屏幕' : single ? `单人挑战 · 电脑是${roleName(session.computerRole)}` : `房间邀请：<code>${escapeHtml(invite)}</code>`}</span></div>
  </div>`;
}
function render() { if (handoff) renderHandoff(); else if (!state) renderLobby(); else renderGame(); }

async function handleAction(button) {
  const type = button.dataset.action;
  const payload = JSON.parse(button.dataset.payload || '{}');
  if (type === 'ui_move') { mode = mode === 'move' ? 'select' : 'move'; render(); return; }
  if (['question','diner'].includes(type)) payload.question = question;
  if (type === 'accuse') { payload.id = selectedId; payload.motive = motiveGuess; }
  if (type === 'murder' && !confirm(`确定谋杀 ${person(payload.id)?.name}？此行动无法撤销。`)) return;
  await action(type, payload);
}
async function handleBlock(block) {
  if (!state) return;
  if (state.phase === 'setup_detective' && state.role === 'detective') return action('choose_start', { block });
  if (state.phase === 'detective' && state.role === 'detective' && mode === 'move') {
    if (adjacent(state.detectiveBlock, block)) { mode = 'select'; return action('move_detective', { block }); }
    return toast('侦探只能移动到相邻街区', true);
  }
  if (selectedId === null) return;
  if (state.phase === 'evacuate' && state.role === 'detective') return action('evacuate', { id:selectedId, block });
  if (state.phase === 'city_killer' && state.role === 'killer' || state.phase === 'city_detective' && state.role === 'detective') {
    if (!state.moveRemaining.includes(selectedId)) return toast('请先选择带“可移动”标记的人物', true);
    if (!canMoveCivilianTo(person(selectedId), block)) return toast('请选择地图上发光的相邻街区', true);
    mode = 'select'; const id = selectedId; selectedId = null; return action('city_move', { id, block });
  }
  if (state.phase === 'detective' && state.role === 'detective' && state.fireRemaining.includes(selectedId)) {
    if (!canMoveCivilianTo(person(selectedId), block)) return toast('请选择地图上发光的相邻街区', true);
    mode = 'select'; const id = selectedId; selectedId = null; return action('fire_move', { id, block });
  }
}
app.addEventListener('click', async event => {
  const ui = event.target.closest('[data-ui]');
  const button = event.target.closest('[data-action]');
  const card = event.target.closest('[data-person]');
  const victim = event.target.closest('[data-victim]');
  const block = event.target.closest('[data-block]');
  if (ui) {
    switch (ui.dataset.ui) {
      case 'mode-offline': lobbyMode = 'offline'; render(); break;
      case 'mode-online': lobbyMode = 'online'; render(); break;
      case 'offline-ai': offlineType = 'ai'; render(); break;
      case 'offline-local': offlineType = 'local'; render(); break;
      case 'create-single': {
        try { const role = document.querySelector('input[name="single-role"]:checked').value; setSession(await request('/api/single', { method:'POST', body:JSON.stringify({role}) })); }
        catch (e) { toast(e.message, true); } break;
      }
      case 'create-local': {
        try { setSession(await request('/api/local', { method:'POST', body:'{}' })); }
        catch (e) { toast(e.message, true); } break;
      }
      case 'create': {
        try { const role = document.querySelector('input[name="role"]:checked').value; setSession(await request('/api/create', { method:'POST', body:JSON.stringify({role}) })); }
        catch (e) { toast(e.message, true); } break;
      }
      case 'join': {
        try { const code = document.querySelector('#join-code').value.trim().toUpperCase(); setSession(await request('/api/join', { method:'POST', body:JSON.stringify({code}) })); }
        catch (e) { toast(e.message, true); } break;
      }
      case 'copy': {
        try { await navigator.clipboard.writeText(`${inviteOrigin}/?room=${state.code}`); toast('邀请链接已复制'); }
        catch { toast(`房间码：${state.code}`); } break;
      }
      case 'cover': {
        if (session?.mode === 'local') {
          handoff = { targetRole: session.activeRole, reason: 'cover' };
          state = null; selectedId = null; mode = 'select'; panelTab = 'actions';
          render();
        }
        break;
      }
      case 'handoff-ready': {
        handoff = null;
        await refresh();
        break;
      }
      case 'leave': {
        if (confirm('退出此对局？当前浏览器保存的玩家身份将被清除。')) { localStorage.removeItem('itk-session'); session = null; state = null; handoff = null; stream?.close(); render(); }
        break;
      }
      case 'tab-actions': panelTab = 'actions'; render(); break;
      case 'tab-history': panelTab = 'history'; render(); break;
      case 'tab-notes': panelTab = 'notes'; render(); break;
      case 'tab-rules': panelTab = 'rules'; render(); break;
    }
    return;
  }
  if (button) return handleAction(button);
  if (victim) { selectedId = Number(victim.dataset.victim); mode = 'select'; panelTab = 'actions'; render(); return; }
  if (card) { selectedId = Number(card.dataset.person); mode = movementContext()?.ids.includes(selectedId) ? 'destination' : 'select'; panelTab = 'actions'; render(); return; }
  if (block) return handleBlock(Number(block.dataset.block));
});
app.addEventListener('change', event => {
  if (event.target.id === 'question-select') question = Number(event.target.value);
  if (event.target.id === 'motive-select') motiveGuess = event.target.value;
  if (event.target.id === 'suspect-select') { selectedId = event.target.value === '' ? null : Number(event.target.value); render(); }
});
app.addEventListener('input', event => {
  if (event.target.id === 'notes') localStorage.setItem(noteKey(), event.target.value);
  if (event.target.id === 'join-code') joinCode = event.target.value.toUpperCase();
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && session) refresh(); });
render();
request('/api/config').then(config => { inviteOrigin = config.publicUrl || location.origin; if (state) render(); }).catch(() => {});
if (session) connect();
