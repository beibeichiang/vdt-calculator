const test = require('node:test');
const assert = require('node:assert/strict');
const { parseDateString, calculateSingleVDT, csvStringifyRow, parseCSV, escapeHtml } = require('../vdt-core.js');

test('parseDateString accepts compact and ISO dates', () => {
    assert.equal(parseDateString('2024-02-29').toISOString().slice(0, 10), '2024-02-29');
    assert.equal(parseDateString('20240229').toISOString().slice(0, 10), '2024-02-29');
});

test('parseDateString rejects impossible dates', () => {
    assert.equal(parseDateString('2023-02-29'), null);
    assert.equal(parseDateString('2024-02-31'), null);
    assert.equal(parseDateString('2024-13-01'), null);
});

test('parsed dates preserve whole-day intervals across daylight saving changes', () => {
    const before = parseDateString('2024-03-30');
    const after = parseDateString('2024-04-01');
    assert.equal((after - before) / 86_400_000, 2);
});

test('VDT calculation follows exponential volume growth', () => {
    const result = calculateSingleVDT(200, 100, 100);
    assert.equal(result.value, '100');
    assert.equal(result.volumeChange, '100.0');
});

test('VDT calculation reports stable and shrinking nodules', () => {
    assert.equal(calculateSingleVDT(100, 100, 90).value, 'Stable');
    assert.equal(calculateSingleVDT(50, 100, 100).value, '-100');
});

test('VDT calculation rejects invalid measurements and intervals', () => {
    assert.equal(calculateSingleVDT(0, 100, 30).value, null);
    assert.equal(calculateSingleVDT(100, 50, 0).value, null);
    assert.equal(calculateSingleVDT('not-a-number', 50, 30).value, null);
});

test('CSV round-trips commas, quotes and multiline notes', () => {
    const original = ['P-001', '2024-01-01', 'note, with "quotes"\nand a new line'];
    const csv = csvStringifyRow(original);
    assert.deepEqual(parseCSV(csv), [original]);
});

test('escapeHtml neutralizes user-controlled markup', () => {
    assert.equal(escapeHtml('<img src=x onerror="alert(1)">'), '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;');
});
