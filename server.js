const express = require('express');
const OpenAI = require('openai');
const path = require('path');

const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

// Generate smart follow-up questions based on job description
app.post('/api/questions', async (req, res) => {
  const { jobDescription } = req.body;
  if (!jobDescription) return res.status(400).json({ error: 'Job description required' });

  try {
    const completion = await openai.chat.completions.create({
      model: 'deepseek-chat',
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
      const text = completion.choices[0].message.content.trim();
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
    const completion = await openai.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 8000,
      messages: [{
        role: 'user',
        content: `You are a senior NZ/AU construction safety professional with 20+ years experience writing high-quality, compliant SWMS documents.

**DEDICATED CONSTRUCTION KNOWLEDGE BASE** (use this for every SWMS):

**Region Detection (critical):**
- If site address contains Auckland, Wellington, Christchurch, NZ, New Zealand → use full NZ rules (HSWA 2015, WorkSafe NZ, AS/NZS standards)
- If site address contains Sydney, Melbourne, Brisbane, AU, Australia → use full AU rules (WHS Act 2011, Safe Work Australia Model Codes)

**Hierarchy of Controls (apply in exact order for every hazard):**
1. ELIMINATE — remove the hazard completely
2. SUBSTITUTE — replace with less hazardous option
3. ISOLATE — physical separation (barriers, exclusion zones)
4. ENGINEERING — physical controls (guardrails, ventilation, mechanical aids)
5. ADMINISTRATIVE — procedures, training, permits, supervision
6. PPE — last resort, task-specific

**High Risk Construction Work (HRCW) categories (AU WHS Reg 291):**
Fall >2m, tilt-up/precast, demolition, confined space, asbestos, crane/hoist, powered mobile plant, excavation >1.5m, hot works, electrical work, etc.

**Trade-Specific Knowledge (apply where relevant):**
- Formwork & falsework: collapse, fall from height, concrete pressure — use AS 3610, engineer drawings, pour rate limits, edge protection
- Precast/tilt-up: crane lift failure, panel instability, rigging failure — engineered lift plan, rated clutches, temporary bracing before hook release, exclusion zones
- Crane & lifting: load drop, overload, power line contact — lift study, licensed operator + dogman, ground assessment
- Waterproofing (Mapeproof FBT): chemical exposure, substrate preparation, full bond to concrete — follow manufacturer SDS and technical data sheets
- Excavation: trench collapse, services strike — Dial Before You Dig, shoring/battering, competent person inspection
- Working at height: fall from leading edge — perimeter scaffolding or safety mesh BEFORE access, full body harness, rescue plan

Company: ${companyNameText}
Job Description: ${jobDescription}
Additional Information: ${answersText}
Site Address: ${siteAddress || "As per site induction"}

Rules:
- Be highly specific to the actual job.
- Never use placeholders.
- Include 6-10 material hazards.
- Work methodology must be 8-12 clear numbered steps.
- Always label controls with Hierarchy level.

Return ONLY valid JSON. No markdown. No explanations.

{
  "document": { ... (same JSON structure as before) }
}
`
TASK-SPECIFIC KNOWLEDGE (apply where relevant):
FORMWORK & FALSEWORK: Key hazards — collapse during pour, fall from height, manual handling, concrete pressure, struck by falling objects. Controls — engineer-designed drawings, pour rate limits, specified stripping sequence, edge protection.
PRECAST CONCRETE INSTALLATION: Key hazards — crane lift failure, panel instability before bracing, rigging failure, panel swing. Controls — engineered lift plans, rated precast clutches, temporary bracing per engineer specs before crane hook release, exclusion zones, licensed dogman.
CRANE & LIFTING: Key hazards — load drop, crane overload, power line contact, ground bearing failure. Controls — lift study, rated rigging with current tags, licensed operator + dogman, ground assessment, exclusion zone.
Use this knowledge to make the SWMS specific and professional.`
      }]
    });

    let swmsData;
    try {
      const text = completion.choices[0].message.content.trim();
      // Log finish reason to help diagnose truncation
      console.log('AI finish reason:', completion.choices[0].finish_reason, '| output length:', text.length);
      if (completion.choices[0].finish_reason === 'length') {
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
