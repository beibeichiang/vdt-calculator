const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseDateString,
    calculateSingleVDT,
    csvStringifyRow,
    parseCSV,
    escapeHtml,
    parseScanLabel,
    inferScanLabels,
    shouldShowTotalInReport,
    getNewNoduleReportState
} = require('../vdt-core.js');

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

test('560-day VDT remains in the established indeterminate category', () => {
    const result = calculateSingleVDT(200, 100, 560);
    assert.equal(result.value, '560');
    assert.match(result.html, /class="vdt-indeterminate"/);
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

test('standard scan labels are parsed and normalized', () => {
    assert.deepEqual(parseScanLabel('first annual + 6m'), {
        label: '1st Annual', stageIndex: 1, offsetMonths: 6, canonical: '1st Annual+6m'
    });
    assert.equal(parseScanLabel('special review'), null);
});

test('one annual anchor infers the expert-read slide labels despite annual drift', () => {
    const rows = [
        { id: 1, date: '2024-04-26' },
        { id: 2, date: '2025-01-31', customLabel: '1st Annual', isLabelAnchor: true },
        { id: 3, date: '2026-04-10' },
        { id: 4, date: '2026-07-10' }
    ];
    assert.deepEqual({ ...inferScanLabels(rows) }, {
        1: 'Baseline+3m',
        2: '1st Annual',
        3: '2nd Annual',
        4: '2nd Annual+3m'
    });
});

test('baseline anchor assigns repeat 3m labels and annual screening', () => {
    const rows = [
        { id: 1, date: '2024-01-10', isBaseline: true },
        { id: 2, date: '2024-04-10' },
        { id: 3, date: '2024-07-10' },
        { id: 4, date: '2024-10-10' },
        { id: 5, date: '2025-01-10' }
    ];
    const labels = inferScanLabels(rows);
    assert.equal(labels[1], 'Baseline');
    assert.equal(labels[2], 'Baseline+3m');
    assert.equal(labels[3], 'Baseline+6m');
    assert.equal(labels[4], 'Baseline+9m');
    assert.equal(labels[5], '1st Annual');
});

test('baseline radio overrides a previously generated repeat label', () => {
    const labels = inferScanLabels([
        { id: 1, date: '2024-04-26', isBaseline: true, customLabel: 'Baseline+3m' },
        { id: 2, date: '2025-04-26', customLabel: '1st Annual' }
    ]);
    assert.equal(labels[1], 'Baseline');
    assert.equal(labels[2], '1st Annual');
});

test('baseline without annual screening can progress directly to biennial', () => {
    const labels = inferScanLabels([
        { id: 1, date: '2024-01-10', isBaseline: true },
        { id: 2, date: '2024-04-10' },
        { id: 3, date: '2026-01-12' }
    ]);
    assert.equal(labels[2], 'Baseline+3m');
    assert.equal(labels[3], 'Biennial');
});

test('partial scan series can be inferred from a second annual anchor', () => {
    const labels = inferScanLabels([
        { id: 1, date: '2025-02-01' },
        { id: 2, date: '2026-03-15', customLabel: '2nd Annual', isLabelAnchor: true },
        { id: 3, date: '2026-06-14' }
    ]);
    assert.equal(labels[1], '1st Annual');
    assert.equal(labels[2], '2nd Annual');
    assert.equal(labels[3], '2nd Annual+3m');
});

test('scan labels fall back to relative scan numbers without an anchor', () => {
    assert.deepEqual({ ...inferScanLabels([
        { id: 1, date: '2024-01-01' },
        { id: 2, date: '2024-04-01' }
    ]) }, { 1: 'Scan -1', 2: 'Scan 0' });
});

test('report total requires at least two regular VDT intervals', () => {
    assert.equal(shouldShowTotalInReport(2, false), false);
    assert.equal(shouldShowTotalInReport(3, false), true);
    assert.equal(shouldShowTotalInReport(3, true), false);
    assert.equal(shouldShowTotalInReport(4, true), true);
});

test('new nodule report state hides the absent volume and marks first appearance', () => {
    assert.equal(getNewNoduleReportState(3, 4, true), 'absent');
    assert.equal(getNewNoduleReportState(2, 4, true), 'new');
    assert.equal(getNewNoduleReportState(1, 4, true), 'measured');
    assert.equal(getNewNoduleReportState(1, 2, false), 'measured');
});
