/**
 * 計画表の計算（formrunの回答1行 → 日ごとの計画）。
 * 設計：Notion「計画アンケートv2」の「GASで並べるとき」「回答から計画表のどの欄に入るか」。
 * 画面（HTML）は render.js が作る。ここは日付と文字だけを扱い、GAS（V8）でもNode.jsでも動くように書く。
 *
 * 入力：row（formrunのスプレッドシートの1行。キー＝列名）、opts（studentName など）
 * 出力：計画表のモデル（style, title, cards, weeks, leftovers …）
 *
 * 決めたこと（Notionに書かれていない部分）
 *  - 期間：回答の翌日から。定期テスト・検定・受験逆算は、ゴールの2日前まで（前日は見直しだけ）
 *  - 1日の使える時間＝その曜日の時間 − 学校の課題の時間（週の合計を、勉強する日で均等に割る）。予備日と、行事の日は0
 *  - 1ページの時間は、実測×1.5。「まだ計っていない」は仮（数学15分、それ以外10分）で、計画表に「仮」と出す
 *  - 教材を入れた順に前から詰める。入りきらなかった分は、削らずに「入りきらなかった分」として出す
 *  - 範囲が数字でない（3-aなど）教材は、分けずに1つのまとまりとして、1ページ分の時間で置く
 *
 * 変更履歴
 *   2026-10-27 新規作成（有元）
 */
