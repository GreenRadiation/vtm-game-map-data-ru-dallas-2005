/*
 * Карта Далласа и Форт-Уэрта 2005 для «Вампиры: Маскарад» (V20).
 * Общие данные лежат в data/map.json и одинаковы для всех.
 * Личные пометки игрока (метка, подпись, заметки) хранятся только в его браузере (localStorage).
 * Подробности устройства: docs/MAP.md
 */
(function () {
"use strict";

var DATA_URL = "data/map.json";
var STORE_KEY = "vtm-dallas-2005.personal.v1";

// Сетки. n/s/w/e — границы в градусах; клетка = (e-w)/cols по долготе и (n-s)/rows по широте.
var BOARDS = {
  city: {cols: 9, rows: 9, label: "Даллас", tab: "Даллас · 9×9", n: 33.02, s: 32.62, w: -96.99, e: -96.55, home: "D5",
    scale: "Одна клетка около 4,5 на 5 км. Ночью по шоссе это 3–5 минут на машине, по улицам 7–10. Клетки с пунктирной рамкой (D5, E5, D6, E6) показаны крупно на карте центра."},
  core: {cols: 8, rows: 8, label: "Центр Далласа", tab: "Центр Далласа · 8×8", n: 32.842222, s: 32.753333, w: -96.843333, e: -96.745556, home: "B4",
    scale: "Карта центра — это ровно четыре клетки большой карты, каждая разбита на 4×4: A–D 1–4 это D5, E–H 1–4 это E5, A–D 5–8 это D6, E–H 5–8 это E6. Толстые линии показывают их границы. Одна клетка около 1,1 на 1,2 км, 15 минут пешком или пара минут на машине."},
  fw: {cols: 9, rows: 9, label: "Форт-Уэрт", tab: "Форт-Уэрт · 9×9", n: 33.00, s: 32.60, w: -97.55, e: -97.11, home: "E6",
    scale: "Тот же масштаб, что у карты Далласа: клетка около 4,5 на 5 км. Между двумя картами лежат Арлингтон и Гранд-Прери. От отеля Anatole до даунтауна Форт-Уэрта около 48 км, ночью 40–50 минут по I-30."}
};
var ORIGIN = [32.8005, -96.8277]; // отель Anatole, от него считаются расстояния
var MARKS = [["", "Без метки"], ["haven", "Убежище"], ["ally", "Союзники"], ["hostile", "Враждебность"], ["important", "Важное место"]];
var MLABEL = {haven: "Убежище", ally: "Союзники", hostile: "Враждебность", important: "Важное место"};
var ZOOM = {"city:D5": 1, "city:E5": 1, "city:D6": 1, "city:E6": 1};
var L = "ABCDEFGHI";

var root = document.getElementById("root");
var data = null, mine = {cells: {}};
var cur = {b: "city", id: "D5"}, editing = false, status = "", toolStatus = "", confirmWipe = false;
var boardEl, panel, scaleEl, toolsEl;

function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (ch) { return {"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[ch]; }); }
function key() { return cur.b + ":" + cur.id; }
function cell(b, id) { return data.cells[b + ":" + id] || {name: "", terrain: "", marker: "", label: "", summary: "", details: "", notes: ""}; }
function own(b, id) { return mine.cells[b + ":" + id] || null; }

// ---------- личное хранилище ----------
function loadMine() {
  try { var raw = localStorage.getItem(STORE_KEY); if (raw) { var p = JSON.parse(raw); if (p && p.cells) mine = p; } } catch (_) {}
}
function saveMine() {
  try { mine.updated = new Date().toISOString(); localStorage.setItem(STORE_KEY, JSON.stringify(mine)); return true; }
  catch (_) { return false; }
}

// ---------- разметка ----------
function shell() {
  root.innerHTML =
    '<div class="wrap">' +
    '<header><div class="eyebrow">Vampire: The Masquerade · 2005 · карта хроники</div><h1>Даллас и Форт-Уэрт 2005</h1>' +
    '<p class="lead">Город поделён на клетки, север сверху. Нажми на клетку, и откроется её описание. Свои метки и заметки можно добавлять к любой клетке: они хранятся только в твоём браузере и никому больше не видны.</p></header>' +
    '<div class="bar"><div class="tabs" role="group" aria-label="Какую карту показать">' +
    Object.keys(BOARDS).map(function (b) { return '<button type="button" id="tab-' + b + '" data-b="' + b + '">' + BOARDS[b].tab + '</button>'; }).join("") + '</div>' +
    '<div class="legend"><span><i class="sw" style="background:var(--haven-bg);box-shadow:inset 0 0 0 2px var(--haven)"></i>убежище</span>' +
    '<span><i class="sw" style="background:var(--ally-bg);box-shadow:inset 0 0 0 2px var(--ally)"></i>союзники</span>' +
    '<span><i class="sw" style="background:var(--hostile-bg);box-shadow:inset 0 0 0 2px var(--hostile)"></i>враждебность</span>' +
    '<span><i class="sw" style="background:var(--imp-bg);box-shadow:inset 0 0 0 2px var(--imp)"></i>важное место</span>' +
    '<span><i class="sw" style="background:var(--no)"></i>соседние города</span>' +
    '<span><i class="sw" style="background:var(--water)"></i>вода</span>' +
    '<span><i class="sw" style="background:var(--green)"></i>лес, пустоши</span>' +
    '<span><i class="sw" style="position:relative;background:var(--paper);overflow:hidden"><i style="position:absolute;right:0;top:0;border-style:solid;border-width:0 7px 7px 0;border-color:transparent var(--imp) transparent transparent"></i></i>есть мои пометки</span></div></div>' +
    '<div class="main"><div class="boardbox"><p class="scale" id="scale"></p><div class="board" id="board"></div></div>' +
    '<aside class="panel" id="panel" aria-live="polite"></aside></div>' +
    '<div class="tools" id="tools"></div>' +
    '<footer><p>Районы и объекты разложены по клеткам по реальным координатам. Границы соседних городов приблизительные: черта и Далласа, и Форт-Уэрта очень изрезанная, и клетка на краю может быть частично чужой. Всё описано по состоянию на 2005 год.</p>' +
    '<p>Ссылку на конкретную клетку можно скопировать из адресной строки и отправить другим игрокам.</p></footer>' +
    '</div>';
  boardEl = document.getElementById("board"); panel = document.getElementById("panel");
  scaleEl = document.getElementById("scale"); toolsEl = document.getElementById("tools");

  boardEl.addEventListener("click", function (e) {
    var t = e.target.closest(".cell"); if (!t) return;
    cur.id = t.getAttribute("data-id"); editing = false; status = ""; renderAll(); syncHash();
    if (window.matchMedia("(max-width:900px)").matches) { try { panel.scrollIntoView({behavior: "smooth", block: "start"}); } catch (_) {} }
    var nb = boardEl.querySelector('.cell[data-id="' + cur.id + '"]'); if (nb) nb.focus({preventScroll: true});
  });
  document.querySelector(".tabs").addEventListener("click", function (e) {
    var t = e.target.closest("button"); if (!t) return;
    var b = t.getAttribute("data-b"); if (b === cur.b) return;
    cur = {b: b, id: BOARDS[b].home}; editing = false; status = ""; renderAll(); syncHash();
  });
}

function renderBoard() {
  var B = BOARDS[cur.b];
  boardEl.className = "board " + cur.b;
  boardEl.style.gridTemplateColumns = "20px repeat(" + B.cols + ",minmax(0,1fr))";
  var h = '<div class="hd"></div>';
  for (var c = 0; c < B.cols; c++) h += '<div class="hd" style="min-height:20px">' + L[c] + '</div>';
  for (var r = 1; r <= B.rows; r++) {
    h += '<div class="hd">' + r + '</div>';
    for (var c2 = 0; c2 < B.cols; c2++) {
      var id = L[c2] + r, x = cell(cur.b, id), o = own(cur.b, id), k = cur.b + ":" + id;
      var m = (o && o.marker) || x.marker;
      var cls = "cell " + (x.terrain || "") + (m ? " m-" + m : "") + (ZOOM[k] ? " zoom" : "") +
        (cur.b === "core" && c2 === 3 ? " qr" : "") + (cur.b === "core" && r === 4 ? " qb" : "");
      h += '<button type="button" class="' + cls + '" data-id="' + id + '" aria-pressed="' + (id === cur.id) + '" title="' + esc(id + " · " + x.name) + '" aria-label="' + esc(id + ", " + x.name) + '">' +
        '<span class="ci">' + id + '</span><span class="cn">' + esc(x.name) + '</span>' + (m ? '<span class="pin"></span>' : '') + (o ? '<span class="own"></span>' : '') + '</button>';
    }
  }
  boardEl.innerHTML = h;
  scaleEl.textContent = B.scale;
  Object.keys(BOARDS).forEach(function (b) { document.getElementById("tab-" + b).setAttribute("aria-pressed", cur.b === b ? "true" : "false"); });
}

function dist() {
  var B = BOARDS[cur.b], c = L.indexOf(cur.id[0]), r = +cur.id.slice(1) - 1;
  var lon = B.w + (c + .5) * (B.e - B.w) / B.cols, lat = B.n - (r + .5) * (B.n - B.s) / B.rows;
  var dx = (lon - ORIGIN[1]) * 93.3, dy = (lat - ORIGIN[0]) * 111;
  var km = Math.sqrt(dx * dx + dy * dy);
  if (km < 0.8) return "рядом с отелем Anatole";
  return "≈ " + (km < 10 ? km.toFixed(1).replace(".", ",") : Math.round(km)) + " км от отеля Anatole по прямой";
}

function paras(t) {
  return String(t || "").split(/\n\s*\n/).filter(function (p) { return p.trim(); }).map(function (p) { return '<p>' + esc(p.trim()) + '</p>'; }).join("");
}

function renderPanel() {
  var x = cell(cur.b, cur.id), o = own(cur.b, cur.id) || {marker: "", label: "", notes: ""}, k = key();
  var where = BOARDS[cur.b].label + ' · ' + cur.id +
    (cur.b === "core" ? ' (в большой ' + "DE"[Math.floor(L.indexOf(cur.id[0]) / 4)] + (5 + Math.floor((+cur.id.slice(1) - 1) / 4)) + ')' : '');

  if (editing) {
    var mopts = MARKS.map(function (m) { return '<option value="' + m[0] + '"' + (m[0] === (o.marker || "") ? " selected" : "") + '>' + m[1] + '</option>'; }).join("");
    panel.innerHTML =
      '<div class="pmeta"><span>' + where + '</span></div>' +
      '<h2>' + esc(x.name) + '</h2>' +
      '<p class="psum">Эти пометки видишь только ты. Они хранятся в этом браузере.</p>' +
      '<form class="form" id="f">' +
      '<div class="two"><div class="row"><label for="f-m">Моя метка</label><select id="f-m">' + mopts + '</select></div>' +
      '<div class="row"><label for="f-tag">Подпись</label><input id="f-tag" placeholder="например, Логово шерифа" value="' + esc(o.label) + '"></div></div>' +
      '<div class="row"><label for="f-notes">Мои заметки</label><textarea id="f-notes" rows="7" placeholder="Сюжетные зацепки, NPC, что угодно своё">' + esc(o.notes) + '</textarea></div>' +
      '<div class="actions"><button class="btn primary" type="submit">Сохранить</button><button class="btn" type="button" id="f-cancel">Отмена</button>' +
      (own(cur.b, cur.id) ? '<button class="btn danger" type="button" id="f-del">Удалить мои пометки</button>' : '') +
      '<span class="status">' + esc(status) + '</span></div></form>';
    document.getElementById("f").addEventListener("submit", function (e) {
      e.preventDefault();
      var next = {marker: document.getElementById("f-m").value, label: document.getElementById("f-tag").value.trim(),
        notes: document.getElementById("f-notes").value.replace(/\r/g, "").trim()};
      if (!next.marker && !next.label && !next.notes) delete mine.cells[k]; else mine.cells[k] = next;
      if (saveMine()) { editing = false; status = "Сохранено в этом браузере"; }
      else status = "Браузер не дал сохранить. Возможно, включён приватный режим.";
      renderAll();
    });
    document.getElementById("f-cancel").addEventListener("click", function () { editing = false; status = ""; renderPanel(); });
    var del = document.getElementById("f-del");
    if (del) del.addEventListener("click", function () { delete mine.cells[k]; saveMine(); editing = false; status = "Мои пометки удалены"; renderAll(); });
    return;
  }

  var chips = "";
  if (x.marker && MLABEL[x.marker]) chips += '<span class="chip m-' + x.marker + '">' + esc(MLABEL[x.marker]) + '</span>';
  if (x.label) chips += '<span class="chip">' + esc(x.label) + '</span>';
  var mineBlock = "";
  if (own(cur.b, cur.id)) {
    mineBlock = '<div class="mine"><h3>Мои пометки</h3>' +
      ((o.marker || o.label) ? '<div class="pmeta">' + (o.marker ? '<span class="chip m-' + o.marker + '">' + esc(MLABEL[o.marker]) + '</span>' : '') + (o.label ? '<span class="chip">' + esc(o.label) + '</span>' : '') + '</div>' : '') +
      (o.notes ? '<p>' + esc(o.notes) + '</p>' : '') + '</div>';
  }
  panel.innerHTML =
    '<div class="pmeta"><span>' + where + '</span>' + chips + '<span>' + dist() + '</span></div>' +
    '<h2>' + esc(x.name || "Без названия") + '</h2>' +
    (x.summary ? '<p class="psum">' + esc(x.summary) + '</p>' : "") +
    '<div class="pdet">' + (paras(x.details) || '<p class="psum">Описания пока нет.</p>') + '</div>' +
    (x.notes && x.notes.trim() ? '<div class="notes"><h3>Заметки мастера</h3><p>' + esc(x.notes) + '</p></div>' : "") +
    mineBlock +
    '<div class="actions"><button class="btn primary" type="button" id="p-edit">' + (own(cur.b, cur.id) ? 'Изменить мои пометки' : 'Добавить свою пометку') + '</button>' +
    (ZOOM[k] ? '<button class="btn" type="button" id="p-zoom">Открыть центр крупно</button>' : "") +
    (status ? '<span class="status">' + esc(status) + '</span>' : "") + '</div>';
  document.getElementById("p-edit").addEventListener("click", function () { editing = true; status = ""; renderPanel(); var t = document.getElementById("f-notes"); if (t) t.focus(); });
  var zb = document.getElementById("p-zoom");
  if (zb) zb.addEventListener("click", function () {
    var zc = L.indexOf(cur.id[0]) - 3, zr = +cur.id.slice(1) - 5;
    cur = {b: "core", id: L[zc * 4 + 1] + (zr * 4 + 2)}; editing = false; status = ""; renderAll(); syncHash();
  });
}

function renderTools() {
  var n = Object.keys(mine.cells).length;
  toolsEl.innerHTML =
    '<span class="status" style="flex-basis:auto">Мои пометки: ' + n + '</span>' +
    '<button class="btn small" type="button" id="t-exp"' + (n ? '' : ' disabled') + '>Скачать файлом</button>' +
    '<label class="btn small" for="t-imp" style="cursor:pointer">Загрузить из файла</label><input type="file" id="t-imp" accept="application/json,.json" hidden>' +
    (n ? (confirmWipe
      ? '<button class="btn small danger" type="button" id="t-wipe2">Да, удалить все</button><button class="btn small" type="button" id="t-wipe0">Не удалять</button>'
      : '<button class="btn small danger" type="button" id="t-wipe">Удалить все мои пометки</button>') : '') +
    (toolStatus ? '<span class="status">' + esc(toolStatus) + '</span>' : '');
  var exp = document.getElementById("t-exp");
  if (exp) exp.addEventListener("click", function () {
    var blob = new Blob([JSON.stringify(mine, null, 1)], {type: "application/json"});
    var a = document.createElement("a"); a.href = URL.createObjectURL(blob);
    a.download = "moi-pometki-dallas-2005.json"; document.body.appendChild(a); a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    toolStatus = "Файл скачан. Его можно загрузить в другом браузере или на другом устройстве."; renderTools();
  });
  document.getElementById("t-imp").addEventListener("change", function (e) {
    var f = e.target.files && e.target.files[0]; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      try {
        var p = JSON.parse(rd.result);
        if (!p || typeof p.cells !== "object") throw new Error("bad");
        var added = 0;
        Object.keys(p.cells).forEach(function (k) { if (data.cells[k]) { mine.cells[k] = p.cells[k]; added++; } });
        saveMine(); toolStatus = "Загружено пометок: " + added + ". Совпадающие клетки заменены пометками из файла.";
      } catch (_) { toolStatus = "Этот файл не похож на файл пометок с этой карты."; }
      renderAll();
    };
    rd.readAsText(f);
  });
  var w = document.getElementById("t-wipe"); if (w) w.addEventListener("click", function () { confirmWipe = true; renderTools(); });
  var w0 = document.getElementById("t-wipe0"); if (w0) w0.addEventListener("click", function () { confirmWipe = false; renderTools(); });
  var w2 = document.getElementById("t-wipe2"); if (w2) w2.addEventListener("click", function () {
    mine = {cells: {}}; saveMine(); confirmWipe = false; toolStatus = "Все мои пометки удалены."; renderAll();
  });
}

function renderAll() { renderBoard(); renderPanel(); renderTools(); }

// Ссылка на клетку: #city-D5, #core-B4, #fw-E6
function syncHash() { try { history.replaceState(null, "", "#" + cur.b + "-" + cur.id); } catch (_) {} }
function readHash() {
  var m = /^#(city|core|fw)-([A-I])([1-9])$/.exec(location.hash || "");
  if (!m) return;
  var B = BOARDS[m[1]], c = L.indexOf(m[2]), r = +m[3];
  if (c < B.cols && r <= B.rows) cur = {b: m[1], id: m[2] + m[3]};
}

fetch(DATA_URL, {cache: "no-cache"}).then(function (r) {
  if (!r.ok) throw new Error(r.status);
  return r.json();
}).then(function (d) {
  data = d; loadMine(); readHash(); shell(); renderAll();
  window.addEventListener("hashchange", function () { readHash(); editing = false; renderAll(); });
}).catch(function () {
  root.innerHTML = '<div class="wrap"><p class="loading">Не удалось загрузить данные карты. Если ты открыл файл прямо с диска, запусти локальный сервер (см. README) или открой сайт по ссылке GitHub Pages.</p></div>';
});
})();
