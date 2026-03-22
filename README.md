# SiteReady 🟢 — Phase 0 Demo

> **Voice-to-SWMS.** Safety docs that get the green light. First time, every time.

A professional AI-powered SWMS (Safe Work Method Statement) generator for NZ/AU construction sites.

## Quick Start

```bash
cd /home/maxim/.openclaw/workspace/SiteReady/app
node server.js
# or with npm: npm start
```

Then open: **http://localhost:3000**

**For a demo:** Open the app and enter this job description:
```
We are doing a precast concrete panel lift tomorrow at the Parnell commercial site. 
200T Liebherr crane, panels are 8T each, working at height up to 12 metres, riggers 
on the ground, crane operator in cab, two panels to be lifted. Site address is 45 
Parnell Road Auckland. Principal contractor is Fletcher Construction.
```

Approve the questions and watch SiteReady generate a complete, professional SWMS in seconds.

## How It Works

**Step 1: Describe the job**
- Type a natural description of what you're doing: task, location, equipment, known hazards
- Include: site address, principal contractor, crane/plant, workers, anything high-risk
- The more detail, the better the SWMS

**Step 2: Answer follow-up questions**
- SiteReady asks 3-5 **targeted questions** based on your description
- Answer boxes are comfortable to type in (3+ rows, mobile-friendly)
- Questions fetch missing info: plant details, worker names/credentials, emergency contacts

**Step 3: Get your SWMS**
- AI generates a complete, professional SWMS in seconds
- Sections include: project details, hazards, controls, plant, personnel, PPE, emergency procedures
- Documents are formatted for **printing or PDF export**

**Step 4: Print/Save/Share**
- Click **Print / Save as PDF** button
- Browser print dialog opens
- CSS handles A4 formatting, page breaks, no dark backgrounds
- Output looks like a real professional document

**Repeat:**
- Click **Start Over** button after SWMS generation to create another one

## Tech Stack

- **Frontend:** Single-page HTML file (`public/index.html`) with embedded CSS + vanilla JS
  - Dark UI with green accents
  - Professional typography & spacing
  - Fully responsive (desktop + mobile)
  - Clean print styles for A4 output
- **Backend:** Node.js + Express.js (`server.js`)
  - Two simple endpoints: `/api/questions` and `/api/generate-swms`
  - No database (stateless, suitable for serverless deployment)
- **AI:** Claude claude-opus-4-5 (Anthropic API)
  - Generates smart follow-up questions
  - Creates detailed, regulation-aware SWMS documents
- **Output:** Browser-native PDF export via print dialog (no Puppeteer/extra libs)

## API Endpoints

### POST `/api/questions`

Generates smart follow-up questions based on a job description.

**Request:**
```json
{
  "jobDescription": "We're installing a concrete tilt panel on Level 2..."
}
```

**Response:**
```json
{
  "questions": [
    "What is the site address and who is the principal contractor?",
    "What plant or equipment will be used? Include make, model and rego if known.",
    ...
  ]
}
```

### POST `/api/generate-swms`

Generates a complete SWMS document.

**Request:**
```json
{
  "jobDescription": "We're installing...",
  "answers": [
    {
      "question": "What is the site address...?",
      "answer": "42 Anzac Ave, Auckland. Principal: Downer NZ."
    },
    ...
  ]
}
```

**Response:**
```json
{
  "swms": {
    "document": { "title": "...", "swmsNumber": "SWMS-2026-001", ... },
    "projectDetails": { "projectName": "...", "siteAddress": "...", ... },
    "taskDescription": { "task": "...", "location": "...", ... },
    "highRiskCategories": ["Work involving lifting...", ...],
    "hazardsAndControls": [
      {
        "hazard": "Dropped load",
        "risk": "High",
        "controlMeasures": ["Certified lifting gear...", ...],
        "residualRisk": "Low",
        "responsiblePerson": "..."
      },
      ...
    ],
    "plantAndEquipment": [...],
    "personnel": [...],
    "emergencyProcedures": {...},
    "ppe": ["Hard hat", "High-vis vest", ...],
    "references": ["NZ Health and Safety at Work Act...", ...]
  }
}
```

## SWMS Document Contents

The generated SWMS includes:

1. **Header** — Title, SWMS number, date, version
2. **Project Details** — Site address, principal contractor, PM, contract number
3. **Task Description** — What's being done, where, how long, methodology
4. **High Risk Categories** — Applicable HRCW under NZ/AU legislation
5. **Hazards & Controls** — 4-8 site-specific hazards with:
   - Initial risk rating (High/Medium/Low)
   - Practical control measures
   - Residual risk after controls
   - Responsible person
6. **Plant & Equipment** — Crane, pump, scaffolding, etc. with make, model, rego, operator
7. **Personnel** — Workers by name, role, licence number, competency
8. **PPE** — Hard hat, hi-vis, boots, gloves, harnesses (regulation-compliant)
9. **Emergency Procedures** — Hospital, first aider, muster point, emergency contact
10. **References** — NZ/AU acts, codes of practice, standards
11. **Sign-Off Section** — Signature lines for workers

## What's Working Now ✅

- **Full SWMS generation** — Professional documents in seconds
- **Smart follow-up questions** — AI asks only what's missing
- **Real job details** — No generic placeholders (uses actual input)
- **Clean typography** — Professional, readable document
- **Responsive design** — Desktop + mobile + print
- **Dark UI** — Easy on the eyes; professional look
- **Print/PDF export** — Works in any browser; A4 formatted
- **Multiple hazard entries** — Tables with risk ratings and controls
- **Personnel & plant tables** — Structured data entry
- **Emergency procedures** — Required contacts and procedures
- **Start Over button** — Quickly generate another SWMS

## Known Limitations & Phase 1 Roadmap

- **Voice input:** Placeholder button only; full Whisper integration coming
- **Storage:** Docs aren't saved; generated live each time
- **Export formats:** Print-to-PDF only; Word (.docx) export coming
- **Company branding:** No custom letterhead yet
- **Customization:** No template library; all outputs use default format

**Phase 1 priorities:**
1. [ ] Real voice input (Whisper API)
2. [ ] Save/retrieve SWMS documents (local + cloud)
3. [ ] Export to Word (.docx)
4. [ ] Company branding & custom letterhead
5. [ ] SWMS template library
6. [ ] Document version history
7. [ ] Share & collaborate features

## Deployment

The app is ready for serverless deployment (AWS Lambda, Vercel, Railway, etc.):

- No database required (stateless)
- API keys via environment variables
- Simple Node.js + Express stack
- Build size: minimal (~150KB assets)

Example env vars:
```bash
ANTHROPIC_API_KEY=sk-ant-...
PORT=3000
```

## For Clive

This demo is ready to show potential customers. It demonstrates:
- **Fast turnaround** — SWMS in seconds
- **Professional output** — Real regulatory content
- **Smart questions** — Not generic; tailored to their job
- **Easy printing** — No extra steps
- **No fluff** — Clean, focused UI

The MVP works; future phases add storage, voice, and export options.
