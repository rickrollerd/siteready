const express = require('express');
const Anthropic = require('@anthropic-ai/sdk');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
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
  
  // Input validation
  if (!jobDescription || typeof jobDescription !== 'string' || jobDescription.trim().length === 0) {
    return res.status(400).json({ error: 'Job description required and must be non-empty' });
  }
  
  // Sanitize inputs
  const sanitizedJobDesc = jobDescription.trim().substring(0, 5000); // Max 5000 chars
  const sanitizedCompanyName = (companyName && typeof companyName === 'string') 
    ? companyName.trim().substring(0, 200) 
    : '[Company Name]';
  
  const answersText = answers && Array.isArray(answers) && answers.length > 0
    ? answers
        .filter(a => a && typeof a === 'object') // Filter out invalid entries
        .map((a, i) => {
          const q = (a.question || '').substring(0, 500);
          const ans = (a.answer || '').substring(0, 500);
          return `Q${i+1}: ${q}\nA${i+1}: ${ans}`;
        })
        .join('\n\n')
    : 'No additional information provided.';

  const companyNameText = sanitizedCompanyName;

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

Generate a professional SWMS. Return ONLY valid JSON — no markdown, no explanation.

CRITICAL HAZARD TRIGGERS:
1. RCS/Silicosis (if cutting, grinding, drilling, breaking, or demolishing concrete/brick/tile/stone): Include hazard with P2+ respirator controls
2. Grouting (if cement, grout, cementitious work): Include chemical exposure hazard with gloves, P2 mask, SDS reference
3. Height work (if any work above ground): Include fall hazard with harness controls
4. Crane/lifting: Include load drop hazard with rigging controls
5. Welding (if mentioned): Include arc flash, fume, fire hazards
6. Manual handling (if lifting, carrying, repetitive work mentioned): Include musculoskeletal strain hazard with ergonomic controls, job rotation, mechanical assistance
7. Confined space (if sump, pit, trench, underground, enclosed space, basement mentioned): Include atmospheric hazard with entry permits, gas monitoring, rescue provisions

Be specific to the actual job. Include 6-10 hazards appropriate to the task.

For complex multi-trade jobs, prioritize: (1) highest-risk activities first, (2) interactions between trades, (3) schedule/weather pressures. Keep hazards focused — don't list every possible hazard, only the material ones for THIS specific work.

COMPANY NAME: Use "${companyNameText}" in document.

JSON structure required:
{
  "document": {"title": "SWMS", "swmsNumber": "SWMS-2026-001", "dateCreated": "[today DD/MM/YYYY]", "version": "1.0"},
  "projectDetails": {"siteAddress": "[from context]", "principalContractor": "[from context]", "subcontractor": "${companyNameText}"},
  "hazards": [
    {"hazard": "[name]", "likelihood": 3, "consequence": 4, "riskScore": 12, "risk": "High", "controlMeasures": ["control1", "control2", "control3"], "residualScore": 6, "residualRisk": "Medium"}
  ],
  "plantAndEquipment": [{"item": "[name]", "makeModel": "[exact make/model from context]", "operator": "[person]"}],
  "personnel": [{"name": "[name from context]", "role": "[role]", "licence": "[licence number if given]"}],
  "riskMatrix": {"methodology": "Likelihood(1-5) × Consequence(1-5). Levels: 1-4=LOW, 5-9=MED, 10-16=HIGH, 17-25=EXTREME"},
  "ppe": ["required items"],
  "references": ["HSWA 2015", "WorkSafe NZ", "Safe Work Australia"]
}`
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
      
      // Attempt JSON parse with aggressive cleanup for malformed responses
      let jsonStr = match[0];
      try {
        swmsData = JSON.parse(jsonStr);
      } catch (parseError) {
        // Try fixing common issues: trailing commas, single quotes, unquoted keys
        try {
          // Remove trailing commas before closing braces/brackets
          jsonStr = jsonStr.replace(/,(\s*[\]}])/g, '$1');
          // Replace single quotes with double quotes (for string values only)
          jsonStr = jsonStr.replace(/:\s*'([^']*)'/g, ': "$1"');
          swmsData = JSON.parse(jsonStr);
        } catch (e2) {
          // Last resort: return minimal valid SWMS structure
          console.error('JSON parsing failed, returning fallback structure:', parseError.message);
          swmsData = {
            document: { title: 'SWMS', swmsNumber: 'SWMS-2026-001', dateCreated: new Date().toLocaleDateString(), version: '1.0' },
            projectDetails: { siteAddress: '[Address TBC]', principalContractor: '[Contractor TBC]', subcontractor: sanitizedCompanyName },
            hazards: [{ hazard: 'General site work hazard', likelihood: 3, consequence: 3, riskScore: 9, risk: 'Medium', controlMeasures: ['Risk assessment required', 'Safety briefing required', 'Standard site induction'], residualScore: 6, residualRisk: 'Medium' }],
            personnel: [],
            plantAndEquipment: [],
            riskMatrix: { methodology: 'Likelihood(1-5) × Consequence(1-5). Levels: 1-4=LOW, 5-9=MED, 10-16=HIGH, 17-25=EXTREME' },
            ppe: ['Hard hat', 'Safety vest', 'Safety boots'],
            references: ['HSWA 2015', 'WorkSafe NZ', 'Safe Work Australia']
          };
        }
      }
      
      // Validate required fields exist
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
