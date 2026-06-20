'use strict';
// Engine unit tests — run with: node --test
// Covers the spec DoD list: deadline math, buffer, serveInPast, late detection,
// lateByMin formatting boundaries, multi-dish mealStart + chronological sort,
// empty-dishes, and validation helpers.

const { test } = require('node:test');
const assert = require('node:assert');
const T = require('../timing.js');

// Helper: build a Date at HH:MM on a fixed reference day (2026-06-20).
function at(h, m = 0) {
  return new Date(2026, 5, 20, h, m, 0, 0);
}

test('single dish: rest ends exactly at deadline (buffer 0 => at serve)', () => {
  const now = at(5, 0);
  const r = T.computeSchedule({
    serveTime: at(6, 0), bufferMin: 0, now,
    dishes: [{ id: 'a', name: 'Ribeye', prep: 5, cook: 12, rest: 8 }],
  });
  assert.strictEqual(r.deadline.getTime(), at(6, 0).getTime());
  const row = r.rows[0];
  // rest ends at deadline; restStart = D - 8 = 5:52; cookStart = 5:40; prepStart = 5:35
  assert.strictEqual(row.restStart.getTime(), at(5, 52).getTime());
  assert.strictEqual(row.cookStart.getTime(), at(5, 40).getTime());
  assert.strictEqual(row.prepStart.getTime(), at(5, 35).getTime());
  assert.strictEqual(row.firstAction.getTime(), at(5, 35).getTime());
  assert.strictEqual(row.serveAt.getTime(), at(6, 0).getTime());
  assert.strictEqual(row.late, false);
});

test('buffer shifts the deadline earlier (serveAt = D, not S)', () => {
  const now = at(5, 0);
  const r = T.computeSchedule({
    serveTime: at(6, 0), bufferMin: 10, now,
    dishes: [{ id: 'a', name: 'X', prep: 0, cook: 20, rest: 0 }],
  });
  assert.strictEqual(r.deadline.getTime(), at(5, 50).getTime());
  // serveAt reports the effective deadline D = 5:50
  assert.strictEqual(r.rows[0].serveAt.getTime(), at(5, 50).getTime());
  // cook 20 ends at 5:50 => cookStart 5:30
  assert.strictEqual(r.rows[0].cookStart.getTime(), at(5, 30).getTime());
});

test('prep and rest of 0 collapse stages correctly', () => {
  const now = at(5, 0);
  const r = T.computeSchedule({
    serveTime: at(6, 0), bufferMin: 0, now,
    dishes: [{ id: 'a', name: 'X', prep: 0, cook: 30, rest: 0 }],
  });
  const row = r.rows[0];
  assert.strictEqual(row.restStart.getTime(), at(6, 0).getTime()); // rest 0 => restStart = D
  assert.strictEqual(row.cookStart.getTime(), at(5, 30).getTime());
  assert.strictEqual(row.prepStart, null); // prep 0 => no prep stage
  assert.strictEqual(row.firstAction.getTime(), at(5, 30).getTime());
});

test('serveInPast flag set when serve <= now', () => {
  const now = at(14, 0);
  const r = T.computeSchedule({
    serveTime: at(13, 0), bufferMin: 0, now,
    dishes: [{ id: 'a', name: 'X', prep: 0, cook: 10, rest: 0 }],
  });
  assert.strictEqual(r.serveInPast, true);
});

test('serveInPast false when serve is in the future', () => {
  const now = at(14, 0);
  const r = T.computeSchedule({
    serveTime: at(18, 0), bufferMin: 0, now, dishes: [],
  });
  assert.strictEqual(r.serveInPast, false);
});

test('late detection: dish whose firstAction is before now', () => {
  const now = at(5, 30); // already 5:30
  const r = T.computeSchedule({
    serveTime: at(6, 0), bufferMin: 0, now,
    dishes: [{ id: 'a', name: 'Brisket', prep: 0, cook: 240, rest: 0 }], // needs to start 2:00
  });
  const row = r.rows[0];
  assert.strictEqual(row.late, true);
  assert.strictEqual(r.lateCount, 1);
  // cookStart = 6:00 - 240m = 2:00; now 5:30 => late by 210 min
  assert.strictEqual(row.lateByMin, 210);
});

