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

const ROLE_WORD = /operator|rigger|dogman|spotter|supervisor|manager|worker|crew|leading|foreman|first aider|crane|slinger|banksman/i;

function todayDdMmYyyy(date = new Date()) {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function sourceCorpus(ctx) {
  return [
    ctx.jobDescription,
    ctx.siteAddress,
    ctx.companyNameText,
    (ctx.selectedPlants || []).join(', '),
    ctx.extraAnswers,
  ].join('\n').toLowerCase();
}

function blankToNotProvided(value) {
  if (typeof value !== 'string') return '';
  return value.trim();
}

function isUnstated(value) {
  return !value || /^(not provided|n\/a|na|unknown|tbc|none|\[.*\])$/i.test(value);
}

function scrubUnstated(value, source) {
  const trimmed = blankToNotProvided(value);
  if (isUnstated(trimmed)) return 'Not provided';
  if (source.includes(trimmed.toLowerCase())) return trimmed;
  return 'Not provided';
}

function scrubRecordedIdentifier(value, source) {
  const trimmed = blankToNotProvided(value);
  if (isUnstated(trimmed)) return 'Not provided';
  if (source.includes(trimmed.toLowerCase())) return trimmed;
  if (/\d/.test(trimmed)) return 'Not provided';
  return trimmed;
}

function scrubPerson(value, source) {
  const trimmed = blankToNotProvided(value);
  if (isUnstated(trimmed)) return 'Not provided';
  if (source.includes(trimmed.toLowerCase())) return trimmed;
  if (!ROLE_WORD.test(trimmed)) return 'Not provided';
  const kept = trimmed.split(/\s+/).filter((token) => {
    const bare = token.replace(/[^A-Za-z'-]/g, '');
    if (!bare) return false;
    return source.includes(bare.toLowerCase()) || ROLE_WORD.test(bare);
  });
  return kept.join(' ').trim() || 'Not provided';
}

function scrubPrincipal(value, source) {
  const trimmed = blankToNotProvided(value);
  if (isUnstated(trimmed)) return 'Not provided';
  if (source.includes(trimmed.toLowerCase())) return trimmed;
  const words = trimmed.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 6);
  if (words.some((word) => source.includes(word))) return trimmed;
  return 'Not provided';
}

function isPublicEmergency(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return false;
  const rest = digits.replace(/111/g, '').replace(/000/g, '');
  return rest.length === 0 && (digits.includes('111') || digits.includes('000'));
}

function scrubPhone(value, source) {
  const trimmed = blankToNotProvided(value);
  if (isUnstated(trimmed)) return 'Not provided';
  if (source.includes(trimmed.toLowerCase())) return trimmed;
  if (isPublicEmergency(trimmed)) return trimmed;
  return 'Not provided';
}

function publicEmergencyNumber(source) {
  const nz = /\b(nz|new zealand|auckland|wellington|christchurch|hamilton|tauranga|dunedin)\b/.test(source);
  const au = /\b(australia|sydney|melbourne|brisbane|perth|adelaide)\b/.test(source);
  if (nz && !au) return '111';
  if (au && !nz) return '000';
  return '111 (NZ) / 000 (AU)';
}

function redactInventedPhones(value, source) {
  if (typeof value !== 'string') return value;
  return value.replace(/\+?\d[\d\s()-]{6,}\d/g, (match) => {
    if (source.includes(match.toLowerCase())) return match;
    if (isPublicEmergency(match)) return match;
    return 'Not provided';
  });
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function methodologyText(task) {
  const value = task.workMethodology || task.methodology || '';
  if (Array.isArray(value)) {
    return value.map((step, index) => {
      const text = typeof step === 'string' ? step : (step && (step.step || step.description)) || '';
      return `${index + 1}. ${String(text).trim()}`;
    }).filter((line) => !/^\d+\.\s*$/.test(line)).join('\n');
  }
  return String(value || '').trim();
}

// deepseek-flash copies a JSON object placed at the end of the user prompt, including empty
// arrays and placeholder steps. Describe the document in prose and reject a template reply.
function buildSwmsMessages(ctx) {
  const today = todayDdMmYyyy();
  const correction = ctx.correction
    ? 'The previous reply was rejected. It was a blank template, or it did not describe this job. Write the finished SWMS now.\n\n'
    : '';
  return [
    {
      role: 'system',
      content: `You are a senior NZ/AU construction safety professional writing a finished Safe Work Method Statement.
Return one JSON object and no other text. Do not wrap it in markdown.
Write the document for the job in the user message. Do not return a schema, a sample, or placeholders.
Every hazard, methodology step, and control must describe this job, naming the plant, loads, and heights that were supplied.
If a worker name, licence number, hospital, or phone number was not supplied, write "Not provided". Never invent them.
The only telephone number you may write without it being supplied is the public emergency number: 111 on a New Zealand site, or 000 on an Australian site.
workerSignoff must be an empty list because nobody has signed yet.`,
    },
    {
      role: 'user',
      content: `${correction}Write a complete SWMS as JSON for this job.

Site address: ${ctx.siteAddress || 'Not provided'}
Selected plant: ${ctx.selectedPlants.length ? ctx.selectedPlants.join(', ') : 'None listed separately'}
Subcontractor: ${ctx.companyNameText}
dateCreated: ${today}

Job description:
${ctx.jobDescription}

Additional information (when an answer is "Not provided", that fact is unknown):
${ctx.extraAnswers}

Required content:
- document.title is "Safe Work Method Statement". document.swmsNumber is "SWMS-${today.slice(-4)}-001". document.dateCreated is ${today}. document.version is "1.0".
- projectDetails.siteAddress, principalContractor, and subcontractor come from the job. Use "Not provided" when a value was not given. subcontractor is "${ctx.companyNameText}".
- taskDescription.task states the actual task. taskDescription.location and duration use the job, or "Not provided".
- taskDescription.workMethodology is a numbered sequence of at least six steps for how THIS task is done, in order. Name the plant, the load, and the work height where the job gives them. Do not use placeholder step labels.
- highRiskCategories lists the high-risk construction work categories that apply to this job.
- hazards has 6 to 10 objects. Cover the high-risk work this job actually involves. Crane or lifting work must include a dropped-load hazard and a crane stability or exclusion-zone hazard. Work above ground must include a fall from height, using the stated height. Each object has hazard, likelihood (1-5), consequence (1-5), riskScore (likelihood times consequence), risk and residualRisk (Low, Medium, High, or Extreme), controlMeasures (practical controls for this job), residualScore, and responsiblePerson (a role, never an invented person's name).
- plantAndEquipment lists the plant named in the job. makeModel only when it was stated, otherwise "Not provided". operator is the role when no person's name was given. rego and inspectionDate are "Not provided" unless stated.
- personnel lists the roles named in the job. name and licenceNumber are "Not provided" unless a real name or licence was supplied.
- ppe lists the PPE this task requires.
- emergencyProcedures.emergencyPhone is 111 for New Zealand or 000 for Australia. nearestHospital, hospitalAddress, firstAider, and firstAiderContact are "Not provided" unless supplied. musterPoint is "Not provided" unless supplied.
- riskMatrix.methodology explains likelihood 1-5 times consequence 1-5, with 1-4 Low, 5-9 Medium, 10-16 High, and 17-25 Extreme.
- references include the Health and Safety at Work Act 2015 and the WorkSafe NZ or Safe Work Australia guidance that applies.
- workerSignoff is empty.

An empty hazards list, or a methodology that does not describe this job, is an invalid reply. Populate those fields from the job before you stop.`,
    },
  ];
}

function looksLikeUnfinishedSwms(swms) {
  if (!swms || typeof swms !== 'object') return true;
  const methodology = methodologyText(swms.taskDescription || {});
  const hazards = Array.isArray(swms.hazards) ? swms.hazards : [];
  const namedHazards = hazards.filter((hazard) => String(hazard && hazard.hazard || '').trim());
  const copiedSteps = /step one/i.test(methodology) && /step two/i.test(methodology) && methodology.length < 160;
  const thinMethod = methodology.length < 80;
  const genericOnly = namedHazards.length === 1
    && /general site work hazard/i.test(String(namedHazards[0].hazard || ''));
  return copiedSteps || thinMethod || namedHazards.length === 0 || genericOnly;
}

function groundSwms(swms, ctx) {
  const source = sourceCorpus(ctx);
  const document = asObject(swms.document);
  document.title = blankToNotProvided(document.title) || 'Safe Work Method Statement';
  document.swmsNumber = blankToNotProvided(document.swmsNumber) || `SWMS-${todayDdMmYyyy().slice(-4)}-001`;
  document.dateCreated = todayDdMmYyyy();
  document.version = blankToNotProvided(document.version) || '1.0';
  swms.document = document;

  const project = asObject(swms.projectDetails);
  project.siteAddress = ctx.siteAddress || scrubUnstated(project.siteAddress, source);
  project.principalContractor = scrubPrincipal(project.principalContractor, source);
  project.subcontractor = ctx.companyNameText || scrubUnstated(project.subcontractor, source);
  swms.projectDetails = project;

  const task = asObject(swms.taskDescription);
  task.workMethodology = redactInventedPhones(methodologyText(task), source);
  if (!blankToNotProvided(task.task)) task.task = ctx.jobDescription;
  swms.taskDescription = task;

  swms.hazards = (Array.isArray(swms.hazards) ? swms.hazards : [])
    .filter((hazard) => hazard && typeof hazard === 'object' && String(hazard.hazard || '').trim())
    .map((hazard) => ({
      ...hazard,
      hazard: redactInventedPhones(String(hazard.hazard), source),
      responsiblePerson: scrubPerson(hazard.responsiblePerson, source),
      controlMeasures: (Array.isArray(hazard.controlMeasures)
        ? hazard.controlMeasures
        : (hazard.controlMeasures ? [hazard.controlMeasures] : [])
      ).map((control) => redactInventedPhones(String(control), source)),
    }));

  swms.plantAndEquipment = (Array.isArray(swms.plantAndEquipment) ? swms.plantAndEquipment : [])
    .filter((item) => item && typeof item === 'object')
    .map((item) => ({
      ...item,
      operator: scrubPerson(item.operator, source),
      rego: scrubRecordedIdentifier(item.rego, source),
      inspectionDate: scrubRecordedIdentifier(item.inspectionDate, source),
    }));

  swms.personnel = (Array.isArray(swms.personnel) ? swms.personnel : [])
    .filter((person) => person && typeof person === 'object')
    .map((person) => {
      const licence = scrubUnstated(person.licenceNumber || person.licence, source);
      return {
        ...person,
        name: scrubPerson(person.name, source),
        licence,
        licenceNumber: licence,
      };
    });

  if (Array.isArray(swms.ppe)) {
    swms.ppe = swms.ppe.map((item) => (typeof item === 'string' ? item : String(item && (item.item || item.name) || ''))).filter(Boolean);
  } else {
    swms.ppe = [];
  }

  const emergency = asObject(swms.emergencyProcedures);
  const suppliedPhone = scrubPhone(emergency.emergencyPhone || emergency.emergencyNumber, source);
  const phoneWasSupplied = suppliedPhone !== 'Not provided' && source.includes(suppliedPhone.toLowerCase());
  emergency.emergencyPhone = phoneWasSupplied ? suppliedPhone : publicEmergencyNumber(source);
  emergency.emergencyNumber = emergency.emergencyPhone;
  emergency.nearestHospital = scrubUnstated(emergency.nearestHospital, source);
  emergency.hospitalAddress = scrubUnstated(emergency.hospitalAddress, source);
  emergency.firstAider = scrubPerson(emergency.firstAider, source);
  const contact = scrubPhone(emergency.firstAiderContact, source);
  emergency.firstAiderContact = contact !== 'Not provided' && source.includes(contact.toLowerCase())
    ? contact
    : 'Not provided';
  emergency.musterPoint = scrubUnstated(emergency.musterPoint, source);
  swms.emergencyProcedures = emergency;

  swms.workerSignoff = [];
  return swms;
}

function fallbackSwms(ctx) {
  return {
    document: { title: 'SWMS', swmsNumber: 'SWMS-2026-001', dateCreated: todayDdMmYyyy(), version: '1.0' },
    projectDetails: {
      siteAddress: ctx.siteAddress || '[Address TBC]',
      principalContractor: '[Contractor TBC]',
      subcontractor: ctx.companyNameText,
    },
    hazards: [{
      hazard: 'General site work hazard',
      likelihood: 3,
      consequence: 3,
      riskScore: 9,
      risk: 'Medium',
      controlMeasures: ['Risk assessment required', 'Safety briefing required', 'Standard site induction'],
      residualScore: 6,
      residualRisk: 'Medium',
    }],
    personnel: [],
    plantAndEquipment: [],
    riskMatrix: { methodology: 'Likelihood(1-5) × Consequence(1-5). Levels: 1-4=LOW, 5-9=MED, 10-16=HIGH, 17-25=EXTREME' },
    ppe: ['Hard hat', 'Safety vest', 'Safety boots'],
    references: ['HSWA 2015', 'WorkSafe NZ', 'Safe Work Australia'],
  };
}

function parseSwmsText(text) {
  const match = String(text || '').match(/\{[\s\S]*\}/);
  if (!match) return { ok: false, error: 'No JSON object found' };
  let jsonStr = match[0];
  try {
    return { ok: true, swms: JSON.parse(jsonStr) };
  } catch (parseError) {
    try {
      jsonStr = jsonStr.replace(/,(\s*[\]}])/g, '$1');
      jsonStr = jsonStr.replace(/:\s*'([^']*)'/g, ': "$1"');
      return { ok: true, swms: JSON.parse(jsonStr) };
    } catch (e2) {
      return { ok: false, error: parseError.message };
    }
  }
}

