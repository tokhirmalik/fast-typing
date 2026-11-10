/*
  Data layer. Two interchangeable backends with the same interface:
   - Firebase (Auth + Firestore)  -> real event, works on every student's computer
   - Demo (localStorage)          -> trial run in one browser (tabs sync with each other)
*/
(function (root) {
  'use strict';
  var CFG = root.APP_CONFIG;
  var FTC = root.FTC;

  var STUDENT_DOMAIN = 'students.fasttyping-contest.app'; // fake e-mail domain used for username/password accounts
  var DEFAULT_CONFIG = {
    round: 0, open: false, maxAttempts: 3, showLeaderboard: false,
    durations: { '1': 30, '2': 45, '3': 60 }
  };

  function normConfig(c) {
    var out = Object.assign({}, DEFAULT_CONFIG, c || {});
    out.durations = Object.assign({}, DEFAULT_CONFIG.durations, (c && c.durations) || {});
    ['1', '2', '3'].forEach(function (k) { out.durations[k] = Number(out.durations[k]) || DEFAULT_CONFIG.durations[k]; });
    out.round = Number(out.round) || 0;
    out.maxAttempts = Number(out.maxAttempts) || 3;
    return out;
  }

  function isDemo() {
    var k = CFG && CFG.firebaseConfig && CFG.firebaseConfig.apiKey;
    return !k || String(k).indexOf('PASTE') === 0;
  }

  /* ------------------------------------------------------------------ DEMO */
  function createDemoBackend() {
    var KEY = 'ftc_demo_db_v1', SKEY = 'ftc_demo_user_v1';
    function blank() { return { config: null, texts: {}, attempts: {}, finishes: {}, players: {}, leaderboard: null, users: {} }; }
    function load() { try { var j = JSON.parse(localStorage.getItem(KEY)); if (j) return j; } catch (e) { /* ignore */ } return blank(); }
    var db = load();
    var listeners = new Set();
    var bc = ('BroadcastChannel' in root) ? new BroadcastChannel('ftc_demo') : null;
    function notify() { listeners.forEach(function (f) { f(); }); }
    function save() { localStorage.setItem(KEY, JSON.stringify(db)); notify(); if (bc) bc.postMessage('x'); }
    if (bc) bc.onmessage = function () { db = load(); notify(); };
    root.addEventListener('storage', function (e) { if (e.key === KEY) { db = load(); notify(); } });

    function watch(fn, cb) {
      var run = function () { cb(fn()); };
      listeners.add(run);
      setTimeout(run, 0);
      return function () { listeners.delete(run); };
    }
    var authCb = null;
    function curUser() { try { return JSON.parse(sessionStorage.getItem(SKEY)); } catch (e) { return null; } }
    function setUser(u) {
      if (u) sessionStorage.setItem(SKEY, JSON.stringify(u)); else sessionStorage.removeItem(SKEY);
      if (authCb) authCb(u);
    }
    function cfg() { return normConfig(db.config); }

    return {
      mode: 'demo',
      onError: null,
      onAuthChanged: function (cb) { authCb = cb; setTimeout(function () { cb(curUser()); }, 0); },
      register: function (p) {
        return new Promise(function (res, rej) {
          if (db.users[p.username]) return rej(new Error('That username is already taken.'));
          if (!p.password || p.password.length < 6) return rej(new Error('Password must be at least 6 characters.'));
          var uid = 'u_' + p.username;
          db.users[p.username] = { uid: uid, name: p.name, password: p.password };
          save();
          setUser({ uid: uid, name: p.name, email: '', isAdmin: false });
          res();
        });
      },
      loginUser: function (p) {
        return new Promise(function (res, rej) {
          var u = db.users[p.username];
          if (!u || u.password !== p.password) return rej(new Error('Wrong username or password.'));
          setUser({ uid: u.uid, name: u.name, email: '', isAdmin: false });
          res();
        });
      },
      loginGoogle: function () { setUser({ uid: 'demo-admin', name: 'Admin (demo)', email: 'admin@demo', isAdmin: true }); return Promise.resolve(); },
      logout: function () { setUser(null); return Promise.resolve(); },

      watchConfig: function (cb) { return watch(cfg, cb); },
      setConfig: function (patch) {
        var c = cfg();
        Object.keys(patch).forEach(function (k) {
          if (k === 'durations') c.durations = Object.assign({}, c.durations, patch.durations); else c[k] = patch[k];
        });
        db.config = c; save(); return Promise.resolve();
      },
      getTexts: function (round) { return Promise.resolve(db.texts['r' + round] || null); },
      setTexts: function (round, items) { db.texts['r' + round] = items; save(); return Promise.resolve(); },

      watchMyAttempts: function (uid, cb) { return watch(function () { return Object.keys(db.attempts).map(function (k) { return db.attempts[k]; }).filter(function (a) { return a.uid === uid; }); }, cb); },
      watchAllAttempts: function (cb) { return watch(function () { return Object.keys(db.attempts).map(function (k) { return db.attempts[k]; }); }, cb); },
      startAttempt: function (a) {
        return new Promise(function (res, rej) {
          var c = cfg(), id = FTC.attemptId(a.uid, a.round, a.attempt);
          if (!c.open || c.round !== a.round) return rej(new Error('This round is not open.'));
          if (db.attempts[id]) return rej(new Error('This attempt already exists.'));
          if (db.finishes[FTC.finishId(a.uid, a.round)]) return rej(new Error('You already finished this round.'));
          if (a.attempt > c.maxAttempts) return rej(new Error('No attempts left.'));
          db.attempts[id] = { id: id, uid: a.uid, name: a.name, round: a.round, attempt: a.attempt, status: 'started', startedAt: Date.now() };
          save(); res();
        });
      },
      finishAttempt: function (id, r) {
        return new Promise(function (res, rej) {
          var att = db.attempts[id];
          if (!att || att.status !== 'started') return rej(new Error('Attempt not found.'));
          Object.assign(att, r, { status: 'done', finishedAt: Date.now() });
          save(); res();
        });
      },
      finishRound: function (uid, round) {
        var id = FTC.finishId(uid, round);
        db.finishes[id] = { id: id, uid: uid, round: round, createdAt: Date.now() };
        save(); return Promise.resolve();
      },
      watchMyFinishes: function (uid, cb) { return watch(function () { return Object.keys(db.finishes).map(function (k) { return db.finishes[k]; }).filter(function (f) { return f.uid === uid; }); }, cb); },
      watchAllFinishes: function (cb) { return watch(function () { return Object.keys(db.finishes).map(function (k) { return db.finishes[k]; }); }, cb); },

      watchLeaderboard: function (cb) { return watch(function () { return db.leaderboard; }, cb); },
      publishLeaderboard: function (rows) { db.leaderboard = { rows: rows, updatedAt: Date.now() }; save(); return Promise.resolve(); },
      watchPlayers: function (cb) { return watch(function () { return Object.keys(db.players).map(function (k) { return db.players[k]; }); }, cb); },
      upsertPlayer: function (u) { db.players[u.uid] = { uid: u.uid, name: u.name, lastLogin: Date.now() }; save(); return Promise.resolve(); },
      deleteAttempt: function (id) { delete db.attempts[id]; save(); return Promise.resolve(); },
      deleteFinish: function (id) { delete db.finishes[id]; save(); return Promise.resolve(); },
      resetEvent: function () { db.attempts = {}; db.finishes = {}; db.leaderboard = null; save(); return Promise.resolve(); }
    };
  }

  /* -------------------------------------------------------------- FIREBASE */
  function friendly(e) {
    var c = (e && e.code) || '';
    var m = {
      'auth/email-already-in-use': 'That username is already taken. Pick another one.',
      'auth/invalid-credential': 'Wrong username or password.',
      'auth/invalid-login-credentials': 'Wrong username or password.',
      'auth/wrong-password': 'Wrong username or password.',
      'auth/user-not-found': 'Wrong username or password.',
      'auth/weak-password': 'Password must be at least 6 characters.',
      'auth/popup-closed-by-user': 'Sign-in was cancelled.',
      'auth/cancelled-popup-request': 'Sign-in was cancelled.',
      'auth/popup-blocked': 'The browser blocked the Google pop-up. Allow pop-ups for this site and try again.',
      'auth/unauthorized-domain': 'This website address is not in Firebase "Authorized domains" yet (see the setup guide).',
      'auth/operation-not-allowed': 'This sign-in method is not enabled in Firebase yet (see the setup guide).',
      'auth/too-many-requests': 'Too many attempts. Wait a minute and try again.',
      'auth/network-request-failed': 'No internet connection.'
    };
    return new Error(m[c] || (e && e.message) || 'Something went wrong.');
  }

  async function createFirebaseBackend() {
    var base = 'https://www.gstatic.com/firebasejs/10.14.1/';
    var mods = await Promise.all([import(base + 'firebase-app.js'), import(base + 'firebase-auth.js'), import(base + 'firebase-firestore.js')]);
    var A = mods[0], Au = mods[1], F = mods[2];
    var app = A.initializeApp(CFG.firebaseConfig);
    var auth = Au.getAuth(app);
    var db = F.getFirestore(app);
    await Au.setPersistence(auth, Au.browserSessionPersistence); // shared school computers: forget the login when the tab closes

    var self = { mode: 'firebase', onError: null };
    var authCb = null;
    var admins = (CFG.ADMIN_EMAILS || []).map(function (s) { return String(s).toLowerCase(); });

    function err(e) { console.error(e); if (self.onError) self.onError(friendly(e).message); }
    function ms(v) { return v && typeof v.toMillis === 'function' ? v.toMillis() : (typeof v === 'number' ? v : null); }
    function norm(d) {
      var x = d.data({ serverTimestamps: 'estimate' });
      ['startedAt', 'finishedAt', 'createdAt', 'lastLogin', 'updatedAt'].forEach(function (k) { if (k in x) x[k] = ms(x[k]); });
      x.id = d.id;
      return x;
    }
    function mapUser(u) {
      if (!u) return null;
      var email = (u.email || '').toLowerCase();
      return {
        uid: u.uid,
        name: u.displayName || email.split('@')[0] || 'Player',
        email: email,
        isAdmin: !!u.emailVerified && admins.indexOf(email) !== -1
      };
    }
    function listen(ref, map, cb) {
      return F.onSnapshot(ref, function (s) { cb(map(s)); }, err);
    }
    async function wipe(col) {
      var snap = await F.getDocs(F.collection(db, col));
      var batch = F.writeBatch(db), n = 0;
      for (var i = 0; i < snap.docs.length; i++) {
        batch.delete(snap.docs[i].ref);
        if (++n % 400 === 0) { await batch.commit(); batch = F.writeBatch(db); }
      }
      await batch.commit();
    }

    self.onAuthChanged = function (cb) { authCb = cb; Au.onAuthStateChanged(auth, function (u) { cb(mapUser(u)); }); };
    self.register = async function (p) {
      try {
        var cred = await Au.createUserWithEmailAndPassword(auth, p.username + '@' + STUDENT_DOMAIN, p.password);
        await Au.updateProfile(cred.user, { displayName: p.name });
        authCb(mapUser(auth.currentUser));
      } catch (e) { throw friendly(e); }
    };
    self.loginUser = async function (p) {
      try { await Au.signInWithEmailAndPassword(auth, p.username + '@' + STUDENT_DOMAIN, p.password); } catch (e) { throw friendly(e); }
    };
    self.loginGoogle = async function () {
      try { await Au.signInWithPopup(auth, new Au.GoogleAuthProvider()); } catch (e) { throw friendly(e); }
    };
    self.logout = function () { return Au.signOut(auth); };

    var cfgRef = F.doc(db, 'config', 'event');
    self.watchConfig = function (cb) { return listen(cfgRef, function (s) { return normConfig(s.exists() ? s.data() : null); }, cb); };
    self.setConfig = function (patch) { return F.setDoc(cfgRef, patch, { merge: true }); };
    self.getTexts = async function (round) {
      var s = await F.getDoc(F.doc(db, 'texts', 'r' + round));
      return s.exists() ? s.data().items : null;
    };
    self.setTexts = function (round, items) { return F.setDoc(F.doc(db, 'texts', 'r' + round), { items: items }); };

    var attemptsCol = F.collection(db, 'attempts');
    var finishesCol = F.collection(db, 'finishes');
    var listMap = function (s) { return s.docs.map(norm); };
    self.watchMyAttempts = function (uid, cb) { return listen(F.query(attemptsCol, F.where('uid', '==', uid)), listMap, cb); };
    self.watchAllAttempts = function (cb) { return listen(attemptsCol, listMap, cb); };
    self.startAttempt = function (a) {
      return F.setDoc(F.doc(db, 'attempts', FTC.attemptId(a.uid, a.round, a.attempt)), {
        uid: a.uid, name: a.name, round: a.round, attempt: a.attempt, status: 'started', startedAt: F.serverTimestamp()
      });
    };
    self.finishAttempt = function (id, r) {
      return F.updateDoc(F.doc(db, 'attempts', id), {
        status: 'done', wpm: r.wpm, accuracy: r.accuracy, correct: r.correct, typed: r.typed, seconds: r.seconds,
        finishedAt: F.serverTimestamp()
      });
    };
    self.finishRound = function (uid, round) {
      return F.setDoc(F.doc(db, 'finishes', FTC.finishId(uid, round)), { uid: uid, round: round, createdAt: F.serverTimestamp() });
    };
    self.watchMyFinishes = function (uid, cb) { return listen(F.query(finishesCol, F.where('uid', '==', uid)), listMap, cb); };
    self.watchAllFinishes = function (cb) { return listen(finishesCol, listMap, cb); };

    var lbRef = F.doc(db, 'config', 'leaderboard');
    self.watchLeaderboard = function (cb) { return listen(lbRef, function (s) { return s.exists() ? norm(s) : null; }, cb); };
    self.publishLeaderboard = function (rows) { return F.setDoc(lbRef, { rows: rows, updatedAt: F.serverTimestamp() }); };
    self.watchPlayers = function (cb) { return listen(F.collection(db, 'players'), listMap, cb); };
    self.upsertPlayer = function (u) {
      return F.setDoc(F.doc(db, 'players', u.uid), { name: u.name, lastLogin: F.serverTimestamp() }, { merge: true });
    };
    self.deleteAttempt = function (id) { return F.deleteDoc(F.doc(db, 'attempts', id)); };
    self.deleteFinish = function (id) { return F.deleteDoc(F.doc(db, 'finishes', id)); };
    self.resetEvent = async function () { await wipe('attempts'); await wipe('finishes'); await F.deleteDoc(lbRef); };
    return self;
  }

  root.FTCBackend = {
    DEFAULT_CONFIG: DEFAULT_CONFIG,
    normConfig: normConfig,
    isDemo: isDemo,
    create: function () { return isDemo() ? Promise.resolve(createDemoBackend()) : createFirebaseBackend(); }
  };
})(window);
