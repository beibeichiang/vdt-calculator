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

    return { parseDateString, calculateSingleVDT, csvStringifyRow, parseCSV, escapeHtml };
});
