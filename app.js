/* =====================================================================
Mon compt'heures — logique de l'application
===================================================================== */

const JOURS = ['Dim','Lun','Mar','Mer','Jeu','Ven','Sam'];
const MOIS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

const $ = (sel, el=document) => el.querySelector(sel);
const $$ = (sel, el=document) => [...el.querySelectorAll(sel)];

function listen(sel, type, fn){
  const el = $(sel);
  if(el) el.addEventListener(type, fn);
}

const DEFAULT_SETTINGS = {
  theme:'auto',
  inputMode:'direct',
  hourFormat:'decimal',
  weeklyGoal: null
};

const today = new Date();

let state = {
  year: today.getFullYear(),
  month: today.getMonth()
};

let settings = loadSettings();
let data = loadData();

let shifts = loadShifts();
let ignoredCodes = loadIgnoredCodes();
let preferredEmployee = loadPreferredEmployee();

let pendingImport = null;
let excelCandidate = null;

function loadSettings(){
  try{
    const raw = localStorage.getItem('ch_settings');
    if(raw){
      const parsed = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
      if(parsed.theme === 'light') parsed.theme = 'carnet-clair';
      if(parsed.theme === 'dark') parsed.theme = 'carnet-sombre';
      return parsed;
    }
  }catch(e){}
  return { ...DEFAULT_SETTINGS };
}

function saveSettings(){
  localStorage.setItem('ch_settings', JSON.stringify(settings));
}

function loadData(){
  try{
    const raw = localStorage.getItem('ch_data');
    if(raw) return JSON.parse(raw);
  }catch(e){}
  return {};
}

function saveData(){
  localStorage.setItem('ch_data', JSON.stringify(data));
}

function monthKey(y,m){
  return `${y}-${String(m+1).padStart(2,'0')}`;
}

function loadShifts(){
  try{
    const raw = localStorage.getItem('ch_shifts');
    if(raw) return JSON.parse(raw);
  }catch(e){}

  return {
    '9nt': { start:'', end:'' },
    '9rh': { start:'', end:'' },
    '9tp': { start:'', end:'' },
    'ki1': { start:'07:15', end:'18:00' },
    'ki2': { start:'07:15', end:'18:00' },
    'ki3': { start:'07:15', end:'18:00' },
    'ki4': { start:'09:30', end:'20:15' },
    'ki5': { start:'09:30', end:'20:15' },
    'ki6': { start:'09:30', end:'20:15' },
    'kic': { start:'07:15', end:'18:00' },
    'mk1': { start:'07:15', end:'11:30' },
    'mk2': { start:'', end:'' },
    'mk3': { start:'', end:'' },
    'mk4': { start:'09:30', end:'14:00' },
    'sk1': { start:'12:15', end:'18:00' },
    'sk2': { start:'', end:'' },
    'sk3': { start:'', end:'' },
    'sk4': { start:'14:45', end:'20:15' }
  };
}

function saveShifts(){
  localStorage.setItem('ch_shifts', JSON.stringify(shifts));
}

function loadIgnoredCodes(){
  try{
    const raw = localStorage.getItem('ch_shifts_ignored');
    if(raw) return new Set(JSON.parse(raw));
  }catch(e){}
  return new Set();
}

function saveIgnoredCodes(){
  localStorage.setItem('ch_shifts_ignored', JSON.stringify([...ignoredCodes]));
}

function loadPreferredEmployee(){
  try{
    return localStorage.getItem('ch_employee') || null;
  }catch(e){
    return null;
  }
}

function savePreferredEmployee(name){
  if(name) localStorage.setItem('ch_employee', name);
  else localStorage.removeItem('ch_employee');
  preferredEmployee = name;
}

function normalizeCode(s){
  return String(s || '').trim().toLowerCase();
}

function isRestCode(code){
  return /^9/.test(normalizeCode(code));
}

function shiftHasHours(code){
  const s = shifts[code];
  return !!(s && s.start && s.end && /^\d{1,2}:\d{2}$/.test(s.start) && /^\d{1,2}:\d{2}$/.test(s.end));
}

function resolveThemeName(){
  if(settings.theme === 'auto'){
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'carnet-sombre' : 'carnet-clair';
  }
  return settings.theme;
}

function applyTheme(){
  const root = document.documentElement;
  root.setAttribute('data-theme-name', resolveThemeName());

  const meta = $('#theme-color-meta');
  if(meta){
    const cs = getComputedStyle(root);
    meta.setAttribute('content', cs.getPropertyValue('--paper').trim());
  }
}

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if(settings.theme === 'auto') applyTheme();
});

function parseHoursInput(str){
  if(str == null) return null;

  str = String(str).trim();
  if(str === '') return null;

  str = str.replace(',', '.');

  let m = str.match(/^(\d{1,2})\s*[h:]\s*(\d{1,2})?\s*$/i);
  if(m){
    const h = parseInt(m[1],10) || 0;
    const mi = m[2] ? parseInt(m[2],10) : 0;
    return h + mi/60;
  }

  const f = parseFloat(str);
  return isNaN(f) ? null : f;
}

function formatHoursForInput(h){
  if(h == null || isNaN(h)) return '';

  if(settings.hourFormat === 'hm'){
    const total = Math.round(h * 60);
    const hh = Math.floor(total/60);
    const mm = total % 60;
    return mm === 0 ? `${hh}h` : `${hh}h${String(mm).padStart(2,'0')}`;
  }

  return (Math.round(h * 100)/100).toString().replace('.', ',');
}

function formatTotal(h){
  if(settings.hourFormat === 'hm'){
    const total = Math.round(h * 60);
    const hh = Math.floor(total/60);
    const mm = total % 60;
    return `${hh}h${String(mm).padStart(2,'0')}`;
  }

  return (Math.round(h*100)/100).toLocaleString('fr-FR', {
    minimumFractionDigits: (h % 1 !== 0) ? 2 : 0
  });
}

function renderMeterDigits(str){
  return [...str].map(ch => {
    if(/\d/.test(ch)) return `<span class="digit">${ch}</span>`;
    return `<span class="sep">${ch}</span>`;
  }).join('');
}

function decimalToHHMM(h){
  if(h == null || isNaN(h)) return '';

  const total = Math.max(0, Math.min(23*60+59, Math.round(h*60)));

  return `${String(Math.floor(total/60)).padStart(2,'0')}:${String(total%60).padStart(2,'0')}`;
}

function parseHHMM(str){
  const m = String(str || '').match(/^(\d{1,2}):(\d{2})$/);
  if(!m) return null;
  return parseInt(m[1],10) + parseInt(m[2],10)/60;
}

