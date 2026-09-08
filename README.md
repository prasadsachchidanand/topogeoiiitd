# IIIT Delhi Topology and Geometry Seminar

This version preserves the original website design. The existing Tailwind classes, navbar, footer, hero sections, cards, colors, spacing, and responsive layout remain the visual source of truth.

Automation and SEO are added at build time; they do not replace the design.

## Preview locally

Open this folder in VS Code and run:

```bash
npm install
npm run dev
```

Then open <http://localhost:8080>. Press `Control + C` to stop the preview.

Run `npm install` once after cloning or whenever `package.json` changes. Node.js 20 or newer is required.

If you prefer the VS Code Live Server extension, run `npm run build` first and open a page from `dist/`. The
repository's `.vscode/settings.json` already points Live Server at `dist/`. Serving the source folder directly
does not work: `data/talks.json` and `assets/site.css` are produced by the build, so the pages report
"Error loading talks".

## Add a new lecture series

Run:

```bash
npm run new-series -- metric-geometry
```

This creates `data/metric-geometry.json`. Edit that one file and add any PDF notes to `notes/`. The build automatically:

- creates the series page using `series-template.html`;
- merges the talks into the generated `data/talks.json`;
- updates the home page, schedule, and archive through their existing scripts;
- updates the sitemap, RSS feed, and calendar;
- adds canonical metadata and Schema.org event information.

No directory mapping or copied HTML page is required.

The `prerequisites` field is optional. Leave it empty when a series has no stated prerequisites; text entered there appears only on that series page.

## Add or update a talk

Edit only the corresponding file in `data/`. For example:

```json
"recording": "https://youtu.be/example",
"notes": "/notes/example.pdf",
"durationMinutes": 60
```

Then run `npm run dev` to inspect the result.

`durationMinutes` is optional and defaults to 60. The series page keeps the Zoom link visible until that duration has elapsed.

### Several sets of notes for one talk

`notes` accepts a single path, a plain list of paths, or a list of labelled entries. Use the labelled form when
a speaker supplies more than one document for the same lecture:

```json
"notes": [
  { "label": "Lecture Notes", "url": "/notes/Ruben-Lecture_Notes-1.pdf" },
  { "label": "Handwritten Notes", "url": "/notes/Ruben-Lecture_Notes.pdf" }
]
```

Each entry becomes its own button under **Post-Lecture Resources** on the series page and in the archive.
The old single-string form still works and is labelled *Lecture Notes*; an unlabelled list is numbered
*Lecture Notes 1*, *Lecture Notes 2*, and so on.

## Commands

```bash
npm run build       # generate the publishable site in dist/
npm run check       # validate data, links, pages, and original visual structure
npm run dev         # build and preview locally
npm run new-series -- my-series-slug
```

After changing a JSON or template file, stop the local server with `Control + C` and run `npm run dev` again. The production site rebuilds automatically after a push to `main`.

The validation step checks generated pages, local links, pre-rendered content, metadata, and the production CSS bundle.

## Site-wide settings

`site.config.json` contains the website URL, title, description, contact email, timezone, mailing-list link, YouTube link, and Google Search Console verification token.

## Publishing

The workflow in `.github/workflows/deploy.yml` runs automatically after every push to `main`. It builds and validates the site, then publishes the generated `dist/` directory to <https://topogeoiiitd.github.io/> using the existing deployment key.
