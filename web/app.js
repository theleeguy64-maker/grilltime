'use strict';
/* GrillTime orchestration — DOM <-> engine <-> storage. Classic script. */
(function () {
  const T = window.GrillTiming;
  const Store = window.GrillStore;
  let state = Store.load();
  let editingId = null; // id of plan row being edited, or null for new

  const $ = (id) => document.getElementById(id);

  // --- serveTime "HH:MM" -> Date today ---
  function serveDate() {
    const [h, m] = (state.settings.serveTime || '18:00').split(':').map(Number);
    const d = new Date();
    d.setHours(h, m, 0, 0);
    return d;
  }

  function fmtTime(date) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }

  // --- Rendering ---
  function render() {
    const now = new Date();
    const res = T.computeSchedule({
      serveTime: serveDate(),
      bufferMin: state.settings.bufferMin,
      dishes: state.plan,
      now,
    });
    renderHeadline(res);
    renderSchedule(res);
    renderSaved();
  }

  function renderHeadline(res) {
    const el = $('headline');
    el.className = '';
    if (res.serveInPast) {
      el.classList.add('past');
      el.textContent = 'Serve time has already passed — pick a later time';
      return;
    }
    if (!res.rows.length) {
      el.textContent = 'Add a dish to build your schedule';
      return;
    }
    if (res.lateCount > 0) {
      el.classList.add('behind');
      el.textContent = '⚠ ' + res.lateCount + ' dish' + (res.lateCount > 1 ? 'es' : '') + ' behind';
      return;
    }
    el.textContent = 'Start cooking at ' + fmtTime(res.mealStart);
  }

  function renderSchedule(res) {
    const wrap = $('schedule');
    wrap.innerHTML = '';
    if (res.serveInPast) {
      const p = document.createElement('div');
      p.className = 'past-state';
      p.textContent = 'Once you pick a serve time later than now, your start-time schedule appears here.';
      wrap.appendChild(p);
      return;
    }
    if (!res.rows.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'No dishes yet — add one to build your schedule.';
      wrap.appendChild(e);
      return;
    }
    res.rows.forEach((row) => {
      const planItem = state.plan.find((d) => d.id === row.id) || {};
      const div = document.createElement('div');
      div.className = 'dish-row' + (row.late ? ' late' : '');

      const info = document.createElement('div');
      info.className = 'info';
      const name = document.createElement('div');
      name.className = 'name';
      name.textContent = planItem.name || '(unnamed)';
      info.appendChild(name);

      const stages = document.createElement('div');
      stages.className = 'stages';
      const parts = [];
      if (row.prepStart) parts.push('prep <span class="at">' + fmtTime(row.prepStart) + '</span>');
      parts.push('cook <span class="at">' + fmtTime(row.cookStart) + '</span>');
      parts.push('serve <span class="at">' + fmtTime(row.serveAt) + '</span>');
      stages.innerHTML = parts.join(' → ');
      info.appendChild(stages);

      if (row.late) {
        const lb = document.createElement('div');
        lb.className = 'late-badge';
        lb.textContent = 'Start now — running late by ' + T.formatDelta(row.lateByMin);
        info.appendChild(lb);
      }
      div.appendChild(info);

      const actions = document.createElement('div');
      actions.className = 'row-actions';
      const edit = document.createElement('button');
      edit.textContent = 'Edit';
      edit.setAttribute('aria-label', 'Edit ' + (planItem.name || 'dish'));
      edit.onclick = () => openForm(planItem);
      const del = document.createElement('button');
      del.className = 'danger';
      del.textContent = 'Remove';
      del.setAttribute('aria-label', 'Remove ' + (planItem.name || 'dish'));
      del.onclick = () => { state.plan = state.plan.filter((d) => d.id !== row.id); persist(); };
      actions.appendChild(edit);
      actions.appendChild(del);
      div.appendChild(actions);

      wrap.appendChild(div);
    });
  }

  function renderSaved() {
    const wrap = $('saved-list');
    wrap.innerHTML = '';
    if (!state.savedDishes.length) {
      const e = document.createElement('div');
      e.className = 'empty';
      e.textContent = 'Dishes you save show up here to reuse.';
      wrap.appendChild(e);
      return;
    }
    state.savedDishes.forEach((d) => {
      const chip = document.createElement('span');
      chip.className = 'saved-chip';
      const add = document.createElement('button');
      add.className = 'add-chip';
      add.textContent = d.name + ' +';
      add.setAttribute('aria-label', 'Add ' + d.name + ' to plan');
      add.onclick = () => {
        state.plan.push({ id: Store.newId(), name: d.name, prep: d.prep, cook: d.cook, rest: d.rest });
        persist();
      };
      const del = document.createElement('button');
      del.className = 'del-chip';
      del.innerHTML = '&times;';
      del.setAttribute('aria-label', 'Delete saved dish ' + d.name);
      del.onclick = () => { state.savedDishes = state.savedDishes.filter((x) => x.id !== d.id); persist(); };
      chip.appendChild(add);
      chip.appendChild(del);
      wrap.appendChild(chip);
    });
  }

  // --- Add/edit form ---
  function openForm(planItem) {
    editingId = planItem && planItem.id ? planItem.id : null;
    $('d-name').value = planItem ? planItem.name : '';
    $('d-prep').value = planItem && planItem.prep ? planItem.prep : '';
    $('d-cook').value = planItem ? planItem.cook : '';
    $('d-rest').value = planItem && planItem.rest ? planItem.rest : '';
    clearErrors();
    $('add-form').classList.remove('hidden');
    $('show-add').classList.add('hidden');
    $('d-name').focus();
  }
  function closeForm() {
    $('add-form').classList.add('hidden');
    $('show-add').classList.remove('hidden');
    editingId = null;
  }
  function clearErrors() {
    ['name', 'prep', 'cook', 'rest'].forEach((f) => {
      $('e-' + f).textContent = '';
      $('f-' + f).classList.remove('field-error');
    });
  }

  function saveDish() {
    clearErrors();
    const v = T.validateDish({
      name: $('d-name').value,
      prep: $('d-prep').value,
      cook: $('d-cook').value,
      rest: $('d-rest').value,
    });
    if (!v.ok) {
      Object.keys(v.errors).forEach((f) => {
        $('e-' + f).textContent = v.errors[f];
        $('f-' + f).classList.add('field-error');
      });
      return;
    }
    if (editingId) {
      const item = state.plan.find((d) => d.id === editingId);
      if (item) Object.assign(item, v.value);
    } else {
      state.plan.push({ id: Store.newId(), name: v.value.name, prep: v.value.prep, cook: v.value.cook, rest: v.value.rest });
    }
    // Save to reusable library (inline copy semantics — dedupe by name+times).
    const dupe = state.savedDishes.some((d) =>
      d.name === v.value.name && d.prep === v.value.prep && d.cook === v.value.cook && d.rest === v.value.rest);
    if (!dupe) state.savedDishes.push({ id: Store.newId(), name: v.value.name, prep: v.value.prep, cook: v.value.cook, rest: v.value.rest });
    closeForm();
    persist();
  }

  function persist() { Store.save(state); render(); }

  // --- Wire up ---
  function init() {
    $('serve-time').value = state.settings.serveTime;
    $('buffer').value = state.settings.bufferMin;

    $('serve-time').addEventListener('input', (e) => {
      if (e.target.value) {
        state.settings.serveTime = e.target.value;
        state.settings.serveDate = Store.todayStr();
        persist();
      }
    });
    $('buffer').addEventListener('input', (e) => {
      const n = parseInt(e.target.value, 10);
      state.settings.bufferMin = Number.isFinite(n) && n >= 0 ? n : 0;
      persist();
    });
    $('show-add').addEventListener('click', () => openForm(null));
    $('cancel-add').addEventListener('click', closeForm);
    $('save-dish').addEventListener('click', saveDish);

    // now re-tick (spec HZ#5): re-render on focus + every 30s so late detection stays fresh.
    document.addEventListener('visibilitychange', () => { if (!document.hidden) render(); });
    setInterval(render, 30000);

    render();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