function timeStrToMinutes(str){
  const m = String(str || '').match(/^(\d{1,2}):(\d{2})$/);
  if(!m) return null;
  return parseInt(m[1],10)*60 + parseInt(m[2],10);
}

function clampHours(v){
  return Math.max(0, Math.min(24, v));
}

function autoPauseMinutes(startStr, endStr){
  const startMin = timeStrToMinutes(startStr);
  const endMin = timeStrToMinutes(endStr);

  if(startMin == null || endMin == null) return 0;

  return (startMin < 11*60 && endMin > 14*60) ? 45 : 0;
}

function entryPause(entry){
  if(!entry) return 0;
  if(entry.pause != null) return entry.pause;
  if(entry.start && entry.end) return autoPauseMinutes(entry.start, entry.end);
  return 0;
}

function computeShiftHours(startStr, endStr, pauseMin){
  const startMin = timeStrToMinutes(startStr);
  let endMin = timeStrToMinutes(endStr);

  if(startMin == null || endMin == null) return null;

  if(endMin < startMin) endMin += 24*60;

  let total = endMin - startMin - (pauseMin || 0);
  if(total < 0) total = 0;

  return clampHours(total/60);
}

function daysInMonth(y,m){
  return new Date(y, m+1, 0).getDate();
}

function render(){
  $('#month-select').value = state.month;
  $('#year-input').value = state.year;

  const key = monthKey(state.year, state.month);
  const monthData = data[key] || {};
  const nbJours = daysInMonth(state.year, state.month);

  let total = 0;
  const list = $('#day-list');
  list.innerHTML = '';

  const isCurrentRealMonth = (state.year === today.getFullYear() && state.month === today.getMonth());

  for(let d=1; d<=nbJours; d++){
    const dow = new Date(state.year, state.month, d).getDay();
    const entry = monthData[d] || {};

    if(typeof entry.h === 'number') total += entry.h;

    const row = document.createElement('div');
    row.className = 'day-row';

    if(dow === 0 || dow === 6) row.classList.add('is-weekend');
    if(dow === 0) row.classList.add('is-sunday');
    if(isCurrentRealMonth && d === today.getDate()) row.classList.add('is-today');

    row.innerHTML = `
      <div class="day-id">
        <div class="day-name">${JOURS[dow]}</div>
        <div class="day-num">${d}</div>
      </div>
      ${dayFieldsHtml(d, entry)}
    `;

    list.appendChild(row);
  }

  $('#meter-window').innerHTML = renderMeterDigits(formatTotal(total));
  $('#period-label').textContent = `${MOIS[state.month]} ${state.year}`;
  updateGoalLine(total, nbJours);
}

function dayFieldsHtml(d, entry){
  if(settings.inputMode === 'shift'){
    return `
      <div class="day-fields shift-fields">
        <div class="shift-row">
          <input type="time" class="time-input" data-day="${d}" data-field="start" value="${entry.start || ''}">
          <span class="shift-arrow">→</span>
          <input type="time" class="time-input" data-day="${d}" data-field="end" value="${entry.end || ''}">
          <span class="pause-group">
            <input type="number" class="pause-input" inputmode="numeric" min="0" max="600" step="5" placeholder="0" data-day="${d}" data-field="pause" value="${entry.pause != null ? entry.pause : ''}">
            <span class="pause-unit">min pause</span>
          </span>
          <span class="shift-duration" data-day-total="${d}">${entry.h != null ? formatHoursForInput(entry.h) : '—'}</span>
        </div>
        <div class="comment-wrap">
          <input class="comment-input" type="text" placeholder="Commentaire (optionnel)" data-day="${d}" data-field="c" value="${entry.c ? escapeAttr(entry.c) : ''}">
        </div>
      </div>
    `;
  }

  const isTimeWidget = settings.hourFormat === 'hm';

  const hoursField = isTimeWidget
    ? `<input class="hours-input time-input" type="time" data-day="${d}" data-field="h" value="${entry.h != null ? decimalToHHMM(entry.h) : ''}">`
    : `<input class="hours-input" type="text" inputmode="decimal" placeholder="0" data-day="${d}" data-field="h" value="${entry.h != null ? formatHoursForInput(entry.h) : ''}">`;

  return `
    <div class="day-fields">
      ${hoursField}
      <div class="comment-wrap">
        <input class="comment-input" type="text" placeholder="Commentaire (optionnel)" data-day="${d}" data-field="c" value="${entry.c ? escapeAttr(entry.c) : ''}">
      </div>
    </div>
  `;
}

function computeMonthTotal(key){
  const monthData = data[key] || {};
  let total = 0;

  Object.values(monthData).forEach(en => {
    if(typeof en.h === 'number') total += en.h;
  });

  return total;
}

function updateGoalLine(total, nbJours){
  const el = $('#goal-line');
  const goal = settings.weeklyGoal;

  if(!goal || goal <= 0){
    el.classList.remove('visible');
    el.innerHTML = '';
    return;
  }

  const monthlyGoal = goal / 7 * nbJours;
  const diff = total - monthlyGoal;

  let msg;

  if(Math.abs(diff) < 0.01){
    msg = `Objectif atteint : <strong>${formatTotal(monthlyGoal)}</strong> ce mois (${formatTotal(goal)}/sem.)`;
  } else if(diff < 0){
    msg = `Objectif ≈ <strong>${formatTotal(monthlyGoal)}</strong> ce mois (${formatTotal(goal)}/sem.) · reste <strong class="delta">${formatTotal(Math.abs(diff))}</strong>`;
  } else {
    msg = `Objectif ≈ <strong>${formatTotal(monthlyGoal)}</strong> ce mois (${formatTotal(goal)}/sem.) · dépassé de <strong class="delta">${formatTotal(diff)}</strong>`;
  }

  el.innerHTML = msg;
  el.classList.add('visible');
  el.classList.toggle('over', diff >= 0);
}

