// ui.js: screen, settings, clicks and online UI. Rules stay in rules.js; AI stays in ai.js.
const WORDS = {
  placeGoat: "place a goat", moveGoat: "move a goat", moveTiger: "move a tiger",
  yourTurn: (ic, action) => `Your turn (${ic}): ${action}`,
  thinking: ic => `Computer (${ic}) is thinking…`, youWin: ic => `You (${ic}) win!`, youLose: ic => `You (${ic}) lose`,
  turn2p: (ic, side, action) => `${ic} ${side}: ${action}`, win: who => `${who} win!`, opponentTurn: ic => `Opponent's turn (${ic})`,
  online: {
    lobby: "Create a game, or enter a friend's code to join.", setup: "Setting up your game…", waiting: code => `Waiting for your friend… share code ${code}`, joining: "Connecting…",
    left: "Your friend disconnected. They can rejoin with the same code.", leftGuest: "Disconnected from the host. Press Join to reconnect.", badCode: "Codes are 5 letters/numbers.",
    notFound: "No game found with that code. Check it and try again.", noService: "Couldn't reach the connection service. Check your internet and try again.",
    noPath: "Couldn't connect to your friend. Some networks (strict firewalls, some mobile data) block direct connections.", problem: "Connection problem",
    askedNew: "Asked the host for a new game…", askNew: "Your friend wants a new game. Start one?", declined: "The host said no to a new game.", copied: "Invite link copied!"
  },
  draw: "Draw: same position repeated", over: { draw: "The same position happened too many times.", trapped: "All the tigers are trapped.", captured: "Enough goats were captured.", stuck: "The goats have no legal moves." }
};

const $ = id => document.getElementById(id);
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace(/^["']|["']$/g, "");
const icon = side => cssVar(`--${side}-icon`) || side;
const popupDelay = () => animationsOn() ? parseFloat(cssVar("--anim-popup-delay")) || 0 : 0;
const ANIM_KEY = "baagh-chaal-animations", SETTINGS_KEY = "baagh-chaal-settings";
const defaults = { mode: "cpu", side: "goat", level: "2" };
let settings = loadSettings(), screen = "start";
let game, selected = null, gameHistory = [], thinking = false, popupClosed = false;
let prevTrapped = 0, animate = null, popupTimer = null;
let online = { role: null, connected: false, mySide: null, code: null, msg: "", note: "" };

function loadSettings() { try { return { ...defaults, ...(JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {}) }; } catch (e) { return { ...defaults }; } }
function saveSettings() { try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); } catch (e) {} }
function syncSettingsControls() {
  $("mode").value = settings.mode; $("mySide").value = settings.side; $("level").value = settings.level;
  document.querySelectorAll("[data-mode]").forEach(b => b.classList.toggle("selected", b.dataset.mode === settings.mode));
  document.querySelectorAll("[data-side]").forEach(b => b.classList.toggle("selected", b.dataset.side === settings.side));
  document.querySelectorAll("[data-level]").forEach(b => b.classList.toggle("selected", b.dataset.level === settings.level));
  $("sideSetting").hidden = settings.mode === "2p";
  $("levelSetting").hidden = settings.mode !== "cpu";
  $("onlineBox").hidden = settings.mode !== "online";
  renderOnline();
}
function setSetting(key, value) { settings[key] = value; saveSettings(); if (key === "mode") { Net.close(); online = freshOnline(); } syncSettingsControls(); }
function animationsOn() { return document.documentElement.dataset.animations !== "off"; }
function setAnimations(on, save) { document.documentElement.dataset.animations = on ? "on" : "off"; if (save) try { localStorage.setItem(ANIM_KEY, on ? "on" : "off"); } catch (e) {} }
function bump(el) { if (!el) return; el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }

const vsComputer = () => settings.mode === "cpu";
const computerSide = () => settings.side === "goat" ? "tiger" : "goat";
const isComputerTurn = () => !!game && !game.winner && vsComputer() && game.turn === computerSide();
const isOnline = () => settings.mode === "online";
const isPersonal = () => vsComputer() || isOnline();
const mySide = () => isOnline() ? online.mySide : settings.side;

