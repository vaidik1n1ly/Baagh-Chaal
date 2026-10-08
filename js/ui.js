// ui.js: everything you SEE and CLICK.
// It never decides rules (that's rules.js) and never picks colours/icons (that's theme.css).

// ---- the wording shown to players (edit freely) ----
// (ic) is the tiger or goat icon from theme.css.
const WORDS = {
  placeGoat: "place a goat",
  moveGoat:  "move a goat",
  moveTiger: "move a tiger",

  // vs Computer: the messages speak to YOU
  yourTurn: (ic, action) => `Your turn (${ic}): ${action}`,
  thinking: ic => `Computer (${ic}) is thinking…`,
  youWin:   ic => `You (${ic}) win!`,
  youLose:  ic => `You (${ic}) lose`,

  // 2 players: neutral wording
  turn2p: (ic, side, action) => `${ic} ${side}: ${action}`,
  win: who => `${who} win!`,

  // Online
  opponentTurn: ic => `Opponent's turn (${ic})`,
  online: {
    lobby:    "Create a game, or enter a friend's code to join.",
    setup:    "Setting up your game…",
    waiting:  code => `Waiting for your friend… share code ${code}`,
    joining:  "Connecting…",
    left:     "Your friend disconnected. They can rejoin with the same code.",
    leftGuest:"Disconnected from the host. Press Join to reconnect.",
    badCode:  "Codes are 5 letters/numbers.",
    notFound: "No game found with that code. Check it and try again.",
    noService:"Couldn't reach the connection service. Check your internet and try again.",
    noPath:   "Couldn't connect to your friend. Some networks (strict firewalls, some mobile data) block direct connections.",
    problem:  "Connection problem",
    askedNew: "Asked the host for a new game…",
    askNew:   "Your friend wants a new game. Start one?",
    declined: "The host said no to a new game.",
    copied:   "Invite link copied!"
  },

  draw: "Draw: same position repeated",
  over: {
    draw:    "The same position happened too many times.",
    trapped: "All the tigers are trapped.",
    captured:"Enough goats were captured.",
    stuck:   "The goats have no legal moves."
  }
};