function escapeAttr(s){
  return String(s)
    .replace(/&/g,'&amp;')
    .replace(/"/g,'&quot;')
    .replace(/</g,'&lt;')
    .replace(/>/g,'&gt;');
}

function escapeHtml(s){
  return escapeAttr(s);
}

function setEntry(day, field, value){
  const key = monthKey(state.year, state.month);

  if(!data[key]) data[key] = {};
  if(!data[key][day]) data[key][day] = {};

  const entry = data[key][day];

  if(field === 'h'){
    const parsed = settings.hourFormat === 'hm' ? parseHHMM(value) : parseHoursInput(value);
    if(parsed == null) delete entry.h;
    else entry.h = clampHours(parsed);
  } else if(field === 'c'){
    if(!value) delete entry.c;
    else entry.c = value;
  } else if(field === 'start' || field === 'end'){
    if(!value) delete entry[field];
    else entry[field] = value;
    recomputeShift(entry);
  } else if(field === 'pause'){
    if(value === ''){
      delete entry.pause;
    } else {
      const m = parseInt(value, 10);
      if(isNaN(m)) delete entry.pause;
      else entry.pause = Math.max(0, Math.min(600, m));
    }
    recomputeShift(entry);
  }

  if(Object.keys(data[key][day]).length === 0) delete data[key][day];
  if(Object.keys(data[key]).length === 0) delete data[key];

  saveData();
}

function recomputeShift(entry){
  const h = computeShiftHours(entry.start, entry.end, entryPause(entry));
  if(h == null) delete entry.h;
  else entry.h = h;
}

document.addEventListener('input', (e) => {
  const t = e.target;

  if(t.matches('.hours-input, .comment-input, .time-input, .pause-input')){
    const day = t.dataset.day;
    const field = t.dataset.field;

    setEntry(day, field, t.value);

    if(field === 'h' || field === 'start' || field === 'end' || field === 'pause'){
      const key = monthKey(state.year, state.month);
      const total = computeMonthTotal(key);

      $('#meter-window').innerHTML = renderMeterDigits(formatTotal(total));
      updateGoalLine(total, daysInMonth(state.year, state.month));

      if(field !== 'h'){
        const entry = (data[key] && data[key][day]) || {};
        const badge = document.querySelector(`.shift-duration[data-day-total="${day}"]`);
        if(badge) badge.textContent = entry.h != null ? formatHoursForInput(entry.h) : '—';
      }
    }
  }
});

document.addEventListener('blur', (e) => {
  const t = e.target;

  if(t.matches('.hours-input') && t.type === 'text'){
    const key = monthKey(state.year, state.month);
    const entry = (data[key] && data[key][t.dataset.day]) || {};
    t.value = entry.h != null ? formatHoursForInput(entry.h) : '';
  }
}, true);

listen('#month-select', 'change', (e) => {
  state.month = parseInt(e.target.value,10);
  render();
});

listen('#year-input', 'change', (e) => {
  let y = parseInt(e.target.value,10);
  if(isNaN(y)) y = today.getFullYear();
  y = Math.max(1970, Math.min(2200, y));
  state.year = y;
  render();
});

listen('#prev-month', 'click', () => {
  state.month--;
  if(state.month < 0){
    state.month = 11;
    state.year--;
  }
  render();
});

listen('#next-month', 'click', () => {
  state.month++;
  if(state.month > 11){
    state.month = 0;
    state.year++;
  }
  render();
});

function openSheet(){
  const overlay = $('#settings-overlay');
  if(overlay){
    overlay.classList.add('open');
    syncSettingsUI();
  }
}

function closeSheet(){
  const overlay = $('#settings-overlay');
  if(overlay) overlay.classList.remove('open');
}

listen('#open-settings', 'click', () => openSheet());
listen('#close-settings', 'click', () => closeSheet());

const settingsOverlay = $('#settings-overlay');
if(settingsOverlay){
  settingsOverlay.addEventListener('click', (e) => {
    if(e.target === settingsOverlay) closeSheet();
  });
}

function syncSettingsUI(){
  $$('.theme-option').forEach(b => b.classList.toggle('active', b.dataset.theme === settings.theme));
  $$('.seg-inputmode button').forEach(b => b.classList.toggle('active', b.dataset.v === settings.inputMode));
  $$('.seg-format button').forEach(b => b.classList.toggle('active', b.dataset.v === settings.hourFormat));

  const goal = $('#weekly-goal');
  if(goal) goal.value = settings.weeklyGoal != null ? settings.weeklyGoal : '';
}

$$('.theme-option').forEach(b => b.addEventListener('click', () => {
  settings.theme = b.dataset.theme;
  saveSettings();
  applyTheme();
  syncSettingsUI();
}));

$$('.seg-inputmode button').forEach(b => b.addEventListener('click', () => {
  settings.inputMode = b.dataset.v;
  saveSettings();
  syncSettingsUI();
  render();
}));

$$('.seg-format button').forEach(b => b.addEventListener('click', () => {
  settings.hourFormat = b.dataset.v;
  saveSettings();
  syncSettingsUI();
  render();
}));

listen('#weekly-goal', 'input', (e) => {
  const v = parseFloat(String(e.target.value).replace(',', '.'));
  settings.weeklyGoal = isNaN(v) || v <= 0 ? null : v;
  saveSettings();

  const key = monthKey(state.year, state.month);
  updateGoalLine(computeMonthTotal(key), daysInMonth(state.year, state.month));
});

function csvEscape(v){
  v = String(v ?? '');
  if(/[;"\n]/.test(v)) return '"' + v.replace(/"/g,'""') + '"';
  return v;
}

function buildCsv(monthsKeys){
  const rows = [['Date','Heures','Début','Fin','Pause (min)','Commentaire']];

  monthsKeys.sort().forEach(key => {
    const [y,m] = key.split('-').map(Number);
    const md = data[key];

    Object.keys(md).map(Number).sort((a,b)=>a-b).forEach(day => {
      const entry = md[day];
      const dateStr = `${y}-${String(m).padStart(2,'0')}-${String(day).padStart(2,'0')}`;
      const hStr = entry.h != null ? (Math.round(entry.h * 100)/100).toString().replace('.', ',') : '';
      const pause = entryPause(entry);

      rows.push([
        dateStr,
        hStr,
        entry.start || '',
        entry.end || '',
        pause ? String(pause) : '',
        entry.c || ''
      ]);
    });
  });

  return rows.map(r => r.map(csvEscape).join(';')).join('\r\n');
}

function downloadCsv(filename, content){
  const blob = new Blob(['\ufeff' + content], {type:'text/csv;charset=utf-8;'});
  downloadBlob(filename, blob);
}

function downloadBlob(filename, blob){
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

async function shareOrDownload(filename, blob, mime, shareText){
  if(navigator.share && navigator.canShare){
    try{
      const file = new File([blob], filename, { type: mime });
      if(navigator.canShare({ files: [file] })){
        await navigator.share({ files: [file], title: "Mon compt'heures", text: shareText });
        return;
      }
    }catch(err){
      if(err && err.name === 'AbortError') return;
    }
  }

  downloadBlob(filename, blob);
  showToast('Partage non disponible ici — fichier téléchargé à la place.');
}

listen('#export-month', 'click', () => {
  const key = monthKey(state.year, state.month);
  if(!data[key]){
    showToast('Aucune donnée à exporter pour ce mois.');
    return;
  }
  downloadCsv(`compt-heures_${key}.csv`, buildCsv([key]));
  showToast('Export du mois effectué.');
});

listen('#share-month-csv', 'click', () => {
  const key = monthKey(state.year, state.month);
  if(!data[key]){
    showToast('Aucune donnée à exporter pour ce mois.');
    return;
  }

  const content = buildCsv([key]);
  const blob = new Blob(['\ufeff' + content], {type:'text/csv;charset=utf-8;'});
  shareOrDownload(`compt-heures_${key}.csv`, blob, 'text/csv', `Mes heures — ${MOIS[state.month]} ${state.year}`);
});

listen('#export-all', 'click', () => {
  const keys = Object.keys(data);
  if(keys.length === 0){
    showToast('Aucune donnée enregistrée.');
    return;
  }
  downloadCsv('compt-heures_complet.csv', buildCsv(keys));
  showToast('Export complet effectué.');
});

listen('#share-all-csv', 'click', () => {
  const keys = Object.keys(data);
  if(keys.length === 0){
    showToast('Aucune donnée enregistrée.');
    return;
  }

  const content = buildCsv(keys);
  const blob = new Blob(['\ufeff' + content], {type:'text/csv;charset=utf-8;'});
  shareOrDownload('compt-heures_complet.csv', blob, 'text/csv', "Mon compt'heures — export complet");
});

function buildMonthPdfDoc(){
  const key = monthKey(state.year, state.month);
  const monthData = data[key] || {};
  const nbJours = daysInMonth(state.year, state.month);

  if(Object.keys(monthData).length === 0) return { error: 'empty' };
  if(!window.jspdf || !window.jspdf.jsPDF) return { error: 'no-lib' };

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  if(!doc.autoTable) return { error: 'no-lib' };

  const title = `Mon compt'heures — ${MOIS[state.month]} ${state.year}`;

  doc.setFontSize(16);
  doc.text(title, 14, 18);

  doc.setFontSize(10);
  doc.setTextColor(110);
  doc.text('Récapitulatif mensuel des heures travaillées', 14, 24);
  doc.setTextColor(0);

  const body = [];
  let total = 0;

  for(let d=1; d<=nbJours; d++){
    const entry = monthData[d];
    const dow = new Date(state.year, state.month, d).getDay();

    if(entry && (entry.h != null || entry.c)){
      if(typeof entry.h === 'number') total += entry.h;

      const pause = entryPause(entry);

      body.push([
        JOURS[dow],
        String(d),
        entry.start || '',
        entry.end || '',
        pause ? `${pause} min` : '',
        entry.h != null ? formatHoursForInput(entry.h) : '',
        entry.c || ''
      ]);
    }
  }

  doc.autoTable({
    startY: 30,
    head: [['Jour', 'Date', 'Début', 'Fin', 'Pause', 'Heures', 'Commentaire']],
    body,
    styles: { fontSize: 9.5, cellPadding: 2.2 },
    headStyles: { fillColor: [40, 48, 46], textColor: 255 },
    columnStyles: {
      0:{cellWidth:15},
      1:{cellWidth:14},
      2:{cellWidth:14},
      3:{cellWidth:14},
      4:{cellWidth:14},
      5:{cellWidth:15}
    },
    theme: 'grid'
  });

  const finalY = doc.lastAutoTable.finalY || 30;

  doc.setFontSize(12);
  doc.setFont(undefined, 'bold');
  doc.text(`Total du mois : ${formatTotal(total)}`, 14, finalY + 10);
  doc.setFont(undefined, 'normal');

  return { doc, filename: `compt-heures_${key}.pdf` };
}

function pdfErrorToast(errCode){
  if(errCode === 'empty') showToast('Aucune donnée à exporter pour ce mois.');
  else showToast("L'export PDF nécessite une connexion internet (chargement du module la première fois).");
}

listen('#export-pdf', 'click', () => {
  const result = buildMonthPdfDoc();
  if(result.error){
    pdfErrorToast(result.error);
    return;
  }
  result.doc.save(result.filename);
  showToast('PDF généré.');
});

listen('#share-pdf', 'click', () => {
  const result = buildMonthPdfDoc();
  if(result.error){
    pdfErrorToast(result.error);
    return;
  }

  const blob = result.doc.output('blob');
  shareOrDownload(result.filename, blob, 'application/pdf', `Mes heures — ${MOIS[state.month]} ${state.year}`);
});

listen('#import-btn', 'click', () => {
  const input = $('#import-file');
  if(input) input.click();
});

listen('#import-file', 'change', (e) => {
  const file = e.target.files[0];
  if(!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try{
      const n = importCsv(reader.result);
      saveData();
      render();
      showToast(`${n} jour(s) importé(s).`);
    }catch(err){
      showToast("Le fichier n'a pas pu être lu. Vérifiez le format CSV.");
    }
  };

  reader.readAsText(file, 'utf-8');
  e.target.value = '';
});

function parseCsvLine(line){
  const out = [];
  let cur = '';
  let inQ = false;

  for(let i=0; i<line.length; i++){
    const c = line[i];

    if(inQ){
      if(c === '"'){
        if(line[i+1] === '"'){
          cur += '"';
          i++;
        } else {
          inQ = false;
        }
      } else {
        cur += c;
      }
    } else {
      if(c === '"') inQ = true;
      else if(c === ';'){
        out.push(cur);
        cur = '';
      } else {
        cur += c;
      }
    }
  }

  out.push(cur);
  return out;
}

function importCsv(text){
  const lines = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(l => l.trim() !== '');
  if(lines.length === 0) return 0;

  const header = parseCsvLine(lines[0]).map(h => h.trim().toLowerCase());
  const findCol = (...starts) => header.findIndex(h => starts.some(s => h.startsWith(s)));
  const hasHeader = findCol('date') !== -1;

  const idx = hasHeader
    ? {
        date: findCol('date'),
        h: findCol('heure'),
        start: findCol('déb','deb'),
        end: findCol('fin'),
        pause: findCol('pause'),
        c: findCol('comment')
      }
    : { date: 0, h: 1, start: -1, end: -1, pause: -1, c: 2 };

  const startRow = hasHeader ? 1 : 0;
  let count = 0;

  for(let i=startRow; i<lines.length; i++){
    const cols = parseCsvLine(lines[i]);

    const dateStr = (cols[idx.date] || '').trim();
    if(!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) continue;

    const [y, m, d] = dateStr.split('-').map(Number);
    const key = monthKey(y, m - 1);

    if(!data[key]) data[key] = {};

    const entry = {};

    const startRaw = idx.start >= 0 ? (cols[idx.start] || '').trim() : '';
    const endRaw = idx.end >= 0 ? (cols[idx.end] || '').trim() : '';
    const pauseRaw = idx.pause >= 0 ? (cols[idx.pause] || '').trim() : '';
    const hRaw = idx.h >= 0 ? (cols[idx.h] || '').trim() : '';
    const c = idx.c >= 0 ? (cols[idx.c] || '').trim() : '';

    if(/^\d{1,2}:\d{2}$/.test(startRaw)) entry.start = startRaw;
    if(/^\d{1,2}:\d{2}$/.test(endRaw)) entry.end = endRaw;

    if(pauseRaw !== ''){
      const p = parseInt(pauseRaw, 10);
      if(!isNaN(p) && p >= 0) entry.pause = Math.min(600, p);
    }

    if(entry.start && entry.end){
      const h = computeShiftHours(entry.start, entry.end, entryPause(entry));
      if(h != null) entry.h = h;
    } else if(hRaw !== ''){
      const h = parseHoursInput(hRaw);
      if(h != null) entry.h = h;
    }

    if(c) entry.c = c;

    if(Object.keys(entry).length){
      data[key][d] = entry;
      count++;
    }
  }

  return count;
}

function stripAccents(s){
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u0306]/g, '');
}

function normalizePerson(s){
  return stripAccents(s).replace(/\s+/g, ' ').trim();
}

const MONTH_KEYWORDS = [
  'janvier','fevrier','mars','avril','mai','juin',
  'juillet','aout','septembre','octobre','novembre','decembre'
];

function detectMonthFromHeader(text){
  const s = stripAccents(text);
  const yearMatch = s.match(/(19|20)\d{2}/);
  if(!yearMatch) return null;

  const year = parseInt(yearMatch[0], 10);

  for(let i=0; i<MONTH_KEYWORDS.length; i++){
    if(s.includes(MONTH_KEYWORDS[i])){
      return { year, month: i };
    }
  }

  return null;
}

function isLikelyPostCode(s){
  s = String(s || '').trim();
  return /^[a-z0-9]{2,10}$/i.test(s) && !/^\d{1,2}[h:]/i.test(s);
}

function looksLikeEmployeeName(s){
  s = String(s || '').trim();

  if(s.length < 3 || s.length > 45) return false;
  if(!s.includes(' ')) return false;
  if(/[0-9]{1,2}:[0-9]{2}/.test(s)) return false;
  if(/^(D|L|M|J|V|S)\.\d{1,2}$/i.test(s)) return false;
  if(/^[A-Z0-9]{2,10}$/i.test(s)) return false;
  if(/\\|planning|S012|personnel|cuisine|salle à manger|cuisinier|direction|restauration/i.test(s)) return false;
  if(/^\d/.test(s)) return false;
  if(/^(VV|V)\d+/i.test(s)) return false;
  if(/doublage|self|repos|matin|soir/i.test(s)) return false;

  return true;
}

function readEmployeeRow(row, current, dayColumns){
  for(const dc of dayColumns){
    const rawA = String(row[dc.colA] || '').trim();
    const rawB = String(row[dc.colB] || '').trim();

    let code = '';
    let annotation = '';

    if(rawA){
      if(isLikelyPostCode(rawA)) code = normalizeCode(rawA);
      else annotation = rawA;
    }

    if(rawB){
      if(annotation) annotation += ' ' + rawB;
      else annotation = rawB;
    }

    annotation = annotation.trim();

    if(code || annotation){
      current.days[dc.day] = { code, annotation };
    }
  }
}

function mergeAnnotationRow(row, current, dayColumns){
  for(const dc of dayColumns){
    const rawA = String(row[dc.colA] || '').trim();
    const rawB = String(row[dc.colB] || '').trim();

    const parts = [];
    if(rawA) parts.push(rawA);
    if(rawB) parts.push(rawB);

    if(parts.length === 0) continue;

    const annotation = parts.join(' ').trim();

    if(!current.days[dc.day]){
      current.days[dc.day] = { code:'', annotation };
    } else {
      if(current.days[dc.day].annotation){
        current.days[dc.day].annotation += ' ' + annotation;
      } else {
        current.days[dc.day].annotation = annotation;
      }
    }
  }
}

function parseExcelPlanning(wb){
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header:1, defval:'' });

  let detected = null;

  for(let i=0; i<Math.min(20, rows.length); i++){
    for(const cell of rows[i]){
      const d = detectMonthFromHeader(cell);
      if(d){
        detected = d;
        break;
      }
    }
    if(detected) break;
  }

  let headerRowIdx = -1;
  let dayColumns = [];

  for(let i=0; i<rows.length; i++){
    const row = rows[i];
    const idx = row.findIndex(c => String(c).trim() === 'D.1');

    if(idx >= 0){
      headerRowIdx = i;

      for(let j=idx; j<row.length; j++){
        const m = String(row[j]).trim().match(/^([DLMJVSD])\.(\d{1,2})$/i);
        if(m){
          const day = parseInt(m[2], 10);
          if(day >= 1 && day <= 31){
            dayColumns.push({ day, colA:j, colB:j+1 });
          }
        }
      }

      break;
    }
  }

  if(headerRowIdx < 0 || dayColumns.length === 0){
    return { detected, employees: [] };
  }

  const employees = [];
  let current = null;
  const seenNames = new Set();

  for(let i=headerRowIdx+1; i<rows.length; i++){
    const row = rows[i] || [];

    if(row.some(c => String(c).trim() === 'D.1')) continue;

    let name = '';
    const searchLimit = Math.min(row.length, Math.max(3, dayColumns[0].colA));

    for(let j=0; j<searchLimit; j++){
      const s = String(row[j] || '').trim();
      if(looksLikeEmployeeName(s) && !seenNames.has(s)){
        name = s;
        break;
      }
    }

    if(name){
      seenNames.add(name);
      current = { name, days: {} };
      employees.push(current);
      readEmployeeRow(row, current, dayColumns);
    } else if(current){
      let hasDayValue = false;

      for(const dc of dayColumns){
        const a = String(row[dc.colA] || '').trim();
        const b = String(row[dc.colB] || '').trim();
        if(a || b){
          hasDayValue = true;
          break;
        }
      }

      if(hasDayValue){
        mergeAnnotationRow(row, current, dayColumns);
      }
    }
  }

  return { detected, employees };
}