(function (root) {
  'use strict';

  var DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
  var DAY_JA = ['月', '火', '水', '木', '金', '土', '日'];
  var AVAIL_MIN = { '0分': 0, '30分': 30, '1時間': 60, '1時間半': 90, '2時間': 120, '3時間以上': 180 };
  var HW_WEEKLY_MIN = { 'ほとんどない': 0, '1〜2時間': 90, '3〜4時間': 210, '5時間以上': 300 };
  var UNIT_MIN = { '3分': 3, '5分': 5, '10分': 10, '15分': 15, '20分': 20, '30分': 30, '45分': 45, '60分': 60 };
  var FACTOR = 1.5;
  var MAX_TASKS = 10;

  // ---- 日付（'YYYY-MM-DD' の文字列で扱う。時刻のずれを避けるため、UTCで計算）----
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function toMs(s) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s || '');
    return m ? Date.UTC(+m[1], +m[2] - 1, +m[3]) : null;
  }
  function ymd(ms) { var d = new Date(ms); return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate()); }
  function addDays(s, n) { return ymd(toMs(s) + n * 86400000); }
  function diffDays(a, b) { return Math.round((toMs(b) - toMs(a)) / 86400000); }
  function dow(s) { return (new Date(toMs(s)).getUTCDay() + 6) % 7; } // 0=月 … 6=日
  function md(s) { var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); return (+m[2]) + '/' + (+m[3]); }
  function mondayOf(s) { return addDays(s, -dow(s)); }

  // ---- 回答の読み取り ----
  function str(row, k) { var v = row[k]; return v == null ? '' : String(v).trim(); }
  function pickOther(row, k) { var v = str(row, k); return v === 'その他' ? (str(row, k + '_other') || 'その他') : v; }
  function numOf(v) {
    var s = String(v == null ? '' : v).trim().replace(/[０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); });
    return /^\d+(\.\d+)?$/.test(s) ? parseFloat(s) : null;
  }
  function splitMulti(s) { return String(s || '').split(/,\s*/).map(function (x) { return x.trim(); }).filter(Boolean); }
  function createdDate(row) { var m = /^(\d{4}-\d{2}-\d{2})/.exec(str(row, '作成日')); return m ? m[1] : null; }

  function availability(row) {
    return DAY_KEYS.map(function (k) { var a = AVAIL_MIN[str(row, 'avail_' + k)]; return a == null ? 0 : a; });
  }
  function reserveIndex(row) { return DAY_JA.indexOf(str(row, 'reserve_day')); }

  // 「11/3 部活の大会」「11/15〜16 修学旅行」などから、勉強できない日を読む。読めなかった分は unparsed に残す
  function parseBusy(note, refDate) {
    var dates = {}, unparsed = [];
    var refY = +refDate.slice(0, 4);
    String(note || '').split(/[、,，;；\n]+/).forEach(function (part) {
      part = part.trim();
      if (!part) return;
      var r = /(\d{1,2})[\/月](\d{1,2})日?\s*[〜~\-ー－]\s*(?:(\d{1,2})[\/月])?(\d{1,2})日?/.exec(part);
      var s = /(\d{1,2})[\/月](\d{1,2})日?/.exec(part);
      var found = false;
      function yearFor(m, d) {
        var c = refY + '-' + pad(m) + '-' + pad(d);
        return diffDays(refDate, c) < -30 ? (refY + 1) + '-' + pad(m) + '-' + pad(d) : c;
      }
      if (r) {
        var m1 = +r[1], d1 = +r[2], m2 = r[3] ? +r[3] : m1, d2 = +r[4];
        var a = yearFor(m1, d1), b = yearFor(m2, d2);
        for (var x = a, n = 0; diffDays(x, b) >= 0 && n < 62; x = addDays(x, 1), n++) dates[x] = part;
        found = true;
      } else if (s) {
        dates[yearFor(+s[1], +s[2])] = part;
        found = true;
      }
      if (!found) unparsed.push(part);
    });
    return { dates: dates, unparsed: unparsed };
  }

  // ---- 教材 ----
  function unitMinutes(row, k, subject) {
    var raw = UNIT_MIN[str(row, k + 'unit_min')];
    var provisional = false;
    if (raw == null) { raw = /数学/.test(subject) ? 15 : 10; provisional = true; }
    return { raw: raw, planned: Math.ceil(raw * FACTOR), provisional: provisional };
  }
  var UNIT_FMT = {
    'ページ': function (a, b) { return a === b ? 'p.' + a : 'p.' + a + '〜' + b; },
    '問題の番号': function (a, b) { return a === b ? 'No.' + a : 'No.' + a + '〜' + b; },
    '単語の番号': function (a, b) { return a === b ? a + '番' : a + '〜' + b + '番'; },
    '枚': function (a, b) { return a === b ? a + '枚' : a + '〜' + b + '枚'; }
  };
  function rangeText(unit, a, b) { var f = UNIT_FMT[unit]; return f ? f(a, b) : a + '〜' + b; }

  function readMaterials(row) {
    var list = [];
    for (var i = 1; i <= MAX_TASKS; i++) {
      var k = 'task' + i + '_';
      var material = str(row, k + 'material');
      if (!material) continue;
      var subject = pickOther(row, k + 'subject');
      var unit = str(row, k + 'unit'), s = str(row, k + 'start'), e = str(row, k + 'end');
      var sn = numOf(s), en = numOf(e);
      var t = unitMinutes(row, k, subject);
      var numeric = sn != null && en != null && en >= sn;
      var size = unit === '単語の番号' ? 10 : 1; // 「1ページ（1問・10単語）」の時間なので、単語は10個を1つ分として数える
      list.push({
        kind: 'material', subject: subject, name: material, unit: unit, startText: s, endText: e,
        start: sn, end: en, numeric: numeric, size: size,
        units: numeric ? Math.ceil((en - sn + 1) / size) : 1, unitMin: t.planned, unitRaw: t.raw, provisional: t.provisional,
        method: pickOther(row, k + 'method'),
        label: function (a, b) { return this.numeric ? (this.name + ' ' + rangeText(this.unit, a, b)) : (this.name + ' ' + this.startText + '〜' + this.endText); }
      });
    }
    return list;
  }

  function readHomeworks(row) {
    var list = [];
    for (var i = 1; i <= MAX_TASKS; i++) {
      var k = 'hw' + i + '_';
      var name = str(row, k + 'name');
      if (!name) continue;
      var subject = pickOther(row, k + 'subject');
      var amountText = str(row, k + 'amount'), amount = numOf(amountText);
      var t = unitMinutes(row, k, subject);
      var unit = str(row, k + 'unit') || 'ページ';
      list.push({
        kind: 'homework', subject: subject, name: name, unit: unit, amountText: amountText, size: 1,
        numeric: amount != null && amount > 0, units: (amount != null && amount > 0) ? Math.round(amount) : 1,
        start: 1, end: (amount != null && amount > 0) ? Math.round(amount) : 1,
        unitMin: t.planned, unitRaw: t.raw, provisional: t.provisional,
        due: str(row, k + 'due'), repeat: str(row, k + 'repeat'),
        label: function (a, b) {
          var u = this.unit === 'ページ' ? 'p.' : '';
          var cnt = b - a + 1;
          return this.numeric ? (this.name + '（' + (this.unit === 'ページ' ? cnt + 'ページ' : cnt + this.unit) + '）') : (this.name + '（' + this.amountText + this.unit + '）');
        }
      });
    }
    // 提出日が近い順。提出日が無いものは、入力した順で最後に置く
    list.forEach(function (h, i) { h._i = i; });
    list.sort(function (a, b) {
      var da = a.due || '9999-12-31', db = b.due || '9999-12-31';
      return da < db ? -1 : da > db ? 1 : a._i - b._i;
    });
    return list;
  }

  // ---- 日ごとの枠を作る ----
  function buildDays(start, end, row, opts) {
    opts = opts || {};
    var avail = availability(row), reserve = reserveIndex(row);
    var hwWeekly = HW_WEEKLY_MIN[str(row, 'school_hw_weekly_min')] || 0;
    var studyDays = avail.filter(function (a, i) { return a > 0 && i !== reserve; }).length;
    var hwShare = studyDays > 0 ? hwWeekly / studyDays : 0;
    var busy = parseBusy(str(row, 'busy_note'), start);
    var days = [];
    for (var d = start; diffDays(d, end) >= 0; d = addDays(d, 1)) {
      var w = dow(d);
      var kind = 'study', cap = 0, note = '';
      if (busy.dates[d]) { kind = 'busy'; note = busy.dates[d]; }
      else if (w === reserve) { kind = 'reserve'; }
      else { cap = Math.max(0, Math.round(avail[w] - hwShare)); if (avail[w] === 0) kind = 'off'; }
      days.push({ date: d, md: md(d), dow: w, dowJa: DAY_JA[w], kind: kind, cap: cap, note: note, items: [], minutes: 0 });
    }
    return { days: days, busy: busy, hwShare: Math.round(hwShare), avail: avail, reserve: reserve, hwWeekly: hwWeekly };
  }

  // 教材を入れた順に前から詰める。入りきらなかった分を返す
  function fill(days, tasks) {
    var leftovers = [];
    var ti = 0, used = 0; // 現在の教材と、その中で置き終えた単位数
    days.forEach(function (day) {
      if (day.kind !== 'study' || day.cap <= 0) return;
      var left = day.cap;
      while (ti < tasks.length && left > 0) {
        var t = tasks[ti], remain = t.units - used;
        var fit = Math.floor(left / t.unitMin);
        if (fit <= 0) { if (day.items.length === 0) fit = 1; else break; } // 1日に1つも置けないときは、その日の最初の1つだけ置く
        var n = Math.min(fit, remain);
        var a = t.numeric ? t.start + used * t.size : null, b = t.numeric ? Math.min(t.end, t.start + (used + n) * t.size - 1) : null;
        var minutes = n * t.unitMin;
        day.items.push({ text: t.label(a, b), min: minutes, subject: t.subject, provisional: t.provisional, name: t.name, from: a, to: b, unit: t.unit });
        day.minutes += minutes;
        left -= minutes;
        used += n;
        if (used >= t.units) { ti++; used = 0; }
      }
    });
    // 入りきらなかった分
    for (var i = ti; i < tasks.length; i++) {
      var t2 = tasks[i], u0 = (i === ti) ? used : 0, rest = t2.units - u0;
      if (rest <= 0) continue;
      var a2 = t2.numeric ? t2.start + u0 * t2.size : null, b2 = t2.numeric ? t2.end : null;
      leftovers.push({ text: t2.label(a2, b2), min: rest * t2.unitMin });
    }
    return leftovers;
  }

  // ---- 週にまとめる（月曜はじまり）----
  function toWeeks(days, rangeStart, rangeEnd, specials) {
    specials = specials || {};
    var byDate = {};
    days.forEach(function (d) { byDate[d.date] = d; });
    var weeks = [];
    for (var m = mondayOf(rangeStart); diffDays(m, rangeEnd) >= 0; m = addDays(m, 7)) {
      var cells = [];
      for (var i = 0; i < 7; i++) {
        var date = addDays(m, i);
        var base = byDate[date];
        var sp = specials[date];
        if (sp) cells.push({ date: date, md: md(date), dowJa: DAY_JA[i], kind: sp.kind, text: sp.text, items: [], minutes: 0 });
        else if (base) cells.push(base);
        else cells.push({ date: date, md: md(date), dowJa: DAY_JA[i], kind: 'blank', items: [], minutes: 0 });
      }
      weeks.push({ startDate: m, startMd: md(m), cells: cells });
    }
    return weeks;
  }

  function hm(min) { var h = Math.floor(min / 60), m = Math.round(min % 60); return (h ? h + '時間' : '') + (m || !h ? m + '分' : ''); }
  function sum(arr) { return arr.reduce(function (a, b) { return a + b; }, 0); }

  // ---- 共通のカード ----
  function goalSubjects(row) {
    var out = [];
    for (var i = 1; i <= 9; i++) {
      var s = pickOther(row, 'goal_subject' + i);
      if (!s) continue;
      out.push({ subject: s, goal: str(row, 'goal_score' + i), last: str(row, 'last_score' + i) });
    }
    return out;
  }
  function gapLines(row) {
    var lines = [];
    var types = splitMulti(str(row, 'gap_type'));
    if (types.length) { lines.push('落とした理由'); types.forEach(function (t) { lines.push('・' + (t === 'その他' ? (str(row, 'gap_type_other') || 'その他') : t)); }); }
    if (str(row, 'gap_text')) lines.push('具体的に：' + str(row, 'gap_text'));
    return lines;
  }
  function timeCard(row, built) {
    var parts = [];
    for (var i = 0; i < 7; i++) {
      if (i === built.reserve) continue;
      parts.push(DAY_JA[i] + (built.avail[i] ? built.avail[i] + '分' : '休'));
    }
    var lines = [parts.join('　')];
    if (built.reserve >= 0) lines.push(DAY_JA[built.reserve] + '曜は予備日（遅れた分）');
    if (built.hwWeekly) lines.push('学校の課題：週' + hm(built.hwWeekly) + '（上の時間から引いて計算）');
    var keys = Object.keys(built.busy.dates).sort();
    if (keys.length) lines.push('行事：' + keys.map(function (k) { return md(k); }).join('・'));
    if (built.busy.unparsed.length) lines.push('行事メモ：' + built.busy.unparsed.join('、'));
    return { label: '⑥ 勉強に使える時間', lines: lines };
  }
  function estimateCard(tasks, days, leftovers) {
    var total = sum(tasks.map(function (t) { return t.units * t.unitMin; }));
    var capTotal = sum(days.map(function (d) { return d.kind === 'study' ? d.cap : 0; }));
    var lines = [];
    var first = tasks[0];
    if (first) lines.push(first.name + ' ' + (first.unit === '単語の番号' ? '10単語' : (first.unit === '問題の番号' ? '1問' : (first.unit === 'ページ' ? '1ページ' : '1' + first.unit))) + (first.provisional ? ' 仮' : ' 実測') + first.unitRaw + '分 → ' + first.unitMin + '分で計算');
    lines.push('合計 ' + hm(total) + ' ／ 使える時間 ' + hm(capTotal));
    if (leftovers.length) lines.push('入りきらない分があります（下に赤字で出しています）');
    return { label: '⑤ 見積もり', lines: lines };
  }

  // ---- スタイルごと ----
  function mdw(date) { return md(date) + '（' + DAY_JA[(new Date(date + 'T00:00:00Z').getUTCDay() + 6) % 7] + '）'; }
  function gradeLong(g) { var m = /^(中|高)(\d)$/.exec(g || ''); return m ? (m[1] === '中' ? '中学' : '高校') + m[2] + '年' : (g || ''); }
  function header(row, opts, startDate, endDate) {
    var created = createdDate(row) || startDate;
    return {
      name: opts.studentName || '', grade: gradeLong(str(row, 'grade')),
      sub: endDate ? mdw(startDate) + '〜' + mdw(endDate) : '作成 ' + mdw(created) + '　担当講師のFB待ち'
    };
  }

  function planTestLike(row, opts, style) {
    var created = createdDate(row) || opts.today;
    var start = addDays(created, 1);
    var goalDate = str(row, 'goal_date');
    var notes = [];
    var end;
    if (toMs(goalDate)) end = addDays(goalDate, -2);
    else { end = addDays(start, 27); notes.push('ゴールの日が読めなかったため、4週間分で作っています。'); }
    var built = buildDays(start, end, row);
    var tasks = readMaterials(row);
    var leftovers = fill(built.days, tasks);
    var specials = {};
    var title, goalCard;
    var subjects = goalSubjects(row);
    if (style === 'A') {
      var tt = pickOther(row, 'test_type') || 'テスト';
      title = md(goalDate) + ' ' + tt + 'までの計画';
      if (toMs(goalDate)) { specials[goalDate] = { kind: 'goal', text: md(goalDate) + '\n' + tt }; specials[addDays(goalDate, -1)] = { kind: 'eve', text: '前日：見直しだけ' }; }
      var s1 = subjects[0];
      goalCard = { label: '① ゴール', big: s1 ? (md(goalDate) + ' ' + tt + 'で' + s1.subject + s1.goal + '点') : (md(goalDate) + ' ' + tt), lines: subjects.slice(1).map(function (s) { return s.subject + 'も' + s.goal + '点' + (s.last ? '（前回' + s.last + '点）' : ''); }) };
      if (s1 && s1.last) goalCard.lines.unshift('前回の' + s1.subject + '：' + s1.last + '点');
    } else { // AP
      var ex = str(row, 'exam_name') || '試験';
      title = ex + 'までの計画';
      if (toMs(goalDate)) { specials[goalDate] = { kind: 'goal', text: md(goalDate) + '\n' + ex }; specials[addDays(goalDate, -1)] = { kind: 'eve', text: '前日：見直しだけ' }; }
      var gt = str(row, 'goal_type');
      var goalText = /点数/.test(gt) && str(row, 'goal_score1') ? (ex + 'で' + str(row, 'goal_score1') + '点') : (ex + 'に合格');
      goalCard = { label: '① ゴール', big: md(goalDate) + ' ' + goalText, lines: str(row, 'last_score1') ? ['いまの実力：' + str(row, 'last_score1')] : [] };
    }
    var gap = { label: '② 現状 → ③ ギャップ', lines: gapLines(row) };
    if (!gap.lines.length) gap.lines = ['（未記入）'];
    var weeks = toWeeks(built.days, start, toMs(goalDate) ? goalDate : end, specials);
    return {
      style: style, styleLabel: style === 'A' ? '定期テスト型' : '検定', title: title, header: header(row, opts, start),
      cards: [goalCard, gap, estimateCard(tasks, built.days, leftovers), timeCard(row, built)].sort(function (x, y) { return x.label < y.label ? -1 : 1; }),
      weeks: weeks, leftovers: leftovers, notes: notes, period: { start: start, end: end },
      provisional: tasks.filter(function (t) { return t.provisional; }).map(function (t) { return t.name; }),
      tasks: tasks.map(function (t) { return { name: t.name, subject: t.subject, method: t.method }; })
    };
  }

  function planMock(row, opts) {
    var created = createdDate(row) || opts.today;
    var start = addDays(created, 1);
    var goalDate = str(row, 'goal_date');
    var notes = [];
    var end = toMs(goalDate) ? addDays(goalDate, -2) : addDays(start, 27);
    if (!toMs(goalDate)) notes.push('模試の日が読めなかったため、4週間分で作っています。');
    var built = buildDays(start, end, row);
    var tasks = readMaterials(row);
    var leftovers = fill(built.days, tasks);
    var mock = str(row, 'mock_name') || '模試';
    var subjects = goalSubjects(row), s1 = subjects[0];
    var specials = {};
    if (toMs(goalDate)) { specials[goalDate] = { kind: 'goal', text: md(goalDate) + '\n' + mock }; specials[addDays(goalDate, -1)] = { kind: 'eve', text: '前日：見直しだけ' }; }
    var allWeeks = toWeeks(built.days, start, toMs(goalDate) ? goalDate : end, specials);
    // 3週間を超える分は、週ごとの合計だけ
    var detail = allWeeks.slice(0, 2), rest = allWeeks.slice(2);
    var weeklyTotals = rest.map(function (w) {
      var items = {};
      w.cells.forEach(function (c) { (c.items || []).forEach(function (it) { items[it.text.split(' ')[0]] = (items[it.text.split(' ')[0]] || 0) + it.min; }); });
      return { startMd: w.startMd, total: sum(w.cells.map(function (c) { return c.minutes || 0; })), items: items };
    });
    var goalCard = { label: '① ゴール', big: s1 ? (md(goalDate) + ' ' + mock + 'で' + s1.subject + s1.goal) : (md(goalDate) + ' ' + mock), lines: [] };
    if (s1 && s1.last) goalCard.lines.push('前回：' + s1.last);
    subjects.slice(1).forEach(function (s) { goalCard.lines.push(s.subject + 'も' + s.goal + (s.last ? '（前回' + s.last + '）' : '')); });
    var gap = { label: '② 現状 → ③ ギャップ', lines: gapLines(row) };
    if (!gap.lines.length) gap.lines = ['（未記入）'];
    return {
      style: 'B', styleLabel: '受験逆算型', title: mock + 'までの計画（今週からの表）', header: header(row, opts, start),
      cards: [goalCard, gap, estimateCard(tasks, built.days, leftovers), timeCard(row, built)].sort(function (x, y) { return x.label < y.label ? -1 : 1; }),
      weeks: detail, weeklyTotals: weeklyTotals, leftovers: leftovers, notes: notes, period: { start: start, end: end },
      upperNote: '受験日までの月ごとの道筋は、担当講師が作成します。',
      provisional: tasks.filter(function (t) { return t.provisional; }).map(function (t) { return t.name; }),
      tasks: tasks.map(function (t) { return { name: t.name, subject: t.subject, method: t.method }; })
    };
  }

  function planHabit(row, opts) { // C 習慣なし
    var created = createdDate(row) || opts.today;
    var start = addDays(created, 1);
    var avail = availability(row);
    var goalMin = numOf((str(row, 'goal_min_per_day').match(/\d+/) || [''])[0]);
    var gm = /1時間半/.test(str(row, 'goal_min_per_day')) ? 90 : /1時間/.test(str(row, 'goal_min_per_day')) ? 60 : goalMin;
    var menu = DAY_KEYS.map(function (k, i) {
      var m = str(row, 'menu_' + k);
      var off = !m || m === 'やらない日', rsv = off && i === 6; // Cに予備日の質問は無いので、日曜が「やらない日」なら予備日にする
      var minutes = off ? 0 : Math.min(gm || 30, avail[i] || (gm || 30));
      return { dowJa: DAY_JA[i], menu: m, off: off, reserve: rsv, minutes: minutes, avail: avail[i] };
    });
    var weeks = [];
    for (var w = 0; w < 4; w++) weeks.push({ startMd: md(addDays(mondayOf(start), w * 7)) });
    var days = str(row, 'goal_days'), last = str(row, 'last_week_days');
    return {
      style: 'C', styleLabel: '日常学習型（学習習慣なし）', title: '週' + days.replace('日', '') + '日・' + (gm || 30) + '分、机に向かう4週間',
      header: header(row, opts, start, addDays(start, 27)),
      cards: [
        { label: 'ゴール', big: '週' + days + '、1日' + (gm || 30) + '分', lines: last ? ['今は週' + last + 'くらい'] : [] },
        { label: '使える時間', lines: [DAY_JA.map(function (d, i) { return d + (avail[i] ? avail[i] + '分' : '休'); }).filter(function (x, i) { return !menu[i].reserve; }).join('　')].concat(menu[6].reserve ? ['日曜は予備日（遅れた分）'] : []) },
        { label: '使う教材', lines: [str(row, 'c_materials') || '（未記入）'] }
      ],
      menu: menu, recordWeeks: weeks, period: { start: start, end: addDays(start, 27) }, notes: [], leftovers: []
    };
  }

  function planTasks(row, opts) { // C' 習慣あり（タスク消化）
    var created = createdDate(row) || opts.today;
    var start = addDays(created, 1);
    var end = addDays(start, 6);
    var built = buildDays(start, end, row);
    var tasks = readHomeworks(row);
    var leftovers = fill(built.days, tasks);
    var weeks = toWeeks(built.days, start, end, {});
    var list = tasks.map(function (t) {
      return { name: t.name, subject: t.subject, amount: t.amountText + t.unit, due: t.due ? md(t.due) : '', repeat: t.repeat };
    });
    return {
      style: 'CP', styleLabel: '習慣あり（タスク消化）', title: 'この1週間の課題・タスク', header: header(row, opts, start),
      cards: [
        { label: '① 今週やること', big: tasks.length + '件', lines: list.slice(0, 4).map(function (t) { return t.name + (t.due ? '（提出 ' + t.due + '）' : ''); }) },
        estimateCard(tasks, built.days, leftovers),
        timeCard(row, built)
      ],
      weeks: weeks, leftovers: leftovers, list: list, notes: [], period: { start: start, end: end },
      provisional: tasks.filter(function (t) { return t.provisional; }).map(function (t) { return t.name; })
    };
  }

  function buildPlan(row, opts) {
    opts = opts || {};
    var style = str(row, 'style');
    if (/定期テスト/.test(style)) return planTestLike(row, opts, 'A');
    if (/検定/.test(style)) return planTestLike(row, opts, 'AP');
    if (/受験逆算/.test(style)) return planMock(row, opts);
    if (/習慣なし/.test(style)) return planHabit(row, opts);
    if (/習慣あり/.test(style)) return planTasks(row, opts);
    throw new Error('計画の種類が読めません：' + style);
  }

  var api = { buildPlan: buildPlan, hm: hm, md: md, addDays: addDays, parseBusy: parseBusy, _internal: { fill: fill, buildDays: buildDays, readMaterials: readMaterials, readHomeworks: readHomeworks, numOf: numOf } };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PlanEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
