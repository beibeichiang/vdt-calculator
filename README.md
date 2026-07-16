# VDT Calculator

A browser-based volume doubling time (VDT) calculator for longitudinal pulmonary nodule measurements. It supports solid, core, and non-solid volumes, scan-to-scan and total VDT, projections, local patient worklists, and CSV backup/restore.

For screening-round labels, enter one standard anchor (`Baseline`, `1st Annual`, `2nd Annual`, or `Biennial`, optionally followed by `+3m`, `+6m`, or `+9m`). The app infers the adjacent labels from scan dates, including partial four-scan series that do not contain the baseline scan.

When **New nodule · VDTmax** is selected, the preceding absent scan remains visually blank. Copied reports mark the first measured volume `(new)`, while the table keeps volume values centered. The 15 mm³ threshold is used only internally to calculate VDTmax.

Use the full **Baseline** radio column for one-click baseline selection. You can also type a standard anchor into **Screening round**; automatically generated labels are selected on focus so replacement does not require manual deletion.

## Use

Open the published site in Chrome and choose **Install VDT Calculator** from the browser menu. Patient records are stored in that browser's local storage; use **Backup** regularly to create portable CSV copies.

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