// ---- small helpers ----
const $ = id => document.getElementById(id);
const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim().replace(/^["']|["']$/g, "");
const icon = side => cssVar(`--${side}-icon`) || side;       // icons come from theme.css
const popupDelay = () => animationsOn() ? parseFloat(cssVar("--anim-popup-delay")) || 0 : 0;   // timing comes from theme.css (in ms)

// ---- animations on/off: remembered in this browser; the first visit follows the device's "reduce motion" setting ----
const ANIM_KEY = "baagh-chaal-animations";
function animationsOn() { return document.documentElement.dataset.animations !== "off"; }
function setAnimations(on, save) {
  document.documentElement.dataset.animations = on ? "on" : "off";   // style.css switches everything off from this
  $("animToggle").checked = on;
  if (save) try { localStorage.setItem(ANIM_KEY, on ? "on" : "off"); } catch (e) { /* storage blocked: just don't remember */ }
}
function bump(el) { el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump"); }   // restart the little "pop"

// ---- what the screen remembers (the game itself lives in `game`) ----
let game, selected = null, history = [], thinking = false, popupClosed = false;
let prevTrapped = 0;      // for the "trapped" counter bump
let animate = null;      // the move to animate on the NEXT render (set right after a move, then cleared)
let popupTimer = null;
let online = { role: null, connected: false, mySide: null, code: null, msg: "", note: "" };   // see "online play" below

const vsComputer     = () => $("mode").value === "cpu";
const computerSide   = () => $("mySide").value === "goat" ? "tiger" : "goat";
const isComputerTurn = () => !game.winner && vsComputer() && game.turn === computerSide();
const isOnline   = () => $("mode").value === "online";
const isPersonal = () => vsComputer() || isOnline();                          // "you" against someone (computer or friend)
const mySide     = () => isOnline() ? online.mySide : $("mySide").value;       // which side the person at this screen plays

function newGame() {
  game = Rules.newGame();
  selected = null; history = []; popupClosed = false;
  render();
  maybeComputerMove();
}

// Make a move for whoever's turn it is (human or computer). Saves a snapshot first, for Undo.
function playMove(m) {
  history.push(JSON.stringify(game));
  Rules.play(game, m);
  selected = null;
  animate = m;                       // tell render() to animate this move
}

function onPointClick(p) {
  if (game.winner || isComputerTurn()) return;
  if (isOnline() && !(online.connected && online.mySide && game.turn === online.mySide)) return;   // online: only on your turn, while connected
  const piece = game.board[p];

  if (game.turn === "goat" && game.goatsInHand > 0) {           // placement phase
    if (piece === null) humanMove({ from: null, to: p, over: null });
  } else if (piece === game.turn) {                             // pick (or un-pick) one of your pieces
    selected = selected === p ? null : p;
  } else if (selected !== null) {                               // move it
    const m = Rules.movesFrom(game, selected).find(mv => mv.to === p);
    if (m) humanMove(m);
  }
  render();
  maybeComputerMove();
}

// A move made by the person at this screen: play it, and tell the friend if we're online.
function humanMove(m) {
  playMove(m);
  if (isOnline()) Net.send({ t: "move", from: m.from, to: m.to });
}

function maybeComputerMove() {
  if (!isComputerTurn() || thinking) return;
  thinking = true;
  setTimeout(() => {                                            // short pause so you can see the board
    thinking = false;
    if (isComputerTurn()) playMove(AI.chooseMove(game, game.turn, Number($("level").value)));
    render();
    maybeComputerMove();
  }, animationsOn() ? 600 : 450);                               // a bit longer when the moves are animated
}

// Undo goes back to a snapshot where it's YOUR turn (so against the computer it undoes both moves).
function findUndoIndex() {
  if (thinking || isComputerTurn() || isOnline()) return -1;      // (no Undo online: it would need your friend's OK)
  let i = history.length - 1;
  if (vsComputer()) while (i >= 0 && JSON.parse(history[i]).turn === computerSide()) i--;
  return i;
}
function undo() {
  const i = findUndoIndex();
  if (i < 0) return;
  game = JSON.parse(history[i]);
  history.length = i;
  selected = null; popupClosed = false;
  render();
}

// How did the game end for the person at the screen? "win", "lose" or "draw" (null while playing).
function resultForMe() {
  if (!game.winner) return null;
  if (game.winner === "Draw") return "draw";
  if (!isPersonal()) return "win";                          // 2 players: someone always wins
  return (game.winner === "Tigers" ? "tiger" : "goat") === mySide() ? "win" : "lose";
}

function statusText(result) {
  const vs = isPersonal(), me = mySide();
  if (result === "draw") return WORDS.draw;
  if (result) return !vs ? WORDS.win(game.winner) : (result === "win" ? WORDS.youWin : WORDS.youLose)(icon(me));
  if (isOnline() && (!online.connected || !online.mySide)) return online.msg || WORDS.online.joining;   // not connected yet / friend left
  if (isComputerTurn()) return WORDS.thinking(icon(game.turn));
  if (isOnline() && game.turn !== me) return WORDS.opponentTurn(icon(game.turn));
  const action = game.turn === "tiger" ? WORDS.moveTiger : game.goatsInHand > 0 ? WORDS.placeGoat : WORDS.moveGoat;
  return vs ? WORDS.yourTurn(icon(game.turn), action)
            : WORDS.turn2p(icon(game.turn), game.turn === "tiger" ? "Tigers" : "Goats", action);
}

// Put a data-result="win|lose|draw" label on an element (CSS colours it), or remove it.
function setResult(el, result) { if (result) el.dataset.result = result; else delete el.dataset.result; }

// ---- drawing: builds simple HTML elements; the CSS decides how they look ----
const place = p => `left:${(p % 5) * 25}%;top:${Math.floor(p / 5) * 25}%`;

function render() {
  const anim = animationsOn() ? animate : null; animate = null;   // the move to animate (only right after a move, and only if animations are on)
  let lines = "", points = "", pieces = "";
  const moves = selected === null ? [] : Rules.movesFrom(game, selected);
  const last = game.lastMove;
  const trapped = Rules.trappedTigers(game);

  for (let p = 0; p < 25; p++) {
    for (const q of Rules.adj[p])
      if (q > p) lines += `<line x1="${(p % 5) * 25}" y1="${Math.floor(p / 5) * 25}" x2="${(q % 5) * 25}" y2="${Math.floor(q / 5) * 25}"/>`;

    const m = moves.find(mv => mv.to === p);
    let cls = "point";
    if (m)                          cls += m.over !== null ? " capture" : " move";
    if (last && last.to === p)      cls += " last-to";
    if (last && last.from === p)    cls += " last-from";
    points += `<div class="${cls}" style="${place(p)}" data-p="${p}"></div>`;

    if (game.board[p]) {
      let cls = `piece ${game.board[p]}${selected === p ? " selected" : ""}${trapped.includes(p) ? " trapped" : ""}`, vars = "";
      if (anim && anim.to === p) {                                           // the piece that just moved
        cls += anim.from === null ? " drop" : anim.over !== null ? " hop" : " slide";
        if (anim.from !== null) vars = `;--fx:${(anim.from % 5) * 25}%;--fy:${Math.floor(anim.from / 5) * 25}%`;   // where it came from
      }
      pieces += `<div class="${cls}" style="${place(p)}${vars}"></div>`;
    }
  }
  if (anim && anim.over !== null) pieces = `<div class="piece goat dying" style="${place(anim.over)}"></div>` + pieces;   // the captured goat fades out
  $("grid").innerHTML = `<svg class="lines" viewBox="0 0 100 100" preserveAspectRatio="none">${lines}</svg>${points}${pieces}`;

  // status line + turn banner colour
  const result = resultForMe();
  $("status").textContent = statusText(result);

  // side panel
  $("phaseLine").textContent = game.winner ? "Game over" : game.goatsInHand > 0 ? "Placement phase" : "Movement phase";
  if (game.winner) delete $("turn").dataset.side; else $("turn").dataset.side = game.turn;   // while playing: tinted by side
  setResult($("turn"), result);                                                              // at the end: green / red / blue
  $("sideRow").hidden  = !isPersonal() || (isOnline() && online.role === "guest");   // "You play": vs computer, or the host online
  $("levelRow").hidden = !vsComputer();                                                // "Level": vs computer only
  renderOnline();
  $("inHand").textContent   = game.goatsInHand;
  $("onBoard").textContent  = game.board.filter(v => v === "goat").length;
  $("captured").textContent = game.captured;
  if (anim && anim.over !== null) bump($("captured").closest(".stat"));   // a goat was captured
  $("trapped").textContent = `${trapped.length}/${game.board.filter(v => v === "tiger").length}`;
  if (anim && trapped.length > prevTrapped) bump($("trapped").closest(".stat"));   // another tiger got stuck
  prevTrapped = trapped.length;
  $("undo").disabled        = findUndoIndex() < 0;

  // game-over popup: after a move, wait a moment so you can watch the last move first
  clearTimeout(popupTimer);
  if (anim && game.winner) popupTimer = setTimeout(() => updatePopup(result), popupDelay());
  else updatePopup(result);
}

function updatePopup(result) {
  const showPopup = game.winner && !popupClosed;
  $("overlay").style.display = showPopup ? "flex" : "none";
  setResult($("popup"), showPopup ? result : null);
  if (showPopup) {
    $("overTitle").textContent = result === "draw" ? "Draw" : isPersonal() ? statusText(result) : `${icon(game.winner === "Tigers" ? "tiger" : "goat")} ${WORDS.win(game.winner)}`;
    $("overMsg").textContent = game.winner === "Draw" ? WORDS.over.draw
      : game.winner === "Goats" ? WORDS.over.trapped
      : game.captured >= Rules.config.capturesToWin ? WORDS.over.captured : WORDS.over.stuck;
  }
}

// ============================================================
// ONLINE PLAY. The connection itself is in net.js; this is what the screen does with it.
// The host (who creates the game) sends the whole game when a friend connects; after that only moves travel
// ({from, to}). Both sides check every move with their own copy of the rules.
// ============================================================
const freshOnline = () => ({ role: null, connected: false, mySide: null, code: null, msg: WORDS.online.lobby, note: "" });

function onModeChange() {
  Net.close(); online = freshOnline();
  newGame();                                  // a fresh local board (online, it stays locked until a friend connects)
}
function onSideChange() { if (!isOnline()) newGame(); }   // online, the host's choice is used at the next new game

function onNewGameClick() {
  if (isOnline() && online.connected) {
    if (online.role === "host") restartOnline();
    else { Net.send({ t: "new-request" }); online.note = WORDS.online.askedNew; render(); }   // the host decides
    return;
  }
  newGame();
}

const otherSide = side => side === "goat" ? "tiger" : "goat";
function sendState() { Net.send({ t: "state", game, guestSide: otherSide(online.mySide) }); }
function restartOnline() { online.mySide = $("mySide").value; newGame(); sendState(); }      // host only

function createRoom() {
  Net.close(); online = freshOnline(); online.role = "host"; online.msg = WORDS.online.setup;
  Net.host({
    ready:     code => { online.code = code; online.msg = WORDS.online.waiting(code); render(); },
    connected: () => { online.connected = true; online.note = ""; if (!online.mySide) online.mySide = $("mySide").value; sendState(); render(); },   // a friend joined or rejoined
    message:   onNetMessage,
    disconnected: () => { online.connected = false; online.msg = WORDS.online.left; render(); },
    error:     showNetError
  });
  render();
}

function joinRoom() {
  const code = $("joinCode").value.trim().toUpperCase();
  if (!/^[A-Z0-9]{5}$/.test(code)) { online.note = WORDS.online.badCode; render(); return; }
  Net.close(); online = freshOnline(); online.role = "guest"; online.code = code; online.msg = WORDS.online.joining;
  Net.join(code, {
    connected: () => { online.connected = true; render(); },                         // the host's game arrives next, as a "state" message
    message:   onNetMessage,
    disconnected: () => { online.connected = false; online.code = null; online.msg = WORDS.online.leftGuest; render(); },
    error:     showNetError
  });
  render();
}

function onNetMessage(msg) {
  if (!msg || typeof msg !== "object" || !isOnline()) return;
  if (msg.t === "state" && online.role === "guest") {                 // the whole game (first connect, rejoin, or new game)
    if (!msg.game || !Array.isArray(msg.game.board) || msg.game.board.length !== 25) return;
    game = msg.game; online.mySide = msg.guestSide === "tiger" ? "tiger" : "goat";
    selected = null; history = []; popupClosed = false; online.note = "";
    render();
  } else if (msg.t === "move") {
    if (game.winner || !online.mySide || game.turn === online.mySide) return;   // not their turn: ignore
    const m = Rules.findMove(game, msg);                                         // OUR rules decide what is legal
    if (!m) { if (online.role === "guest") Net.send({ t: "sync-request" }); return; }
    playMove(m); render();
  } else if (msg.t === "sync-request" && online.role === "host") {
    sendState();                                                                 // the guest's board drifted: send the real one
  } else if (msg.t === "new-request" && online.role === "host") {
    if (confirm(WORDS.online.askNew)) restartOnline(); else Net.send({ t: "new-declined" });
  } else if (msg.t === "new-declined" && online.role === "guest") {
    online.note = WORDS.online.declined; render();
  }
}

function showNetError(err) {
  if (online.connected) return;                // a live game carries on; the heartbeat in net.js notices if the link really dies
  const type = err && err.type;
  const text = type === "peer-unavailable" ? WORDS.online.notFound
    : ["network", "server-error", "socket-error", "socket-closed", "browser-incompatible", "ssl-unavailable"].includes(type) ? WORDS.online.noService
    : type === "timeout" || type === "webrtc" ? WORDS.online.noPath
    : `${WORDS.online.problem} (${type || err})`;
  Net.close(); online = freshOnline(); online.msg = text; online.note = text;
  render();
}

function renderOnline() {
  $("onlineBox").hidden = !isOnline();
  if (!isOnline()) return;
  $("lobby").hidden    = !!online.code;
  $("roomInfo").hidden = !online.code;
  $("roomCode").textContent = online.code || "";
  $("copyLink").hidden = online.role !== "host";
  $("onlineNote").textContent = online.note;
}

function copyInvite() {
  const url = `${location.href.split(/[?#]/)[0]}?room=${online.code}`;
  (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject())
    .then(() => { online.note = WORDS.online.copied; render(); }, () => { online.note = url; render(); });   // if copying is blocked, just show the link
}

// ---- start-up ----
document.querySelectorAll("[data-icon]").forEach(el => el.textContent = `${icon(el.dataset.icon)} ${el.textContent}`.trim());
document.querySelectorAll("[data-rule]").forEach(el => el.textContent = Rules.config[el.dataset.rule]);

$("grid").addEventListener("click", e => { const pt = e.target.closest(".point"); if (pt) onPointClick(Number(pt.dataset.p)); });
let savedAnim = null;
try { savedAnim = localStorage.getItem(ANIM_KEY); } catch (e) {}
setAnimations(savedAnim ? savedAnim === "on" : !(window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches), false);
$("animToggle").onchange = () => setAnimations($("animToggle").checked, true);

$("new").onclick = onNewGameClick;
$("undo").onclick = undo;
$("overNew").onclick = onNewGameClick;
$("overClose").onclick = () => { popupClosed = true; render(); };
$("mode").onchange = onModeChange;   // changing mode or side starts a fresh game
$("mySide").onchange = onSideChange;
$("createRoom").onclick = createRoom;
$("joinRoom").onclick = joinRoom;
$("copyLink").onclick = copyInvite;
$("joinCode").oninput = e => { e.target.value = e.target.value.toUpperCase(); };
$("joinCode").onkeydown = e => { if (e.key === "Enter") joinRoom(); };
if (window.innerWidth > 1100) $("about").open = true;   // show the rules on wide screens

newGame();

// An invite link (…/index.html?room=ABCDE) opens straight into joining that game.
const roomFromLink = new URLSearchParams(location.search).get("room");
if (roomFromLink) { $("mode").value = "online"; onModeChange(); $("joinCode").value = roomFromLink.toUpperCase(); joinRoom(); }
