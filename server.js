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
        content: `You are a senior NZ/AU construction safety professional.
Site Address: ${siteAddress || "Not provided"}
Selected Plants: ${selectedPlants ? selectedPlants.join(", ") : "None"}

Return ONLY valid JSON. No other text.

{
  "document": {"title": "Safe Work Method Statement", "swmsNumber": "SWMS-2026-001", "dateCreated": "DD/MM/YYYY", "version": "1.0"},
  "projectDetails": {"siteAddress": "${siteAddress || ""}", "subcontractor": "${companyNameText || ""}"},
  "taskDescription": {"task": "${jobDescription || ""}", "workMethodology": "1. Step one 2. Step two"},
  "hazards": [],
  "plantAndEquipment": [],
  "ppe": [],
  "emergencyProcedures": {"emergencyNumber": "111 (NZ) / 000 (AU)"},
  "workerSignoff": []
}`

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
