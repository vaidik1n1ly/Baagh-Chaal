// net.js: the link between two players. It knows nothing about the board, the rules or the screen;
// it only opens a connection and passes small messages (plain objects) back and forth.
//
// How it works: PeerJS (js/vendor/peerjs.min.js) uses a free public "matchmaker" server ONLY for the first
// handshake. After that the two browsers talk to each other directly (WebRTC), so GitHub Pages is enough.
const Net = (() => {
  const PREFIX   = "baagh-chaal-";                        // keeps our codes apart from other apps on the shared matchmaker
  const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";     // no 0/O or 1/I/L: easier to read out loud
  const PING_EVERY = 5000, GIVE_UP_AFTER = 15000, JOIN_TIMEOUT = 20000;   // milliseconds

  // Advanced (optional): define window.BAAGH_NET before the scripts load to use your own PeerServer and/or
  // TURN servers, e.g. { host: "my-server.example.com", port: 443, secure: true, config: { iceServers: [...] } }
  const options = Object.assign({ debug: 0 }, window.BAAGH_NET || {});

  let peer = null, conn = null, handlers = {}, lastHeard = 0, pinger = null, joinTimer = null;
  const newCode = () => Array.from({ length: 5 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join("");
  const say = (name, arg) => handlers[name] && handlers[name](arg);

  function close() {                                      // drop everything (used when leaving online mode)
    clearInterval(pinger); clearTimeout(joinTimer);
    const c = conn, p = peer; conn = peer = null; handlers = {};
    try { c && c.close(); } catch (e) {}
    try { p && p.destroy(); } catch (e) {}
  }

  function gone(c) {                                      // the other player's link ended
    if (conn !== c) return;
    conn = null; clearInterval(pinger);
    try { c.close(); } catch (e) {}
    say("disconnected");
  }

  function attach(c) {                                    // wire up a data connection
    if (conn && conn !== c) { const old = conn; conn = null; try { old.close(); } catch (e) {} }   // a rejoin replaces the old link
    conn = c;
    c.on("open", () => {
      if (conn !== c) return;
      clearTimeout(joinTimer); lastHeard = Date.now();
      clearInterval(pinger);
      pinger = setInterval(() => {                        // heartbeat: notice a friend who vanished without saying goodbye
        if (conn !== c) return;
        if (Date.now() - lastHeard > GIVE_UP_AFTER) return gone(c);
        try { c.send({ t: "ping" }); } catch (e) {}
      }, PING_EVERY);
      say("connected");
    });
    c.on("data", d => { if (conn !== c) return; lastHeard = Date.now(); if (d && d.t === "ping") return; say("message", d); });
    c.on("close", () => gone(c));
    c.on("error", e => { if (conn === c) say("error", e); });
  }

  // Create a game: you get a short code for your friend. handlers: ready(code), connected(), message(msg), disconnected(), error(err)
  function host(h, tries = 0) {
    if (typeof Peer === "undefined") { h.error && h.error({ type: "browser-incompatible" }); return; }
    close(); handlers = h;
    const code = newCode(), p = peer = new Peer(PREFIX + code, options);
    p.on("open", () => { if (peer === p) say("ready", code); });
    p.on("connection", c => { if (peer === p) attach(c); });
    p.on("disconnected", () => { if (peer === p) { try { p.reconnect(); } catch (e) {} } });   // lost the matchmaker: reconnect so the code keeps working
    p.on("error", err => {
      if (peer !== p) return;
      if (err.type === "unavailable-id" && tries < 5) host(h, tries + 1);                      // code already taken: pick another
      else say("error", err);
    });
  }

  // Join a friend's game by code. Same handlers as host().
  function join(code, h) {
    if (typeof Peer === "undefined") { h.error && h.error({ type: "browser-incompatible" }); return; }
    close(); handlers = h;
    const p = peer = new Peer(options);
    p.on("open", () => { if (peer === p) attach(p.connect(PREFIX + code, { reliable: true, serialization: "json" })); });
    p.on("error", err => { if (peer === p) say("error", err); });
    joinTimer = setTimeout(() => { if (peer === p) say("error", { type: "timeout" }); }, JOIN_TIMEOUT);
  }

  function send(msg) { if (conn && conn.open) { try { conn.send(msg); } catch (e) {} } }

  return { host, join, send, close, isConnected: () => !!(conn && conn.open) };
})();