function updateEmployeeHint(){
  const hint = $('#current-employee-hint');
  if(!hint) return;

  hint.textContent = preferredEmployee
    ? `Salarié actuel : ${preferredEmployee} — un autre pourra être choisi lors du prochain import.`
    : `Aucun salarié mémorisé. Il sera demandé lors du premier import.`;
}

listen('#import-excel-btn', 'click', () => {
  const input = $('#import-excel-file');
  if(input) input.click();
});

listen('#import-excel-file', 'change', async (e) => {
  const file = e.target.files[0];
  if(!file) return;

  if(!window.XLSX){
    showToast('Bibliothèque Excel non chargée.');
    return;
  }

  try{
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type:'array' });
    processExcelWorkbook(wb);
  }catch(err){
    console.error(err);
    showToast("Erreur lors de la lecture du fichier Excel.");
  }

  e.target.value = '';
});

function processExcelWorkbook(wb){
  const parsed = parseExcelPlanning(wb);

  if(parsed.employees.length === 0){
    showToast('Aucun salarié trouvé dans ce fichier.');
    return;
  }

  excelCandidate = parsed;

  const select = $('#employee-modal-select');
  if(!select) return;

  select.innerHTML = '';

  parsed.employees.forEach(emp => {
    const opt = document.createElement('option');
    opt.value = emp.name;
    opt.textContent = emp.name;
    select.appendChild(opt);
  });

  let selected = null;

  if(preferredEmployee){
    selected = parsed.employees.find(e => normalizePerson(e.name) === normalizePerson(preferredEmployee));
  }

  if(selected){
    select.value = selected.name;
  } else {
    select.selectedIndex = 0;
  }

  const hint = $('#employee-modal-hint');
  const monthSelect = $('#employee-modal-month');
  const yearInput = $('#employee-modal-year');

  if(monthSelect && monthSelect.options.length === 0){
    MOIS.forEach((m,i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = m;
      monthSelect.appendChild(opt);
    });
  }

  if(parsed.detected){
    if(hint) hint.textContent = `Mois détecté dans le fichier : ${MOIS[parsed.detected.month]} ${parsed.detected.year}.`;
    if(monthSelect) monthSelect.value = parsed.detected.month;
    if(yearInput) yearInput.value = parsed.detected.year;
  } else {
    if(hint) hint.textContent = `Mois non détecté automatiquement. Merci de choisir le mois d'import.`;
    if(monthSelect) monthSelect.value = state.month;
    if(yearInput) yearInput.value = state.year;
  }

  const remember = $('#employee-modal-remember');
  if(remember) remember.checked = !!preferredEmployee;

  const overlay = $('#employee-modal-overlay');
  if(overlay) overlay.classList.add('open');
}

