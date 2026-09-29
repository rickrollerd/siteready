const express = require('express');
const OpenAI = require('openai');
const path = require('path');

require('dotenv').config();

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// deepseek-chat was discontinued on 2026-07-24. Chat Completions accepts deepseek-flash.
const MODEL = 'deepseek-flash';

let openai;
function getClient() {
  if (openai) return openai;
  const apiKey = process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('DEEPSEEK_API_KEY is not set');
  }
  openai = new OpenAI({
    apiKey,
    baseURL: 'https://api.deepseek.com',
  });
  return openai;
}

function textField(value, max) {
  if (typeof value !== 'string') return '';
  return value.trim().substring(0, max);
}

function plantList(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => item.substring(0, 200));
}

function answersText(answers) {
  if (!Array.isArray(answers) || answers.length === 0) {
    return 'No additional information provided.';
  }
  return answers
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry, index) => {
      const question = textField(entry.question, 500);
      const answer = textField(entry.answer, 500);
      return `Q${index + 1}: ${question}\nA${index + 1}: ${answer}`;
    })
    .join('\n\n') || 'No additional information provided.';
}

async function complete(messages, maxTokens) {
  return getClient().chat.completions.create({
    model: MODEL,
    max_tokens: maxTokens,
    messages,
    // deepseek-flash thinks by default. The retired deepseek-chat alias was non-thinking,
    // and this handler reads message.content within a fixed token budget.
    thinking: { type: 'disabled' },
  });
}

const FALLBACK_QUESTIONS = [
  'What is the site address and who is the principal contractor?',
  'What plant or equipment will be used? Include make, model and rego if known.',
  'Who are the workers on this task? Please list names and roles.',
  'Are there any other trades working nearby that could create hazards?',
  'What are the emergency contact details and nearest hospital to the site?',
];

