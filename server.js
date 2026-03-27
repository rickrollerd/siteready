const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const OpenAI = require('openai');
const path = require('path');
require('dotenv').config();

const app = express();

// ===================== SECURITY MIDDLEWARE =====================

// Security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https://api.deepseek.com"]
    }
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  }
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://siteready.nz', 'https://www.siteready.nz']
    : ['http://localhost:3849', 'http://localhost:3000', 'http://localhost:8080'],
  credentials: true,
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

// Rate limiting - 100 requests per 15 minutes per IP
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: { error: 'Too many requests from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use('/api/', limiter);

// Body parsing with reasonable limits
app.use(express.json({ limit: '1mb' })); // Reduced from 10mb to prevent DoS
app.get('/privacy', (req, res) => res.sendFile(path.join(__dirname, 'public', 'privacy.html')));
app.use(express.static(path.join(__dirname, 'public')));

// Basic API key validation (can be enhanced for production)
app.use('/api/', (req, res, next) => {
  // For now, just log API usage
  console.log(`[API] ${req.method} ${req.path} from ${req.ip} at ${new Date().toISOString()}`);
  
  // In production, you might want to add API key validation here
  // const apiKey = req.headers['x-api-key'];
  // if (!apiKey || apiKey !== process.env.API_KEY) {
  //   return res.status(401).json({ error: 'Unauthorized' });
  // }
  
  next();
});

// ===================== AI CLIENT SETUP =====================

const openai = new OpenAI({
  apiKey: process.env.DEEPSEEK_API_KEY || process.env.OPENAI_API_KEY,
  baseURL: 'https://api.deepseek.com',
});

// ===================== INPUT VALIDATION =====================

function sanitizeInput(input, maxLength = 5000) {
  if (typeof input !== 'string') return '';
  // Trim and limit length
  let sanitized = input.trim().substring(0, maxLength);
  // Remove potentially dangerous characters (basic XSS prevention)
  sanitized = sanitized.replace(/[<>]/g, '');
  return sanitized;
}

function validateJobDescription(jobDescription) {
  if (!jobDescription || typeof jobDescription !== 'string') {
    return { valid: false, error: 'Job description must be a non-empty string' };
  }
  
  const sanitized = sanitizeInput(jobDescription, 5000);
  if (sanitized.length < 10) {
    return { valid: false, error: 'Job description must be at least 10 characters' };
  }
  
  if (sanitized.length > 5000) {
    return { valid: false, error: 'Job description must not exceed 5000 characters' };
  }
  
  return { valid: true, sanitized };
}

function validateAnswers(answers) {
  if (!answers || !Array.isArray(answers)) {
    return { valid: true, sanitized: [] }; // Answers are optional
  }
  
  const sanitized = answers
    .filter(a => a && typeof a === 'object' && a.question && a.answer)
    .map(a => ({
      question: sanitizeInput(a.question, 500),
      answer: sanitizeInput(a.answer, 500)
    }))
    .slice(0, 20); // Limit to 20 Q&A pairs
  
  return { valid: true, sanitized };
}

function validateCompanyName(companyName) {
  if (!companyName || typeof companyName !== 'string') {
    return { valid: true, sanitized: '[Company Name]' }; // Default value
  }
  
  const sanitized = sanitizeInput(companyName, 200);
  return { valid: true, sanitized };
}

// ===================== API ENDPOINTS =====================

// Generate smart follow-up questions based on job description
app.post('/api/questions', async (req, res) => {
  const { jobDescription } = req.body;
  
  // Validate input
  const validation = validateJobDescription(jobDescription);
  if (!validation.valid) {
    return res.status(400).json({ error: validation.error });
  }
  
  const sanitizedJobDesc = validation.sanitized;

  try {
    const completion = await openai.chat.completions.create({
      model: 'deepseek-chat',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `You are a construction safety expert helping generate a SWMS (Safe Work Method Statement) for a NZ/AU construction site.

A worker described their job as:
"${sanitizedJobDesc}"

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
  
  // Validate all inputs
  const jobValidation = validateJobDescription(jobDescription);
  if (!jobValidation.valid) {
    return res.status(400).json({ error: jobValidation.error });
  }
  
  const answersValidation = validateAnswers(answers);
  if (!answersValidation.valid) {
    return res.status(400).json({ error: answersValidation.error });
  }
  
  const companyValidation = validateCompanyName(companyName);
  if (!companyValidation.valid) {
    return res.status(400).json({ error: companyValidation.error });
  }
  
  const sanitizedJobDesc = jobValidation.sanitized;
  const sanitizedAnswers = answersValidation.sanitized;
  const companyNameText = companyValidation.sanitized;
  
  // Format answers text
  const answersText = sanitizedAnswers.length > 0
    ? sanitizedAnswers
        .map((a, i) => `Q${i+1}: ${a.question}\nA${i+1}: ${a.answer}`)
        .join('\n\n')
    : 'No additional information provided.';

  try {
    const completion = await openai.chat.completions.create({
      model: 'deepseek-chat',
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
    // Don't expose internal error details in production
    const errorMessage = process.env.NODE_ENV === 'production'
      ? 'An error occurred while generating the SWMS. Please try again.'
      : error.message;
    res.status(500).json({ error: errorMessage });
  }
});

// ===================== ERROR HANDLING MIDDLEWARE =====================

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  
  // Don't expose stack traces in production
  const errorResponse = {
    error: process.env.NODE_ENV === 'production'
      ? 'An internal server error occurred'
      : err.message
  };
  
  // Add stack trace in development
  if (process.env.NODE_ENV !== 'production') {
    errorResponse.stack = err.stack;
  }
  
  res.status(err.status || 500).json(errorResponse);
});

// Prevent uncaught errors from crashing the server
process.on('uncaughtException', (err) => {
  console.error('Uncaught exception (server kept alive):', err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('Unhandled rejection (server kept alive):', reason);
});

// ===================== SERVER START =====================

const PORT = process.env.PORT || 3849;
app.listen(PORT, () => {
  console.log(`SiteReady server running on http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Security: Rate limiting enabled (100 requests/15min per IP)`);
  console.log(`Security: CORS configured for ${process.env.NODE_ENV === 'production' ? 'production origins' : 'development origins'}`);
});