listen('#employee-modal-confirm', 'click', () => {
  if(!excelCandidate) return;

  const select = $('#employee-modal-select');
  const monthSelect = $('#employee-modal-month');
  const yearInput = $('#employee-modal-year');
  const remember = $('#employee-modal-remember');

  if(!select || !monthSelect || !yearInput) return;

  const name = select.value;
  const emp = excelCandidate.employees.find(e => e.name === name);

  if(!emp){
    showToast('Salarié introuvable.');
    return;
  }

  const month = parseInt(monthSelect.value, 10);
  const year = parseInt(yearInput.value, 10);

  if(isNaN(month) || month < 0 || month > 11 || isNaN(year) || year < 1970 || year > 2200){
    showToast('Mois ou année invalide.');
    return;
  }

  if(remember && remember.checked){
    savePreferredEmployee(name);
    updateEmployeeHint();
  }

  const overlay = $('#employee-modal-overlay');
  if(overlay) overlay.classList.remove('open');

  continueExcelImport(emp, year, month);
});

listen('#employee-modal-cancel', 'click', () => {
  excelCandidate = null;
  const overlay = $('#employee-modal-overlay');
  if(overlay) overlay.classList.remove('open');
});

const employeeOverlay = $('#employee-modal-overlay');
if(employeeOverlay){
  employeeOverlay.addEventListener('click', (e) => {
    if(e.target === employeeOverlay){
      excelCandidate = null;
      employeeOverlay.classList.remove('open');
    }
  });
}

