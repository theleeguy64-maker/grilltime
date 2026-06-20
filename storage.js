'use strict';
/* GrillTime persistence — localStorage. Classic script (window.GrillStore). */
(function (root) {
  const KEY = 'grilltime.v1';

  function todayStr(d) {
    d = d || new Date();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function defaultServeTime() {
    const t = new Date(Date.now() + 60 * 60 * 1000); // now + 1h
    return String(t.getHours()).padStart(2, '0') + ':' + String(t.getMinutes()).padStart(2, '0');
  }

  function emptyState() {
    return {
      savedDishes: [],
      plan: [],
      settings: { serveTime: defaultServeTime(), serveDate: todayStr(), bufferMin: 0 },
    };
  }

  function load() {
    let s;
    try {
      s = JSON.parse(root.localStorage.getItem(KEY)) || emptyState();
    } catch (e) {
      s = emptyState();
    }
    // Repair shape
    if (!Array.isArray(s.savedDishes)) s.savedDishes = [];
    if (!Array.isArray(s.plan)) s.plan = [];
    if (!s.settings) s.settings = emptyState().settings;
    // Stale serve-date reset (spec H1): if stored date isn't today, reset serve time.
    if (s.settings.serveDate !== todayStr()) {
      s.settings.serveTime = defaultServeTime();
      s.settings.serveDate = todayStr();
    }
    if (typeof s.settings.bufferMin !== 'number' || s.settings.bufferMin < 0) {
      s.settings.bufferMin = 0;
    }
    return s;
  }

  function save(state) {
    try {
      root.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (e) { /* storage full / private mode — non-fatal */ }
  }

  function newId() {
    newId._c = (newId._c || 0) + 1;
    return String(Date.now()) + '-' + newId._c;
  }

  root.GrillStore = { load, save, newId, todayStr, defaultServeTime, KEY };
})(window);