function readCompletion(completion) {
  const choice = completion.choices && completion.choices[0];
  const text = choice && choice.message && choice.message.content ? choice.message.content.trim() : '';
  const finish = choice ? choice.finish_reason : 'missing';
  console.log('AI finish reason:', finish, '| output length:', text.length);
  if (finish === 'length') {
    console.error('WARNING: AI response was truncated — increase max_tokens or shorten prompt');
  }
  const parsed = parseSwmsText(text);
  if (!parsed.ok) {
    console.error('No usable SWMS JSON. First 500 chars:', text.substring(0, 500));
  }
  return parsed;
}

async function createSwms(ctx) {
  const first = readCompletion(await complete(buildSwmsMessages(ctx), 8000));
  let parsed = first.ok
    ? { ok: true, swms: groundSwms(first.swms, ctx) }
    : first;
  if (!parsed.ok || looksLikeUnfinishedSwms(parsed.swms)) {
    console.error(parsed.ok
      ? 'SWMS response was an empty template; retrying once'
      : 'SWMS response was not usable JSON; retrying once');
    const second = readCompletion(await complete(buildSwmsMessages({ ...ctx, correction: true }), 8000));
    parsed = second.ok
      ? { ok: true, swms: groundSwms(second.swms, ctx) }
      : second;
  }
  if (!parsed.ok) {
    console.error('JSON parsing failed, returning fallback structure:', parsed.error);
    return { swms: fallbackSwms(ctx), unfinished: false };
  }
  const unfinished = looksLikeUnfinishedSwms(parsed.swms);
  if (!unfinished) {
    const methodology = methodologyText(parsed.swms.taskDescription || {});
    console.log('SWMS hazards:', parsed.swms.hazards.length, '| methodology chars:', methodology.length);
  }
  return { swms: parsed.swms, unfinished };
}

// Generate the full SWMS document
app.post('/api/generate-swms', async (req, res) => {
  const body = req.body || {};
  const jobDescription = textField(body.jobDescription, 5000);
  if (!jobDescription) {
    return res.status(400).json({ error: 'Job description required and must be non-empty' });
  }

  const siteAddress = textField(body.siteAddress, 500);
  const selectedPlants = plantList(body.selectedPlants);
  const companyNameText = textField(body.companyName, 200) || '[Company Name]';
  const ctx = {
    jobDescription,
    siteAddress,
    selectedPlants,
    companyNameText,
    extraAnswers: answersText(body.answers),
    correction: false,
  };

  try {
    const result = await createSwms(ctx);
    if (result.unfinished) {
      console.error('SWMS generation returned an unfinished template');
      return res.status(500).json({ error: 'SWMS generation returned an unfinished template' });
    }
    res.json({ swms: result.swms });
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

if (require.main === module) {
  const PORT = process.env.PORT || 3849;
  app.listen(PORT, () => {
    console.log(`SiteReady server running on http://localhost:${PORT}`);
  });
}

module.exports = {
  app,
  buildSwmsMessages,
  looksLikeUnfinishedSwms,
  groundSwms,
  publicEmergencyNumber,
};