function continueExcelImport(emp, year, month){
  const nbDays = daysInMonth(year, month);
  const resolved = {};
  const unknownQueue = [];
  const seenUnknown = new Set();

  for(const day of Object.keys(emp.days).map(Number).sort((a,b)=>a-b)){
    if(day < 1 || day > nbDays) continue;

    const item = emp.days[day];
    const code = normalizeCode(item.code);
    const annotation = String(item.annotation || '').trim();

    if(!code && !annotation) continue;

    const dayResolved = {
      code,
      annotation,
      start:null,
      end:null,
      pause:0,
      comment:'',
      status:'clear'
    };

    if(code){
      if(shiftHasHours(code)){
        const s = shifts[code];
        dayResolved.start = s.start;
        dayResolved.end = s.end;
        dayResolved.pause = autoPauseMinutes(s.start, s.end);
        dayResolved.comment = annotation ? `${code} (${annotation})` : code;
        dayResolved.status = 'hours';
      } else if(isRestCode(code)){
        dayResolved.comment = annotation || '';
        dayResolved.status = annotation ? 'comment' : 'clear';
      } else if(ignoredCodes.has(code)){
        dayResolved.comment = annotation || '';
        dayResolved.status = annotation ? 'comment' : 'clear';
      } else {
        dayResolved.comment = annotation ? `${code} (${annotation})` : code;
        dayResolved.status = 'unknown';

        if(!seenUnknown.has(code)){
          seenUnknown.add(code);
          unknownQueue.push(code);
        }
      }
    } else {
      dayResolved.comment = annotation;
      dayResolved.status = annotation ? 'comment' : 'clear';
    }

    resolved[day] = dayResolved;
  }

  pendingImport = {
    employee: emp.name,
    year,
    month,
    resolved,
    unknownQueue,
    unknownIdx: 0
  };

  if(unknownQueue.length > 0){
    askNextUnknown();
  } else {
    showImportPreview();
  }
}

