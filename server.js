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
        content: `You are a senior NZ/AU construction safety professional with 20+ years experience writing high-quality, compliant SWMS documents for the building, civil and demolition industries.
Company: ${companyNameText}
Job Description: ${jobDescription}
Additional Information: ${answersText}
Rules:
- Be highly specific to the actual job. Never add generic or irrelevant hazards.
- Always apply the Hierarchy of Controls in order for every hazard: ELIMINATE → SUBSTITUTE → ISOLATE → ENGINEERING → ADMINISTRATIVE → PPE.
- Never use placeholders like [Name], [TBC], [Insert here]. Use realistic values or "As per site register" if information is missing.
- Include 6-10 material hazards relevant to this exact task.
- Work methodology must be 8-12 clear numbered steps specific to this job.
Return ONLY valid JSON. No markdown. No explanations. No extra text.
{
  "document": {
    "title": "Safe Work Method Statement",
    "swmsNumber": "SWMS-2026-001",
    "dateCreated": "[today DD/MM/YYYY]",
    "reviewDate": "[3 months from today DD/MM/YYYY]",
    "version": "1.0"
  },
  "projectDetails": {
    "siteAddress": "[from context or As per site induction]",
    "principalContractor": "[from context or As per contract documents]",
    "subcontractor": "${companyNameText}"
  },
  "taskDescription": {
    "task": "${jobDescription}",
    "locationOnSite": "[from context]",
    "estimatedDuration": "[realistic based on task]",
    "workMethodology": "1. [specific step] 2. [specific step] ... (8-12 numbered steps specific to this job)"
  },
  "highRiskCategories": ["list applicable HRCW or None identified"],
  "hazards": [
    {
      "hazard": "Specific hazard for this job",
      "likelihood": 1-5,
      "consequence": 1-5,
      "riskScore": number,
      "risk": "Low/Medium/High/Extreme",
      "controlMeasures": [
        "ELIMINATE/SUBSTITUTE: [specific control]",
        "ISOLATE/ENGINEERING: [specific control]",
        "ADMINISTRATIVE: [specific procedure or training]",
        "PPE: [specific PPE]"
      ],
      "residualScore": number,
      "residualRisk": "Low/Medium/High",
      "responsible": "Role responsible"
    }
  ],
  "plantAndEquipment": [{"item": "name", "makeModel": "from context or As per site register", "operator": "role"}],
  "personnel": [{"name": "from context", "role": "role", "licence": "if relevant"}],
  "riskMatrix": {"methodology": "Likelihood (1-5) × Consequence (1-5). 1-4=Low, 5-9=Medium, 10-16=High, 17-25=Extreme"},
  "ppe": ["specific PPE required for this job"],
  "emergencyProcedures": {
    "emergencyNumber": "111 (NZ) / 000 (AU)",
    "nearestHospital": "[from context or As per site emergency plan]",
    "hospitalAddress": "[from context or As per site emergency plan]",
    "firstAider": "[from context or As per site induction records]",
    "firstAiderContact": "[from context or As per site emergency plan]",
    "musterPoint": "[from context or As per site emergency plan]"
  },
  "references": ["relevant legislation and codes for this specific task"],
  "workerSignoff": [
    {"name": "[from context or To be completed on site]", "role": "role"}
  ]
}
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
