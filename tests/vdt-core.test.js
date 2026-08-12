const test = require('node:test');
const assert = require('node:assert/strict');
const {
    parseDateString,
    calculateSingleVDT,
    csvStringifyRow,
    parseCSV,
    escapeHtml,
    matchStoredPatientId,
    parseScanLabel,
    inferScanLabels,
    shouldShowTotalInReport,
    findFirstMeasuredIndex,
    isNewNoduleType,
    detectNewNodule,
    isResolvedAtLatest,
    getNewNoduleReportState,
    getCopyReportLayout
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

test('patient ID lookup accepts a unique stored prefix but never guesses among duplicates', () => {
    const patientIds = ['120046410-2 (CCN)', '120099999-1 (NSD)', '120046411-1 (CCN)'];
    assert.deepEqual(matchStoredPatientId('120046410', patientIds), {
        status: 'match', patientId: '120046410-2 (CCN)', matches: ['120046410-2 (CCN)']
    });
    assert.equal(matchStoredPatientId('120046410-2', patientIds).patientId, '120046410-2 (CCN)');
    assert.equal(matchStoredPatientId('120046410-2 (ccn)', patientIds).patientId, '120046410-2 (CCN)');
    assert.equal(matchStoredPatientId('12004641', patientIds).status, 'ambiguous');
    assert.equal(matchStoredPatientId('new-patient', patientIds).status, 'none');
});

test('standard scan labels are parsed and normalized', () => {
    assert.deepEqual(parseScanLabel('first annual + 6m'), {
        label: '1st Annual', stageIndex: 1, repeatIndex: 2, offsetMonths: 6, canonical: '1st Annual+6m'
    });
    assert.equal(parseScanLabel('biennial + 2nd 3m').canonical, 'Biennial+6m');
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

test('baseline repeat followed by a two-year gap becomes biennial with a first short-term repeat', () => {
    const labels = inferScanLabels([
        { id: 1, date: '2024-02-17', customLabel: 'Baseline+3m', isLabelAnchor: true },
        { id: 2, date: '2026-03-17' },
        { id: 3, date: '2026-08-04' }
    ]);
    assert.equal(labels[1], 'Baseline+3m');
    assert.equal(labels[2], 'Biennial');
    assert.equal(labels[3], 'Biennial+3m');
});

test('first annual repeat establishes second annual before its short-term repeat', () => {
    const labels = inferScanLabels([
        { id: 1, date: '2024-02-17', customLabel: '1st Annual+3m', isLabelAnchor: true },
        { id: 2, date: '2026-03-17' },
        { id: 3, date: '2026-08-04' }
    ]);
    assert.equal(labels[1], '1st Annual+3m');
    assert.equal(labels[2], '2nd Annual');
    assert.equal(labels[3], '2nd Annual+3m');
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
    assert.equal(shouldShowTotalInReport(2, true), false);
    assert.equal(shouldShowTotalInReport(3, true), true);
    assert.equal(shouldShowTotalInReport(4, true), true);
});

test('new nodule appearance follows the first measured scan rather than the first interval', () => {
    const oldestFirst = [
        { core: NaN },
        { core: NaN },
        { core: 10668.3 },
        { core: 5927.3 }
    ];
    assert.equal(findFirstMeasuredIndex(oldestFirst, 'core'), 2);

    const newestFirstAppearanceIndex = 1;
    assert.equal(getNewNoduleReportState(3, newestFirstAppearanceIndex, true), 'absent');
    assert.equal(getNewNoduleReportState(2, newestFirstAppearanceIndex, true), 'absent');
    assert.equal(getNewNoduleReportState(1, newestFirstAppearanceIndex, true), 'new');
    assert.equal(getNewNoduleReportState(0, newestFirstAppearanceIndex, true), 'measured');
    assert.equal(getNewNoduleReportState(1, newestFirstAppearanceIndex, false), 'measured');
});

test('new nodules are detected independently for each volume type', () => {
    const oldestFirst = [
        { solid: 40, core: NaN, nonsolid: NaN },
        { solid: 44, core: NaN, nonsolid: NaN },
        { solid: 48, core: 120, nonsolid: NaN }
    ];

    assert.equal(isNewNoduleType(oldestFirst, 'solid'), false);
    assert.equal(isNewNoduleType(oldestFirst, 'core'), true);
    assert.equal(isNewNoduleType(oldestFirst, 'nonsolid'), false);
    assert.equal(detectNewNodule(oldestFirst), true);
    assert.equal(detectNewNodule([{ core: 20 }, { core: 30 }], ['core']), false);
});

test('a blank latest volume is resolved only when that type was measured earlier', () => {
    const oldestFirst = [
        { solid: 40, core: NaN },
        { solid: 25, core: NaN },
        { solid: NaN, core: NaN }
    ];

    assert.equal(isResolvedAtLatest(oldestFirst, 'solid'), true);
    assert.equal(isResolvedAtLatest(oldestFirst, 'core'), false);
    assert.equal(isResolvedAtLatest([{ solid: 40 }, { solid: 25 }], 'solid'), false);
});

test('copy report width aligns scan and interval centres for two to four slide images', () => {
    assert.deepEqual(getCopyReportLayout(2), {
        scanCount: 2,
        columnCount: 5,
        comparisonWidthIn: 10.4,
        reportWidthIn: 10.4,
        columnWidthIn: 2.6,
        edgeColumnWidthIn: 1.3,
        rowHeightPt: 1,
        lineHeightPt: 11
    });
    assert.equal(getCopyReportLayout(3).reportWidthIn, 13.2);
    assert.equal(getCopyReportLayout(3).columnWidthIn, 2.2);
    assert.equal(getCopyReportLayout(3).edgeColumnWidthIn, 1.1);
    assert.equal(getCopyReportLayout(4).reportWidthIn, 13.2);
    assert.equal(getCopyReportLayout(4).columnWidthIn, 1.65);
    assert.equal(getCopyReportLayout(4).edgeColumnWidthIn, 0.825);
});