function showStartScreen({ preserveGame = true, replaceHistory = false } = {}) {
  screen = "start"; $("startScreen").hidden = false; $("gameScreen").hidden = true;
  if (!preserveGame) game = null;
  syncSettingsControls();
  if (replaceHistory) window.history.replaceState({ screen: "start" }, "", location.href.split("#")[0]);
  renderStart();
}
function showGameScreen({ pushHistory = true } = {}) {
  screen = "game"; $("startScreen").hidden = true; $("gameScreen").hidden = false;
  if (pushHistory && location.hash !== "#game") window.history.pushState({ screen: "game" }, "", `${location.href.split("#")[0]}#game`);
  render();
}
function startConfiguredGame() { if (isOnline()) { $("createRoom").focus(); return; } newGame(); }
function newGame() { game = Rules.newGame(); selected = null; gameHistory = []; popupClosed = false; prevTrapped = 0; animate = null; showGameScreen({ pushHistory: false }); render(); maybeComputerMove(); }
function playMove(m) { gameHistory.push(JSON.stringify(game)); Rules.play(game, m); selected = null; animate = m; }

function onPointClick(p) {
  if (!game || game.winner || isComputerTurn()) return;
  if (isOnline() && !(online.connected && online.mySide && game.turn === online.mySide)) return;
  const piece = game.board[p];
  if (game.turn === "goat" && game.goatsInHand > 0) { if (piece === null) humanMove({ from: null, to: p, over: null }); }
  else if (piece === game.turn) selected = selected === p ? null : p;
  else if (selected !== null) { const m = Rules.movesFrom(game, selected).find(mv => mv.to === p); if (m) humanMove(m); }
  render(); maybeComputerMove();
}
function humanMove(m) { playMove(m); if (isOnline()) Net.send({ t: "move", from: m.from, to: m.to }); }
function maybeComputerMove() {
  if (!isComputerTurn() || thinking) return;
  thinking = true;
  setTimeout(() => { thinking = false; if (isComputerTurn()) playMove(AI.chooseMove(game, game.turn, Number(settings.level))); render(); maybeComputerMove(); }, animationsOn() ? 600 : 450);
}
function findUndoIndex() {
  if (!game || thinking || isComputerTurn() || isOnline()) return -1;
  let i = gameHistory.length - 1;
  if (vsComputer()) while (i >= 0 && JSON.parse(gameHistory[i]).turn === computerSide()) i--;
  return i;
}
function undo() { const i = findUndoIndex(); if (i < 0) return; game = JSON.parse(gameHistory[i]); gameHistory.length = i; selected = null; popupClosed = false; render(); }

function resultForMe() {
  if (!game || !game.winner) return null;
  if (game.winner === "Draw") return "draw";
  if (!isPersonal()) return "win";
  return (game.winner === "Tigers" ? "tiger" : "goat") === mySide() ? "win" : "lose";
}
function statusText(result) {
  const vs = isPersonal(), me = mySide();
  if (result === "draw") return WORDS.draw;
  if (result) return !vs ? WORDS.win(game.winner) : (result === "win" ? WORDS.youWin : WORDS.youLose)(icon(me));
  if (isOnline() && (!online.connected || !online.mySide)) return online.msg || WORDS.online.joining;
  if (isComputerTurn()) return WORDS.thinking(icon(game.turn));
  if (isOnline() && game.turn !== me) return WORDS.opponentTurn(icon(game.turn));
  const action = game.turn === "tiger" ? WORDS.moveTiger : game.goatsInHand > 0 ? WORDS.placeGoat : WORDS.moveGoat;
  return vs ? WORDS.yourTurn(icon(game.turn), action) : WORDS.turn2p(icon(game.turn), game.turn === "tiger" ? "Tigers" : "Goats", action);
}
function setResult(el, result) { if (result) el.dataset.result = result; else delete el.dataset.result; }
const place = p => `left:${(p % 5) * 25}%;top:${Math.floor(p / 5) * 25}%`;

