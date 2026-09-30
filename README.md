# SiteReady

A writing aid for a Queensland safe work method statement (SWMS) for one task. It prepares a draft from the facts the user gives. The subcontractor checks, finishes and signs it. The draft is marked "Not approved. Not signed."

## Run it

```bash
npm install
npm start
```

Open http://localhost:3849.

```bash
npm test
```

## How it works

1. Pick the state, write the task, and answer Yes or No to "Could a person fall more than 2 metres during this task?". Only Queensland is loaded. Other states are shown but cannot be chosen. A No shows a short explanation of what a fall from height is. If the task wording describes work at height, a No is treated as Yes, the user is told why, and a fall control is still required.
2. The app asks for the facts the task needs, for example:
   - crane chart: rated capacity in tonnes at the working radius in metres
   - erection design, centre of gravity and brace arrangement for a panel lift
   - fall control for work where a person could fall more than 2 metres
   - trench support for a trench deeper than 1.5 metres
   - safety data sheet for a hazardous substance
   - what happens with asbestos
3. If a required fact is blank, or only says it was supplied without stating it, the task is stood down and no method is written.
4. Otherwise the draft lists the high risk construction work, hazards, controls in hierarchy order, how controls are implemented, monitored and reviewed, site-specific lines and the method.
5. Download the draft as a Word file.

The draft is built by fixed rules in `draft.js`. No AI service is called, and nothing is saved.

## Files

| File | Purpose |
|---|---|
| `server.js` | Express server and API routes |
| `draft.js` | Rules that build the draft or stand the task down |
| `legislation.js` | Queensland WHS Regulation 2011 references and the section 291 categories |
| `docx-draft.js` | Word file output |
| `public/` | Web page (`index.html`, `app.js`), manifest and icons |
| `test/` | Tests (`npm test`) |
| `android/`, `ios/`, `capacitor.config.json` | Native app shells |
| `transcribe.py` | Stand-alone voice transcription script. The app does not use it. |

## API

| Route | Purpose |
|---|---|
| `GET /api/states` | States and whether each is loaded |
| `POST /api/draft/questions` | Required facts and site fields for a task |
| `POST /api/draft` | The draft, or a stand-down listing what is missing |
| `POST /api/draft.docx` | The same, as a Word file |

`/api` routes are rate limited per client address.

## Settings

See `.env.example`.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 3849 | Server port |
| `ALLOWED_ORIGINS` | none | Extra origins allowed to call the API (comma-separated). The native app origins are always allowed. |
| `RATE_LIMIT_WINDOW_MS` | 900000 | Rate limit window (15 minutes) |
| `RATE_LIMIT_MAX_REQUESTS` | 100 | Requests per window per client |

## Native app

The native app loads `public/` from the device, so it must be told where the server is. Set `content` in `<meta name="siteready-api">` in `public/index.html` to the deployed server address before running `npx cap sync`. The web page leaves it blank and calls the server it was loaded from.

## Legislation references

The Queensland references in `legislation.js` and `draft.js` must be checked against the current compilation on legislation.qld.gov.au before release, and again when the regulation changes.
