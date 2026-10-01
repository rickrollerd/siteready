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

1. Pick the state, write the task, and answer Yes or No to "Could a person fall more than 2 metres during this task?". All eight states and territories are loaded. In the Northern Territory the user is also asked whether the work is residential construction work, which sets the fall height at 3 metres (2 metres otherwise). A No shows a short explanation of what a fall from height is. If the task wording mentions work at height and the answer is No, the user is warned and asked to check, but the No stands, because a scaffold, parapet or edge protection may already remove the risk. The draft records the answer.
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

`/api` routes are rate limited per client address: 600 requests per 15 minutes, with the Word file limited separately to 300. A site office or phones on one mobile network can share an address, so the limits are set for a busy site rather than one person.

The server runs one worker per processor core and replaces a worker that stops. Each worker keeps its own rate limit count, so with several workers the effective limit per address is higher than the figure set.

## Job steps and PPE

Each draft lays the job out as the regulators' templates do: job steps, each with its hazards and controls, and a Who column. `activities.js` holds the steps for common work (roofing, scaffolding, trenches, roads, power lines, cranes, precast panels, propping and demolition, asbestos, confined spaces, work over water, painting with solvents), always opened by a Before starting step and closed by a Finish and clean up step. The user's facts go into the step they belong to. Work the library does not know gets one step built from the task. The PPE list ticks the site minimum plus what the work needs (for example a P2 respirator and coveralls for asbestos, a life jacket over water, sunscreen unless the task is indoors), and every item can be changed in Word. A Responsibilities section covers the works manager and phone, who ensures compliance, who reviews the controls, the review date and whether workers were consulted.

Confined spaces, propping or load-bearing demolition, overhead power lines and work over water each stand down until their key fact is given: the entry permit and rescue, the temporary support design, the electrical safety arrangement, and the drowning controls.

## Electrical work and cited sources

The electrician's job steps (construction power, cast-in conduits, cable tray and containment, cable pulling, apartment rough-in and fit-off, switchboards and commissioning) are built from the Electrical Safety Regulation 2026 (Qld), the Electrical Safety Act 2002 (Qld) and Safe Work Australia's model Code of Practice: Managing electrical risks in the workplace. Controls taken from them end with their source, for example (Electrical Safety Regulation 2026 (Qld) s 140). Required facts cover the isolation and testing procedure, whether any work is on or near energised parts (within 3 m, s 193), and inspection and testing of construction wiring. Choosing testing on or near energised parts adds the s 195 to s 204 controls, ticks the energised installations category and ticks arc-rated PPE.

A project file can carry a `rules` list: each rule names the SWMS it belongs to, a phrase and its source. `scenarios/projects.js` fails if a rule is missing from its SWMS or its citation is missing, so content is checked against the sources, not only against itself. Queensland's own electrical codes of practice could not be downloaded (WorkSafe Queensland refuses automated requests), so code citations are to the model code and should be re-checked against the Queensland code.

## Decks and load limits

When a formwork deck is laid, the draft asks how: from below through the joists from a working platform, or on top working away from the edge on laid sheets. Each choice gets its own controls. Loading ply onto the deck while it is being laid has its own step. Work that puts materials or plant on a formwork deck or a suspended slab (formwork, load-out and loading platforms, forklifts and telehandlers, reo on a deck) stands down until the load limits are stated: the allowable loads, where they are shown on site, and who checks them. Load limits then appear in each step that lands or stacks loads, and in the documents to keep on site.

## Proprietary systems

SiteReady does not write erection methods for proprietary formwork, scaffold or platform systems. Their supplier's instructions set how they are erected, used and dismantled. Where formwork, falsework, scaffold erection or loading platforms are found, the draft asks for the system, its supplier, the instructions it is erected to (document and revision) and who trained the crew, and stands down without them. The job steps then point to those instructions and say not to mix or change components without the supplier's approval. Documents the SWMS relies on are listed in a Documents to keep on site section.

## Cranes

Cranes are taken to be supplied and operated by a crane company, whose operator and dogmen work to its own lift plan. The draft asks which company that is and that its lift plan covers the lifts, and the job steps cover working with the crane crew: planning the day's lifts and landing areas, only licensed dogmen or riggers slinging and releasing loads, preparing loads as directed, staying out from under loads, and stopping when the crane stops. Choosing "Our company" for who operates the crane gives the crane set-up and lifting steps instead and asks for the crane chart.

## Sign-off

Every statement ends with a Prepared by section, a Principal contractor review (date received, reviewed by, Accepted / Accepted with changes / Not accepted, comments, signature, date) and Worker sign-on pages. The sign-on starts on a new page with a short declaration and 44 lines for name, company, signature and date, over about two pages, with the heading row repeated on each page. A stood-down task has none of these, because it has no method to sign onto.

## Company profile