function render() {
  if (!game) return;
  const anim = animationsOn() ? animate : null; animate = null; let lines = "", points = "", pieces = "";
  const moves = selected === null ? [] : Rules.movesFrom(game, selected), last = game.lastMove, trapped = Rules.trappedTigers(game);
  for (let p = 0; p < 25; p++) {
    for (const q of Rules.adj[p]) if (q > p) lines += `<line x1="${(p % 5) * 25}" y1="${Math.floor(p / 5) * 25}" x2="${(q % 5) * 25}" y2="${Math.floor(q / 5) * 25}"/>`;
    const m = moves.find(mv => mv.to === p); let cls = "point";
    if (m) cls += m.over !== null ? " capture" : " move"; if (last && last.to === p) cls += " last-to"; if (last && last.from === p) cls += " last-from";
    points += `<div class="${cls}" style="${place(p)}" data-p="${p}"></div>`;
    if (game.board[p]) {
      let pc = `piece ${game.board[p]}${selected === p ? " selected" : ""}${trapped.includes(p) ? " trapped" : ""}`, vars = "";
      if (anim && anim.to === p) { pc += anim.from === null ? " drop" : anim.over !== null ? " hop" : " slide"; if (anim.from !== null) vars = `;--fx:${(anim.from % 5) * 25}%;--fy:${Math.floor(anim.from / 5) * 25}%`; }
      pieces += `<div class="${pc}" style="${place(p)}${vars}"></div>`;
    }
  }
  if (anim && anim.over !== null) pieces = `<div class="piece goat dying" style="${place(anim.over)}"></div>` + pieces;
  $("grid").innerHTML = `<svg class="lines" viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>${points}${pieces}`;
  const result = resultForMe(); $("status").textContent = statusText(result); $("phaseLine").textContent = game.winner ? "Game over" : game.goatsInHand > 0 ? "Placement phase" : "Movement phase";
  if (game.winner) delete $("turn").dataset.side; else $("turn").dataset.side = game.turn; setResult($("turn"), result);
  $("inHand").textContent = game.goatsInHand; $("onBoard").textContent = game.board.filter(v => v === "goat").length; $("captured").textContent = game.captured;
  if (anim && anim.over !== null) bump($("captured").closest(".stat")); $("trapped").textContent = `${trapped.length}/${game.board.filter(v => v === "tiger").length}`;
  if (anim && trapped.length > prevTrapped) bump($("trapped").closest(".stat")); prevTrapped = trapped.length; $("undo").disabled = findUndoIndex() < 0; $("summary").textContent = summaryText();
  clearTimeout(popupTimer); if (anim && game.winner) popupTimer = setTimeout(() => updatePopup(result), popupDelay()); else updatePopup(result);
}
function summaryText() {
  if (settings.mode === "2p") return "2 players";
  if (settings.mode === "cpu") return `You: ${settings.side === "tiger" ? "tigers" : "goats"} · vs Computer · ${settings.level === "1" ? "Easy" : settings.level === "2" ? "Medium" : "Hard"}`;
  return `You: ${online.mySide === "tiger" ? "tigers" : "goats"} · vs Friend`;
}
function updatePopup(result) {
  const show = !!game.winner && !popupClosed; $("overlay").style.display = show ? "flex" : "none"; setResult($("popup"), show ? result : null); if (!show) return;
  $("overTitle").textContent = result === "draw" ? "Draw" : isPersonal() ? statusText(result) : `${icon(game.winner === "Tigers" ? "tiger" : "goat")} ${WORDS.win(game.winner)}`;
  $("overMsg").textContent = game.winner === "Draw" ? WORDS.over.draw : game.winner === "Goats" ? WORDS.over.trapped : game.captured >= Rules.config.capturesToWin ? WORDS.over.captured : WORDS.over.stuck;
}

