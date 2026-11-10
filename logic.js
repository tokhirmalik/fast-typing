/* Pure logic: scoring, ranking, default texts. Works in the browser (window.FTC) and in Node (tests). */
(function (root) {
  'use strict';

  var ROUNDS = [1, 2, 3];

  // 9 passages (3 rounds x 3 attempts). Plain ASCII, simple punctuation, so nobody is punished for symbols.
  // Rule of thumb: ~10 characters per second of the round, so even a 120 WPM typist cannot run out of text.
  var DEFAULT_TEXTS = {
    1: [
      'Every morning the students of our school gather in the yard before the first lesson begins. Some of them talk about homework, others repeat new words, and a few simply enjoy the quiet air. When the bell rings, everyone walks inside and the day starts. A good habit practiced every day will take you much further than a great plan that you never begin. Start small and stay consistent.',
      'Typing is a skill that grows with practice. At first your fingers move slowly and you must look at the keys, but after a few weeks the letters appear almost by themselves. Keep your back straight, rest your wrists, and look at the screen instead of the keyboard. Speed will come later, so focus on accuracy first and let the rhythm build naturally. Small steps repeated daily always beat a big effort made once.',
      'A library is a quiet place full of stories, maps, and ideas waiting to be found. You can travel to the other side of the world without leaving your chair, or learn how a bridge holds the weight of a hundred trucks. Anyone who reads regularly builds a larger vocabulary and a sharper mind, and that advantage will help you in every exam. So take a book home this week and read a few pages every night.'
    ],
    2: [
      'The city of Samarkand has stood on the Silk Road for more than two thousand years. Merchants once arrived there with silk, spices, paper, and glass, and they left with news from distant lands. Today travelers still walk across the great square to admire the blue domes and the carved tiles. Every building tells a small part of a long story, and every street keeps the memory of the caravans that passed through it. Learning about the past helps us understand the choices we make in the present day. Every traveler leaves with a new question.',
      'Modern computers can do millions of calculations in a single second, yet they still depend on people to give them clear instructions. A program is simply a list of steps written in a language that a machine can follow. Good programmers break a large problem into small parts, test each part carefully, and fix mistakes without getting angry. Patience matters as much as talent, because even experts spend hours searching for a single missing comma in a long file of code. Slow and careful work beats a fast mistake.',
      'Sleep is one of the most powerful tools a student has, yet many people treat it as a waste of time. During the night the brain sorts the new information of the day and stores the important parts in long term memory. Students who sleep well remember more, solve problems faster, and feel calmer during tests. Try to go to bed at the same hour each evening, put your phone away, and give your body the rest it needs before a big competition. Rest is part of training, not a break from it.'
    ],
    3: [
      'Water covers most of our planet, but only a very small part of it is fresh and safe to drink. Rivers, lakes, and underground springs supply farms, factories, and homes, and every one of them needs careful protection. When a river is polluted, the damage spreads to the fields, the animals, and finally to the people who depend on them. Simple actions make a real difference, such as closing the tap while you brush your teeth, fixing a leaking pipe, and never throwing waste into streams. If millions of families do these small things every day, the total saving is enormous, and future generations will inherit a healthier world with enough clean water for everyone.',
      'A great team is not made of people who all think alike. It is made of people who respect each other, share their ideas openly, and help one another when a task becomes difficult. During a long project there will be moments of doubt and tiredness, and that is exactly when good teammates matter most. One person may notice a mistake that everyone else missed, another may find a faster way to finish the work, and a third may simply bring energy and humor to the room. When the final result is ready, nobody remembers who was the loudest voice. They remember that they worked together, learned from each other, and achieved something none of them could have done alone.',
      'The invention of the printing press changed the way people shared knowledge. Before that time every book was copied by hand, which took months and made books very expensive. Once printers learned to arrange metal letters and press them onto paper, books became cheaper and ideas could travel much faster across countries and seas. Schools opened in more towns, scientists could compare their discoveries, and ordinary families began to read at home. Today we carry a whole library in our pockets, yet the lesson is the same: when knowledge is easy to reach, society grows stronger. Use your skills well, practice every day, and never stop learning something new.'
    ]
  };

  function round1(x) { return Math.round(x * 10) / 10; }

  /** Net WPM = (correct characters / 5) per minute. Accuracy = correct / typed characters. */
  function scoreAttempt(target, typed, seconds) {
    var correct = 0;
    for (var i = 0; i < typed.length; i++) { if (typed.charAt(i) === target.charAt(i)) correct++; }
    var minutes = seconds / 60;
    var wpm = minutes > 0 ? round1(correct / 5 / minutes) : 0;
    var accuracy = typed.length ? round1((correct / typed.length) * 100) : 0;
    return { wpm: wpm, accuracy: accuracy, correct: correct, typed: typed.length };
  }

  function attemptId(uid, round, n) { return uid + '_r' + round + '_a' + n; }
  function finishId(uid, round) { return uid + '_r' + round; }

  /** Best finished attempt of a round (highest WPM, ties -> higher accuracy). Returns null if none. */
  function bestOfRound(list) {
    var best = null;
    (list || []).forEach(function (a) {
      if (a.status !== 'done') return;
      if (!best || a.wpm > best.wpm || (a.wpm === best.wpm && a.accuracy > best.accuracy)) best = a;
    });
    return best;
  }

  function emptyRounds() { return { 1: [], 2: [], 3: [] }; }

  /** Combine players + attempts into ranked rows. Total = sum of the best WPM of each round. */
  function buildRows(players, attempts) {
    var map = {};
    (players || []).forEach(function (p) { map[p.uid] = { uid: p.uid, name: p.name || '(no name)', rounds: emptyRounds() }; });
    (attempts || []).forEach(function (a) {
      var r = map[a.uid];
      if (!r) { r = map[a.uid] = { uid: a.uid, name: a.name || '(no name)', rounds: emptyRounds() }; }
      if (!r.rounds[a.round]) r.rounds[a.round] = [];
      r.rounds[a.round].push(a);
    });
    var rows = Object.keys(map).map(function (uid) {
      var r = map[uid];
      var out = { uid: uid, name: r.name, best: {}, acc: {}, attempts: {}, total: 0, avgAcc: 0 };
      var accSum = 0, n = 0, total = 0;
      ROUNDS.forEach(function (rd) {
        var list = r.rounds[rd].slice().sort(function (a, b) { return a.attempt - b.attempt; });
        var b = bestOfRound(list);
        out.attempts[rd] = list;
        out.best[rd] = b ? b.wpm : null;
        out.acc[rd] = b ? b.accuracy : null;
        if (b) { total += b.wpm; accSum += b.accuracy; n++; }
      });
      out.total = round1(total);
      out.avgAcc = n ? round1(accSum / n) : 0;
      return out;
    });
    rows.sort(function (a, b) {
      return (b.total - a.total) || (b.avgAcc - a.avgAcc) || a.name.localeCompare(b.name);
    });
    rows.forEach(function (r, i) {
      var prev = rows[i - 1];
      r.rank = (prev && prev.total === r.total && prev.avgAcc === r.avgAcc) ? prev.rank : i + 1;
    });
    return rows;
  }

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(rows) {
    var head = ['Rank', 'Name', 'Round 1 best WPM', 'Round 2 best WPM', 'Round 3 best WPM', 'Total WPM', 'Avg accuracy %',
      'Round 1 attempts', 'Round 2 attempts', 'Round 3 attempts'];
    var lines = [head.map(csvCell).join(',')];
    rows.forEach(function (r) {
      var att = ROUNDS.map(function (rd) {
        return r.attempts[rd].map(function (a) { return a.status === 'done' ? a.wpm : 'lost'; }).join(' / ');
      });
      lines.push([r.rank, r.name, r.best[1], r.best[2], r.best[3], r.total, r.avgAcc].concat(att).map(csvCell).join(','));
    });
    return lines.join('\n');
  }

  function normalizeUsername(u) { return String(u || '').trim().toLowerCase(); }
  function validUsername(u) { return /^[a-z0-9._-]{3,20}$/.test(u); }
  function recommendedChars(seconds) { return seconds * 10; }

  var api = {
    ROUNDS: ROUNDS, DEFAULT_TEXTS: DEFAULT_TEXTS, scoreAttempt: scoreAttempt, attemptId: attemptId, finishId: finishId,
    bestOfRound: bestOfRound, buildRows: buildRows, toCsv: toCsv, normalizeUsername: normalizeUsername,
    validUsername: validUsername, recommendedChars: recommendedChars, round1: round1
  };
  if (typeof module !== 'undefined' && module.exports) { module.exports = api; } else { root.FTC = api; }
})(typeof window !== 'undefined' ? window : this);