A company enters its name, ABN, address, phone, email and logo once. They are saved in the browser on that device and filled into every statement; the subcontractor name can still be changed on any one statement. The details appear at the top of the statement and in the header of every page of the Word file, with the logo. The logo is redrawn at header size in the browser, and the server accepts only PNG or JPEG up to 400 KB. The server does not keep the profile. Sharing one profile across a team's devices would need user accounts, which the app does not have yet.

## Scenarios

`scenarios/scenarios.json` holds ten work scenarios with the result each should give. `npm test` runs them in every state and territory; `npm run scenarios` also writes `scenarios/results.md`. A state without loaded legislation must refuse.

`npm run load` runs many users at once across the country (default 200 users for 30 seconds; `node scenarios/load.js 300 60` for 300 users for a minute). Each user is a different site working through every scenario in every state: questions, the draft with and without facts, then the Word file. Every answer is compared with the same draft prepared directly, so a busy server cannot give one user another user's statement. It starts its own server with the rate limits raised, or pass a server address as the third argument.

## Settings

See `.env.example`.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 3849 | Server port |
| `ALLOWED_ORIGINS` | none | Extra origins allowed to call the API (comma-separated). The native app origins are always allowed. |
| `RATE_LIMIT_WINDOW_MS` | 900000 | Rate limit window (15 minutes) |
| `RATE_LIMIT_MAX_REQUESTS` | 600 | Requests per window per client address, other than the Word file |
| `RATE_LIMIT_WORD_REQUESTS` | 300 | Word files per window per client address |
| `TRUST_PROXY` | 1 | Number of proxies in front of the server. Set 0 when clients connect directly, or a client can fake its address to get round the rate limit. |
| `WEB_CONCURRENCY` | number of cores | Server worker processes. Set 1 to run a single process. |

## Native app

The native app loads `public/` from the device, so it must be told where the server is. Set `content` in `<meta name="siteready-api">` in `public/index.html` to the deployed server address before running `npx cap sync`. The web page leaves it blank and calls the server it was loaded from.

## Legislation references

- Queensland: Work Health and Safety Regulation 2011 (Qld), current as at 29 March 2026, checked against legislation.qld.gov.au and the model WHS Regulations (5 December 2025). Overhead line distance from the Electrical Safety Regulation 2026 (Qld).
- New South Wales: Work Health and Safety Regulation 2025 (NSW), current version for 3 July 2026, checked against the official PDF and the model WHS Regulations (5 December 2025). Overhead line approach distances from the SafeWork NSW Code of practice, Work near overhead and underground electric lines (May 2026), Table 1.
- Victoria: Occupational Health and Safety Regulations 2017 (Vic), authorised version 017 as at 29 July 2026, checked against the authorised PDF and WorkSafe Victoria's Safe Work Method Statements (SWMS) page, which lists the same 19 categories. Victoria is not a model WHS state: high risk construction work is regulation 322 (19 categories, any demolition, tunnels listed separately), the SWMS is regulation 327, and regulation 324 asks only how controls are to be implemented. The regulations set no overhead line distance, so drafts tell the user to get the line owner's requirements.
- South Australia: Work Health and Safety Regulations 2012 (SA), version of 1 July 2026, checked against the authorised PDF and the model WHS Regulations (5 December 2025). Regulations 291 and 299 follow the national model. Regulation 166 sets no overhead line distance, so drafts tell the user to get the electricity supply authority's requirements.
- Western Australia: Work Health and Safety (General) Regulations 2022 (WA), version 01-c0-00 as at 1 July 2026, read from legislation.wa.gov.au and checked against the 2022 PDF and the model WHS Regulations. Regulations 291 and 299 follow the national model. Regulation 166A sets overhead line danger zones (0.5 m to 6.0 m by voltage). Regulations 306B to 306I apply to tilt-up and precast concrete panels: the draft asks when WorkSafe WA was notified (at least 10 working days before casting) and adds the site documents and entry rules.
- Tasmania: Work Health and Safety Regulations 2022 (Tas), authorised version of 2 July 2025, read from legislation.tas.gov.au and checked against the model WHS Regulations. Regulations 291 and 299 follow the national model. Regulation 166 sets no overhead line distance, so drafts tell the user to get the electricity supply authority's requirements.
- Northern Territory: Work Health and Safety (National Uniform Legislation) Regulations 2011 (NT), as in force at 17 July 2026, read from legislation.nt.gov.au and checked against the model WHS Regulations. Regulation 291 sets a 3 metre fall height for residential construction work (a Class 1 building, or a Class 10 building attached or adjacent to one) and 2 metres otherwise. Regulation 299 follows the national model. The text of regulation 166 could not be read from the published PDF, so drafts tell the user to get the electricity supply authority's requirements and cite the Electrical Reform Act 2000; it needs checking by hand.
- Australian Capital Territory: Work Health and Safety Regulation 2011 (ACT), republication 47 effective 29 November 2025, read from legislation.act.gov.au and checked against the model WHS Regulations. Section 291 adds light rail and item (s), processing crystalline silica material with a power tool or another mechanical method (section 418A). Section 166 sets no overhead line distance.
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
