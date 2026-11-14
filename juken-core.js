// 受験逆算（ルールベース）：志望校→帯、進行ルートの選択、偏差値の補正と差、月ごとの道筋（上段）の自動作成。AIは使わない。
// 元：Notion「学習計画pj_AIチャットボット概要」の「志望校別 帯一覧」「偏差値補正と学習比重」（2026-10-28 下書き）。文は、Notionの文をそのまま使う。
// 未実装：教材の割り当て（ルートマスタが必要）、手持ち教材の置き換え判定（レベルの対応表が必要）
(function (root) {
  'use strict';
  var P = function (from, to, k, n, t) { return { from: from, to: to, k: k, n: n, t: t }; };   // 月の範囲・共テ％・2次％・方針
  var AFTER = '2次試験の過去問演習に専念。';
  // 国公立（帯1〜4）：標準 [4〜7月, 8〜10月, 11〜12月, 1月]、短期 [7〜8月, 9〜10月, 11〜12月, 1月]。そのあと「共通テスト後」
  var BANDS = {
    1: { name: '東大・京大・東科大・国公立医学部', kind: '国公立', ratio: '2次試験極めて重視（共テ：2次＝3：7〜1：9目安）', after: AFTER,
      std: [P(4, 7, 0, 100, 'Lv.2【標準】までを完了させる。完了し次第、Lv.3【応用】を進める。'), P(8, 10, 5, 95, 'Lv.3【応用】までを早めに完了させる。その後はLv.4【発展】の演習に集中し、記述力を固めつつ2次過去問に着手。合間で共通テスト対策のみ必要な科目に取り組み始める。'), P(11, 12, 30, 70, '12月に入ってから段階的に共テ対策を引き上げる。'), P(1, 1, 90, 10, '共テ特化期間としつつ、Lv.4の記述感覚を維持する。')],
      short: [P(7, 8, 0, 100, 'Lv.2【標準】までを仕上げ、完了し次第、Lv.3【応用】を進める。'), P(9, 10, 0, 100, 'Lv.3【応用】を完成させ、頻出分野のLv.4【発展】と2次過去問の対策を進める。'), P(11, 12, 30, 70, '12月中旬までは2次対策を続け、後半から共テ対策へシフトする。'), P(1, 1, 90, 10, '共テでの確実な足切り突破・得点確保を優先する。')] },
    2: { name: '旧帝大・最難関国公立（科学大、一橋など）', kind: '国公立', ratio: '2次試験重視（共テ：2次＝3：7〜4：6目安）', after: AFTER,
      std: [P(4, 7, 0, 100, 'Lv.2【標準】を完遂し、Lv.3【応用】へ入る。'), P(8, 10, 10, 90, 'Lv.3【応用】を固め、過去問演習を図る。合間で共テ対策のみ必要な科目に取り組み始める。'), P(11, 12, 50, 50, '11月下旬から共テ対策を本格化する。'), P(1, 1, 90, 10, '共テへの最終調整に注力する。')],
      short: [P(7, 8, 0, 100, '着実にLv.2【標準】までを固める。'), P(9, 10, 10, 90, 'Lv.2の完了を優先し、Lv.3【応用】は一部を見送って過去問演習へ移行する。'), P(11, 12, 60, 40, '2次対策は志望校の頻出傾向に絞り、共テ対策の比重を高める。'), P(1, 1, 100, 0, '共テ対策に特化する。')] },
    3: { name: '難関・上位国公立（筑波・神戸・千葉など）', kind: '国公立', ratio: '2次試験重視（共テ：2次＝5：5〜6：4目安）', after: AFTER,
      std: [P(4, 7, 5, 95, 'Lv.1【基礎】を完了させ、Lv.2【標準】へ進む。合間で共テ対策のみ必要な科目に取り組み始める。'), P(8, 10, 20, 80, 'Lv.2【標準】を早めに完成させ、Lv.3【応用】の頻出分野と2次記述対策に注力する。共テ対策は、2次がない科目を中心に取り組む。'), P(11, 12, 70, 30, '共テ対策をメインに切り替える。'), P(1, 1, 95, 5, '共テ特化期間とする。')],
      short: [P(7, 8, 10, 90, 'Lv.1【基礎】固めを優先する。'), P(9, 10, 30, 70, 'Lv.2【標準】と並行して早期に共テ対策を組み込む。Lv.2【標準】が完了したらLv.3【応用】の頻出分野に取り組む。'), P(11, 12, 80, 20, '共テ対策に大きく比重を移す。'), P(1, 1, 100, 0, '共テ対策に特化する。')] },
    4: { name: '地方主要国公立（金岡千広・5Sなど）', kind: '国公立', ratio: '共テ逃げ切り型（共テ：2次＝6：4〜7：3目安）', after: AFTER,
      std: [P(4, 7, 20, 80, 'Lv.1【基礎】を確実に定着させる。'), P(8, 10, 50, 50, 'Lv.2【標準】を進めつつ、共テ対策を早めに開始する。'), P(11, 12, 80, 20, 'Lv.3以上は扱わず、学習の大半を共テ対策に充てる。'), P(1, 1, 100, 0, '共テ逃げ切りに向けた最終調整。')],
      short: [P(7, 8, 40, 60, 'Lv.1【基礎】の反復を徹底する。'), P(9, 10, 80, 20, '2次対策はLv.2の維持に留め、共テ形式の演習を優先する。'), P(11, 12, 100, 0, '共テ対策へ比重を完全に移す。'), P(1, 1, 100, 0, '共テ特化。')] },
    // 私立（帯5〜7）：標準 [4〜7月, 8〜10月, 11〜12月, 1月〜入試本番]
    5: { name: '最難関私立（早稲田、慶應、上智難関学部など）', kind: '私立', ratio: '', after: '',
      std: [P(4, 7, null, null, 'Lv.2【標準】までを完了させる。'), P(8, 10, null, null, 'Lv.3【応用】へ入りつつ、過去問傾向の把握を始める。'), P(11, 12, null, null, 'Lv.4【発展】の頻出分野と過去問演習をメインに行う。'), P(1, 3, null, null, '併願校を含めた最終調整。過去問対策に集中する。')],
      short: [P(7, 8, null, null, 'Lv.2【標準】までの完成を急ぐ。'), P(9, 10, null, null, 'Lv.3【応用】を頻出分野中心に進める。'), P(11, 12, null, null, '過去問演習を通じて形式への適応力を磨く。'), P(1, 3, null, null, '過去問対策に集中する。')] },
    6: { name: 'GMARCH・関関同立・理科大など', kind: '私立', ratio: '', after: '',
      std: [P(4, 7, null, null, 'Lv.1【基礎】を完了しLv.2【標準】へ。'), P(8, 10, null, null, 'Lv.3【応用】までを完了させ、過去問演習に着手する。'), P(11, 12, null, null, '各大学の過去問演習をローテーションで行う。'), P(1, 3, null, null, '併願校を含めた最終調整。過去問対策に集中する。')],
      short: [P(7, 8, null, null, '確実なLv.1【基礎】固めを行う。'), P(9, 10, null, null, 'Lv.3【応用】は基本的に見送り、Lv.2【標準】が固まり次第過去問へ接続する。'), P(11, 12, null, null, '過去問演習を通じた形式慣れで得点力を底上げする。'), P(1, 3, null, null, '過去問対策に集中する。')] },
    7: { name: '中堅私大（日東駒専・産近甲龍など）', kind: '私立', ratio: '', after: '',
      std: [P(4, 7, null, null, 'Lv.0〜Lv.1【基礎】を確実に取りこぼさない状態を作る。'), P(8, 10, null, null, 'Lv.1の反復とLv.2【標準】の入り口レベルの演習を行う。'), P(11, 12, null, null, 'Lv.3以上は扱わずLv.2【標準】まで完成させ、過去問演習を本格化させる。'), P(1, 3, null, null, '併願校を含めた最終調整。過去問対策に集中する。')],
      short: [P(7, 8, null, null, '単語帳や文法書の1冊目の定着に集中する。定着し次第、Lv.1【基礎】を進める。'), P(9, 10, null, null, 'Lv.1【基礎】を優先的に扱い、多くの時間を割く。余裕があれば、Lv.2【標準】の頻出範囲の演習を行う。'), P(11, 12, null, null, '過去問へ挑む。'), P(1, 3, null, null, '過去問対策に集中する。')] }
  };
  var PREP = 'ルートに入る前の準備期間。基礎（Lv.0〜Lv.1）を固める。';   // 暫定（元の資料にない。有元が置いた）

  function bandNo(label) { var m = /帯\s*([1-7])/.exec(String(label || '')); return m ? Number(m[1]) : null; }
  function ym(s) { var m = /^(\d{4})-(\d{2})/.exec(s); return m ? { y: +m[1], m: +m[2] } : null; }
  function pad(n) { return n < 10 ? '0' + n : '' + n; }
  function addMonth(y, m, k) { var t = y * 12 + (m - 1) + k; return { y: Math.floor(t / 12), m: (t % 12) + 1 }; }

  // 進行ルート：受験勉強のスタート時期で決める。高3の6月より前なら標準、6月以降なら短期圧縮（examYear＝入試の年。高3の年＝examYear-1）
  function chooseRoute(start, examYm) {
    var s = ym(start), e = ym(examYm); if (!s || !e) return 'std';
    var junshi = (e.y - 1) * 12 + 5;            // 高3の6月（index）
    return (s.y * 12 + s.m - 1) >= junshi ? 'short' : 'std';
  }
  // 偏差値の補正（河合基準へ）。進研は−5〜−10、駿台は＋5〜＋10の範囲。ここでは、真ん中の値を使う
  var MOCK = { '河合': 0, '東進': 0, '進研': -7.5, '駿台': 7.5 };
  function correct(mock, score) { if (!(mock in MOCK)) return Number(score); return Number(score) + MOCK[mock]; }
  // 目標との差：15以上＝ビハインド、5〜14＝標準、4以下＝リード
  function gapLevel(target, current) {
    var gap = Math.round((target - current) * 10) / 10;
    return { gap: gap, level: gap >= 15 ? 'ビハインド' : gap >= 5 ? '標準' : 'リード' };
  }
  var ADJUST = {
    'ビハインド': '目標との差が大きいため、基礎定着の期間を長く確保する。高3の夏以降のスタートなら、応用はスキップして過去問へつなぐ。',
    '標準': '標準ルートどおりに、各フェーズを均等に配置する。',
    'リード': '目標との差が小さいため、基礎を極限まで圧縮・スキップし、早い時期から応用・過去問へ進む。'
  };

  function periodFor(band, route, month) {
    var list = band[route], i;
    for (i = 0; i < list.length; i++) if (month >= list[i].from && month <= list[i].to) return { p: list[i], label: list[i].from === list[i].to ? list[i].from + '月' : list[i].from + '〜' + list[i].to + '月' };
    return null;
  }
  // 月ごとの道筋：start（YYYY-MM-DD）から、入試の月（examYm）まで。1か月に1行。{month, text, phase}
  function roadmap(o) {
    var band = BANDS[o.band]; if (!band) throw new Error('帯を確認してください');
    var s = ym(o.start), e = ym(o.examYm); if (!s || !e) throw new Error('日付を確認してください');
    var route = o.route || chooseRoute(o.start, o.examYm), firstFrom = band[route][0].from, y3 = e.y - 1, out = [];
    for (var t = s.y * 12 + s.m - 1; t <= e.y * 12 + e.m - 1; t++) {
      var y = Math.floor(t / 12), m = (t % 12) + 1, key = y + '-' + pad(m), text, phase;
      var inRoute = (y > y3 || (y === y3 && m >= firstFrom));     // 高3の年の、ルートの最初の月から
      if (!inRoute) { text = PREP; phase = '準備'; }
      else {
        var f = periodFor(band, route, m > 3 && y === e.y ? 99 : m);   // 入試の年の4月以降は、範囲外
        if (f) { var p = f.p; text = f.label + '　' + (p.k == null ? '' : '共テ' + p.k + '％／2次' + p.n + '％。') + p.t; phase = f.label; }
        else if (band.after && y === e.y && m >= 2) { text = '共通テスト後。' + band.after; phase = '共通テスト後'; }
        else if (y === e.y && m <= 3) { var last = band[route][band[route].length - 1]; text = last.t; phase = '直前期'; }
        else { text = PREP; phase = '準備'; }
      }
      out.push({ month: key, text: text.slice(0, 300), phase: phase });
    }
    return out;
  }

  // 志望校の検索（志望校マスタ。rows＝[id, 大学名, 学部名, 国公私立, 文理, 略称, 偏差値, 帯, 共テ科目, 2次科目]）
  function norm(s) { return String(s || '').replace(/[\s　]/g, '').replace(/[Ａ-Ｚａ-ｚ０-９]/g, function (c) { return String.fromCharCode(c.charCodeAt(0) - 0xFEE0); }).toLowerCase(); }
  function search(rows, query, limit) {
    var q = norm(query); if (!q) return [];
    var hits = [];
    rows.forEach(function (r) {
      var keys = String(r[5] || '').split(',').map(norm), name = norm(r[1]) + norm(r[2]);
      var score = keys.indexOf(q) >= 0 || norm(r[1]) === q ? 3 : (norm(r[1]) + norm(r[2])).indexOf(q) === 0 ? 2 : keys.some(function (k) { return k.indexOf(q) >= 0; }) || name.indexOf(q) >= 0 ? 1 : 0;
      if (score) hits.push({ score: score, row: r });
    });
    hits.sort(function (a, b) { return b.score - a.score; });
    return hits.slice(0, limit || 8).map(function (h) { return { id: h.row[0], univ: h.row[1], dept: h.row[2], type: h.row[3], band: bandNo(h.row[7]), dev: Number(h.row[6]) || null, aff: h.row[4] }; });
  }

  // ---- 教材の割り当て：ルートマスタ（帯×科目の、教材の順番）と、教材マスタ（総学習量÷週間の目安ペース＝週数）から、教材ごとの期間を並べる ----
  function routeData(d) { return d || (typeof module !== 'undefined' && module.exports ? require('./masters-route.js') : root.JukenRoute); }
  function subjectsOf(d) { d = routeData(d); var s = {}; d.routes.forEach(function (r) { s[r[1]] = 1; }); return Object.keys(s); }
  function routeRows(d, band, subject) {    // 帯の指定を優先。なければ「全帯」「全帯(共テ)」。どれもなければ、null（推測で埋めない）
    d = routeData(d);
    var pick = function (seg) { var rows = d.routes.filter(function (r) { return r[0] === seg && r[1] === subject; }); rows.sort(function (a, b) { return a[2] - b[2]; }); return rows.length ? rows : null; };
    return pick('帯' + band) || pick('全帯') || pick('全帯(共テ)');
  }
  function addDays(s, n) { var t = Date.parse(s + 'T00:00:00Z') + n * 86400000; return new Date(t).toISOString().slice(0, 10); }
  function dateDiff(a, b) { return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000); }

  // ---- 手持ち教材の置き換え（Notionの規則を、有元の指示で、私が解釈して決めた暫定版）----
  // 教材マスタの「代替可能タグ」は [科目_種類_レベル]（例：[英_単語_標準]）。種類（科目_種類）が同じなら、入れ替えられる。レベルは入門<基礎<標準＝網羅<応用＝国公立<難関
  //   同じ種類・同じレベル → 置き換える（手持ちを使う）。※Notionの文言は「同等も置換不可」だが、手持ちを使う目的と逆になるため、置き換えにした（要確認）
  //   同じ種類・上のレベル → 現在の偏差値がそのレベルの目安以上なら置き換え。足りない・偏差値が不明なら「保留」（ルートの教材のまま。講師が決める）
  //   同じ種類・下のレベル → 置き換えない（ルートの教材を優先）。マスタにない教材・種類が違う教材 → 置き換えない（講師が確認）
  var LEVEL = { '入門': 0, '基礎': 1, '標準': 2, '網羅': 2, '国公立': 3, '応用': 3, '難関': 4 };
  var STANDARD_WEEKLY_MIN = 300;      // 「週間の目安ペース」は、週5時間（300分）で進む速さと仮定した（マスタに前提の時間がない。暫定）
  var LVN = ['入門', '基礎', '標準', '応用', '難関'];
  var MINDEV = [0, 40, 50, 58, 65];          // そのレベルの教材を扱える、現在の偏差値（河合基準）の目安。暫定値
  function tagParts(tag) { var m = /^\[(.+)_([^_\]]+)\]$/.exec(tag || ''); return m && m[2] in LEVEL ? { cat: m[1], lvl: LEVEL[m[2]], name: m[2] } : null; }
  function resolveOwned(d, owned) {
    return (owned || []).map(function (o) {
      var m = o && o.id ? d.materials[o.id] : null, tp = m ? tagParts(m[6]) : null;
      return { id: m ? o.id : '', name: m ? m[0] : String((o && o.name) || '').slice(0, 60), mat: m, tp: tp, used: false };
    }).filter(function (o) { return o.name; });
  }
  function pickOwned(list, rp) {      // 同じ種類の手持ちから、同じレベル→近い上のレベル→下のレベル、の順に選ぶ
    var c = list.filter(function (o) { return !o.used && o.tp && o.tp.cat === rp.cat; });
    var eq = c.filter(function (o) { return o.tp.lvl === rp.lvl; }), up = c.filter(function (o) { return o.tp.lvl > rp.lvl; }).sort(function (a, b) { return a.tp.lvl - b.tp.lvl; }), low = c.filter(function (o) { return o.tp.lvl < rp.lvl; });
    return eq[0] || up[0] || low[0] || null;
  }

  // 教材に、期間（from・to）をつける。過去問・実戦のフェーズ（「5.」で始まる）は、入試の直前まで続けたいので、入試の前年の9月以降に、入試の日から逆算して置く
  function layout(items, start, examYm, fixed) {
    var examEnd = examYm + '-15', cursor = start;
    items.forEach(function (i, n) { if (n < (fixed || 0)) { cursor = addDays(i.to, 1); return; } if (i.finished) return; i.from = cursor; i.to = addDays(cursor, i.weeks * 7 - 1); cursor = addDays(i.to, 1); });
    var postFrom = items.length; while (postFrom > 0 && /^5\./.test(items[postFrom - 1].phase)) postFrom--;
    if (postFrom < items.length && items.slice(postFrom).some(function (i) { return !i.finished; })) {
      var postDays = items.slice(postFrom).reduce(function (x, i) { return x + (i.finished ? 0 : i.weeks * 7); }, 0), latest = addDays(examEnd, -postDays + 1), preEnd = postFrom ? items[postFrom - 1].to : addDays(start, -1), at, earliest, want;
      earliest = (Number(examYm.slice(0, 4)) - 1) + '-09-01';          // 帯ごとの方針（8〜10月に過去問へ着手）に合わせ、入試の前年の9月より前には置かない
      want = dateDiff(latest, earliest) < 0 ? earliest : latest; at = dateDiff(addDays(preEnd, 1), want) > 0 ? want : addDays(preEnd, 1);
      for (var k = postFrom; k < items.length; k++) { if (items[k].finished) continue; items[k].from = at; items[k].to = addDays(at, items[k].weeks * 7 - 1); at = addDays(items[k].to, 1); }
    }
    var finish = items.length ? items[items.length - 1].to : start, over = dateDiff(examEnd, finish), preFinish = postFrom && postFrom < items.length ? items[postFrom - 1].to : null;
    return { finish: finish, fits: over <= 0, shortDays: Math.max(0, over), totalWeeks: items.reduce(function (a, i) { return a + i.weeks; }, 0), slackWeeks: preFinish ? Math.max(0, Math.floor(dateDiff(preFinish, items[postFrom].from) / 7)) : 0 };
  }

  // 科目ごとに、教材を順番に並べる。o：band・subjects・start・examYm・level・route・owned（手持ち教材：[{id}か{name}]）・dev（現在の偏差値。河合基準へ補正ずみ）
  // 共通テスト専用科目（Notion「情報I・理科基礎・公民」。ルートマスタの科目名に当てはめた）：開始は、高3の秋（9月）以降
  var KYOTSU_ONLY = ['情報I', '地学基礎', '公共', '倫理', '政経', '政経(共テ)'];
  function materialPlan(o) {
    var d = routeData(o.data), out = [], own = resolveOwned(d, o.owned);
    (o.subjects || []).forEach(function (subject) {
      var rows = routeRows(d, o.band, subject);
      if (!rows) { out.push({ subject: subject, missing: true, note: 'この帯の、この科目のルートが、ルートマスタにありません' }); return; }
      var skipped = [], items = [];
      rows.forEach(function (r) {
        var m = d.materials[r[4]], pn = Number((/^(\d)\./.exec(r[3]) || [0, 0])[1]), item = { id: r[4], name: m[0], phase: r[3], total: m[3], unit: m[4], pace: m[5], slot: r[2] }, rp = tagParts(m[6]);
        // 手持ち教材の置き換え
        if (rp) {
          var cand = pickOwned(own, rp);
          if (cand) {
            if (cand.tp.lvl <= rp.lvl) {
              if (cand.tp.lvl === rp.lvl) { cand.used = true; item = { id: cand.id, name: cand.mat[0], phase: r[3], total: cand.mat[3], unit: cand.mat[4], pace: cand.mat[5], slot: r[2], replaced: { fromId: r[4], fromName: m[0], why: '手持ちの教材が、同じ種類・同じレベルのため' } }; }
              else { cand.used = true; item.hold = { kind: 'lower', ownId: cand.id, ownName: cand.mat[0], why: '手持ちの「' + cand.mat[0] + '」は、ルートの「' + m[0] + '」より、やさしいレベル（' + LVN[cand.tp.lvl] + '）です。この段階には、やさしすぎる可能性があります。' }; }
            } else {
              cand.used = true;
              if (o.dev != null && o.dev >= MINDEV[cand.tp.lvl]) item = { id: cand.id, name: cand.mat[0], phase: r[3], total: cand.mat[3], unit: cand.mat[4], pace: cand.mat[5], slot: r[2], replaced: { fromId: r[4], fromName: m[0], why: '手持ちの教材が、1つ上のレベルで、今の偏差値で扱えるため' } };
              else item.hold = { kind: 'upper', ownId: cand.id, ownName: cand.mat[0], why: o.dev == null ? '手持ちの「' + cand.mat[0] + '」は、ルートの「' + m[0] + '」より、難しいレベル（' + LVN[cand.tp.lvl] + '）です。偏差値が分からないため、いまの学力に合うか、判断できません。' : '手持ちの「' + cand.mat[0] + '」は、ルートの「' + m[0] + '」より、難しいレベル（' + LVN[cand.tp.lvl] + '）です。いまの偏差値（' + Math.round(o.dev * 10) / 10 + '）は、目安（' + MINDEV[cand.tp.lvl] + '）に届いていません。実力不足のため、一時保留にしています。' };
            }
          }
        }
        var speed = o.weeklyMinutes ? Math.min(3, Math.max(0.2, o.weeklyMinutes / STANDARD_WEEKLY_MIN)) : 1, weeks = Math.max(1, Math.ceil(item.total / (item.pace * speed))), factor = 1;
        item.speed = speed === 1 ? null : speed; item.minPerUnit = STANDARD_WEEKLY_MIN / item.pace;
        // 差に応じた伸縮（元の資料の方針。倍率は、有元の指示で私が決めた暫定値）：ビハインド＝基礎（フェーズ1〜2）の期間を1.5倍／リード＝基礎を半分に圧縮／標準＝そのまま
        if (pn >= 1 && pn <= 2) { if (o.level === 'ビハインド') factor = 1.5; else if (o.level === 'リード') factor = 0.5; }
        // ビハインドで、短期圧縮ルート（高3の夏以降のスタート）なら、応用（フェーズ4）は、スキップして過去問へつなぐ
        if (o.level === 'ビハインド' && o.route === 'short' && pn === 4) { skipped.push({ id: item.id, name: item.name, reason: '目標との差が大きく、短期のため、応用を見送り、過去問へ' }); return; }
        item.weeks = Math.max(1, Math.ceil(weeks * factor)); item.stretch = factor === 1 ? null : factor; items.push(item);
      });
      var minStart = KYOTSU_ONLY.indexOf(subject) >= 0 && o.examYm ? ((+o.examYm.slice(0, 4) - 1) + '-09-01') : null, st0 = minStart && o.start < minStart ? minStart : o.start;
      var lay = layout(items, st0, o.examYm);
      out.push({ minStart: minStart, subject: subject, skipped: skipped, items: items, totalWeeks: lay.totalWeeks, finish: lay.finish, fits: lay.fits, shortDays: lay.shortDays, slackWeeks: lay.slackWeeks });
    });
    // 手持ち教材の扱いの一覧：置き換えた／保留／使わない（理由つき）。マスタにない教材は、講師が確認
    var owned = own.map(function (o) {
      var rep = null; out.forEach(function (p) { (p.items || []).forEach(function (i) { if (i.replaced && i.id === o.id) rep = { subject: p.subject, replaced: i.replaced.fromName }; if (i.hold && i.hold.ownId === o.id) rep = { subject: p.subject, hold: i.name, why: i.hold.why, kind: i.hold.kind }; }); });
      return { id: o.id, name: o.name, status: rep ? (rep.hold ? (rep.kind === 'lower' ? '警告' : '保留') : '置き換え') : (o.mat ? (o.tp ? '使わない' : 'レベル不明') : 'マスタにない'), note: rep ? (rep.hold ? rep.why : rep.subject + '：「' + rep.replaced + '」の代わりに使う') : (!o.mat ? '教材マスタにないため、レベルが分かりません。講師が確認してください' : !o.tp ? 'レベルが分からないため、使いません' : own.some(function (x) { return x !== o && x.used && x.tp && x.tp.cat === o.tp.cat; }) ? 'すでに、同じ種類の別の手持ち教材を使うため、使いません' : 'ルートの教材と同じ種類で、同じか上のレベルのものがないため、ルートの教材を優先します') };
    });
    out.owned = owned; return out;
  }
  // 教材の期間を、並べ直す（講師の調整・月1回の見直しで使う）。items：materialPlan の1科目分
  // 見直しのとき：すでに終わった教材（終了日が今日より前）は、そのまま。残りを、今日から並べ直す
  function relayoutFrom(sp, today, examYm) {
    var isFixed = function (i) { return i.finished || (!i.tracked && i.to < today); };       // 実績を追っている教材は、終わった（finished）ものだけ固定。追っていない教材は、終了日が過ぎたもの
    var n = 0; while (n < sp.items.length && isFixed(sp.items[n])) n++;
    var start = n ? (sp.items[n - 1].to < today ? today : addDays(sp.items[n - 1].to, 1)) : today;
    if (!n && sp.items.length && sp.items[0].from > today) start = sp.items[0].from;
    return relayout(sp, start, examYm, n);
  }
  function relayout(subjectPlan, start, examYm, fixed) { if (subjectPlan.minStart && start < subjectPlan.minStart) start = subjectPlan.minStart; var lay = layout(subjectPlan.items, start, examYm, fixed); subjectPlan.totalWeeks = lay.totalWeeks; subjectPlan.finish = lay.finish; subjectPlan.fits = lay.fits; subjectPlan.shortDays = lay.shortDays; subjectPlan.slackWeeks = lay.slackWeeks; return subjectPlan; }
  // 月ごとの道筋に、その月に取り組む教材を足す
  function withMaterials(rm, plans) {
    return rm.map(function (r) {
      var first = r.month + '-01', last = addDays(addMonthStr(r.month), -1), act = [];
      plans.forEach(function (p) { if (p.missing) return; p.items.forEach(function (i) { if (i.from <= last && i.to >= first) act.push({ subject: p.subject, id: i.id, name: i.name }); }); });
      var parts = act.map(function (a) { return a.subject + '＝' + a.name; }), text = r.text;
      if (parts.length) { var suffix = '　教材：' + parts.join('、'); while (text.length + suffix.length > 300 && parts.length > 1) { parts.pop(); suffix = '　教材：' + parts.join('、') + '…'; } text = (text + suffix).slice(0, 300); }
      return { month: r.month, text: text, phase: r.phase, materials: act };
    });
  }
  function addMonthStr(m) { var y = +m.slice(0, 4), mo = +m.slice(5); mo++; if (mo > 12) { mo = 1; y++; } return y + '-' + pad(mo) + '-01'; }

  // 志望校と模試から、骨組みを作る。univ＝search の1件、mock＝{type, score}、start＝受験勉強のスタート日、examYm＝'2028-02'
  function plan(o) {
    var band0 = o.band || (o.univ && o.univ.band), others = (o.others || []).filter(function (b) { return b >= 1 && b <= 7; }), band = Math.min.apply(null, [band0].concat(others)), route = o.route || chooseRoute(o.start, o.examYm), g = null;      // 併願は、上位の帯（数字が小さいほう）をベースにする
    if (o.univ && o.univ.dev && o.mock && o.mock.score != null) { var cur = correct(o.mock.type, o.mock.score); g = gapLevel(o.univ.dev, cur); g.current = cur; }
    var rm = roadmap({ band: band, route: route, start: o.start, examYm: o.examYm }), mp = null;
    // 国公立（帯1〜4）がベースで、私立（帯5〜7）を併願するとき：秋以降の過去問演習に、私立特有の形式に慣れる期間を入れる
    var priv = band <= 4 && others.some(function (b) { return b >= 5; }), hey = Number(o.examYm.slice(0, 4)) - 1;
    if (priv) rm = rm.map(function (r) { var y = Number(r.month.slice(0, 4)), m = Number(r.month.slice(5)), on = (y === hey && m >= 9) || (y === hey + 1 && m === 1); return on ? { month: r.month, phase: r.phase, text: (r.text + '　併願（私立）：細かい知識問題やマーク式の長文など、私立特有の形式に慣れる期間を入れる。').slice(0, 300) } : r; });
    if (o.subjects && o.subjects.length) { mp = materialPlan({ band: band, subjects: o.subjects, start: o.start, examYm: o.examYm, level: g && g.level, route: route, owned: o.owned, weeklyMinutes: o.weeklyMinutes, dev: g ? g.current : (o.mock && o.mock.score != null ? correct(o.mock.type, o.mock.score) : null) }); rm = withMaterials(rm, mp); }
    return { baseBand: band0, mixedNote: band !== band0 ? '併願校に、より上位の帯があるため、上位の帯（帯' + band + '）をベースにしています。' : '', band: band, bandName: BANDS[band] && BANDS[band].name, route: route, routeName: route === 'std' ? '標準進行ルート（高2秋〜高3春スタート）' : '短期圧縮ルート（高3夏頃スタート）',
      gap: g, adjustNote: g ? ADJUST[g.level] : '', ratioNote: BANDS[band] ? BANDS[band].ratio : '', roadmap: rm, materials: mp, owned: mp ? mp.owned : null };
  }
  var api = { STANDARD_WEEKLY_MIN: STANDARD_WEEKLY_MIN, withMaterials: withMaterials, relayoutFrom: relayoutFrom, relayout: relayout, addDays: addDays, dateDiff: dateDiff, catalog: function () { return routeData().materials; }, correct0: correct, relayout_: relayout, tagParts: tagParts, MINDEV: MINDEV, LEVEL: LEVEL, subjectsOf: subjectsOf, routeRows: routeRows, materialPlan: materialPlan, BANDS: BANDS, bandNo: bandNo, chooseRoute: chooseRoute, correct: correct, gapLevel: gapLevel, ADJUST: ADJUST, roadmap: roadmap, search: search, plan: plan, PREP: PREP };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.JukenCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
