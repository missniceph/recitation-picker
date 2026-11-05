/* Recitation Picker — all data stays in this browser (localStorage). No network calls. */
(function () {
  'use strict';

  const STORAGE_KEY = 'recitationPicker.v1';
  const OUTCOMES = {
    well: 'Answered well',
    answered: 'Answered',
    passed: 'Passed',
    absent: 'Absent',
  };
  const OUTCOME_KEYS = ['well', 'answered', 'passed', 'absent'];
  const BACKUP_NAG_DAYS = 14;

  // ---------- helpers ----------
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  const pad = (n) => String(n).padStart(2, '0');
  const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const today = () => localDate();
  const prettyDate = (iso) => {
    const [y, m, d] = iso.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  };
  const prettyTime = (ts) => new Date(ts).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const el = (tag, attrs = {}, ...children) => {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (v == null || v === false) continue;
      if (k === 'class') node.className = v;
      else if (k === 'text') node.textContent = v;
      else if (k.startsWith('on')) node.addEventListener(k.slice(2), v);
      else node.setAttribute(k, v === true ? '' : v);
    }
    for (const c of children) if (c != null) node.append(c);
    return node;
  };
  const cleanName = (s) => s.replace(/\s+/g, ' ').trim();
  const byName = (a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
  const randomItem = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
  const WELCOME = 'Welcome! Click “+ Class” to add your first class.';

  // ---------- state ----------
  function blankState() {
    return { version: 1, currentClassId: null, settings: { allowRepeats: false, theme: null }, lastBackup: null, classes: [] };
  }

  let storageOk = true;
  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return blankState();
      return normalize(JSON.parse(raw));
    } catch (e) {
      storageOk = false;
      return blankState();
    }
  }

  // Accepts loaded/imported data and fills in anything missing. Throws on garbage.
  function normalize(data) {
    if (!data || typeof data !== 'object' || !Array.isArray(data.classes)) throw new Error('Not a Recitation Picker backup');
    const s = blankState();
    s.settings = Object.assign(s.settings, data.settings || {});
    s.lastBackup = data.lastBackup || null;
    s.classes = data.classes.map((c) => {
      if (!c || typeof c.name !== 'string') throw new Error('Bad class entry');
      const students = (Array.isArray(c.students) ? c.students : [])
        .filter((st) => st && typeof st.name === 'string')
        .map((st) => ({ id: String(st.id || uid()), name: cleanName(st.name) }));
      const ids = new Set(students.map((st) => st.id));
      const records = (Array.isArray(c.records) ? c.records : [])
        .filter((r) => r && ids.has(String(r.studentId)) && OUTCOMES[r.outcome] && /^\d{4}-\d{2}-\d{2}$/.test(r.date))
        .map((r) => ({ id: String(r.id || uid()), studentId: String(r.studentId), date: r.date, ts: Number(r.ts) || Date.now(), outcome: r.outcome }));
      const round = (Array.isArray(c.round) ? c.round : []).map(String).filter((id) => ids.has(id));
      return { id: String(c.id || uid()), name: cleanName(c.name) || 'Untitled class', students, records, round };
    });
    s.currentClassId = s.classes.some((c) => c.id === data.currentClassId) ? data.currentClassId : (s.classes[0] || {}).id || null;
    return s;
  }

  let state = load();

  function save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      storageOk = true;
    } catch (e) {
      storageOk = false;
      toast('⚠️ Could not save — your browser is blocking storage. Download a backup now.');
    }
  }

  const cls = () => state.classes.find((c) => c.id === state.currentClassId) || null;
  const studentById = (c, id) => c.students.find((s) => s.id === id);

  function absentToday(c) {
    const t = today();
    // The latest record for each student today decides whether they're absent.
    const latest = new Map();
    for (const r of c.records) if (r.date === t) {
      const prev = latest.get(r.studentId);
      if (!prev || r.ts >= prev.ts) latest.set(r.studentId, r);
    }
    return new Set([...latest.values()].filter((r) => r.outcome === 'absent').map((r) => r.studentId));
  }

  // ---------- picking ----------
  let pending = null; // { classId, studentId }
  let rolling = false;

  function eligible(c) {
    const absent = absentToday(c);
    const present = c.students.filter((s) => !absent.has(s.id));
    if (!present.length) return { list: [], present, reset: false };
    if (state.settings.allowRepeats) {
      // Avoid picking the same person twice in a row when possible.
      const last = lastRecord(c);
      const list = present.length > 1 && last ? present.filter((s) => s.id !== last.studentId) : present;
      return { list, present, reset: false };
    }
    const called = new Set(c.round);
    const list = present.filter((s) => !called.has(s.id));
    if (list.length) return { list, present, reset: false };
    return { list: present, present, reset: true };
  }

  function lastRecord(c) {
    return c.records.reduce((a, r) => (!a || r.ts > a.ts ? r : a), null);
  }

  function pick() {
    if (rolling) return;
    const c = cls();
    if (!c) { showEmpty(WELCOME); return; }
    const { list, present, reset } = eligible(c);
    const display = $('#nameDisplay');
    if (!c.students.length) {
      showEmpty('No students yet — add them in the Roster tab.');
      return;
    }
    if (!present.length) {
      showEmpty('Everyone is marked absent today.');
      return;
    }
    if (reset) {
      c.round = [];
      save();
      toast('🎉 Everyone here has had a turn — starting a new round!');
    }
    const chosen = randomItem(list);
    pending = { classId: c.id, studentId: chosen.id };
    $('#outcomeBar').hidden = true;
    $('#skipBtn').hidden = true;
    $('#pickBtn').setAttribute('aria-disabled', 'true');
    rolling = true;

    const finish = () => {
      rolling = false;
      display.textContent = chosen.name;
      display.className = 'name-display revealed';
      $('#outcomeBar').hidden = false;
      $('#skipBtn').hidden = false;
      $('#pickBtn').removeAttribute('aria-disabled');
      $('#pickBtn').textContent = 'Pick again';
      $('#srLive').textContent = `Picked: ${chosen.name}. Press 1 for Answered well, 2 Answered, 3 Passed, 4 Absent.`;
      confetti();
      renderStatus();
    };

    if (reducedMotion() || present.length < 2) { finish(); return; }

    // Slot-machine style: flick through names, slowing down, then land.
    display.className = 'name-display rolling';
    const pool = present.map((s) => s.name);
    let delay = 45;
    let lastShown = '';
    const step = () => {
      let n;
      do { n = randomItem(pool); } while (pool.length > 1 && n === lastShown);
      lastShown = n;
      display.textContent = n;
      delay *= 1.13;
      if (delay < 320) setTimeout(step, delay);
      else setTimeout(finish, 180);
    };
    step();
  }

  function showEmpty(msg) {
    const d = $('#nameDisplay');
    d.textContent = msg;
    d.className = 'name-display empty';
    $('#srLive').textContent = msg;
    $('#outcomeBar').hidden = true;
    $('#skipBtn').hidden = true;
    pending = null;
  }

  function resetStage() {
    // If focus is on a button that's about to be hidden, move it to Pick so keyboard users don't get lost.
    const a = document.activeElement;
    const hadFocus = a && ($('#outcomeBar').contains(a) || a === $('#skipBtn'));
    pending = null;
    const d = $('#nameDisplay');
    d.textContent = state.classes.length ? 'Ready?' : WELCOME;
    d.className = state.classes.length ? 'name-display idle' : 'name-display empty';
    $('#outcomeBar').hidden = true;
    $('#skipBtn').hidden = true;
    $('#pickBtn').removeAttribute('aria-disabled');
    $('#pickBtn').textContent = 'Pick a student';
    if (hadFocus) $('#pickBtn').focus();
  }

  function logOutcome(outcome) {
    if (!pending || rolling) return;
    const c = state.classes.find((x) => x.id === pending.classId);
    if (!c) return;
    const st = studentById(c, pending.studentId);
    const rec = addRecord(c, pending.studentId, outcome);
    save();
    resetStage();
    renderStatus();
    toast(`Logged: ${st ? st.name : ''} — ${OUTCOMES[outcome]}`, 'Undo', () => {
      deleteRecord(c, rec.id);
      save();
      renderAll();
    });
  }

  function addRecord(c, studentId, outcome) {
    const rec = { id: uid(), studentId, date: today(), ts: Date.now(), outcome };
    c.records.push(rec);
    syncRound(c, studentId);
    return rec;
  }

  function deleteRecord(c, recId) {
    const r = c.records.find((x) => x.id === recId);
    c.records = c.records.filter((x) => x.id !== recId);
    if (r) syncRound(c, r.studentId);
  }

  // A student counts as "called this round" if they have a non-absent record today
  // or were already in the round. Being marked absent gives them their turn back.
  function syncRound(c, studentId) {
    const t = today();
    const todays = c.records.filter((r) => r.studentId === studentId && r.date === t).sort((a, b) => a.ts - b.ts);
    const latest = todays[todays.length - 1];
    const inRound = c.round.includes(studentId);
    if (latest && latest.outcome !== 'absent') {
      if (!inRound) c.round.push(studentId);
    } else if (inRound) {
      c.round = c.round.filter((id) => id !== studentId);
    }
  }

  function confetti() {
    if (reducedMotion()) return;
    const stage = $('#stage');
    const colors = ['#ffd84d', '#ff6b6b', '#4dd4ff', '#7dff8a', '#c38bff', '#ffffff'];
    for (let i = 0; i < 36; i++) {
      const p = el('span', { class: 'confetti' });
      const angle = Math.random() * Math.PI * 2;
      const dist = 140 + Math.random() * 260;
      p.style.background = randomItem(colors);
      p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
      p.style.setProperty('--dy', `${Math.sin(angle) * dist * 0.7}px`);
      p.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
      p.style.animationDelay = `${Math.random() * 80}ms`;
      stage.append(p);
      setTimeout(() => p.remove(), 1200);
    }
  }

  // ---------- rendering ----------
  function renderClassSelect() {
    const sel = $('#classSelect');
    sel.innerHTML = '';
    if (!state.classes.length) sel.append(el('option', { value: '', text: 'No classes yet' }));
    for (const c of state.classes) sel.append(el('option', { value: c.id, text: c.name }));
    sel.value = state.currentClassId || '';
    sel.disabled = !state.classes.length;
  }

  function renderStatus() {
    const c = cls();
    const s = $('#stageStatus');
    if (!c) { s.textContent = 'Add a class to get started.'; return; }
    const absent = absentToday(c);
    const present = c.students.filter((x) => !absent.has(x.id)).length;
    const called = c.round.filter((id) => !absent.has(id)).length;
    const parts = [c.name];
    if (!c.students.length) parts.push('no students yet');
    else if (state.settings.allowRepeats) parts.push(`${present} present · repeats allowed`);
    else parts.push(`${Math.min(called, present)} of ${present} called this round`);
    if (absent.size) parts.push(`${absent.size} absent today`);
    s.textContent = parts.join(' · ');
  }

  function renderToday() {
    const c = cls();
    const t = today();
    $('#todayDate').textContent = '· ' + prettyDate(t);
    const list = $('#todayList');
    const chips = $('#notCalledList');
    list.innerHTML = '';
    chips.innerHTML = '';
    if (!c) { list.append(el('div', { class: 'empty-note', text: 'No class selected.' })); $('#todayStats').textContent = ''; return; }

    const recs = c.records.filter((r) => r.date === t).sort((a, b) => b.ts - a.ts);
    const counts = Object.fromEntries(OUTCOME_KEYS.map((k) => [k, 0]));
    recs.forEach((r) => counts[r.outcome]++);
    $('#todayStats').textContent = recs.length
      ? `${recs.length} logged — ${OUTCOME_KEYS.map((k) => `${counts[k]} ${OUTCOMES[k].toLowerCase()}`).join(', ')}`
      : 'Nobody has been called yet today.';

    if (recs.length) {
      const ul = el('ul', { class: 'log' });
      for (const r of recs) {
        const st = studentById(c, r.studentId);
        const select = el('select', {
          onchange: (e) => { r.outcome = e.target.value; syncRound(c, r.studentId); save(); renderAll(); },
        }, ...OUTCOME_KEYS.map((k) => el('option', { value: k, text: OUTCOMES[k], selected: k === r.outcome })));
        const who = st ? st.name : '(removed)';
        select.setAttribute('aria-label', `Outcome for ${who} at ${prettyTime(r.ts)}`);
        ul.append(el('li', {},
          el('span', { class: 'time', text: prettyTime(r.ts) }),
          el('span', { class: 'who', text: who }),
          el('span', { class: 'log-actions' }, select,
            el('button', {
              class: 'icon-btn', type: 'button', title: 'Delete this entry', 'aria-label': `Delete entry for ${who} at ${prettyTime(r.ts)}`, text: '✕',
              onclick: () => { deleteRecord(c, r.id); save(); renderAll(); },
            }))));
      }
      list.append(ul);
    }

    const calledToday = new Set(recs.map((r) => r.studentId));
    const notCalled = c.students.filter((s) => !calledToday.has(s.id)).sort(byName);
    if (!notCalled.length) chips.append(el('span', { class: 'muted', text: c.students.length ? 'Everyone has been called or marked absent today.' : 'No students in this class yet.' }));
    for (const s of notCalled) {
      chips.append(el('span', { class: 'chip' }, s.name, el('button', {
        type: 'button', text: 'Absent', 'aria-label': `Mark ${s.name} absent for today`,
        onclick: () => { addRecord(c, s.id, 'absent'); save(); renderAll(); toast(`${s.name} marked absent for today.`); },
      })));
    }
  }

  let sortKey = 'name';
  let sortAsc = true;

  function summaryRows(c) {
    const rows = c.students.map((s) => ({ id: s.id, name: s.name, total: 0, well: 0, answered: 0, passed: 0, absent: 0, last: '' }));
    const map = new Map(rows.map((r) => [r.id, r]));
    for (const r of c.records) {
      const row = map.get(r.studentId);
      if (!row) continue;
      row[r.outcome]++;
      if (r.outcome !== 'absent') {
        row.total++;
        if (r.date > row.last) row.last = r.date;
      }
    }
    return rows;
  }

  function renderSummary() {
    const c = cls();
    const tbody = $('#summaryTable tbody');
    tbody.innerHTML = '';
    $$('#summaryTable thead th').forEach((th) => {
      const on = th.dataset.sort === sortKey;
      th.classList.toggle('sorted', on);
      th.classList.toggle('asc', on && sortAsc);
      if (on) th.setAttribute('aria-sort', sortAsc ? 'ascending' : 'descending');
      else th.removeAttribute('aria-sort');
    });
    if (!c) { $('#summaryMeta').textContent = ''; return; }
    const sessions = new Set(c.records.map((r) => r.date)).size;
    $('#summaryMeta').textContent = `${c.name} · ${plural(c.students.length, 'student')} · ${plural(sessions, 'day')} with records. “Called” counts every outcome except Absent.`;
    const rows = summaryRows(c).sort((a, b) => {
      let v;
      if (sortKey === 'name') v = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      else if (sortKey === 'last') v = (a.last || '').localeCompare(b.last || '');
      else v = a[sortKey] - b[sortKey];
      if (v === 0 && sortKey !== 'name') v = a.name.localeCompare(b.name);
      return sortAsc ? v : -v;
    });
    if (!rows.length) {
      tbody.append(el('tr', {}, el('td', { colspan: 7, class: 'empty-note', text: 'No students yet — add them in the Roster tab.' })));
      return;
    }
    for (const r of rows) {
      const num = (k) => el('td', { class: 'num' + (r[k] ? '' : ' zero'), text: String(r[k]) });
      tbody.append(el('tr', { onclick: (e) => { if (!e.target.closest('button')) openHistory(c, r.id); } },
        el('th', { scope: 'row', class: 'name-cell' }, el('button', {
          type: 'button', class: 'linkish', text: r.name, 'aria-haspopup': 'dialog',
          onclick: () => openHistory(c, r.id),
        })),
        el('td', { class: 'num' + (r.total ? '' : ' never'), text: String(r.total) }),
        num('well'), num('answered'), num('passed'), num('absent'),
        el('td', { class: r.last ? '' : 'muted', text: r.last ? prettyDate(r.last) : 'Not yet' })));
    }
  }

  function openHistory(c, studentId) {
    const st = studentById(c, studentId);
    if (!st) return;
    $('#historyTitle').textContent = st.name;
    const body = $('#historyBody');
    body.innerHTML = '';
    const recs = c.records.filter((r) => r.studentId === studentId).sort((a, b) => b.ts - a.ts);
    if (!recs.length) body.append(el('p', { class: 'muted', text: 'No records yet.' }));
    else {
      const ul = el('ul', { class: 'history' });
      for (const r of recs) {
        ul.append(el('li', {},
          el('span', { text: `${prettyDate(r.date)} · ${prettyTime(r.ts)}` }),
          el('span', { class: `badge ${r.outcome}`, text: OUTCOMES[r.outcome] })));
      }
      body.append(ul);
    }
    const dlg = $('#historyDialog');
    if (dlg.showModal) dlg.showModal(); else dlg.setAttribute('open', '');
  }

  function renderRoster() {
    const c = cls();
    const list = $('#rosterList');
    list.innerHTML = '';
    $('#rosterTitle').textContent = c ? `Roster — ${c.name}` : 'Roster';
    $('#rosterCount').textContent = plural(c ? c.students.length : 0, 'student');
    $('#renameClassBtn').disabled = !c;
    $('#deleteClassBtn').disabled = !c;
    $('#addNamesBtn').disabled = !c;
    if (!c) return;
    for (const s of [...c.students].sort(byName)) {
      const input = el('input', { type: 'text', value: s.name, 'aria-label': `Name of ${s.name}` });
      input.addEventListener('change', () => {
        const v = cleanName(input.value);
        if (!v) { input.value = s.name; return; }
        s.name = v;
        save();
        renderStatus();
        toast('Name updated.');
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); });
      const remove = el('button', {
        class: 'icon-btn', type: 'button', text: '✕', title: `Remove ${s.name}`, 'aria-label': `Remove ${s.name}`,
        onclick: () => {
          const n = c.records.filter((r) => r.studentId === s.id).length;
          const msg = n ? `Remove ${s.name}? This also deletes their ${n} participation record${n === 1 ? '' : 's'}.` : `Remove ${s.name}?`;
          if (!confirm(msg)) return;
          c.students = c.students.filter((x) => x.id !== s.id);
          c.records = c.records.filter((r) => r.studentId !== s.id);
          c.round = c.round.filter((id) => id !== s.id);
          if (pending && pending.studentId === s.id) resetStage();
          save();
          renderAll();
        },
      });
      list.append(el('li', {}, el('div', { class: 'row' }, input, remove)));
    }
  }

  function renderBackup() {
    $('#lastBackup').textContent = state.lastBackup
      ? `Last backup downloaded: ${new Date(state.lastBackup).toLocaleString()}`
      : 'You haven\'t downloaded a backup yet.';
    const hasRecords = state.classes.some((c) => c.records.length);
    const stale = !state.lastBackup || (Date.now() - state.lastBackup) > BACKUP_NAG_DAYS * 864e5;
    $('#backupNag').hidden = !(hasRecords && stale) && storageOk;
    $('#backupNagText').textContent = !storageOk
      ? '⚠️ This browser is not saving your data (private window or storage blocked). Download a backup before closing.'
      : state.lastBackup ? `It's been over ${BACKUP_NAG_DAYS} days since your last backup.` : 'You have records but no backup yet.';
  }

  function renderAll() {
    renderClassSelect();
    renderStatus();
    renderToday();
    renderSummary();
    renderRoster();
    renderBackup();
    $('#repeatsToggle').checked = !!state.settings.allowRepeats;
  }

  // ---------- classes & roster ----------
  function addClass() {
    const name = cleanName(prompt('Name of the new class (e.g., PA 106):') || '');
    if (!name) return;
    const c = { id: uid(), name, students: [], records: [], round: [] };
    state.classes.push(c);
    state.currentClassId = c.id;
    save();
    resetStage();
    renderAll();
    showView('roster');
    $('#pasteNames').focus();
  }

  function renameClass() {
    const c = cls();
    if (!c) return;
    const name = cleanName(prompt('Rename class:', c.name) || '');
    if (!name) return;
    c.name = name;
    save();
    renderAll();
  }

  function deleteClass() {
    const c = cls();
    if (!c) return;
    const typed = prompt(`This permanently deletes "${c.name}", its roster, and all its records.\nType the class name to confirm:`);
    if (typed == null) return;
    if (cleanName(typed).toLowerCase() !== c.name.toLowerCase()) { alert('Name did not match — nothing was deleted.'); return; }
    state.classes = state.classes.filter((x) => x.id !== c.id);
    state.currentClassId = (state.classes[0] || {}).id || null;
    save();
    resetStage();
    renderAll();
  }

  function addNames() {
    const c = cls();
    if (!c) return;
    const existing = new Set(c.students.map((s) => s.name.toLowerCase()));
    let added = 0, dupes = 0;
    for (const line of $('#pasteNames').value.split(/\r?\n/)) {
      // Strip leading list numbering like "1." or "12)" that comes from pasted lists.
      const name = cleanName(line.replace(/^\s*\d+[.)\]]\s+/, ''));
      if (!name) continue;
      if (existing.has(name.toLowerCase())) { dupes++; continue; }
      existing.add(name.toLowerCase());
      c.students.push({ id: uid(), name });
      added++;
    }
    save();
    $('#pasteNames').value = '';
    $('#addNamesMsg').textContent = `Added ${added} student${added === 1 ? '' : 's'}` + (dupes ? ` · skipped ${dupes} already on the roster` : '') + '.';
    renderAll();
  }

  // ---------- export / import ----------
  function download(filename, content, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = el('a', { href: url, download: filename });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const safeFile = (s) => s.replace(/[^\p{L}\p{N}_-]+/gu, '-').replace(/^-+|-+$/g, '') || 'class';

  function csvCell(v) {
    let s = String(v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // keep spreadsheets from treating it as a formula
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  }

  function exportCsv() {
    const c = cls();
    if (!c) { toast('Add a class first.'); return; }
    const rows = [['Name', 'Date', 'Outcome']];
    const recs = [...c.records].sort((a, b) => a.ts - b.ts);
    for (const r of recs) {
      const st = studentById(c, r.studentId);
      if (st) rows.push([st.name, r.date, OUTCOMES[r.outcome]]);
    }
    if (rows.length === 1) { toast('No records to export yet for this class.'); return; }
    const csv = '﻿' + rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
    download(`${safeFile(c.name)}_participation_${today()}.csv`, csv, 'text/csv;charset=utf-8');
  }

  function exportJson() {
    state.lastBackup = Date.now();
    save();
    const data = Object.assign({ app: 'Recitation Picker', exportedAt: new Date().toISOString() }, state);
    download(`recitation-picker-backup_${today()}.json`, JSON.stringify(data, null, 2), 'application/json');
    renderBackup();
    toast('Backup downloaded. Keep the file somewhere safe.');
  }

  function importJson(file) {
    const reader = new FileReader();
    reader.onload = () => {
      let next;
      try {
        next = normalize(JSON.parse(reader.result));
      } catch (e) {
        alert('That file doesn\'t look like a Recitation Picker backup. Nothing was changed.');
        return;
      }
      const nRecs = next.classes.reduce((n, c) => n + c.records.length, 0);
      const ok = confirm(`Restore this backup?\n\n${next.classes.length} class(es), ${nRecs} record(s).\n\nThis REPLACES everything currently in the app.`);
      if (!ok) return;
      next.settings.theme = state.settings.theme;
      state = next;
      save();
      resetStage();
      applyTheme();
      renderAll();
      toast('Backup restored.');
    };
    reader.readAsText(file);
  }

  // ---------- UI chrome ----------
  function showView(name) {
    $$('.view').forEach((v) => v.classList.toggle('active', v.id === `view-${name}`));
    $$('.tab').forEach((t) => {
      const on = t.dataset.view === name;
      t.classList.toggle('active', on);
      if (on) t.setAttribute('aria-current', 'page'); else t.removeAttribute('aria-current');
    });
    if (name !== 'pick' && document.fullscreenElement) document.exitFullscreen();
    renderAll();
  }
  const currentView = () => ($('.tab.active') || {}).dataset?.view;

  let toastTimer;
  function toast(msg, actionLabel, action) {
    const t = $('#toast');
    t.innerHTML = '';
    t.append(el('span', { text: msg }));
    if (actionLabel) {
      t.append(el('button', { type: 'button', text: actionLabel, onclick: () => { action(); t.hidden = true; } }));
    }
    t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, actionLabel ? 6000 : 3000);
  }

  function applyTheme() {
    let theme = state.settings.theme;
    if (!theme) theme = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    document.documentElement.dataset.theme = theme;
    $('#themeBtn').textContent = theme === 'dark' ? 'Light mode' : 'Dark mode';
  }

  function wire() {
    $$('.tab').forEach((t) => t.addEventListener('click', () => showView(t.dataset.view)));
    $$('[data-goto]').forEach((b) => b.addEventListener('click', () => showView(b.dataset.goto)));
    $('#classSelect').addEventListener('change', (e) => {
      state.currentClassId = e.target.value;
      save();
      resetStage();
      renderAll();
    });
    $('#addClassBtn').addEventListener('click', addClass);
    $('#renameClassBtn').addEventListener('click', renameClass);
    $('#deleteClassBtn').addEventListener('click', deleteClass);
    $('#addNamesBtn').addEventListener('click', addNames);
    $('#pickBtn').addEventListener('click', pick);
    $('#skipBtn').addEventListener('click', () => { resetStage(); renderStatus(); });
    $$('#outcomeBar .outcome').forEach((b) => b.addEventListener('click', () => logOutcome(b.dataset.outcome)));
    $('#repeatsToggle').addEventListener('change', (e) => {
      state.settings.allowRepeats = e.target.checked;
      save();
      renderStatus();
    });
    $('#newRoundBtn').addEventListener('click', () => {
      const c = cls();
      if (!c) return;
      c.round = [];
      save();
      renderAll();
      toast('New round started — everyone present can be picked again.');
    });
    $('#fullscreenBtn').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else if ($('#stage').requestFullscreen) $('#stage').requestFullscreen();
    });
    document.addEventListener('fullscreenchange', () => {
      $('#fullscreenBtn').textContent = document.fullscreenElement ? 'Exit full screen' : 'Full screen';
    });
    $('#csvBtn').addEventListener('click', exportCsv);
    $('#csvBtn2').addEventListener('click', exportCsv);
    $('#exportJsonBtn').addEventListener('click', exportJson);
    $('#importBtn').addEventListener('click', () => $('#importFile').click());
    $('#importFile').addEventListener('change', (e) => {
      const f = e.target.files[0];
      if (f) importJson(f);
      e.target.value = '';
    });
    $$('#summaryTable thead th').forEach((th) => $('button', th).addEventListener('click', () => {
      const k = th.dataset.sort;
      if (sortKey === k) sortAsc = !sortAsc;
      else { sortKey = k; sortAsc = k === 'name' || k === 'last'; }
      renderSummary();
    }));
    const darkQuery = window.matchMedia('(prefers-color-scheme: dark)');
    if (darkQuery.addEventListener) darkQuery.addEventListener('change', () => { if (!state.settings.theme) applyTheme(); });
    $('#themeBtn').addEventListener('click', () => {
      state.settings.theme = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      save();
      applyTheme();
    });

    // After a mouse/touch click (detail > 0) on these controls, drop focus so the Space bar
    // means "pick" again instead of re-pressing the control. Keyboard users keep their focus.
    document.addEventListener('click', (e) => {
      if (e.detail > 0 && e.target.closest('button, .toggle') && !e.target.closest('#outcomeBar, .stage-actions, dialog')) {
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
      }
    });

    // Keyboard shortcuts on the Pick screen.
    document.addEventListener('keydown', (e) => {
      if (currentView() !== 'pick' || e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (e.target.tagName || '').toLowerCase();
      if (['input', 'textarea', 'select'].includes(tag) || $('#historyDialog').open) return;
      // Let Space/Enter work normally on a focused button or link (e.g. an outcome button).
      const onControl = ['button', 'a', 'summary'].includes(tag);
      if ((e.key === ' ' || e.key === 'Enter') && !onControl) {
        e.preventDefault();
        pick();
      } else if (['1', '2', '3', '4'].includes(e.key) && pending && !rolling) {
        logOutcome(OUTCOME_KEYS[Number(e.key) - 1]);
      } else if (e.key === 'Escape' && pending && !rolling) {
        resetStage();
      }
    });

    // If the page is left open past midnight, refresh "today".
    let lastDay = today();
    setInterval(() => { if (today() !== lastDay) { lastDay = today(); renderAll(); } }, 60000);
    // Keep tabs in sync if the app is open in two windows.
    window.addEventListener('storage', (e) => { if (e.key === STORAGE_KEY) { state = load(); renderAll(); } });
  }

  applyTheme();
  wire();
  renderAll();
  resetStage();
})();