const freshOnline = () => ({ role:null, connected:false, mySide:null, code:null, msg:WORDS.online.lobby, note:"" });
function onNewGameClick() {
  if (isOnline() && online.connected) { if (online.role === "host") restartOnline(); else { Net.send({ t:"new-request" }); online.note = WORDS.online.askedNew; render(); } return; }
  newGame();
}
const otherSide = side => side === "goat" ? "tiger" : "goat";
function sendState() { Net.send({ t:"state", game, guestSide:otherSide(online.mySide) }); }
function restartOnline() { online.mySide = settings.side; newGame(); sendState(); }
function createRoom() {
  Net.close(); online = freshOnline(); online.role = "host"; online.mySide = settings.side; online.msg = WORDS.online.setup;
  Net.host({
    ready: code => { online.code = code; online.msg = WORDS.online.waiting(code); renderStart(); },
    connected: () => { online.connected = true; online.note = ""; newGame(); sendState(); }, message:onNetMessage,
    disconnected: () => { online.connected = false; online.msg = WORDS.online.left; showStartScreen(); }, error:showNetError
  }); renderStart();
}
function joinRoom() {
  const code = $("joinCode").value.trim().toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) { online.note = WORDS.online.badCode; renderStart(); return; }
  Net.close(); online = freshOnline(); online.role = "guest"; online.code = code; online.msg = WORDS.online.joining;
  Net.join(code, { connected: () => { online.connected = true; renderStart(); }, message:onNetMessage, disconnected:() => { online.connected=false; online.code=null; online.msg=WORDS.online.leftGuest; showStartScreen(); }, error:showNetError }); renderStart();
}
function onNetMessage(msg) {
  if (!msg || typeof msg !== "object" || !isOnline()) return;
  if (msg.t === "state" && online.role === "guest") {
    if (!msg.game || !Array.isArray(msg.game.board) || msg.game.board.length !== 25) return;
    game = msg.game; online.mySide = msg.guestSide === "tiger" ? "tiger" : "goat"; selected=null; gameHistory=[]; popupClosed=false; online.note=""; showGameScreen();
  } else if (msg.t === "move") {
    if (!game || game.winner || !online.mySide || game.turn === online.mySide) return;
    const m = Rules.findMove(game, msg); if (!m) { if (online.role === "guest") Net.send({t:"sync-request"}); return; } playMove(m); render();
  } else if (msg.t === "sync-request" && online.role === "host") sendState();
  else if (msg.t === "new-request" && online.role === "host") { if (confirm(WORDS.online.askNew)) restartOnline(); else Net.send({t:"new-declined"}); }
  else if (msg.t === "new-declined" && online.role === "guest") { online.note=WORDS.online.declined; renderStart(); }
}
function showNetError(err) {
  if (online.connected) return; const type=err && err.type;
  const text=type === "peer-unavailable" ? WORDS.online.notFound : ["network","server-error","socket-error","socket-closed","browser-incompatible","ssl-unavailable"].includes(type) ? WORDS.online.noService : type === "timeout" || type === "webrtc" ? WORDS.online.noPath : `${WORDS.online.problem} (${type || err})`;
  Net.close(); online=freshOnline(); online.msg=text; online.note=text; showStartScreen();
}
function renderOnline() {
  if (!$('onlineBox')) return; $("onlineBox").hidden=settings.mode !== "online"; if (settings.mode !== "online") return;
  $("lobby").hidden=!!online.code; $("roomInfo").hidden=!online.code; $("roomCode").textContent=online.code || ""; $("copyLink").hidden=online.role !== "host"; $("onlineNote").textContent=online.note || online.msg || ""; $("createRoom").disabled=online.role === "host" && !!online.code;
}
function copyInvite() { const url=`${location.href.split(/[?#]/)[0]}?room=${online.code}`; (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).then(() => { online.note=WORDS.online.copied; renderStart(); }, () => { online.note=url; renderStart(); }); }
function renderStart() { syncSettingsControls(); if (screen !== "start") return; $("backToGame").hidden=!game; $("startStatus").textContent=isOnline() ? (online.msg || "") : "Remembers your last choice"; }

// ---- startup ----
document.querySelectorAll("[data-icon]").forEach(el => el.textContent=`${icon(el.dataset.icon)} ${el.textContent}`.trim());
document.querySelectorAll("[data-rule]").forEach(el => el.textContent=Rules.config[el.dataset.rule]);
$("grid").addEventListener("click", e => { const pt=e.target.closest(".point"); if (pt) onPointClick(Number(pt.dataset.p)); });
let savedAnim=null; try { savedAnim=localStorage.getItem(ANIM_KEY); } catch(e) {}
setAnimations(savedAnim ? savedAnim === "on" : !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches), false);
document.querySelectorAll("[data-mode]").forEach(b => b.onclick=() => setSetting("mode",b.dataset.mode));
document.querySelectorAll("[data-side]").forEach(b => b.onclick=() => setSetting("side",b.dataset.side));
document.querySelectorAll("[data-level]").forEach(b => b.onclick=() => setSetting("level",b.dataset.level));
$("play").onclick=startConfiguredGame; $("backToGame").onclick=() => { if (game) showGameScreen({pushHistory:false}); }; $("gear").onclick=() => showStartScreen();
$("new").onclick=onNewGameClick; $("undo").onclick=undo; $("overNew").onclick=() => { popupClosed=false; if (isOnline() && online.connected && online.role === "guest") onNewGameClick(); else newGame(); }; $("overSettings").onclick=() => { popupClosed=true; showStartScreen(); };
$("createRoom").onclick=createRoom; $("joinRoom").onclick=joinRoom; $("copyLink").onclick=copyInvite; $("joinCode").oninput=e => { e.target.value=e.target.value.toUpperCase(); }; $("joinCode").onkeydown=e => { if(e.key === "Enter") joinRoom(); };
window.addEventListener("popstate", () => { if (screen === "game") showStartScreen({replaceHistory:true}); });
syncSettingsControls(); showStartScreen({preserveGame:false,replaceHistory:true});
const roomFromLink=new URLSearchParams(location.search).get("room");
if (roomFromLink) { setSetting("mode","online"); $("joinCode").value=roomFromLink.toUpperCase(); screen="start"; joinRoom(); }
