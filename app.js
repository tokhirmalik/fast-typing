/* UI: sign in / register, student dashboard + typing test, admin panel. Plain JavaScript, no build step. */
(function () {
  'use strict';
  var FTC = window.FTC, CFG = window.APP_CONFIG, ROUNDS = FTC.ROUNDS;
  var $app = document.getElementById('app');
  var $toast = document.getElementById('toast');
  var B = null;

  var S = {
    user: null, cfg: window.FTCBackend.normConfig(null),
    authTab: 'signin', authError: '', busy: false,
    view: 'home',            // home | typing | result
    studentTab: 'play',      // play | board
    adminTab: 'control',     // control | results | texts | players
    myAttempts: [], myFinishes: [], board: null,
    allAttempts: [], allFinishes: [], players: [],
    expanded: null, projector: false, draft: null,
    typing: null
  };
  var unsubs = [];
  var publishTimer = null;

  /* ------------------------------------------------------------ helpers */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function fmt(n) { return n == null ? '–' : (Math.round(n * 10) / 10).toFixed(1).replace(/\.0$/, ''); }
  function toast(msg) {
    $toast.textContent = msg; $toast.className = 'show';
    clearTimeout(toast.t); toast.t = setTimeout(function () { $toast.className = ''; }, 5000);
  }
  function brandHtml() {
    return '<span class="brand"><img class="logo" src="logo.png" alt="CIFS Support"><span class="evt">' + esc(CFG.EVENT_TITLE) + '</span></span>';
  }
  function dur(round) { return Number(S.cfg.durations[String(round)]) || 30; }
  function myRound(r) {
    var atts = S.myAttempts.filter(function (a) { return a.round === r; }).sort(function (a, b) { return a.attempt - b.attempt; });
    var fin = S.myFinishes.some(function (f) { return f.round === r; });
    var best = FTC.bestOfRound(atts);
    return { atts: atts, used: atts.length, finished: fin || atts.length >= S.cfg.maxAttempts, best: best };
  }
  function roundState(r) {
    var mine = myRound(r);
    if (mine.finished) return { cls: 'done', label: 'Finished' };
    if (S.cfg.open && S.cfg.round === r) return { cls: 'open', label: 'Open now' };
    if (S.cfg.round > r || (S.cfg.round === r && !S.cfg.open && S.cfg.round !== 0)) return { cls: 'closed', label: 'Closed' };
    return { cls: 'wait', label: 'Not open yet' };
  }

  /* ------------------------------------------------------------ boot */
  async function boot() {
    $app.innerHTML = '<div class="boot">Loading…</div>';
    try {
      B = await window.FTCBackend.create();
    } catch (e) {
      console.error(e);
      $app.innerHTML = '<div class="boot">Could not load Firebase. Check your internet connection and config.js, then refresh.</div>';
      return;
    }
    B.onError = toast;
    B.onAuthChanged(onUser);
  }

  function clearSubs() { unsubs.forEach(function (u) { try { u(); } catch (e) { /* ignore */ } }); unsubs = []; }

  function onUser(user) {
    clearSubs();
    S.user = user; S.view = 'home'; S.typing = null; S.myAttempts = []; S.myFinishes = [];
    S.allAttempts = []; S.allFinishes = []; S.players = []; S.draft = null; S.expanded = null; S.projector = false;
    if (user) {
      if (!user.isAdmin) B.upsertPlayer(user).catch(function (e) { console.error(e); }); // organizers are not participants
      unsubs.push(B.watchConfig(function (c) { S.cfg = c; soft(); }));
      unsubs.push(B.watchLeaderboard(function (b) { S.board = b; soft(); }));
      if (user.isAdmin) {
        unsubs.push(B.watchAllAttempts(function (a) { S.allAttempts = a; soft(); schedulePublish(); }));
        unsubs.push(B.watchAllFinishes(function (f) { S.allFinishes = f; soft(); }));
        unsubs.push(B.watchPlayers(function (p) { S.players = p; soft(); }));
        loadDraft();
      } else {
        unsubs.push(B.watchMyAttempts(user.uid, function (a) { S.myAttempts = a; soft(); }));
        unsubs.push(B.watchMyFinishes(user.uid, function (f) { S.myFinishes = f; soft(); }));
      }
    }
    render();
  }

  /* ------------------------------------------------------------ render */
  function render() {
    if (S.view === 'typing') return;
    if (!S.user) { $app.innerHTML = authView(); return; }
    if (S.view === 'result') { $app.innerHTML = resultView(); return; }
    $app.innerHTML = S.user.isAdmin ? adminView() : studentView();
  }
  // Re-render caused by incoming data: never while somebody is typing in a form field.
  function soft() {
    var ae = document.activeElement;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) && $app.contains(ae)) return;
    render();
  }

  /* ------------------------------------------------------------ auth view */
  function authView() {
    var demo = window.FTCBackend.isDemo();
    var reg = S.authTab === 'register';
    return '<div class="auth">' +
      '<img class="biglogo" src="logo.png" alt="CIFS Support">' +
      '<h2>' + esc(CFG.EVENT_TITLE) + '</h2>' +
      '<p class="sub">3 rounds · 3 attempts each · your best WPM in every round counts</p>' +
      (demo ? '<div class="demo">DEMO MODE – data stays in this browser only. Use the “Organizer” button to try the admin panel. ' +
        'Open a second tab to sign in as a student.</div>' : '') +
      '<div class="card">' +
      '<div class="tabs"><button class="tab ' + (reg ? '' : 'on') + '" data-act="authTab" data-v="signin">Sign in</button>' +
      '<button class="tab ' + (reg ? 'on' : '') + '" data-act="authTab" data-v="register">Register</button></div>' +
      '<form data-submit="' + (reg ? 'register' : 'signin') + '" autocomplete="off">' +
      (reg ? '<label>Full name<input name="name" required maxlength="40" placeholder="e.g. Aziza Karimova"></label>' : '') +
      '<label>Username<input name="username" required maxlength="20" autocapitalize="none" spellcheck="false" placeholder="letters, numbers, . _ -"></label>' +
      '<label>Password<input name="password" type="password" required minlength="6" placeholder="at least 6 characters"></label>' +
      (S.authError ? '<div class="err">' + esc(S.authError) + '</div>' : '') +
      '<button class="btn primary wide" ' + (S.busy ? 'disabled' : '') + '>' + (reg ? 'Create account' : 'Sign in') + '</button>' +
      '</form>' +
      '<div class="or"><span>or</span></div>' +
      '<button class="btn wide" data-act="google">' + (demo ? 'Organizer (demo admin)' : 'Continue with Google') + '</button>' +
      '</div></div>';
  }

  /* ------------------------------------------------------------ student view */
  function header(extra) {
    return '<header class="top">' + brandHtml() + '<div class="who">' +
      (extra || '') + '<span class="name">' + esc(S.user.name) + (S.user.isAdmin ? ' · organizer' : '') + '</span>' +
      '<button class="btn small" data-act="logout">Sign out</button></div></header>';
  }

  function studentView() {
    var tabs = '<div class="tabs inline"><button class="tab ' + (S.studentTab === 'play' ? 'on' : '') + '" data-act="sTab" data-v="play">My rounds</button>' +
      '<button class="tab ' + (S.studentTab === 'board' ? 'on' : '') + '" data-act="sTab" data-v="board">Leaderboard</button></div>';
    return header() + '<main class="wrap">' + tabs + (S.studentTab === 'board' ? boardView() : playView()) + '</main>';
  }

  function playView() {
    var c = S.cfg, html = '';
    var cur = c.round;
    var banner;
    if (cur === 0) banner = '<div class="banner wait">Waiting for the organizer to open Round 1…</div>';
    else if (c.open) banner = '<div class="banner open">Round ' + cur + ' is OPEN · ' + dur(cur) + ' seconds per attempt</div>';
    else banner = '<div class="banner wait">Round ' + cur + ' is closed. Wait for the organizer.</div>';
    html += banner + '<div class="rounds">';
    ROUNDS.forEach(function (r) {
      var st = roundState(r), m = myRound(r), slots = '';
      for (var i = 1; i <= c.maxAttempts; i++) {
        var a = m.atts.filter(function (x) { return x.attempt === i; })[0];
        var txt = !a ? '–' : (a.status === 'done' ? fmt(a.wpm) : '✕');
        slots += '<div class="slot ' + (a ? (a.status === 'done' ? 'has' : 'lost') : '') + '"><small>#' + i + '</small>' + txt + '</div>';
      }
      html += '<div class="rcard ' + st.cls + '"><div class="rhead"><b>Round ' + r + '</b><span class="pill ' + st.cls + '">' + st.label + '</span></div>' +
        '<div class="rmeta">' + dur(r) + ' s per attempt</div><div class="slots">' + slots + '</div>' +
        '<div class="best">Best <b>' + (m.best ? fmt(m.best.wpm) : '–') + '</b> WPM</div></div>';
    });
    html += '</div>';

    if (c.open && c.round > 0) {
      var r = c.round, mine = myRound(r);
      if (mine.finished) {
        html += '<div class="card pad"><h3>Round ' + r + ' complete ✓</h3><p>Your best: <b>' + (mine.best ? fmt(mine.best.wpm) : '0') +
          ' WPM</b>. Wait for the organizer to open the next round.</p></div>';
      } else {
        var next = mine.used + 1;
        html += '<div class="card pad action"><h3>Round ' + r + ' · attempt ' + next + ' of ' + c.maxAttempts + '</h3>' +
          '<ul class="rules"><li>You have <b>' + dur(r) + ' seconds</b>. The timer starts on your <b>first key press</b>.</li>' +
          '<li>Fix mistakes with Backspace – only correct characters count.</li>' +
          '<li>Pasting is disabled. Do not refresh the page during an attempt: it would use up the attempt.</li>' +
          '<li>Your <b>best</b> attempt is your round score. You may stop after any attempt.</li></ul>' +
          '<div class="btns"><button class="btn primary big" data-act="start">Start attempt ' + next + '</button>' +
          (mine.best ? '<button class="btn" data-act="finishRound">Finish round ' + r + ' now (keep ' + fmt(mine.best.wpm) + ' WPM)</button>' : '') +
          '</div></div>';
      }
    }
    return html;
  }

  function boardView() {
    var b = S.board;
    if (!S.cfg.showLeaderboard || !b || !b.rows || !b.rows.length) {
      return '<div class="card pad"><p>The organizer will publish the leaderboard soon.</p></div>';
    }
    return '<div class="card pad"><div class="tablewrap">' + boardTable(b.rows, S.user.uid, 0) + '</div>' +
      '<p class="muted small">Total = sum of your best WPM in each round. Updated ' + (b.updatedAt ? new Date(b.updatedAt).toLocaleTimeString() : '') + '</p></div>';
  }

  function boardTable(rows, meUid, limit) {
    var list = limit ? rows.slice(0, limit) : rows;
    var h = '<table class="lb"><thead><tr><th>#</th><th>Name</th><th>R1</th><th>R2</th><th>R3</th><th>Total</th><th>Acc.</th></tr></thead><tbody>';
    list.forEach(function (r) {
      h += '<tr class="' + (r.uid === meUid ? 'me' : '') + '"><td>' + r.rank + '</td><td class="l">' + esc(r.name) + '</td><td>' + fmt(r.r1 != null ? r.r1 : (r.best && r.best[1])) +
        '</td><td>' + fmt(r.r2 != null ? r.r2 : (r.best && r.best[2])) + '</td><td>' + fmt(r.r3 != null ? r.r3 : (r.best && r.best[3])) +
        '</td><td><b>' + fmt(r.total) + '</b></td><td>' + fmt(r.avgAcc) + '%</td></tr>';
    });
    return h + '</tbody></table>';
  }

  /* ------------------------------------------------------------ typing flow */
  async function beginAttempt() {
    var c = S.cfg, r = c.round;
    var mine = myRound(r), n = mine.used + 1;
    if (!c.open || mine.finished || n > c.maxAttempts) { toast('This round is not available right now.'); render(); return; }
    var items = null;
    try { items = await B.getTexts(r); } catch (e) { console.error(e); toast('Could not load the text. Check your connection and try again.'); return; }
    if (!items || !items[n - 1]) items = FTC.DEFAULT_TEXTS[r];
    var text = String(items[n - 1] || '').replace(/\s+/g, ' ').trim();
    S.typing = { round: r, attemptNo: n, text: text, dur: dur(r), phase: 'countdown', typed: '', t0: 0, timer: null, startP: null, result: null, save: 'idle' };
    S.view = 'typing';
    renderTyping();
    var count = 3, T = S.typing;
    var cd = setInterval(function () {
      if (S.typing !== T) { clearInterval(cd); return; }
      count--;
      var ov = document.getElementById('overlay');
      if (count > 0) { if (ov) ov.textContent = count; return; }
      clearInterval(cd);
      T.phase = 'ready';
      if (ov) { ov.innerHTML = 'Start typing!<small>The timer starts on your first key</small>'; ov.className = 'overlay ready'; }
      var ta = document.getElementById('ta'); ta.disabled = false; ta.focus();
    }, 1000);
  }

  function renderTyping() {
    var T = S.typing;
    var spans = T.text.split('').map(function (ch, i) { return '<span class="ch' + (i === 0 ? ' cur' : '') + '">' + esc(ch) + '</span>'; }).join('');
    $app.innerHTML = '<div class="typing">' +
      '<div class="thead"><div>Round ' + T.round + ' · attempt ' + T.attemptNo + ' of ' + S.cfg.maxAttempts + '</div>' +
      '<div class="timer" id="timer">' + T.dur + '</div><div id="live" class="live">0 WPM</div></div>' +
      '<div class="tbox" id="tbox">' + spans + '<div class="overlay" id="overlay">3</div></div>' +
      '<textarea id="ta" disabled autocomplete="off" autocorrect="off" autocapitalize="off" spellcheck="false" maxlength="' + T.text.length + '"></textarea>' +
      '<div class="thint">Fix mistakes with Backspace. Click the text if typing stops working.</div>' +
      '<div class="tfoot"><button class="btn small" data-act="cancelAttempt" id="cancel">Cancel (only before you type)</button></div></div>';
    var ta = document.getElementById('ta'), box = document.getElementById('tbox');
    ta.addEventListener('input', onTypeInput);
    ['paste', 'cut', 'drop', 'contextmenu', 'copy'].forEach(function (ev) { ta.addEventListener(ev, function (e) { e.preventDefault(); }); });
    ta.addEventListener('keydown', function (e) {
      if (/^(Arrow|Home|End|Page)/.test(e.key) || ((e.ctrlKey || e.metaKey) && /^[azxcv]$/i.test(e.key))) e.preventDefault();
    });
    var toEnd = function () { ta.setSelectionRange(ta.value.length, ta.value.length); };
    ta.addEventListener('click', toEnd); ta.addEventListener('select', toEnd);
    box.addEventListener('mousedown', function (e) { e.preventDefault(); ta.focus(); });
  }

  function paintTyping() {
    var T = S.typing, spans = document.getElementById('tbox').getElementsByClassName('ch');
    var limit = Math.min(spans.length, Math.max(T.typed.length + 2, T.prevLen || 0));
    for (var i = 0; i < limit; i++) {
      var cls = i < T.typed.length ? (T.typed.charAt(i) === T.text.charAt(i) ? 'ok' : 'bad') : (i === T.typed.length ? 'cur' : '');
      var want = 'ch' + (cls ? ' ' + cls : '');
      if (spans[i].className !== want) spans[i].className = want;
    }
    T.prevLen = T.typed.length;
    var caret = spans[Math.min(T.typed.length, spans.length - 1)], box = document.getElementById('tbox');
    if (caret) box.scrollTop = Math.max(0, caret.offsetTop - box.clientHeight / 3);
  }

  function onTypeInput() {
    var T = S.typing, ta = document.getElementById('ta');
    if (!T || (T.phase !== 'ready' && T.phase !== 'running')) { if (T) ta.value = T.typed; return; }
    if (T.phase === 'ready') {
      T.phase = 'running';
      T.t0 = performance.now();
      var ov = document.getElementById('overlay'); if (ov) ov.style.display = 'none';
      var cancel = document.getElementById('cancel'); if (cancel) cancel.style.visibility = 'hidden';
      T.startP = B.startAttempt({ uid: S.user.uid, name: S.user.name, round: T.round, attempt: T.attemptNo })
        .then(function () { return { ok: true }; }, function (e) { return { ok: false, err: e }; });
      T.startP.then(function (st) { if (!st.ok && S.typing === T && T.phase === 'running') abortAttempt(st.err); });
      T.timer = setInterval(tick, 100);
    }
    T.typed = ta.value;
    paintTyping();
    if (T.typed.length >= T.text.length) finishTyping('text');
  }

  function tick() {
    var T = S.typing; if (!T || T.phase !== 'running') return;
    var el = (performance.now() - T.t0) / 1000, rem = Math.max(0, T.dur - el);
    var tm = document.getElementById('timer'), lv = document.getElementById('live');
    if (tm) { tm.textContent = Math.ceil(rem); tm.className = 'timer' + (rem <= 5 ? ' low' : ''); }
    if (lv) lv.textContent = Math.round(FTC.scoreAttempt(T.text, T.typed, Math.max(el, 3)).wpm) + ' WPM';
    if (rem <= 0) finishTyping('time');
  }

  function abortAttempt(e) {
    var T = S.typing; clearInterval(T.timer);
    S.typing = null; S.view = 'home';
    toast('Could not start the attempt: ' + ((e && e.message) || 'unknown error') + ' The round may have been closed.');
    render();
  }

  function finishTyping(reason) {
    var T = S.typing; if (!T || T.phase !== 'running') return;
    clearInterval(T.timer);
    T.phase = 'done';
    document.getElementById('ta').disabled = true;
    var elapsed = reason === 'time' ? T.dur : Math.min(T.dur, (performance.now() - T.t0) / 1000);
    var secs = Math.max(elapsed, 2);
    var sc = FTC.scoreAttempt(T.text, T.typed, secs);
    T.result = { wpm: sc.wpm, accuracy: sc.accuracy, correct: sc.correct, typed: sc.typed, seconds: FTC.round1(secs) };
    T.reason = reason;
    S.view = 'result';
    render();
    saveResult();
  }

  async function saveResult() {
    var T = S.typing; if (!T) return;
    T.save = 'saving'; refreshSaveBadge();
    try {
      var st = await T.startP;
      if (!st.ok) throw st.err;
      await B.finishAttempt(FTC.attemptId(S.user.uid, T.round, T.attemptNo), T.result);
      T.save = 'saved';
    } catch (e) {
      console.error(e); T.save = 'failed';
    }
    if (S.typing === T) render();
  }
  function refreshSaveBadge() { if (S.view === 'result') render(); }

  function resultView() {
    var T = S.typing, r = T.result, c = S.cfg;
    var mine = myRound(T.round);
    var prevBest = mine.atts.filter(function (a) { return a.attempt !== T.attemptNo; });
    var pb = FTC.bestOfRound(prevBest);
    var best = Math.max(pb ? pb.wpm : 0, T.save === 'failed' ? 0 : r.wpm);
    var canAgain = T.attemptNo < c.maxAttempts && c.open && c.round === T.round && T.save === 'saved';
    var badge = T.save === 'saved' ? '<span class="pill done">Saved ✓</span>' : T.save === 'failed'
      ? '<span class="pill closed">Not saved</span>' : '<span class="pill wait">Saving…</span>';
    var h = header() + '<main class="wrap"><div class="card pad result"><div class="rtitle">Round ' + T.round + ' · attempt ' + T.attemptNo + ' ' + badge + '</div>' +
      '<div class="bigwpm">' + fmt(r.wpm) + '<small>WPM</small></div>' +
      '<div class="stats"><div><b>' + fmt(r.accuracy) + '%</b><small>accuracy</small></div><div><b>' + r.correct + '</b><small>correct characters</small></div>' +
      '<div><b>' + fmt(r.seconds) + ' s</b><small>time</small></div><div><b>' + fmt(best) + '</b><small>round best WPM</small></div></div>';
    if (T.save === 'failed') {
      h += '<div class="err">The result could not be saved (round closed, no connection, or it took too long). ' +
        '<button class="btn small" data-act="retrySave">Try saving again</button></div>';
    }
    h += '<div class="btns">';
    if (canAgain) h += '<button class="btn primary big" data-act="again">Try again – attempt ' + (T.attemptNo + 1) + ' of ' + c.maxAttempts + '</button>';
    if (T.save === 'saved' && T.attemptNo < c.maxAttempts) h += '<button class="btn" data-act="finishRoundResult">Finish round ' + T.round + ' (keep ' + fmt(best) + ' WPM)</button>';
    h += '<button class="btn" data-act="home"' + (T.save === 'saving' ? ' disabled' : '') + '>Back to my rounds</button></div></div></main>';
    return h;
  }

  /* ------------------------------------------------------------ admin */
  function adminRows() { return FTC.buildRows(S.players, S.allAttempts); }

  function adminView() {
    var names = { control: 'Control', results: 'Live results', texts: 'Texts', players: 'Participants' };
    var nav = '<div class="tabs inline">' + Object.keys(names).map(function (k) {
      return '<button class="tab ' + (S.adminTab === k ? 'on' : '') + '" data-act="aTab" data-v="' + k + '">' + names[k] + '</button>';
    }).join('') + '</div>';
    var panel = S.adminTab === 'control' ? controlPanel() : S.adminTab === 'results' ? resultsPanel() : S.adminTab === 'texts' ? textsPanel() : playersPanel();
    return header() + '<main class="wrap wide">' + nav + panel + '</main>' + (S.projector ? projectorView() : '');
  }

  function controlPanel() {
    var c = S.cfg, h = '';
    var state = c.round === 0 ? 'LOBBY – nothing is open' : 'Round ' + c.round + ' is ' + (c.open ? 'OPEN' : 'CLOSED');
    h += '<div class="card pad"><div class="status ' + (c.open ? 'open' : 'wait') + '">' + state + '</div>' +
      '<p class="muted">Students can only type while a round is OPEN. Open one round at a time.</p><div class="btns">';
    ROUNDS.forEach(function (r) {
      h += '<button class="btn ' + (c.round === r && c.open ? 'primary' : '') + ' big" data-act="openRound" data-r="' + r + '">' +
        (c.round === r && c.open ? '● ' : '▶ ') + 'Open round ' + r + ' <small>(' + dur(r) + ' s)</small></button>';
    });
    h += '</div><div class="btns"><button class="btn" data-act="closeRound"' + (c.open ? '' : ' disabled') + '>⏸ Close current round</button>' +
      '<button class="btn" data-act="lobby">Back to lobby</button></div></div>';

    h += '<div class="grid2"><div class="card pad"><h3>Leaderboard for students</h3>' +
      '<label class="check"><input type="checkbox" id="showLb" ' + (c.showLeaderboard ? 'checked' : '') + ' data-act="toggleLb"> Show the leaderboard to students</label>' +
      '<p class="muted small">While this page is open and the box is ticked, the leaderboard is refreshed automatically a few seconds after every new result. ' +
      (S.board && S.board.updatedAt ? 'Last published: ' + new Date(S.board.updatedAt).toLocaleTimeString() + '.' : 'Not published yet.') + '</p>' +
      '<button class="btn" data-act="publishNow">Publish now</button></div>';

    h += '<div class="card pad"><h3>Round settings</h3><form data-submit="saveSettings" class="settings">' +
      ROUNDS.map(function (r) { return '<label>Round ' + r + ' seconds<input type="number" name="d' + r + '" min="10" max="300" value="' + dur(r) + '"></label>'; }).join('') +
      '<label>Attempts per round<input type="number" name="max" min="1" max="5" value="' + c.maxAttempts + '"></label>' +
      '<button class="btn primary">Save settings</button></form></div></div>';

    h += '<div class="card pad danger"><h3>Danger zone</h3><p class="muted small">Deletes every attempt and result (participants stay registered). Use it after a test run.</p>' +
      '<button class="btn bad" data-act="reset">Reset all scores</button></div>';
    return h;
  }

  function resultsPanel() {
    var rows = adminRows(), c = S.cfg;
    var inProg = S.allAttempts.filter(function (a) { return a.status === 'started'; }).length;
    var h = '<div class="bar"><div class="chips"><span class="chip">' + rows.length + ' participants</span><span class="chip">' + S.allAttempts.length +
      ' attempts</span><span class="chip">' + inProg + ' typing / unsaved</span></div><div class="btns">' +
      '<button class="btn" data-act="projector">📺 Projector view</button><button class="btn" data-act="csv">⬇ Export CSV</button></div></div>';
    if (!rows.length) return h + '<div class="card pad"><p>No participants yet. Students register on the home page.</p></div>';
    h += '<div class="card"><div class="tablewrap"><table class="lb adm"><thead><tr><th>#</th><th>Name</th><th>R1</th><th>R2</th><th>R3</th><th>Total</th><th>Acc.</th><th></th></tr></thead><tbody>';
    rows.forEach(function (r) {
      var open = S.expanded === r.uid;
      h += '<tr><td>' + r.rank + '</td><td class="l">' + esc(r.name) + '</td><td>' + fmt(r.best[1]) + '</td><td>' + fmt(r.best[2]) + '</td><td>' + fmt(r.best[3]) +
        '</td><td><b>' + fmt(r.total) + '</b></td><td>' + fmt(r.avgAcc) + '%</td><td><button class="btn small" data-act="expand" data-u="' + esc(r.uid) + '">' + (open ? 'Hide' : 'Details') + '</button></td></tr>';
      if (open) {
        h += '<tr class="detail"><td colspan="8">';
        ROUNDS.forEach(function (rd) {
          var fin = S.allFinishes.filter(function (f) { return f.uid === r.uid && f.round === rd; })[0];
          h += '<div class="drow"><b>Round ' + rd + '</b>';
          if (!r.attempts[rd].length) h += '<span class="muted"> no attempts</span>';
          r.attempts[rd].forEach(function (a) {
            h += '<span class="achip ' + a.status + '">#' + a.attempt + ': ' + (a.status === 'done' ? fmt(a.wpm) + ' WPM (' + fmt(a.accuracy) + '%)' : 'unfinished') +
              ' <button class="x" title="Delete this attempt so the student can redo it" data-act="delAttempt" data-id="' + esc(a.id) + '">✕</button></span>';
          });
          if (fin) h += '<span class="achip fin">finished early <button class="x" title="Reopen the round for this student" data-act="delFinish" data-id="' + esc(fin.id) + '">✕</button></span>';
          h += '</div>';
        });
        h += '</td></tr>';
      }
    });
    return h + '</tbody></table></div></div><p class="muted small">Tip: deleting an attempt (✕) gives that student a free redo, but only while that round is open and the number of attempts allows it.</p>';
  }

  function projectorView() {
    var rows = adminRows().filter(function (r) { return r.total > 0; });
    return '<div class="proj"><div class="projhead">' + brandHtml() +
      '<button class="btn" data-act="projectorClose">Close ✕</button></div>' +
      '<div class="projtable">' + (rows.length ? boardTable(rows, null, 15) : '<p class="muted">No results yet…</p>') + '</div></div>';
  }

  function textsPanel() {
    if (!S.draft) return '<div class="card pad">Loading texts…</div>';
    var h = '<p class="muted">Everyone gets the same text for the same round and attempt number. Aim for about 10 characters per second of the round so fast typists never run out. ' +
      'Use plain letters and simple punctuation.</p>';
    ROUNDS.forEach(function (r) {
      var need = FTC.recommendedChars(dur(r));
      h += '<div class="card pad"><h3>Round ' + r + ' <small class="muted">(' + dur(r) + ' s · at least ~' + need + ' characters)</small></h3>';
      for (var i = 0; i < 3; i++) {
        var t = S.draft[r][i] || '';
        h += '<label>Attempt ' + (i + 1) + ' <span class="count ' + (t.length < need ? 'short' : '') + '" id="cnt-' + r + '-' + i + '">' + t.length + ' chars</span>' +
          '<textarea rows="4" data-r="' + r + '" data-i="' + i + '">' + esc(t) + '</textarea></label>';
      }
      h += '<button class="btn primary" data-act="saveTexts" data-r="' + r + '">Save round ' + r + ' texts</button></div>';
    });
    h += '<button class="btn" data-act="defaultTexts">Fill all with the built-in texts (then press Save)</button>';
    return h;
  }

  async function loadDraft() {
    var d = {};
    for (var i = 0; i < ROUNDS.length; i++) {
      var r = ROUNDS[i], items = null;
      try { items = await B.getTexts(r); } catch (e) { console.error(e); }
      d[r] = (items && items.length ? items : FTC.DEFAULT_TEXTS[r]).slice(0, 3);
      while (d[r].length < 3) d[r].push('');
    }
    S.draft = d; soft();
  }

  function playersPanel() {
    var list = S.players.slice().sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    var h = '<div class="card pad"><h3>' + list.length + ' registered participants</h3><div class="plist">';
    list.forEach(function (p) {
      h += '<div class="pitem">' + esc(p.name) + '<small>' + (p.lastLogin ? new Date(p.lastLogin).toLocaleTimeString() : '') + '</small></div>';
    });
    return h + '</div><p class="muted small">Time = last sign-in. </p></div>';
  }

  function schedulePublish() {
    if (!S.user || !S.user.isAdmin || !S.cfg.showLeaderboard) return;
    clearTimeout(publishTimer);
    publishTimer = setTimeout(publishBoard, 6000);
  }
  function publishBoard() {
    var rows = adminRows().filter(function (r) { return r.total > 0; }).map(function (r) {
      return { uid: r.uid, name: r.name, rank: r.rank, r1: r.best[1], r2: r.best[2], r3: r.best[3], total: r.total, avgAcc: r.avgAcc };
    });
    return B.publishLeaderboard(rows).catch(function (e) { console.error(e); toast('Could not publish the leaderboard.'); });
  }

  function downloadCsv() {
    var csv = '﻿' + FTC.toCsv(adminRows());
    var a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'typing-results.csv';
    document.body.appendChild(a); a.click(); a.remove();
  }

  /* ------------------------------------------------------------ events */
  var actions = {
    authTab: function (t) { S.authTab = t.dataset.v; S.authError = ''; render(); },
    google: async function () {
      try { await B.loginGoogle(); } catch (e) { S.authError = e.message; render(); }
    },
    logout: function () { B.logout(); },
    sTab: function (t) { S.studentTab = t.dataset.v; render(); },
    aTab: function (t) { S.adminTab = t.dataset.v; render(); },
    start: function () { beginAttempt(); },
    again: function () { beginAttempt(); },
    cancelAttempt: function () { if (S.typing && S.typing.phase !== 'running') { S.typing = null; S.view = 'home'; render(); } },
    home: function () { S.typing = null; S.view = 'home'; render(); },
    retrySave: function () { saveResult(); },
    finishRound: function () { doFinishRound(S.cfg.round, false); },
    finishRoundResult: function () { doFinishRound(S.typing.round, true); },

    openRound: function (t) {
      var r = Number(t.dataset.r);
      B.setConfig({ round: r, open: true }).then(function () { toast('Round ' + r + ' is open.'); }, function (e) { toast('Failed: ' + e.message); });
    },
    closeRound: function () { B.setConfig({ open: false }).then(function () { toast('Round closed.'); }, function (e) { toast('Failed: ' + e.message); }); },
    lobby: function () { B.setConfig({ round: 0, open: false }); },
    toggleLb: function (t) {
      B.setConfig({ showLeaderboard: t.checked }).then(function () { if (t.checked) publishBoard(); });
    },
    publishNow: function () { publishBoard().then(function () { toast('Leaderboard published.'); }); },
    reset: function () {
      if (!confirm('Delete ALL attempts and results? This cannot be undone.')) return;
      B.resetEvent().then(function () { toast('All scores deleted.'); }, function (e) { toast('Failed: ' + e.message); });
    },
    expand: function (t) { S.expanded = S.expanded === t.dataset.u ? null : t.dataset.u; render(); },
    delAttempt: function (t) {
      if (!confirm('Delete this attempt? The student will be able to redo it (while the round is open).')) return;
      B.deleteAttempt(t.dataset.id).catch(function (e) { toast('Failed: ' + e.message); });
    },
    delFinish: function (t) { B.deleteFinish(t.dataset.id).catch(function (e) { toast('Failed: ' + e.message); }); },
    projector: function () { S.projector = true; render(); },
    projectorClose: function () { S.projector = false; render(); },
    csv: downloadCsv,
    defaultTexts: function () {
      S.draft = {}; ROUNDS.forEach(function (r) { S.draft[r] = FTC.DEFAULT_TEXTS[r].slice(); }); render();
    },
    saveTexts: function (t) {
      var r = Number(t.dataset.r), items = S.draft[r].map(function (x) { return x.replace(/\s+/g, ' ').trim(); });
      if (items.some(function (x) { return !x; })) { toast('All three texts must be filled in.'); return; }
      B.setTexts(r, items).then(function () { toast('Round ' + r + ' texts saved.'); }, function (e) { toast('Failed: ' + e.message); });
    }
  };

  function doFinishRound(round, fromResult) {
    if (!confirm('Finish round ' + round + ' now? You will not be able to make more attempts in this round.')) return;
    B.finishRound(S.user.uid, round).then(function () {
      S.typing = null; S.view = 'home'; render(); toast('Round ' + round + ' finished.');
    }, function (e) { toast('Could not finish the round: ' + e.message); });
  }

  var submits = {
    signin: async function (f) {
      var u = FTC.normalizeUsername(f.username.value), p = f.password.value;
      S.busy = true; S.authError = '';
      try { await B.loginUser({ username: u, password: p }); } catch (e) { S.authError = e.message; }
      S.busy = false; if (!S.user) render();
    },
    register: async function (f) {
      var name = f.name.value.trim(), u = FTC.normalizeUsername(f.username.value), p = f.password.value;
      S.authError = '';
      if (name.length < 2) S.authError = 'Please enter your full name.';
      else if (!FTC.validUsername(u)) S.authError = 'Username: 3–20 characters, only letters, numbers, dot, dash or underscore.';
      if (S.authError) { render(); return; }
      S.busy = true;
      try { await B.register({ name: name, username: u, password: p }); } catch (e) { S.authError = e.message; }
      S.busy = false; if (!S.user) render();
    },
    saveSettings: function (f) {
      var d = {};
      ROUNDS.forEach(function (r) { d[String(r)] = Math.max(10, Math.min(300, parseInt(f['d' + r].value, 10) || 30)); });
      var max = Math.max(1, Math.min(5, parseInt(f.max.value, 10) || 3));
      B.setConfig({ durations: d, maxAttempts: max }).then(function () { toast('Settings saved.'); }, function (e) { toast('Failed: ' + e.message); });
    }
  };

  $app.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t || t.tagName === 'FORM') return;
    if (t.type === 'checkbox' && e.type === 'click') { /* handled below via change */ return; }
    var fn = actions[t.dataset.act]; if (fn) fn(t, e);
  });
  $app.addEventListener('change', function (e) {
    var t = e.target;
    if (t.type === 'checkbox' && t.dataset.act && actions[t.dataset.act]) actions[t.dataset.act](t, e);
  });
  $app.addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target, fn = submits[f.dataset.submit]; if (fn) fn(f);
  });
  $app.addEventListener('input', function (e) {
    var t = e.target;
    if (t.tagName === 'TEXTAREA' && t.dataset.r && S.draft) {
      var r = Number(t.dataset.r), i = Number(t.dataset.i);
      S.draft[r][i] = t.value;
      var cnt = document.getElementById('cnt-' + r + '-' + i);
      if (cnt) { cnt.textContent = t.value.length + ' chars'; cnt.className = 'count ' + (t.value.length < FTC.recommendedChars(dur(r)) ? 'short' : ''); }
    }
  });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.projector) { S.projector = false; render(); } });

  boot();
})();