test('boundary: firstAction == now is NOT late (strict <)', () => {
  const now = at(5, 40);
  const r = T.computeSchedule({
    serveTime: at(6, 0), bufferMin: 0, now,
    dishes: [{ id: 'a', name: 'X', prep: 0, cook: 20, rest: 0 }], // cookStart = 5:40 == now
  });
  assert.strictEqual(r.rows[0].late, false);
  assert.strictEqual(r.rows[0].lateByMin, 0);
});

test('multi-dish: mealStart = earliest firstAction, rows sorted chronologically', () => {
  const now = at(5, 0);
  const r = T.computeSchedule({
    serveTime: at(6, 0), bufferMin: 0, now,
    dishes: [
      { id: 'asp', name: 'Asparagus', prep: 0, cook: 6, rest: 0 },   // start 5:54
      { id: 'rib', name: 'Ribeye', prep: 5, cook: 12, rest: 8 },     // start 5:35
    ],
  });
  assert.strictEqual(r.mealStart.getTime(), at(5, 35).getTime());
  // sorted by firstAction asc => Ribeye (5:35) before Asparagus (5:54)
  assert.strictEqual(r.rows[0].id, 'rib');
  assert.strictEqual(r.rows[1].id, 'asp');
});

test('empty dishes => mealStart null, no rows, not late', () => {
  const now = at(5, 0);
  const r = T.computeSchedule({ serveTime: at(6, 0), bufferMin: 0, now, dishes: [] });
  assert.strictEqual(r.mealStart, null);
  assert.strictEqual(r.rows.length, 0);
  assert.strictEqual(r.lateCount, 0);
});

// ---- lateByMin formatting boundaries ----
test('formatDelta: < 60 => "Nm"', () => {
  assert.strictEqual(T.formatDelta(0), '0m');
  assert.strictEqual(T.formatDelta(45), '45m');
  assert.strictEqual(T.formatDelta(59), '59m');
});

test('formatDelta: 60..1439 => "Hh Mm"', () => {
  assert.strictEqual(T.formatDelta(60), '1h 0m');
  assert.strictEqual(T.formatDelta(235), '3h 55m');
  assert.strictEqual(T.formatDelta(1439), '23h 59m');
});

test('formatDelta: >= 1440 => "Dd Hh"', () => {
  assert.strictEqual(T.formatDelta(1440), '1d 0h');
  assert.strictEqual(T.formatDelta(1565), '1d 2h');
});

// ---- validation helpers ----
test('validateDish: accepts a clean dish', () => {
  const v = T.validateDish({ name: 'Ribeye', prep: 5, cook: 12, rest: 8 });
  assert.strictEqual(v.ok, true);
  assert.deepStrictEqual(v.value, { name: 'Ribeye', prep: 5, cook: 12, rest: 8 });
});

test('validateDish: name required and trimmed, max 40', () => {
  assert.strictEqual(T.validateDish({ name: '   ', cook: 5 }).ok, false);
  assert.strictEqual(T.validateDish({ name: 'x'.repeat(41), cook: 5 }).ok, false);
  assert.strictEqual(T.validateDish({ name: '  Ribeye  ', cook: 5 }).value.name, 'Ribeye');
});

test('validateDish: cook must be 1..1440 integer', () => {
  assert.strictEqual(T.validateDish({ name: 'a', cook: 0 }).ok, false);
  assert.strictEqual(T.validateDish({ name: 'a', cook: 1441 }).ok, false);
  assert.strictEqual(T.validateDish({ name: 'a', cook: -5 }).ok, false);
  assert.strictEqual(T.validateDish({ name: 'a', cook: NaN }).ok, false);
  assert.strictEqual(T.validateDish({ name: 'a', cook: 'abc' }).ok, false);
  assert.strictEqual(T.validateDish({ name: 'a', cook: 1 }).ok, true);
  assert.strictEqual(T.validateDish({ name: 'a', cook: 1440 }).ok, true);
});

test('validateDish: prep/rest 0..1440, empty coerces to 0, decimals round', () => {
  assert.strictEqual(T.validateDish({ name: 'a', cook: 10, prep: '', rest: '' }).value.prep, 0);
  assert.strictEqual(T.validateDish({ name: 'a', cook: 10, prep: 5.6 }).value.prep, 6);
  assert.strictEqual(T.validateDish({ name: 'a', cook: 10, prep: -1 }).ok, false);
  assert.strictEqual(T.validateDish({ name: 'a', cook: 10, rest: 1441 }).ok, false);
});
