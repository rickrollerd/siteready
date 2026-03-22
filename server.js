const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY || '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',
});

// Generate smart follow-up questions based on job description
app.post('/api/questions', async (req, res) => {
  const { jobDescription } = req.body;
  if (!jobDescription) return res.status(400).json({ error: 'Job description required' });

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a construction safety expert helping generate a SWMS (Safe Work Method Statement) for a NZ/AU construction site.

A worker described their job as:
"${jobDescription}"

Based on what they said, generate 3-5 targeted follow-up questions to gather the missing information needed for a complete, specific SWMS.

The SWMS needs:
- Site address and principal contractor
- Plant and equipment (make/model/rego)
- Workers (names, roles, licence numbers)
- Other trades on site (interfaces/interactions)
- Emergency details (nearest hospital, first aider, muster point)

Look at what they already told you and only ask about what's missing or needs clarification. Make questions specific to their task — not generic.

Return ONLY a JSON array of question strings. No explanation. Example format:
["Question 1?", "Question 2?", "Question 3?"]`
      }]
    });

    let questions;
    try {
      const text = message.content[0].text.trim();
      // Extract JSON array from response
      const match = text.match(/\[[\s\S]*\]/);
      questions = JSON.parse(match ? match[0] : text);
    } catch (e) {
      // Fallback to default questions
      questions = [
        "What is the site address and who is the principal contractor?",
        "What plant or equipment will be used? Include make, model and rego if known.",
        "Who are the workers on this task? Please list names and roles.",
        "Are there any other trades working nearby that could create hazards?",
        "What are the emergency contact details and nearest hospital to the site?"
      ];
    }

    res.json({ questions });
  } catch (error) {
    console.error('Questions API error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate the full SWMS document
app.post('/api/generate-swms', async (req, res) => {
  const { jobDescription, answers, companyName } = req.body;
  if (!jobDescription) return res.status(400).json({ error: 'Job description required' });

  const answersText = answers && answers.length > 0
    ? answers.map((a, i) => `Q${i+1}: ${a.question}\nA${i+1}: ${a.answer}`).join('\n\n')
    : 'No additional information provided.';

  const companyNameText = companyName ? companyName : '[Company Name]';

  try {
    const message = await anthropic.messages.create({
      model: 'claude-opus-4-5',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `You are a construction safety expert creating a professional SWMS (Safe Work Method Statement) for the NZ/AU construction industry.

COMPANY: ${companyNameText}

JOB DESCRIPTION:
${jobDescription}

ADDITIONAL INFORMATION:
${answersText}

Generate a complete, specific, professional SWMS document. Return ONLY valid JSON — no markdown, no explanation, just the JSON object.

CRITICAL INSTRUCTIONS:

1. RISK MATRIX: Include a riskMatrix section using the standard NZ/AU 5x5 risk matrix methodology:
   - Likelihood ratings: Rare (1), Unlikely (2), Possible (3), Likely (4), Almost Certain (5)
   - Consequence ratings: Insignificant (1), Minor (2), Moderate (3), Major (4), Catastrophic (5)
   - Risk Score = Likelihood × Consequence
   - Risk levels: 1-4 = LOW, 5-9 = MEDIUM, 10-16 = HIGH, 17-25 = EXTREME

2. GROUTING HAZARD: If the job description mentions grouting, cement mixing, or cementitious products in any form, you MUST include a dedicated hazard row for:
   - Chemical exposure from cementitious grout (skin burns, eye damage, respiratory irritation from dust)
   - Required PPE: nitrile gloves, safety glasses/goggles, P2 dust mask (especially when mixing dry product), long sleeves, waterproof boots
   - Control measures must reference the product SDS (Safety Data Sheet)

3. SILICOSIS / RESPIRABLE CRYSTALLINE SILICA (RCS) HAZARD: If the job involves ANY of the following — cutting, grinding, drilling, breaking, demolishing, or sanding concrete, brick, block, tile, stone, or engineered stone — you MUST include a dedicated silicosis/RCS hazard row:
   - Hazard name: "Respirable Crystalline Silica (RCS) / Silicosis risk"
   - Explain: inhalation of fine silica particles causes irreversible silicosis (progressive lung disease), lung cancer, and other life-threatening disease. No safe exposure level. Australia WEL: 0.05 mg/m³ (8-hour TWA) — legally binding from December 2026 under Safe Work Australia Model Code of Practice (August 2025).
   - Controls (hierarchy): eliminate dry cutting/grinding entirely; substitute with pre-cut materials or lower-silica alternatives; isolate work area; engineering controls: wet cutting (water suppression), on-tool dust extraction with H-class HEPA vacuum, local exhaust ventilation; admin controls: wet wiping only (never dry sweep), restrict access during dust generation; PPE: P2 minimum respirator (half-face or full-face for high exposure), safety glasses.
   - Never recommend a standard dust mask — only P2 or P3 rated respirator for RCS.
   - This hazard MUST appear for: concrete cutting/grinding/drilling/breaking, demolition of concrete or masonry, precast panel cutting, tiling/tile cutting, engineered stone work, brick cutting, road saw work, core drilling.

4. COMPREHENSIVE HAZARD COVERAGE: For every SWMS, you MUST include hazards covering ALL of the following categories that are applicable to the task:
   a) Working at height (falls, falling objects) — include if work is above ground level
   b) Crane and lifting operations — include if any lifting or rigging is involved
   c) Struck by / caught between hazards
   d) Manual handling (musculoskeletal risks)
   e) Plant and vehicle interaction
   f) Hazardous substances / chemicals — ALWAYS check: is grouting, painting, welding, or solvents involved?
   g) Electrical hazards — include if working near services or using power tools
   h) Structural instability — include for precast, formwork, excavation, demolition
   i) Environmental / weather conditions
   j) Interaction with other trades
   Each hazard MUST have: initial risk rating (using likelihood × consequence), minimum 3 specific control measures following the hierarchy of controls (elimination → substitution → isolation → engineering → administrative → PPE), and residual risk rating.

