# SiteReady

A writing aid for a safe work method statement (SWMS) for one task, for the states whose legislation is loaded. It prepares a draft from the facts the user gives. The subcontractor checks, finishes and signs it. The draft is marked "Not approved. Not signed."

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

1. Pick the state, write the task, and answer Yes or No to "Could a person fall more than 2 metres during this task?". Queensland, New South Wales, Victoria, South Australia, Western Australia and Tasmania are loaded. Other states are shown but cannot be chosen. A No shows a short explanation of what a fall from height is. If the task wording mentions work at height and the answer is No, the user is warned and asked to check, but the No stands, because a scaffold, parapet or edge protection may already remove the risk. The draft records the answer.
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
| `legislation.js` | Each loaded state's regulation, section 291 categories, fall explanation and overhead line control |
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

## Scenarios

`scenarios/scenarios.json` holds ten work scenarios with the result each should give. `npm test` runs them in every state and territory; `npm run scenarios` also writes `scenarios/results.md`. A state without loaded legislation must refuse.

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

- Queensland: Work Health and Safety Regulation 2011 (Qld), current as at 29 March 2026, checked against legislation.qld.gov.au and the model WHS Regulations (5 December 2025). Overhead line distance from the Electrical Safety Regulation 2026 (Qld).
- New South Wales: Work Health and Safety Regulation 2025 (NSW), current version for 3 July 2026, checked against the official PDF and the model WHS Regulations (5 December 2025). Overhead line approach distances from the SafeWork NSW Code of practice, Work near overhead and underground electric lines (May 2026), Table 1.
- Victoria: Occupational Health and Safety Regulations 2017 (Vic), authorised version 017 as at 29 July 2026, checked against the authorised PDF and WorkSafe Victoria's Safe Work Method Statements (SWMS) page, which lists the same 19 categories. Victoria is not a model WHS state: high risk construction work is regulation 322 (19 categories, any demolition, tunnels listed separately), the SWMS is regulation 327, and regulation 324 asks only how controls are to be implemented. The regulations set no overhead line distance, so drafts tell the user to get the line owner's requirements.
- South Australia: Work Health and Safety Regulations 2012 (SA), version of 1 July 2026, checked against the authorised PDF and the model WHS Regulations (5 December 2025). Regulations 291 and 299 follow the national model. Regulation 166 sets no overhead line distance, so drafts tell the user to get the electricity supply authority's requirements.
- Western Australia: Work Health and Safety (General) Regulations 2022 (WA), version 01-c0-00 as at 1 July 2026, read from legislation.wa.gov.au and checked against the 2022 PDF and the model WHS Regulations. Regulations 291 and 299 follow the national model. Regulation 166A sets overhead line danger zones (0.5 m to 6.0 m by voltage). Regulations 306B to 306I apply to tilt-up and precast concrete panels: the draft asks when WorkSafe WA was notified (at least 10 working days before casting) and adds the site documents and entry rules.
- Tasmania: Work Health and Safety Regulations 2022 (Tas), authorised version of 2 July 2025, read from legislation.tas.gov.au and checked against the model WHS Regulations. Regulations 291 and 299 follow the national model. Regulation 166 sets no overhead line distance, so drafts tell the user to get the electricity supply authority's requirements.
- Queensland section 299(4): where the only fall controls are administrative or PPE, the draft asks what other controls were considered.

The references in `legislation.js` must be checked against each state's official legislation site before release, and again when a regulation changes.

## Daily legislation check

`.github/workflows/legislation-watch.yml` runs every morning at 06:17 Brisbane time. It reads the version shown on the official legislation page for each state and territory's WHS (or Victorian OHS) Act and Regulation, and the Queensland Electrical Safety Act and Regulation. The pages are listed in `legislation-watch/sources.json`.

- When a version changes, it opens a GitHub issue and sends an email. The app then needs updating and the update signed off.
- When a page cannot be read, it reports that once, when it starts, so a change is not missed silently.
- The NSW site refuses automated requests from GitHub, so the NSW pages are reported for a manual check.
- The versions last seen are kept in `legislation-watch/state.json`.

The check runs from the default branch (`main`). Email needs three repository secrets (Settings, Secrets and variables, Actions):

| Secret | Value |
|---|---|
| `ALERT_EMAIL` | The address that receives the alerts |
| `SMTP_USERNAME` | The Gmail address that sends them |
| `SMTP_PASSWORD` | A Gmail app password for that address (needs 2-Step Verification) |

Without them, the issue is still opened and GitHub notifies the repository owner.

## Legislation cross-check

`.github/workflows/legislation-crosscheck.yml` compares each loaded state's section numbers and category labels with a second source, and prints the provisions. Queensland is read from legislation.qld.gov.au. AustLII refuses requests from GitHub, so the other states are checked by hand against the sources listed in `legislation-watch/crosscheck.js`.
