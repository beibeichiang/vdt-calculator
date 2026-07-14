# Dynamic VDT Calculator

A browser-based volume doubling time (VDT) calculator for longitudinal pulmonary nodule measurements. It supports solid, core, and non-solid volumes, scan-to-scan and total VDT, projections, local patient worklists, and CSV backup/restore.

## Use

Open the published site in Chrome and choose **Install Dynamic VDT Calculator** from the browser menu. Patient records are stored in that browser's local storage; use **Export CSV** regularly to create portable backups.

The calculator uses the exponential-growth formula:

```text
VDT = ln(2) × elapsed days / ln(current volume / previous volume)
```

## Local development

Serve the repository over HTTP so the service worker and install behavior can run:

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000`.

Run the dependency-free core tests with Node.js 18 or newer:

```bash
npm test
```

## Data and safety

- Data is kept in browser `localStorage`; it is not a substitute for a clinical information system or managed backup.
- CSV exports may contain identifiers and notes. Handle them according to your organization's privacy and security requirements.
- This is a decision-support calculation. Verify source measurements, dates, and results before clinical use.