// Generate smart follow-up questions based on job description
app.post('/api/questions', async (req, res) => {
  const body = req.body || {};
  const jobDescription = textField(body.jobDescription, 5000);
  if (!jobDescription) return res.status(400).json({ error: 'Job description required' });

  const siteAddress = textField(body.siteAddress, 500);
  const selectedPlants = plantList(body.selectedPlants);

  try {
    const completion = await complete([{
      role: 'user',
      content: `You are a construction safety expert helping generate a SWMS (Safe Work Method Statement) for a NZ/AU construction site.

A worker described their job as:
"${jobDescription}"

Site address: ${siteAddress || 'Not provided'}
Selected plant: ${selectedPlants.length ? selectedPlants.join(', ') : 'None'}

Based on what they said, generate 3-5 targeted follow-up questions to gather the missing information needed for a complete, specific SWMS.

The SWMS needs:
- Site address and principal contractor
- Plant and equipment (make/model/rego)
- Workers (names, roles, licence numbers)
- Other trades on site (interfaces/interactions)
- Emergency details (nearest hospital, first aider, muster point)

Look at what they already told you and only ask about what's missing or needs clarification. Make questions specific to their task — not generic.

Return ONLY a JSON array of question strings. No explanation. Example format:
["Question 1?", "Question 2?", "Question 3?"]`,
    }], 1024);

    let questions;
    try {
      const text = completion.choices[0].message.content.trim();
      const match = text.match(/\[[\s\S]*\]/);
      const parsed = JSON.parse(match ? match[0] : text);
      questions = Array.isArray(parsed) && parsed.every((item) => typeof item === 'string')
        ? parsed
        : FALLBACK_QUESTIONS;
    } catch (e) {
      questions = FALLBACK_QUESTIONS;
    }

    res.json({ questions });
  } catch (error) {
    console.error('Questions API error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// Generate the full SWMS document
app.post('/api/generate-swms', async (req, res) => {
  const body = req.body || {};
  const jobDescription = textField(body.jobDescription, 5000);
  if (!jobDescription) {
    return res.status(400).json({ error: 'Job description required and must be non-empty' });
  }

  const siteAddress = textField(body.siteAddress, 500);
  const selectedPlants = plantList(body.selectedPlants);
  const sanitizedCompanyName = textField(body.companyName, 200) || '[Company Name]';
  const companyNameText = sanitizedCompanyName;
  const extraAnswers = answersText(body.answers);

  try {
    const completion = await complete([{
      role: 'user',
      content: `You are a senior NZ/AU construction safety professional.
Site Address: ${siteAddress || 'Not provided'}
Selected Plants: ${selectedPlants.length ? selectedPlants.join(', ') : 'None'}
Company: ${companyNameText}

Job description:
${jobDescription}

Additional information:
${extraAnswers}

Return ONLY valid JSON. No other text.

{
  "document": {"title": "Safe Work Method Statement", "swmsNumber": "SWMS-2026-001", "dateCreated": "DD/MM/YYYY", "version": "1.0"},
  "projectDetails": {"siteAddress": "${siteAddress}", "subcontractor": "${companyNameText}"},
  "taskDescription": {"task": "${jobDescription}", "workMethodology": "1. Step one 2. Step two"},
  "hazards": [],
  "plantAndEquipment": [],
  "ppe": [],
  "emergencyProcedures": {"emergencyNumber": "111 (NZ) / 000 (AU)"},
  "workerSignoff": []
}`,
    }], 8000);

    let swmsData;
    try {
      const text = completion.choices[0].message.content.trim();
      console.log('AI finish reason:', completion.choices[0].finish_reason, '| output length:', text.length);
      if (completion.choices[0].finish_reason === 'length') {
        console.error('WARNING: AI response was truncated — increase max_tokens or shorten prompt');
      }

      const match = text.match(/\{[\s\S]*\}/);
      if (!match) {
        console.error('No JSON object found in AI response. First 500 chars:', text.substring(0, 500));
        return res.status(500).json({ error: 'Failed to parse SWMS data from AI response' });
      }

      let jsonStr = match[0];
      try {
        swmsData = JSON.parse(jsonStr);
      } catch (parseError) {
        try {
          jsonStr = jsonStr.replace(/,(\s*[\]}])/g, '$1');
          jsonStr = jsonStr.replace(/:\s*'([^']*)'/g, ': "$1"');
          swmsData = JSON.parse(jsonStr);
        } catch (e2) {
          console.error('JSON parsing failed, returning fallback structure:', parseError.message);
          swmsData = {
            document: { title: 'SWMS', swmsNumber: 'SWMS-2026-001', dateCreated: new Date().toLocaleDateString(), version: '1.0' },
            projectDetails: { siteAddress: siteAddress || '[Address TBC]', principalContractor: '[Contractor TBC]', subcontractor: sanitizedCompanyName },
            hazards: [{ hazard: 'General site work hazard', likelihood: 3, consequence: 3, riskScore: 9, risk: 'Medium', controlMeasures: ['Risk assessment required', 'Safety briefing required', 'Standard site induction'], residualScore: 6, residualRisk: 'Medium' }],
            personnel: [],
            plantAndEquipment: [],
            riskMatrix: { methodology: 'Likelihood(1-5) × Consequence(1-5). Levels: 1-4=LOW, 5-9=MED, 10-16=HIGH, 17-25=EXTREME' },
            ppe: ['Hard hat', 'Safety vest', 'Safety boots'],
            references: ['HSWA 2015', 'WorkSafe NZ', 'Safe Work Australia']
          };
        }
      }

      if (!swmsData || typeof swmsData !== 'object') {
        throw new Error('Response is not a valid object');
      }
      if (!swmsData.hazards || !Array.isArray(swmsData.hazards)) {
        swmsData.hazards = [];
      }
      if (!swmsData.personnel || !Array.isArray(swmsData.personnel)) {
        swmsData.personnel = [];
      }
      if (!swmsData.plantAndEquipment || !Array.isArray(swmsData.plantAndEquipment)) {
        swmsData.plantAndEquipment = [];
      }
    } catch (e) {
      console.error('SWMS data processing error:', e.message);
      return res.status(500).json({ error: 'Failed to process SWMS data: ' + e.message });
    }

    res.json({ swms: swmsData });
  } catch (error) {
    console.error('SWMS generation error:', error.message);
    res.status(500).json({ error: error.message });
  }
});

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