function askNextUnknown(){
  if(!pendingImport) return;

  if(pendingImport.unknownIdx >= pendingImport.unknownQueue.length){
    showImportPreview();
    return;
  }

  const code = pendingImport.unknownQueue[pendingImport.unknownIdx];

  const title = $('#shift-modal-title');
  const hint = $('#shift-modal-hint');
  const codeInput = $('#shift-modal-code');
  const startInput = $('#shift-modal-start');
  const endInput = $('#shift-modal-end');
  const overlay = $('#shift-modal-overlay');

  if(title) title.textContent = `Poste à définir : ${code}`;
  if(hint) hint.textContent = `Ce poste apparaît dans le planning mais n'a pas d'horaires enregistrées.`;
  if(codeInput) codeInput.value = code;
  if(startInput) startInput.value = '';
  if(endInput) endInput.value = '';
  if(overlay) overlay.classList.add('open');
}

function applyResolvedCode(code){
  if(!pendingImport) return;

  const s = shifts[code];
  if(!s || !s.start || !s.end) return;

  const pause = autoPauseMinutes(s.start, s.end);

  for(const day of Object.keys(pendingImport.resolved)){
    const r = pendingImport.resolved[day];

    if(r.status === 'unknown' && r.code === code){
      r.start = s.start;
      r.end = s.end;
      r.pause = pause;
      r.comment = r.annotation ? `${code} (${r.annotation})` : code;
      r.status = 'hours';
    }
  }
}

function markCodeIgnored(code){
  if(!pendingImport) return;

  for(const day of Object.keys(pendingImport.resolved)){
    const r = pendingImport.resolved[day];

    if(r.status === 'unknown' && r.code === code){
      r.start = null;
      r.end = null;
      r.pause = 0;
      r.comment = r.annotation || '';
      r.status = r.annotation ? 'comment' : 'clear';
    }
  }
}

listen('#shift-modal-save', 'click', () => {
  if(!pendingImport) return;

  const codeInput = $('#shift-modal-code');
  const startInput = $('#shift-modal-start');
  const endInput = $('#shift-modal-end');

  if(!codeInput || !startInput || !endInput) return;

  const code = codeInput.value;
  const start = startInput.value;
  const end = endInput.value;

  if(!start || !end){
    showToast('Merci de saisir les deux horaires.');
    return;
  }

  shifts[code] = { start, end };
  saveShifts();
  renderShiftsTable();

  applyResolvedCode(code);

  const overlay = $('#shift-modal-overlay');
  if(overlay) overlay.classList.remove('open');

  pendingImport.unknownIdx++;
  askNextUnknown();
});

listen('#shift-modal-ignore', 'click', () => {
  if(!pendingImport) return;

  const codeInput = $('#shift-modal-code');
  if(!codeInput) return;

  const code = codeInput.value;

  ignoredCodes.add(code);
  saveIgnoredCodes();
  renderShiftsTable();

  markCodeIgnored(code);

  const overlay = $('#shift-modal-overlay');
  if(overlay) overlay.classList.remove('open');

  pendingImport.unknownIdx++;
  askNextUnknown();
});

listen('#shift-modal-skip', 'click', () => {
  if(!pendingImport) return;

  const codeInput = $('#shift-modal-code');
  if(!codeInput) return;

  const code = codeInput.value;
  markCodeIgnored(code);

  const overlay = $('#shift-modal-overlay');
  if(overlay) overlay.classList.remove('open');

  pendingImport.unknownIdx++;
  askNextUnknown();
});

function showImportPreview(){
  if(!pendingImport) return;

  const { year, month, resolved, employee } = pendingImport;

  let html = `<p class="hint"><strong>${escapeHtml(employee)}</strong> — ${MOIS[month]} ${year}</p>`;

  const days = Object.keys(resolved).map(Number).sort((a,b)=>a-b);
  let total = 0;

  for(const day of days){
    const r = resolved[day];

    let hoursStr = '—';
    let info = '';
    let cls = '';

    if(r.status === 'hours' && r.start && r.end){
      const h = computeShiftHours(r.start, r.end, r.pause);
      if(h != null){
        total += h;
        hoursStr = formatHoursForInput(h);
      }

      info = `${r.start} → ${r.end}`;
      if(r.pause) info += ` (−${r.pause} min pause)`;
      if(r.comment) info += `<br>${escapeHtml(r.comment)}`;
    } else if(r.status === 'comment'){
      info = escapeHtml(r.comment || '');
      hoursStr = '(sans heures)';
      cls = 'pd-rest';
    } else {
      info = 'Jour effacé / repos';
      cls = 'pd-rest';
    }

    html += `
      <div class="preview-day ${cls}">
        <div class="pd-num">${day}</div>
        <div class="pd-info">${info}</div>
        <div class="pd-hours">${hoursStr}</div>
      </div>
    `;
  }

  html += `
    <p style="margin-top:12px; font-weight:700; font-size:15px;">
      Total importé :
      <span style="color:var(--accent-2); font-family:var(--font-mono);">${formatTotal(total)}</span>
    </p>
    <p class="hint" style="margin-top:8px; color:var(--sunday); font-weight:600;">
      Attention : l’import remplacera toutes les données du mois ${MOIS[month]} ${year}.
    </p>
  `;

  const title = $('#preview-modal-title');
  const content = $('#preview-modal-content');
  const overlay = $('#preview-modal-overlay');

  if(title) title.textContent = `Aperçu — ${MOIS[month]} ${year}`;
  if(content) content.innerHTML = html;
  if(overlay) overlay.classList.add('open');
}

listen('#preview-modal-confirm', 'click', () => {
  if(!pendingImport) return;

  const { year, month, resolved } = pendingImport;
  const key = monthKey(year, month);

  // Le mois importé est entièrement remplacé.
  data[key] = {};

  let count = 0;

  for(const day of Object.keys(resolved)){
    const r = resolved[day];

    if(r.status === 'hours'){
      const entry = {
        start: r.start,
        end: r.end
      };

      if(r.pause > 0) entry.pause = r.pause;

      entry.h = computeShiftHours(entry.start, entry.end, entryPause(entry));

      if(r.comment) entry.c = r.comment;

      if(entry.h != null || entry.c){
        data[key][day] = entry;
        count++;
      }
    } else if(r.status === 'comment' && r.comment){
      data[key][day] = { c: r.comment };
      count++;
    }
  }

  if(Object.keys(data[key]).length === 0){
    delete data[key];
  }

  saveData();

  settings.inputMode = 'shift';
  saveSettings();

  state.year = year;
  state.month = month;

  render();
  applyTheme();
  syncSettingsUI();

  const overlay = $('#preview-modal-overlay');
  if(overlay) overlay.classList.remove('open');

  pendingImport = null;

  showToast(`${count} jour(s) importé(s). Le mois a été remplacé.`);
  closeSheet();
});