5. COMPANY NAME: Use "${companyNameText}" as the subcontractor/company name in the document.

Use this exact JSON structure:
{
  "document": {
    "title": "Safe Work Method Statement",
    "swmsNumber": "SWMS-[year]-[3 digit number]",
    "dateCreated": "[today's date DD/MM/YYYY]",
    "reviewDate": "[3 months from today DD/MM/YYYY]",
    "version": "1.0"
  },
  "projectDetails": {
    "projectName": "",
    "siteAddress": "",
    "principalContractor": "",
    "contractNumber": "",
    "subcontractor": "${companyNameText}",
    "projectManager": ""
  },
  "taskDescription": {
    "task": "",
    "location": "",
    "duration": "",
    "methodology": ""
  },
  "riskMatrix": {
    "methodology": "Risk Score = Likelihood (1-5) × Consequence (1-5). Risk levels: LOW (1-4), MEDIUM (5-9), HIGH (10-16), EXTREME (17-25).",
    "likelihoodScale": [
      {"rating": 1, "label": "Rare", "description": "May occur only in exceptional circumstances"},
      {"rating": 2, "label": "Unlikely", "description": "Could occur at some time"},
      {"rating": 3, "label": "Possible", "description": "Might occur at some time"},
      {"rating": 4, "label": "Likely", "description": "Will probably occur in most circumstances"},
      {"rating": 5, "label": "Almost Certain", "description": "Is expected to occur in most circumstances"}
    ],
    "consequenceScale": [
      {"rating": 1, "label": "Insignificant", "description": "No injuries, low financial loss"},
      {"rating": 2, "label": "Minor", "description": "First aid treatment, on-site release"},
      {"rating": 3, "label": "Moderate", "description": "Medical treatment, on-site release contained"},
      {"rating": 4, "label": "Major", "description": "Extensive injuries, loss of production"},
      {"rating": 5, "label": "Catastrophic", "description": "Death, toxic release off-site"}
    ]
  },
  "highRiskCategories": ["List applicable HRCW categories from NZ/AU legislation"],
  "hazardsAndControls": [
    {
      "hazard": "",
      "likelihood": 3,
      "consequence": 4,
      "riskScore": 12,
      "risk": "High",
      "controlMeasures": ["control 1", "control 2", "control 3"],
      "residualLikelihood": 2,
      "residualConsequence": 3,
      "residualScore": 6,
      "residualRisk": "Medium",
      "responsiblePerson": ""
    }
  ],
  "plantAndEquipment": [
    {
      "item": "",
      "makeModel": "",
      "rego": "",
      "inspectionDate": "",
      "operator": ""
    }
  ],
  "personnel": [
    {
      "name": "",
      "role": "",
      "licenceNumber": "",
      "competency": ""
    }
  ],
  "emergencyProcedures": {
    "nearestHospital": "",
    "hospitalAddress": "",
    "firstAider": "",
    "firstAiderContact": "",
    "musterPoint": "",
    "emergencyContact": "",
    "emergencyPhone": "111 (NZ) / 000 (AU)"
  },
  "ppe": ["List required PPE items"],
  "references": ["Relevant NZ/AU legislation, standards, codes of practice"]
}

Be SPECIFIC — use actual task details, not generic placeholders. Where info wasn't provided, use realistic placeholders in square brackets like [Site Address]. 

For hazards, include at least 6-10 realistic hazards specific to this task with practical control measures. Make it look like a real professional document that would pass tier-1 contractor review.`
      }]
    });

    let swmsData;
    try {
      const text = message.content[0].text.trim();
      // Log stop reason to help diagnose truncation
      console.log('AI stop reason:', message.stop_reason, '| output length:', text.length);
      if (message.stop_reason === 'max_tokens') {
        console.error('WARNING: AI response was truncated — increase max_tokens or shorten prompt');
      }
      // Extract JSON from response (handles markdown code block wrapping)
      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error('No JSON object found in AI response. First 500 chars:', text.substring(0, 500));
        return res.status(500).json({ error: 'Failed to parse SWMS data from AI response' });
      }
      swmsData = JSON.parse(match[0]);
    } catch (e) {
      console.error('JSON parse error:', e.message);
      return res.status(500).json({ error: 'Failed to parse SWMS data from AI response' });
    }

    res.json({ swms: swmsData });
  } catch (error) {
    console.error('SWMS generation error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Prevent uncaught errors from crashing the server
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server kept alive):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (server kept alive):', reason);
});

const PORT = process.env.PORT || 3849;
app.listen(PORT, () => {
  console.log(`SiteReady server running on http://localhost:${PORT}`);
});
