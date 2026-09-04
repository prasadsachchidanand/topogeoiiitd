# IIIT Delhi Topology and Geometry Seminar

This version preserves the original website design. The existing Tailwind classes, navbar, footer, hero sections, cards, colors, spacing, and responsive layout remain the visual source of truth.

Automation and SEO are added at build time; they do not replace the design.

## Preview locally

Open this folder in VS Code and run:

```bash
npm run dev
```

Then open <http://localhost:8080>. Press `Control + C` to stop the preview.

No `npm install` command is needed. Node.js 20 or newer is required.

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

## Commands

```bash
npm run build       # generate the publishable site in dist/
npm run check       # validate data, links, pages, and original visual structure
npm run dev         # build and preview locally
npm run new-series -- my-series-slug
```

The validation step compares the generated page structure with the original `index.html`, `schedule/index.html`, `archive/index.html`, and `series-template.html`. It fails if the visible structure changes unexpectedly.

## Site-wide settings

`site.config.json` contains the website URL, title, description, contact email, timezone, mailing-list link, and YouTube link.

## Publishing

The workflow in `.github/workflows/deploy.yml` runs automatically after every push to `main`. It builds and validates the site, then publishes the generated `dist/` directory to <https://topogeoiiitd.github.io/> using the existing deployment key.
