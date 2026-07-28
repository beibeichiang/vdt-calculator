(function (root, factory) {
    const api = factory();
    if (typeof module === 'object' && module.exports) module.exports = api;
    root.VDTCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
    'use strict';

    function parseDateString(dateStr) {
        if (typeof dateStr !== 'string') return null;
        const match = dateStr.trim().match(/^(\d{4})-?(\d{2})-?(\d{2})$/);
        if (!match) return null;

        const year = Number(match[1]);
        const month = Number(match[2]);
        const day = Number(match[3]);
        const date = new Date(Date.UTC(year, month - 1, day));

        if (
            date.getUTCFullYear() !== year ||
            date.getUTCMonth() !== month - 1 ||
            date.getUTCDate() !== day
        ) return null;

        return date;
    }

    function calculateSingleVDT(vol1, vol2, timeDiff, isNewNoduleCalc = false) {
        const base = { html: '-', value: null, timeDiff: null, volumeChange: null };
        const current = Number(vol1);
        const previous = Number(vol2);
        const days = Number(timeDiff);

        if (!Number.isFinite(days) || days <= 0 || !Number.isFinite(current) || !Number.isFinite(previous) || current <= 0 || previous <= 0) {
            return base;
        }

        if (isNewNoduleCalc && current < previous) {
            return { html: 'N/A (&lt;15mm³)', value: null, timeDiff: null, volumeChange: null };
        }

        const volumeChange = ((current - previous) / previous) * 100;
        if (current === previous) {
            return {
                html: '<span class="vdt-stable-or-slow">Stable</span>',
                value: 'Stable',
                timeDiff: days.toFixed(0),
                volumeChange: '0.0'
            };
        }

        const vdt = (Math.log(2) * days) / (Math.log(current) - Math.log(previous));
        if (!Number.isFinite(vdt)) return base;

        const display = vdt.toFixed(0);
        let className = 'vdt-stable-or-slow';
        if (vdt > 0 && vdt <= 400) className = 'vdt-positive';
        else if (vdt > 400 && vdt <= 600) className = 'vdt-indeterminate';
        else if (vdt < 0 && vdt >= -400) className = 'vdt-shrinking';

        return {
            html: `<strong><span class="${className}">${display}d</span></strong>`,
            value: display,
            timeDiff: days.toFixed(0),
            volumeChange: volumeChange.toFixed(1)
        };
    }

    function csvStringifyRow(values) {
        return values.map(value => {
            const text = value === undefined || value === null ? '' : String(value);
            return `"${text.replace(/"/g, '""')}"`;
        }).join(',');
    }

    function parseCSV(text) {
        if (typeof text !== 'string') return [];
        const rows = [];
        let row = [];
        let value = '';
        let inQuotes = false;

        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            const next = text[i + 1];

            if (char === '"' && inQuotes && next === '"') {
                value += '"';
                i++;
            } else if (char === '"') {
                inQuotes = !inQuotes;
            } else if (char === ',' && !inQuotes) {
                row.push(value);
                value = '';
            } else if ((char === '\n' || char === '\r') && !inQuotes) {
                if (char === '\r' && next === '\n') i++;
                row.push(value);
                if (row.some(cell => cell !== '')) rows.push(row);
                row = [];
                value = '';
            } else {
                value += char;
            }
        }

        if (inQuotes) throw new Error('CSV contains an unterminated quoted field.');
        if (value !== '' || row.length > 0) {
            row.push(value);
            if (row.some(cell => cell !== '')) rows.push(row);
        }
        return rows;
    }

    function escapeHtml(value) {
        return String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    const ROUTINE_STAGES = [
        { label: 'Baseline', months: 0 },
        { label: '1st Annual', months: 12 },
        { label: '2nd Annual', months: 24 },
        { label: 'Biennial', months: 48 }
    ];

    function parseScanLabel(value) {
        if (typeof value !== 'string') return null;
        const normalized = value.trim().replace(/\s+/g, ' ');
        const match = normalized.match(/^(baseline|1st annual|first annual|2nd annual|second annual|biennial)(?:\s*\+\s*(3|6|9)m)?$/i);
        if (!match) return null;

        const name = match[1].toLowerCase();
        const label = name === 'baseline' ? 'Baseline'
            : (name === '1st annual' || name === 'first annual') ? '1st Annual'
                : (name === '2nd annual' || name === 'second annual') ? '2nd Annual'
                    : 'Biennial';
        return {
            label,
            stageIndex: ROUTINE_STAGES.findIndex(stage => stage.label === label),
            offsetMonths: Number(match[2] || 0),
            canonical: label + (match[2] ? `+${match[2]}m` : '')
        };
    }

    function addMonths(date, months) {
        const copy = new Date(date.getTime());
        copy.setUTCMonth(copy.getUTCMonth() + months);
        return copy;
    }

    function monthsBetween(later, earlier) {
        return (later - earlier) / (86_400_000 * 30.44);
    }

    function inferScanLabels(rows) {
        const scans = rows
            .map(row => ({ ...row, dateObj: row.dateObj instanceof Date ? row.dateObj : parseDateString(row.date) }))
            .filter(row => row.dateObj)
            .sort((a, b) => a.dateObj - b.dateObj);
        const labels = Object.create(null);
        if (!scans.length) return labels;

        let anchor = scans.find(scan => scan.isLabelAnchor && parseScanLabel(scan.customLabel));
        if (!anchor) anchor = scans.find(scan => scan.isBaseline);

        if (!anchor) {
            [...scans].reverse().forEach((scan, index) => {
                labels[scan.id] = index === 0 ? 'Scan 0' : `Scan -${index}`;
            });
            return labels;
        }

        const parsedAnchor = anchor.isBaseline
            ? parseScanLabel('Baseline')
            : parseScanLabel(anchor.customLabel) || parseScanLabel('Baseline');
        const routineDates = ROUTINE_STAGES.map(stage => addMonths(anchor.dateObj, stage.months - ROUTINE_STAGES[parsedAnchor.stageIndex].months - parsedAnchor.offsetMonths));
        const routineIds = Array(ROUTINE_STAGES.length).fill(null);
        if (parsedAnchor.offsetMonths === 0) {
            routineDates[parsedAnchor.stageIndex] = anchor.dateObj;
            routineIds[parsedAnchor.stageIndex] = anchor.id;
        }

        const usedIds = new Set([anchor.id]);
        function findRoutineCandidate(referenceDate, gapMonths, direction) {
            const minGap = gapMonths === 24 ? 21.5 : 9.5;
            const maxGap = gapMonths === 24 ? 32 : 21.5;
            return scans
                .filter(scan => !usedIds.has(scan.id))
                .map(scan => ({ scan, gap: direction > 0 ? monthsBetween(scan.dateObj, referenceDate) : monthsBetween(referenceDate, scan.dateObj) }))
                .filter(item => item.gap >= minGap && item.gap < maxGap)
                .sort((a, b) => Math.abs(a.gap - gapMonths) - Math.abs(b.gap - gapMonths))[0]?.scan || null;
        }

        let directBiennial = null;
        if (parsedAnchor.stageIndex === 0 && parsedAnchor.offsetMonths === 0) {
            const annualCandidate = findRoutineCandidate(routineDates[0], 12, 1);
            if (!annualCandidate) {
                directBiennial = findRoutineCandidate(routineDates[0], 24, 1);
                if (directBiennial) {
                    routineDates[3] = directBiennial.dateObj;
                    routineIds[3] = directBiennial.id;
                    usedIds.add(directBiennial.id);
                }
            }
        }

        for (let stage = parsedAnchor.stageIndex + 1; stage < ROUTINE_STAGES.length; stage++) {
            const gap = ROUTINE_STAGES[stage].months - ROUTINE_STAGES[stage - 1].months;
            if (directBiennial) {
                if (stage < 3) routineDates[stage] = addMonths(routineDates[stage - 1], gap);
                continue;
            }
            const candidate = findRoutineCandidate(routineDates[stage - 1], gap, 1);
            if (candidate) {
                routineDates[stage] = candidate.dateObj;
                routineIds[stage] = candidate.id;
                usedIds.add(candidate.id);
            } else {
                routineDates[stage] = addMonths(routineDates[stage - 1], gap);
            }
        }
        for (let stage = parsedAnchor.stageIndex - 1; stage >= 0; stage--) {
            const gap = ROUTINE_STAGES[stage + 1].months - ROUTINE_STAGES[stage].months;
            const candidate = findRoutineCandidate(routineDates[stage + 1], gap, -1);
            if (candidate) {
                routineDates[stage] = candidate.dateObj;
                routineIds[stage] = candidate.id;
                usedIds.add(candidate.id);
            } else {
                routineDates[stage] = addMonths(routineDates[stage + 1], -gap);
            }
        }

        scans.forEach(scan => {
            if (scan.id === anchor.id && parseScanLabel(anchor.customLabel)) {
                labels[scan.id] = parsedAnchor.canonical;
                return;
            }
            const routineIndex = routineIds.findIndex(id => id === scan.id);
            if (routineIndex !== -1) {
                labels[scan.id] = ROUTINE_STAGES[routineIndex].label;
                return;
            }

            let stage = -1;
            for (let i = 0; i < routineDates.length; i++) {
                if (scan.dateObj >= routineDates[i]) stage = i;
            }
            if (stage < 0) {
                labels[scan.id] = 'Pre-Baseline';
                return;
            }
            const offset = monthsBetween(scan.dateObj, routineDates[stage]);
            if (offset < 1.5) labels[scan.id] = ROUTINE_STAGES[stage].label;
            else if (offset < 4.5) labels[scan.id] = `${ROUTINE_STAGES[stage].label}+3m`;
            else if (offset < 7.5) labels[scan.id] = `${ROUTINE_STAGES[stage].label}+6m`;
            else if (offset < 10.5) labels[scan.id] = `${ROUTINE_STAGES[stage].label}+9m`;
            else labels[scan.id] = `${ROUTINE_STAGES[stage].label}+>9m`;
        });

        return labels;
    }

    function shouldShowTotalInReport(scanCount, isNewNodule) {
        return Number(scanCount) >= 3;
    }

    function isMeasuredVolume(value) {
        const volume = Number(value);
        return Number.isFinite(volume) && volume > 0;
    }

    function findFirstMeasuredIndex(scans, volumeKey) {
        if (!Array.isArray(scans)) return -1;
        return scans.findIndex(scan => isMeasuredVolume(scan && scan[volumeKey]));
    }

    function getNewNoduleReportState(newestFirstIndex, appearanceIndex, isNewNodule) {
        if (!isNewNodule || appearanceIndex < 0) return 'measured';
        if (newestFirstIndex > appearanceIndex) return 'absent';
        if (newestFirstIndex === appearanceIndex) return 'new';
        return 'measured';
    }

    return {
        parseDateString,
        calculateSingleVDT,
        csvStringifyRow,
        parseCSV,
        escapeHtml,
        parseScanLabel,
        inferScanLabels,
        shouldShowTotalInReport,
        isMeasuredVolume,
        findFirstMeasuredIndex,
        getNewNoduleReportState
    };
});
