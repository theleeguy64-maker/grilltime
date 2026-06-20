'use strict';
/*
 * GrillTime timing engine — PURE functions, zero DOM.
 *
 * Dual-consumer (spec Architecture note): loaded in the browser as a CLASSIC <script>
 * (attaches window.GrillTiming) and required by Node tests via module.exports.
 * NO browser import/export — those break over file://.
 */
(function (root) {
  const MIN = 60 * 1000;

  function minutesBefore(date, mins) {
    return new Date(date.getTime() - mins * MIN);
  }

  /**
   * computeSchedule — back-time every dish so its rest ends at the effective deadline.
   * @param serveTime Date  target serve moment S
   * @param bufferMin int   finish everything bufferMin minutes early (D = S - buffer)
   * @param dishes [{id,name,prep,cook,rest}]  prep/rest may be 0
   * @param now Date        injected for determinism
   */
  function computeSchedule({ serveTime, bufferMin = 0, dishes = [], now }) {
    const deadline = minutesBefore(serveTime, bufferMin);
    const serveInPast = serveTime.getTime() <= now.getTime();

    const rows = dishes.map(function (d) {
      const prep = d.prep || 0;
      const cook = d.cook || 0;
      const rest = d.rest || 0;
      const restStart = minutesBefore(deadline, rest);
      const cookStart = minutesBefore(restStart, cook);
      const prepStart = prep > 0 ? minutesBefore(cookStart, prep) : null;
      const firstAction = prepStart || cookStart;
      const late = firstAction.getTime() < now.getTime();
      const lateByMin = late
        ? Math.round((now.getTime() - firstAction.getTime()) / MIN)
        : 0;
      return {
        id: d.id,
        name: d.name,
        prepStart: prepStart,
        cookStart: cookStart,
        restStart: restStart,
        firstAction: firstAction,
        serveAt: deadline,
        late: late,
        lateByMin: lateByMin,
      };
    });

    rows.sort(function (a, b) {
      return a.firstAction.getTime() - b.firstAction.getTime();
    });

    const mealStart = rows.length ? rows[0].firstAction : null;
    const lateCount = rows.filter(function (r) { return r.late; }).length;

    return { deadline, mealStart, serveInPast, lateCount, rows };
  }

  /** Format a positive minute delta for the late-by reason (spec M1). */
  function formatDelta(mins) {
    mins = Math.max(0, Math.round(mins));
    if (mins < 60) return mins + 'm';
    if (mins < 1440) return Math.floor(mins / 60) + 'h ' + (mins % 60) + 'm';
    const days = Math.floor(mins / 1440);
    const hours = Math.floor((mins % 1440) / 60);
    return days + 'd ' + hours + 'h';
  }

  /** Coerce + validate one numeric field. Returns {ok, value} or {ok:false, error}. */
  function validateNum(raw, { min, max, name, allowEmpty }) {
    if (raw === '' || raw === null || raw === undefined) {
      if (allowEmpty) return { ok: true, value: 0 };
      return { ok: false, error: name + ' is required' };
    }
    const n = Number(raw);
    if (!Number.isFinite(n)) return { ok: false, error: name + ' must be a number' };
    const v = Math.round(n);
    if (v < min || v > max) return { ok: false, error: name + ' must be ' + min + '–' + max };
    return { ok: true, value: v };
  }

  /**
   * validateDish — spec validation: name 1–40 trimmed; cook 1–1440; prep/rest 0–1440
   * (empty → 0); decimals round; NaN/negative/out-of-range rejected.
   * Returns {ok:true, value:{name,prep,cook,rest}} or {ok:false, errors:{field:msg}}.
   */
  function validateDish(d) {
    const errors = {};
    const name = (d.name == null ? '' : String(d.name)).trim();
    if (name.length < 1) errors.name = 'Name is required';
    else if (name.length > 40) errors.name = 'Name must be 1–40 characters';

    const cook = validateNum(d.cook, { min: 1, max: 1440, name: 'Cook', allowEmpty: false });
    if (!cook.ok) errors.cook = cook.error;
    const prep = validateNum(d.prep, { min: 0, max: 1440, name: 'Prep', allowEmpty: true });
    if (!prep.ok) errors.prep = prep.error;
    const rest = validateNum(d.rest, { min: 0, max: 1440, name: 'Rest', allowEmpty: true });
    if (!rest.ok) errors.rest = rest.error;

    if (Object.keys(errors).length) return { ok: false, errors };
    return { ok: true, value: { name, prep: prep.value, cook: cook.value, rest: rest.value } };
  }

  const api = { computeSchedule, formatDelta, validateDish };

  // Dual export — Node test (CommonJS) + browser global. No ES module syntax.
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.GrillTiming = api;
})(typeof window !== 'undefined' ? window : this);