listen('#preview-modal-cancel', 'click', () => {
  const overlay = $('#preview-modal-overlay');
  if(overlay) overlay.classList.remove('open');
  pendingImport = null;
});

const previewOverlay = $('#preview-modal-overlay');
if(previewOverlay){
  previewOverlay.addEventListener('click', (e) => {
    if(e.target === previewOverlay){
      previewOverlay.classList.remove('open');
      pendingImport = null;
    }
  });
}

function renderShiftsTable(){
  const container = $('#shifts-table');
  if(!container) return;

  const codes = Object.keys(shifts).sort();

  let html = '<div class="shifts-list">';

  if(codes.length === 0 && ignoredCodes.size === 0){
    html += '<p class="hint">Aucun poste.</p>';
  }

  for(const code of codes){
    const s = shifts[code] || {};
    const rest = isRestCode(code);

    html += `
      <div class="shift-row-edit ${rest ? 'is-rest' : ''}">
        <input type="text" data-shift-code="${escapeAttr(code)}" data-shift-field="code" value="${escapeAttr(code)}">
        <input type="time" data-shift-code="${escapeAttr(code)}" data-shift-field="start" value="${escapeAttr(s.start || '')}">
        <input type="time" data-shift-code="${escapeAttr(code)}" data-shift-field="end" value="${escapeAttr(s.end || '')}">
        <button type="button" class="shift-delete-btn" data-delete-shift="${escapeAttr(code)}" title="Supprimer">✕</button>
      </div>
    `;
  }

  for(const code of [...ignoredCodes].sort()){
    html += `
      <div class="shift-row-edit is-rest">
        <input type="text" value="${escapeAttr(code)}" readonly>
        <input type="text" value="ignoré définitivement" readonly class="ignored-label" style="grid-column: span 2;">
        <button type="button" class="shift-delete-btn" data-restore-shift="${escapeAttr(code)}" title="Réactiver">↺</button>
      </div>
    `;
  }

  html += '</div>';
  container.innerHTML = html;
}

document.addEventListener('change', (e) => {
  const t = e.target;

  if(t.matches('#shifts-table input[data-shift-field="code"]')){
    const oldCode = t.dataset.shiftCode;
    const newCode = normalizeCode(t.value);

    if(!newCode){
      t.value = oldCode;
      return;
    }

    if(newCode !== oldCode){
      if(shifts[newCode]){
        showToast('Ce code existe déjà.');
        t.value = oldCode;
        return;
      }

      shifts[newCode] = shifts[oldCode];
      delete shifts[oldCode];
      saveShifts();
      renderShiftsTable();
    } else {
      t.value = oldCode;
    }
  }
});

document.addEventListener('input', (e) => {
  const t = e.target;

  if(t.matches('#shifts-table input[data-shift-field="start"], #shifts-table input[data-shift-field="end"]')){
    const code = t.dataset.shiftCode;
    const field = t.dataset.shiftField;

    if(shifts[code]){
      shifts[code][field] = t.value;
      saveShifts();
    }
  }
});

document.addEventListener('click', (e) => {
  if(e.target.matches('.shift-delete-btn[data-delete-shift]')){
    const code = e.target.dataset.deleteShift;

    if(confirm(`Supprimer le poste "${code}" de la table ?`)){
      delete shifts[code];
      saveShifts();
      renderShiftsTable();
    }
  }

  if(e.target.matches('.shift-delete-btn[data-restore-shift]')){
    const code = e.target.dataset.restoreShift;
    ignoredCodes.delete(code);
    saveIgnoredCodes();
    renderShiftsTable();
  }
});

listen('#add-shift-btn', 'click', () => {
  const code = prompt('Code du nouveau poste :');
  if(!code) return;

  const c = normalizeCode(code);

  if(!c) return;

  if(shifts[c]){
    showToast('Ce code existe déjà.');
    return;
  }

  shifts[c] = { start:'', end:'' };
  saveShifts();
  renderShiftsTable();
});

listen('#export-shifts-btn', 'click', () => {
  const payload = {
    shifts,
    ignored: [...ignoredCodes]
  };

  const blob = new Blob([JSON.stringify(payload, null, 2)], { type:'application/json' });
  downloadBlob('table-correspondance.json', blob);
  showToast('Table exportée.');
});

listen('#import-shifts-btn', 'click', () => {
  const input = $('#import-shifts-file');
  if(input) input.click();
});

listen('#import-shifts-file', 'change', (e) => {
  const file = e.target.files[0];
  if(!file) return;

  const reader = new FileReader();

  reader.onload = () => {
    try{
      const payload = JSON.parse(reader.result);

      const incomingShifts = payload.shifts || payload;
      const incomingIgnored = payload.ignored || [];

      shifts = {};

      for(const [k,v] of Object.entries(incomingShifts)){
        const code = normalizeCode(k);
        shifts[code] = {
          start: v.start || '',
          end: v.end || ''
        };
      }

      ignoredCodes = new Set(incomingIgnored.map(normalizeCode));

      saveShifts();
      saveIgnoredCodes();
      renderShiftsTable();

      showToast('Table importée.');
    }catch(err){
      showToast('Fichier JSON invalide.');
    }
  };

  reader.readAsText(file);
  e.target.value = '';
});

let toastTimer;

function showToast(msg){
  const t = $('#toast');
  if(!t) return;

  t.textContent = msg;
  t.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

listen('#reset-data', 'click', () => {
  if(confirm('Supprimer définitivement toutes les données enregistrées sur cet appareil ?')){
    data = {};
    saveData();
    render();
    closeSheet();
    showToast('Toutes les données ont été supprimées.');
  }
});

function init(){
  const sel = $('#month-select');

  if(sel){
    MOIS.forEach((m,i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = m;
      sel.appendChild(opt);
    });
  }

  const empMonth = $('#employee-modal-month');
  if(empMonth && empMonth.options.length === 0){
    MOIS.forEach((m,i) => {
      const opt = document.createElement('option');
      opt.value = i;
      opt.textContent = m;
      empMonth.appendChild(opt);
    });
  }

  applyTheme();
  render();
  renderShiftsTable();
  updateEmployeeHint();

  if('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')){
    navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' }).then((reg) => {
      reg.update().catch(()=>{});
    }).catch(()=>{});
  }
}

init();