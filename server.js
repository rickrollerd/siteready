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
  // Questions often name hospitals or licences as examples. Only the job and the
  // answers count as facts that were actually supplied.
  const answerLines = String(ctx.extraAnswers || '')
    .split('\n')
    .filter((line) => /^A\d+:/i.test(line))
    .map((line) => line.replace(/^A\d+:\s*/i, ''));
  return [
    ctx.jobDescription,
    ctx.siteAddress,
    (ctx.selectedPlants || []).join(', '),
    answerLines.join('\n'),
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
  const words = trimmed.toLowerCase().split(/[^a-z0-9]+/).filter((word) => word.length >= 4);
  if (words.length && words.every((word) => source.includes(word))) return trimmed;
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

function stripStepNumber(text) {
  return String(text || '').replace(/^\s*(?:\d+\s*[.)]\s*)+/, '').trim();
}

function stepBody(step) {
  if (typeof step === 'string') return step;
  if (step && typeof step === 'object') {
    const text = step.step || step.description || step.text || step.action || step.task || '';
    return typeof text === 'string' ? text : '';
  }
  return '';
}

function methodologyText(task) {
  const value = task.workMethodology || task.methodology || '';
  const lines = Array.isArray(value) ? value.map(stepBody) : String(value || '').split('\n');
  return lines.map((line) => stripStepNumber(line)).filter(Boolean).join('\n');
}

function citationText(item) {
  if (typeof item === 'string') {
    const text = item.trim();
    return text && !/\[object Object\]/.test(text) ? text : '';
  }
  if (!item || typeof item !== 'object') return '';
  const parts = ['citation', 'title', 'name', 'reference', 'text', 'source', 'document']
    .map((key) => item[key])
    .filter((part) => typeof part === 'string')
    .map((part) => part.trim())
    .filter((part) => part && !/\[object Object\]/.test(part));
  return parts.join('. ');
}

function stripAddedFacts(text, source) {
  if (typeof text !== 'string' || !text) return text;
  let out = text;
  if (!/\bmobile\b/.test(source)) {
    out = out.replace(/\bmobile\s+crane\s+dynamic\s+factor\b/gi, 'MOBILECRANEDYNAMICFACTOR');
    out = out.replace(/(\d+\s*t(?:onne)?s?\s+liebherr)\s+mobile\s+crane\b/gi, '$1');
    out = out.replace(/\bliebherr\s+mobile\s+crane\b/gi, 'Liebherr');
    out = out.replace(/\bmobile\s+crane\b/gi, 'crane');
    out = out.replace(/MOBILECRANEDYNAMICFACTOR/g, 'mobile crane dynamic factor');
  }
  if (!/self-?\s*propelled/.test(source)) out = out.replace(/\bself-?\s*propelled\b/gi, '');
  if (!/\bcommercial\b/.test(source)) out = out.replace(/\bcommercial\b/gi, '');
  if (!/\btomorrow\b/.test(source)) out = out.replace(/\btomorrow\b/gi, '');
  return out.replace(/\s{2,}/g, ' ').replace(/\s+([,.;])/g, '$1').replace(/,\s*(?=,|$)/g, '').trim();
}

function stripInjectedWords(text, jobText) {
  if (typeof text !== 'string' || !text) return text;
  const job = String(jobText || '').toLowerCase();
  const trimmed = text.trim().toLowerCase();
  if (trimmed && job.includes(trimmed)) return text;
  return text
    .replace(/\btomorrow\b/gi, '')
    .replace(/\bcommercial\b/gi, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/\s+([,.;])/g, '$1')
    .replace(/,\s*(?=,|$)/g, '')
    .trim();
}

function statedPrincipal(job) {
  const text = String(job || '');
  const labelled = text.match(/principal contractor(?:\s+is|:)?\s+([^.\n]+)/i);
  if (labelled) return labelled[1].trim().replace(/[.,;]+$/, '');
  const asPrincipal = text.match(/\b([A-Z][\w'&.-]*(?:\s+[A-Z][\w'&.-]*)*)\s+as principal\b/);
  if (asPrincipal) return asPrincipal[1].trim();
  return '';
}

function explicitSubcontractor(ctx) {
  const answers = String(ctx.extraAnswers || '')
    .split('\n')
    .filter((line) => /^A\d+:/i.test(line))
    .map((line) => line.replace(/^A\d+:\s*/i, ''))
    .join('\n');
  const match = `${ctx.jobDescription || ''}\n${answers}`.match(/subcontractor(?:\s+is|:)\s+([^.\n]+)/i);
  return match ? match[1].trim().replace(/[.,;]+$/, '') : '';
}

function namesMatch(left, right) {
  const norm = (value) => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const a = norm(left);
  const b = norm(right);
  if (!a || !b || a === 'not provided' || b === 'not provided') return false;
  return a === b || a.includes(b) || b.includes(a);
}

function plantOperator(value, source) {
  const cleaned = String(value || '')
    .replace(/[()[\]]/g, ' ')
    .replace(/\bnot provided\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned || isUnstated(cleaned)) return 'Not provided';
  if (!source.includes(cleaned.toLowerCase())) return 'Not provided';
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.every((word) => ROLE_WORD.test(word.replace(/[^A-Za-z'-]/g, '')))) return 'Not provided';
  return cleaned;
}

function jobProfile(ctx) {
  const source = sourceCorpus(ctx);
  const nz = /\b(nz|new zealand|auckland|wellington|christchurch|hamilton|tauranga|dunedin)\b/.test(source);
  const au = /\b(australia|sydney|melbourne|brisbane|perth|adelaide)\b/.test(source);
  const panelWeight = panelWeightTonnes(source);
  const panelCount = statedPanelCount(source);
  const craneClass = craneClassTonnes(source);
  const heightM = statedHeightMetres(source);
  const riggersOnGround = /\briggers?\b/.test(source) && /\bon the ground\b|\bon ground\b/.test(source);
  const operatorInCab = /\boperator\b/.test(source) && /\bin the cab\b|\bin cab\b/.test(source);
  const peopleAtHeightStated = /\b(ewp|mewp|scaffold|boom lift|scissor lift|connector|harness)\b/.test(source);
  return {
    source,
    nz: nz && !au,
    au: au && !nz,
    crane: /\b(crane|liebherr)\b/.test(source),
    panel: /\bpanels?\b/.test(source),
    panelWeight,
    panelCount,
    craneClass,
    heightM,
    riggersOnGround,
    operatorInCab,
    onlyGroundAndCab: riggersOnGround && operatorInCab && !peopleAtHeightStated,
    qualificationsSupplied: qualificationsWereSupplied(source),
    jobText: String(ctx.jobDescription || ''),
    answerText: suppliedAnswerText(ctx),
    plantPhrase: statedPlantPhrase(ctx),
  };
}

function suppliedAnswerText(ctx) {
  return String(ctx.extraAnswers || '')
    .split('\n')
    .filter((line) => /^A\d+:/i.test(line))
    .map((line) => line.replace(/^A\d+:\s*/i, '').trim())
    .filter((line) => line && !isUnstated(line))
    .join('\n');
}

function panelWeightTonnes(source) {
  const patterns = [
    /\b(\d+(?:\.\d+)?)\s*t(?:onne)?s?\s+panels?\b/,
    /\bpanels?\s+(?:are|of|at|weigh(?:ing)?)\s+(\d+(?:\.\d+)?)\s*t(?:onne)?s?\b/,
    /\b(\d+(?:\.\d+)?)\s*t(?:onne)?s?\s+each\b/,
  ];
  for (const pattern of patterns) {
    const match = source.match(pattern);
    if (match) return match[1];
  }
  return null;
}

function statedPanelCount(source) {
  if (/\b(two|2)\b[^.]{0,40}\bpanels?\b/.test(source) || /\bpanels?\b[^.]{0,40}\b(two|2)\b/.test(source)) {
    return 2;
  }
  const match = source.match(/\b(\d+)\s+panels?\b/);
  return match ? Number(match[1]) : null;
}

function craneClassTonnes(source) {
  const match = source.match(/\b(\d+(?:\.\d+)?)\s*t(?:onne)?s?\s+(?:[a-z0-9]+\s+){0,2}(?:crane|liebherr)\b/);
  return match ? match[1] : null;
}

function statedHeightMetres(source) {
  const match = source.match(/\b(\d+(?:\.\d+)?)\s*m(?:etre|eter)?s?\b/);
  return match ? match[1] : null;
}

function qualificationsWereSupplied(source) {
  if (/\b(3795|3789)\b/.test(source)) return true;
  const match = source.match(/\blicen[cs]e(?:\s+(?:number|no\.?))?\s*[:#]?\s*([a-z0-9-]{4,})/i);
  if (!match) return false;
  return !/^not/.test(match[1]) && !/^provided$/.test(match[1]) && !/^number/.test(match[1]);
}

function isPlaceholderMethod(text) {
  const methodology = String(text || '').trim();
  const copiedSteps = /step one/i.test(methodology) && /step two/i.test(methodology) && methodology.length < 160;
  return !methodology || methodology.length < 80 || copiedSteps;
}

function stripAuEmergency(text) {
  return String(text || '')
    .replace(/\s*\/\s*000(?:\s*\(AU\))?/gi, '')
    .replace(/\b000\s*\(AU\)/gi, '')
    .replace(/\b(?:call|dial|phone)\s+000\b/gi, 'call 111')
    .replace(/\(\s*NZ\s*\)/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function replaceInventedNames(line, source) {
  return line.replace(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)+\b/g, (name) => {
    if (source.includes(name.toLowerCase())) return name;
    if (/^(New Zealand|Safe Work(?: Australia)?|Unit Standards?)$/.test(name)) return name;
    return 'Not provided';
  });
}

function assertsWindStop(line, source) {
  const match = line.match(/(\d+(?:\.\d+)?)\s*(km\/h|kmh|m\/s|knots)\b/i);
  if (!match) return false;
  return !source.includes(match[0].toLowerCase());
}

function assertsInventedRadius(line) {
  if (/\b(no radius|radius (?:was|is) not|without a radius|radius was not given|no working radius|not this job|general guidance|none was given)\b/i.test(line)) {
    return false;
  }
  const metresNearRadius = /\bradius\b[^.]{0,40}\d|\d[^.]{0,40}\bradius\b/i.test(line)
    && /\d+(?:\.\d+)?\s*m(?:etre|eter)?s?\b/i.test(line);
  return metresNearRadius;
}

function assertsChartValue(line) {
  if (/\b(no (?:crane |load |rating )?chart|chart (?:was|is) not|do not invent a chart|not provided)\b/i.test(line)) {
    return false;
  }
  if (/\brating sheets?\b/i.test(line) && !/\b\d+(?:\.\d+)?\s*t(?:onne)?s?\b/i.test(line)) return false;
  if (!/\b(?:load|rating|crane) charts?\b/i.test(line)) return false;
  return /\d/.test(line);
}

function assertsCombinedPick(line, profile) {
  if (!profile.panelWeight || !profile.panelCount) return false;
  if (/\b(not added|do not add|don't add|not one combined|separate lifts)\b/i.test(line)) return false;
  const combined = String(Number(profile.panelWeight) * Number(profile.panelCount));
  const combinedWeight = new RegExp(`\\b${combined}\\s*t(?:onne)?s?\\b`, 'i');
  if (combinedWeight.test(line)) return true;
  return /\b(both panels (?:together|at once|in one)|single pick of both|one pick of both)\b/i.test(line);
}

function assertsLinePresence(line) {
  if (/\b(not provided|not known|unknown|do not assume|whether any|look for|checked for|check the swing|swing area|required check|not a finding)\b/i.test(line)) {
    return false;
  }
  return /\b(no overhead|no power lines|no underground|without overhead|lines are present|lines are absent|services are present|underground services are|power lines (?:cross|run|exist)|overhead lines (?:cross|run|exist)|there are (?:no )?(?:power |overhead |underground )?lines|there are underground)\b/i.test(line);
}

function assertsBraceAngle(line) {
  if (/\b(not given|not provided|do not invent|was not)\b/i.test(line)) return false;
  return /\bbrace\b/i.test(line) && /\b\d+(?:\.\d+)?\s*(?:degrees|°)\b/i.test(line);
}

function assertsJobUsesOptionalPlant(line) {
  if (/\b(do not|not said|not given|if a strongback|was not|leave it blank|is not said)\b/i.test(line)) return false;
  return /\b(strongback|tailing crane)\b/i.test(line);
}

function assertsRoadInsideZone(line) {
  if (/\b(check is required|do not say|not known|not provided|whether)\b/i.test(line)) return false;
  return /\b(road|footpath)\b/i.test(line) && /\b(inside|within|in) the (?:exclusion )?zone\b/i.test(line);
}

function assertsNoticeDecided(line) {
  if (/\b(do not decide|not decided|unknown|not known|check is required|do not tick|not shown)\b/i.test(line)) return false;
  if (/\bnotice (?:has been|was) (?:given|sent|done|lodged|ticked)\b/i.test(line)) return true;
  if (/\b(?:24-hour|24 hour) notice\b/i.test(line) && /\b(done|given|sent|lodged|complete|yes)\b/i.test(line)) return true;
  if (!/\b(notifiable|reg(?:ulation)?\s*26)\b/i.test(line)) return false;
  return /\b(is notifiable|is not notifiable|no notice is required|notice is required)\b/i.test(line);
}

function assertsSelfPropelledDecided(line) {
  if (/\b(not shown|not known|do not decide|unknown)\b/i.test(line)) return false;
  return /\bself-propelled\b/i.test(line);
}

function assertsFallDistanceDecided(line) {
  if (/\b(not stated|not shown|was not stated|missing|do not|check is required|nobody|no one|not named)\b/i.test(line)) return false;
  if (/\bvertical distance\b/i.test(line) && /\d/.test(line)) return true;
  return /\b(?:fall(?:s|ing)?|able to fall)\b/i.test(line) && /\b(?:5|12)\s*m/.test(line);
}

function assertsPanelWll(line) {
  if (/\b(not this panel|guidance|recommended factor|a competent person calculates|factor \d)\b/i.test(line)) return false;
  return /\bworking load limit\b/i.test(line) && /\b\d+(?:\.\d+)?\s*t(?:onne)?s?\b/i.test(line);
}

function claimsNsw(line) {
  return /\b(NSW|New South Wales)\b/.test(line) && !/\b(do not|not applied|does not|are not)\b/i.test(line);
}

function assertsBearing(line, source) {
  if (/\b(not provided|do not invent|was not provided)\b/i.test(line)) return false;
  if (/\bground bearing\b/i.test(line) && !source.includes('ground bearing')) return true;
  return /\b\d+(?:\.\d+)?\s*kpa\b/i.test(line) && !source.includes('kpa');
}

function claimsSwmsRequired(line) {
  if (!/\bswms\b/i.test(line) || !/\brequired\b/i.test(line)) return false;
  return !/\b(not required|does not claim|do not claim|not claim)\b/i.test(line);
}

function claimsAuHrcw(line) {
  return /\bhigh[-\s]?risk construction work\b/i.test(line)
    && !/\b(not applied|does not use|do not copy|not use)\b/i.test(line);
}

function inventedTerm(line, source, pattern) {
  const match = line.match(pattern);
  if (!match) return false;
  return !source.includes(match[0].toLowerCase());
}

function shouldDropLine(line, source, profile) {
  if (assertsWindStop(line, source)) return true;
  if (assertsInventedRadius(line)) return true;
  if (assertsChartValue(line)) return true;
  if (assertsCombinedPick(line, profile)) return true;
  if (assertsLinePresence(line)) return true;
  if (assertsBearing(line, source)) return true;
  if (assertsBraceAngle(line)) return true;
  if (assertsJobUsesOptionalPlant(line)) return true;
  if (assertsRoadInsideZone(line)) return true;
  if (assertsNoticeDecided(line)) return true;
  if (assertsSelfPropelledDecided(line)) return true;
  if (assertsFallDistanceDecided(line)) return true;
  if (assertsPanelWll(line)) return true;
  if (profile.nz && claimsNsw(line)) return true;
  if (profile.nz && claimsSwmsRequired(line)) return true;
  if (profile.nz && claimsAuHrcw(line)) return true;

  const denial = /\b(not provided|not known|unknown|do not|don't|is not part|are not part|not decided|not confirmed|not held|no precast-erection|was not provided|were not provided|not stated|not a procedure|not the allowable|no numeric|no radius|no crane chart|no hospital|no connector|no ewp|no scaffold)\b/i.test(line);
  if (denial) return false;

  if (inventedTerm(line, source, /\b(ewp|mewp|boom lift|scissor lift|cherry picker|scaffold(?:ing)?)\b/i)) return true;
  if (inventedTerm(line, source, /\bconnectors?\b/i)) return true;
  if (inventedTerm(line, source, /\b(weld(?:ing|ed|s)?|grout(?:ing|ed)?|starter bars?|propping|temporary brac(?:e|ing)|dowels?|shim packs?)\b/i)) return true;
  if (inventedTerm(line, source, /\b(swift\s?lift|lifting anchors?|cast-?in anchors?|anchor capacit|reid anchors?)\b/i)) return true;
  if (/\bhospital\b/i.test(line)) return true;
  if (profile.onlyGroundAndCab && inventedTerm(line, source, /\b(harness|lanyard|fall arrest)\b/i)) return true;
  return false;
}

function cleanProse(text, source, profile) {
  const kept = [];
  for (const line of String(text || '').split('\n')) {
    const parts = [];
    for (let part of line.split(/(?<=\.)\s+/)) {
      part = replaceInventedNames(part, source);
      part = redactInventedPhones(part, source);
      if (profile.nz) part = stripAuEmergency(part);
      part = stripAddedFacts(part, source);
      part = stripInjectedWords(part, profile.jobText || '');
      if (!part.trim() || /^\d+$/.test(part.trim()) || shouldDropLine(part, source, profile)) continue;
      parts.push(part.trim());
    }
    if (parts.length) kept.push(parts.join(' '));
  }
  return kept.join('\n').trim();
}

function sentenceIsOnlyUnknown(sentence) {
  const text = sentence.trim();
  if (!text) return true;
  if (/\b(do not add|stop the lift|keep at least|free-fall|freefall)\b/i.test(text)) return false;
  const unknown = /\b(not provided|not given|were not supplied|was not supplied|was not stated|were not stated|none was given|not decided|do not decide|do not tick|do not invent|not shown|no hospital|no (?:site )?wind|no bearing|no radius|leave (?:it|them) blank|three facts are missing)\b/i.test(text);
  return unknown;
}

function sentenceIsGuideRepeat(sentence) {
  const text = sentence.toLowerCase();
  if (/october 2018/.test(text) && /factor/.test(text)) return true;
  if (/anchors 3\.0 general/.test(text) || /dynamic factor 1\.0/.test(text)) return true;
  if (/three facts are missing/.test(text)) return true;
  if (/unit standards 3795/.test(text) && /not supplied|not provided/.test(text)) return true;
  if (/those roles are required and were not supplied/.test(text)) return true;
  return false;
}

function briefableLine(line) {
  const sentences = stripStepNumber(line)
    .split(/(?<=\.)\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !/^\d+$/.test(sentence))
    .filter((sentence) => !sentenceIsOnlyUnknown(sentence) && !sentenceIsGuideRepeat(sentence));
  return sentences.join(' ').trim();
}

function joinList(items) {
  if (items.length <= 1) return items[0] || '';
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

function statedPlantPhrase(ctx) {
  const job = String(ctx.jobDescription || '');
  const match = job.match(/\b\d+(?:\.\d+)?\s*T(?:onne)?s?\s+Liebherr\b/);
  if (match) return match[0];
  const sent = (ctx.selectedPlants || []).map((item) => String(item || '').trim()).find(Boolean);
  return sent || '';
}

function packFlags(profile) {
  const source = profile.source || '';
  return {
    erectionDesign: /\berection design\b/.test(source),
    centreOfGravity: /\b(?:centre|center) of gravity\b/.test(source),
    chart: /\bchart\b/.test(source),
    radius: /\bradius\b/.test(source),
    braceArrangement: /\bbrace arrangement\b/.test(source),
  };
}

function packComplete(flags) {
  return flags.erectionDesign && flags.centreOfGravity && flags.chart && flags.radius && flags.braceArrangement;
}

function packHold(profile) {
  const flags = packFlags(profile);
  const items = [];
  if (profile.panel && !flags.erectionDesign) items.push('the erection design');
  if (!flags.centreOfGravity) items.push('the centre of gravity');
  if (!flags.chart || !flags.radius) items.push('the crane chart at the working radius');
  if (profile.panel && !flags.braceArrangement) items.push('the brace arrangement');
  if (!items.length) return '';
  return `The lift does not start until the pack contains ${joinList(items)}.`;
}

function suppliedClauses(text) {
  return String(text || '')
    .split(/\n+|(?<=\.)\s+|;\s+/)
    .map((part) => part.trim())
    .filter((part) => part && !/^not provided$/i.test(part));
}

function quotedPackClauses(profile) {
  const text = `${profile.jobText || ''}\n${profile.answerText || ''}`;
  const patterns = [
    /\berection design\b/i,
    /\b(?:centre|center) of gravity\b/i,
    /\bchart\b/i,
    /\bradius\b/i,
    /\bbrace arrangement\b/i,
  ];
  const seen = new Set();
  const quotes = [];
  for (const clause of suppliedClauses(text)) {
    if (/does not start until the pack contains/i.test(clause)) continue;
    if (!patterns.some((pattern) => pattern.test(clause))) continue;
    const key = clause.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    quotes.push(clause.replace(/[.\s]+$/, ''));
  }
  return quotes;
}

function chartStatesAllowableLoad(profile) {
  const text = `${profile.jobText || ''}\n${profile.answerText || ''}`;
  if (!/\bchart\b/i.test(text)) return false;
  if (/\ballowable load\b/i.test(text)) return true;
  return suppliedClauses(text).some((clause) => {
    if (!/\bchart\b/i.test(clause)) return false;
    return /\b(covers?|allows?|rated capacity|capacity)\b/i.test(clause)
      && /\b(\d+(?:\.\d+)?\s*t(?:onne)?s?|panel|load)\b/i.test(clause);
  });
}

function standUpStep(profile) {
  const count = profile.panelCount === 2 ? 'two' : (profile.panelCount ? String(profile.panelCount) : 'the');
  const lead = `Stand these ${count} panels up as the supplied pack says, using the erection design, the centre of gravity, the chart at the stated radius, and the brace arrangement that were given.`;
  const quotes = quotedPackClauses(profile);
  if (!quotes.length) return lead;
  return `${lead} ${quotes.join('. ')}.`;
}

function crewBrief(profile) {
  const steps = [];
  const flags = packFlags(profile);
  const hold = packHold(profile);
  if (packComplete(flags)) steps.push(standUpStep(profile));
  else if (hold) steps.push(hold);
  if (profile.panelWeight && profile.panelCount) {
    const combined = Number(profile.panelWeight) * Number(profile.panelCount);
    const count = profile.panelCount === 2 ? 'Two' : String(profile.panelCount);
    const weightNote = flags.centreOfGravity ? '' : ` ${profile.panelWeight}T is the given weight, not a centre of gravity.`;
    steps.push(`${count} separate ${profile.panelWeight}T lifts. Do not add them into one ${combined}T pick.${weightNote}`);
  }
  steps.push('One signaller. Anyone may stop the lift. Do not pass a load over a person.');
  if (profile.riggersOnGround || profile.operatorInCab || profile.onlyGroundAndCab) {
    const where = [
      profile.riggersOnGround ? 'Riggers stay on the ground' : '',
      profile.operatorInCab ? 'the operator stays in the cab' : '',
    ].filter(Boolean).join(', and ');
    const height = profile.heightM ? ` Do not place a person at ${profile.heightM} m.` : '';
    steps.push(`${where ? `${where}.` : ''}${height} Do not use an EWP or a scaffold.`.replace(/\s+/g, ' ').trim());
  }
  steps.push('Keep at least 4.0 m from a live overhead line unless the line owner agrees in writing. Underground services are a required check, not a finding. Whether a road is inside the zone is a required check, not a finding.');
  const plant = profile.plantPhrase || (profile.craneClass ? `${profile.craneClass}T` : '');
  const classRule = profile.craneClass && !chartStatesAllowableLoad(profile)
    ? `${plant} is the crane class, not the chart. `
    : '';
  steps.push(`${classRule}No free-fall with a load.`.trim());
  if (profile.nz) steps.push('The emergency number is 111.');
  return steps;
}

function stepConfirmsMissingFact(line) {
  const text = stripStepNumber(line);
  if (/does not start until the pack contains/i.test(text)) return false;
  if (/\b(falsework|sign off|sign-off)\b/i.test(text)) return true;
  if (/\b(erection (?:design|procedure)|competent person|who is competent)\b/i.test(text)) return true;
  if (/\b(?:centre|center) of gravity\b/i.test(text) && !/\bnot a centre of gravity\b/i.test(text)) return true;
  if (/\b(rating sheets?|ground bearing|bearing value|wind stop|wind limit|wind speed|tag line|lean and lug)\b/i.test(text)) return true;
  if (/\b(working radius|crane chart)\b/i.test(text) && !/\bnot the chart\b/i.test(text)) return true;
  if (/\bdo not invent a brace\b/i.test(text)) return true;
  return false;
}

function stepIsEmptyCheck(line) {
  const text = stripStepNumber(line);
  if (!/\bcheck is required\b/i.test(text)) return false;
  return !/\b(underground|overhead|power line|road|footpath|4(?:\.0)?\s*m)\b/i.test(text);
}

function ensureMethodology(swms, profile) {
  const task = asObject(swms.taskDescription);
  if (profile.crane) {
    const steps = crewBrief(profile);
    task.workMethodology = steps.map((line, index) => `${index + 1}. ${line}`).join('\n');
  } else {
    let text = cleanProse(task.workMethodology || '', profile.source, profile);
    if (isPlaceholderMethod(text)) text = '';
    const lines = text.split('\n')
      .map(briefableLine)
      .map((line) => line.trim())
      .filter((line) => line && !stepConfirmsMissingFact(line) && !stepIsEmptyCheck(line));
    task.workMethodology = lines.map((line, index) => `${index + 1}. ${stripStepNumber(line)}`).join('\n');
  }
  const job = String(profile.jobText || '');
  if (task.task && !job.toLowerCase().includes(String(task.task).trim().toLowerCase())) {
    task.task = stripAddedFacts(stripInjectedWords(task.task, job), profile.source);
  }
  swms.taskDescription = task;
}

function hazardBlob(hazards) {
  return hazards.map((hazard) => [
    hazard.hazard,
    ...(hazard.controlMeasures || []),
  ].join(' ')).join('\n').toLowerCase();
}

function ensureHazards(swms, profile) {
  if (!profile.crane) return;
  const hazards = Array.isArray(swms.hazards) ? swms.hazards.filter((hazard) => {
    return hazard && !/general site work hazard/i.test(String(hazard.hazard || ''));
  }) : [];
  const covered = () => hazardBlob(hazards);
  const add = (hazard, controls) => {
    hazards.push({
      hazard,
      risk: 'High',
      residualRisk: 'Medium',
      controlMeasures: controls,
      responsiblePerson: 'Not provided',
    });
  };
  let blob = covered();
  if (!/directly involved/.test(blob) || !/breached/.test(blob)) {
    add(
      'Exclusion zone under the crane operating and lifting area',
      [
        'Only people directly involved in the lift are inside the exclusion zone',
        'Stop the lift if the zone is breached',
        'Loads should not pass over a person',
        'Whether a road or footpath is inside the zone is a required check, not a finding',
      ],
    );
  }
  blob = covered();
  if (!(/swing/.test(blob) && /sling/.test(blob) && /signal/.test(blob))) {
    add(
      'Swinging load, unsuitable slings, a person under the load, or an unclear signal',
      [
        'One signaller. Anyone may stop the lift',
        'Do not pass a load over a person',
      ],
    );
  }
  blob = covered();
  const overhead = hazards.find(isOverheadHazard);
  if (overhead) {
    const controls = Array.isArray(overhead.controlMeasures) ? overhead.controlMeasures : [];
    const joined = controls.join(' ');
    if (!/4(?:\.0)?\s*m/.test(joined)) {
      controls.push('Keep at least 4.0 m from a live overhead line unless the line owner agrees in writing');
    }
    if (!/underground/.test(joined.toLowerCase())) {
      controls.push('Underground services are a required check, not a finding');
    }
    overhead.controlMeasures = controls;
  } else if (!(/underground/.test(blob) && /4(?:\.0)?\s*m/.test(blob))) {
    add(
      'Overhead power lines and underground services',
      [
        'Keep at least 4.0 m from a live overhead line unless the line owner agrees in writing',
        'Underground services are a required check, not a finding',
      ],
    );
  }
  blob = covered();
  if (!(/tag line/.test(blob) && /lean/.test(blob) && /acceleration/.test(blob))) {
    add(
      'Wind, acceleration, and braking as toppling forces, and a large panel in wind',
      [
        'Wind, acceleration, and braking are toppling forces on the crane and the load',
        'A large panel can mean the lift waits until the wind drops',
        'A tag line is for light winds. If a worker has to lean and lug, do not lift',
      ],
    );
  }
  blob = covered();
  if (!(/raised object|falling object/.test(blob) && /exclusion zone/.test(blob))) {
    add(
      'Work under a raised object, and a falling object where the fall cannot be prevented or arrested',
      [
        'Do not work under a raised object',
        'If a fall cannot be prevented or arrested, keep an exclusion zone',
      ],
    );
  }
  blob = covered();
  if (profile.panel && !/suction/.test(blob)) {
    add(
      'Suction during handling overloading the crane or the anchors',
      [
        'Suction depends on surface area, not the stated panel weight',
        'It can overload the crane and the anchors',
        'Do not treat the stated panel weight as a suction load',
      ],
    );
  }
  blob = covered();
  if (profile.panel && !/two restraints|temporary support/.test(blob)) {
    add(
      'Temporary supports missing from the erection documents, or braces released before the panel is in the final structure',
      [
        'Erection documents have to show temporary supports. The minimum is two restraints unless the erection design clearly says otherwise',
        'Brace footings must have reached the specified strength first. Base restraint against sliding is required, and the panel weight may not provide it',
      ],
    );
  }
  blob = covered();
  const designInUse = packComplete(packFlags(profile));
  if (profile.panel && profile.onlyGroundAndCab && !/advancing edge/.test(blob)) {
    const controls = [
      'Treat advancing edges as a hazard to consider, not as a procedure',
      designInUse ? '' : 'No precast-erection procedure is held, and none is taken from the 2002 precast ACOP',
      'Do not place a person at the stated height. Do not use an EWP or a scaffold',
    ].filter(Boolean);
    add('Advancing edges of precast erection', controls);
  }
  swms.hazards = collapseOverheadHazards(hazards.filter((hazard) => {
    const controls = (hazard.controlMeasures || [])
      .map(settleUnderPanelControl)
      .map((control) => (designInUse ? stripHeldProcedureDenial(control) : control))
      .filter((control) => control && !controlConfirmsMissing(control));
    hazard.controlMeasures = controls;
    return true;
  }));
}

function stripHeldProcedureDenial(control) {
  const parts = String(control || '').split(/(?<=\.)\s+/).map((part) => part.trim()).filter(Boolean);
  return parts.filter((line) => !/no precast-erection procedure is held/i.test(line)).join(' ');
}

function settleUnderPanelControl(control) {
  const parts = String(control || '').split(/(?<=\.)\s+/).map((part) => part.trim()).filter(Boolean);
  const kept = parts.map((line) => {
    if (/\bexcept to secure braces\b/i.test(line)) return 'Do not work under a raised object';
    if (/\b(go|goes|going|work|works|working) under\b/i.test(line) && /\bbrace/i.test(line)) return '';
    if (/\bonly to secure braces\b/i.test(line)) return '';
    return line;
  }).filter(Boolean);
  return kept.join(' ');
}

function controlConfirmsMissing(control) {
  const text = String(control || '');
  if (/\bdo not invent a brace\b/i.test(text)) return true;
  if (/\b(?:centre|center) of gravity\b/i.test(text) && !/\bnot a centre of gravity\b/i.test(text)) return true;
  if (/\bfalsework\b|\bcompetent person\b/i.test(text)) return true;
  if (/\bcheck is required\b/i.test(text) && !/\b(underground|overhead|road|footpath|4(?:\.0)?\s*m)\b/i.test(text)) return true;
  return false;
}

function isOverheadHazard(hazard) {
  return /overhead|power line/.test(`${hazard.hazard || ''} ${(hazard.controlMeasures || []).join(' ')}`.toLowerCase());
}

function collapseOverheadHazards(hazards) {
  const overheads = hazards.filter(isOverheadHazard);
  if (overheads.length <= 1) return hazards;
  const primary = overheads[0];
  const controls = Array.isArray(primary.controlMeasures) ? primary.controlMeasures : [];
  for (const extra of overheads.slice(1)) {
    for (const control of extra.controlMeasures || []) {
      if (!controls.includes(control)) controls.push(control);
    }
  }
  primary.controlMeasures = controls;
  return hazards.filter((hazard) => hazard === primary || !isOverheadHazard(hazard));
}

function citationKey(line) {
  const text = String(line || '').toLowerCase();
  if (/\b3795\b|\b3789\b/.test(text)) return 'quals';
  if (/crane acop/.test(text) || (/crane/.test(text) && /\bacop\b|approved code of practice/.test(text) && !/rigging/.test(text))) return 'crane-acop';
  if (/rigging acop/.test(text) || (/rigging/.test(text) && /\bacop\b|approved code of practice/.test(text))) return 'rigging-acop';
  if (/grwm/.test(text) || (/reg(?:ulation)?s?\s*24\b/.test(text) && /\b25\b/.test(text))) return 'grwm';
  if (/reg(?:ulation)?\s*26\b/.test(text)) return 'reg26';
  if (/reg(?:ulation)?\s*21\b/.test(text)) return 'reg21';
  if (/precast|october 2018/.test(text)) return 'precast';
  if (/working[- ]at[- ]height/.test(text)) return 'height';
  if (/health and safety at work act|\bhswa\b/.test(text)) return 'hswa';
  if (/safe work australia/.test(text)) return 'swa';
  return `other:${text}`;
}

function ensureReferences(swms, profile) {
  const incoming = Array.isArray(swms.references) ? swms.references.map(citationText).filter(Boolean) : [];
  const refs = [];
  const seen = new Set();
  const add = (line) => {
    const key = citationKey(line);
    if (seen.has(key)) return;
    seen.add(key);
    refs.push(line);
  };
  if (profile.nz) {
    add('Health and Safety at Work Act 2015 (HSWA). This record does not claim that a document called a SWMS is required in New Zealand.');
    add('GRWM regs 24 and 25: work under a raised object, and a falling object.');
    swms.highRiskCategories = ['Work under a raised object and a falling object (GRWM regs 24 and 25).'];
  }
  if (profile.crane) {
    add('Crane ACOP: still published by WorkSafe. The page says the guidance has not been updated for HSWA 2015. Use it as published practice with that status, not as a current approved code under HSWA.');
    add('Rigging ACOP: still published by WorkSafe. The page says the guidance has not been updated for HSWA 2015. Use it as published practice with that status, not as a current approved code under HSWA.');
    if (!profile.qualificationsSupplied) {
      add('Crane and rigging qualification evidence was not provided. Unit standards 3795 and 3789 are the minimum the crane ACOP table names.');
    }
    add('Health and Safety in Employment Regulations 1995, reg 26: written notice at least 24 hours before notifiable work. Whether this lift is notifiable is not decided, and the notice is not ticked as done or not done.');
    add('Health and Safety in Employment Regulations 1995, reg 21: means to prevent a fall where any employee may fall more than 3 metres. Whether any employee may fall more than 3 metres was not stated.');
  }
  if (profile.panel) {
    add('WorkSafe Good Practice Guidelines, Safe work with precast concrete (October 2018). Advice: must is a legal requirement and should is recommended. Its factors are guidance, not this panel\'s working load limit. No panel procedure is taken from the 2002 precast ACOP.');
  }
  if (profile.heightM || profile.crane) {
    add('Working-at-height guideline: status under the current HSWA is not confirmed.');
  }
  for (const line of incoming) add(line);
  swms.references = refs.filter((line) => {
    if (/\[object Object\]/.test(line)) return false;
    if (/^(crane|rigging) acop: status under the current hswa is not confirmed\.?$/i.test(line.trim())) return false;
    if (!profile.nz) return true;
    if (/^safe work australia$/i.test(line.trim())) return false;
    if (/\b(nsw|new south wales)\b/i.test(line) && !/\b(not applied|are not|does not)\b/i.test(line)) return false;
    return true;
  });
}

function hazardCallsForPpe(item, blob) {
  const label = String(item || '').toLowerCase().trim();
  if (!label) return false;
  if (blob.includes(label)) return true;
  const words = label.split(/[^a-z0-9]+/).filter((word) => word.length > 3 && !/^(safety|protective|standard|personal)$/.test(word));
  return words.length > 0 && words.every((word) => blob.includes(word));
}

function ensurePpe(swms) {
  const hazards = Array.isArray(swms.hazards) ? swms.hazards : [];
  const blob = hazards.map((hazard) => [hazard.hazard, ...(hazard.controlMeasures || [])].join(' ')).join('\n').toLowerCase();
  const items = Array.isArray(swms.ppe) ? swms.ppe : [];
  swms.ppe = items
    .map((item) => (typeof item === 'string' ? item : String(item && (item.item || item.name) || '')))
    .map((item) => item.trim())
    .filter((item) => hazardCallsForPpe(item, blob));
}

function ensurePersonnel(swms, profile) {
  if (!profile.crane) return;
  const qualificationNote = 'Crane and rigging qualification evidence was not provided. Unit standards 3795 and 3789 are the minimum the crane ACOP table names.';
  const people = Array.isArray(swms.personnel) ? swms.personnel : [];
  const roles = [
    { role: 'Erection supervisor', match: /erection supervisor/i, note: 'This role is required and was not supplied. No name or licence was provided.' },
    { role: 'Crane operator', match: /crane operator|\boperator\b/i, note: `This role is required and was not supplied. ${qualificationNote}` },
    { role: 'Dogman or rigger', match: /dogman|rigger/i, note: `This role is required and was not supplied. ${qualificationNote}` },
  ];
  for (const spec of roles) {
    let person = people.find((entry) => entry && spec.match.test(`${entry.role || ''} ${entry.name || ''}`));
    if (!person) {
      person = { name: 'Not provided', role: spec.role, licenceNumber: 'Not provided', licence: 'Not provided', competency: spec.note };
      people.push(person);
    }
    const scrubbed = scrubPerson(person.name, profile.source);
    person.name = !scrubbed || scrubbed === 'Not provided' || spec.match.test(scrubbed)
      ? 'Not provided'
      : scrubbed;
    person.role = spec.role;
    if (!profile.qualificationsSupplied) {
      person.licenceNumber = 'Not provided';
      person.licence = 'Not provided';
    }
    person.competency = person.name === 'Not provided' && !profile.qualificationsSupplied
      ? spec.note
      : (person.competency || spec.note);
  }
  swms.personnel = people;
}

function applyJobLimits(swms, ctx) {
  const profile = jobProfile(ctx);
  const task = asObject(swms.taskDescription);
  task.location = scrubUnstated(stripInjectedWords(stripAddedFacts(task.location, profile.source), profile.jobText), profile.source);
  task.duration = scrubUnstated(stripInjectedWords(stripAddedFacts(task.duration, profile.source), profile.jobText), profile.source);
  swms.taskDescription = task;

  swms.hazards = (Array.isArray(swms.hazards) ? swms.hazards : []).map((hazard) => ({
    ...hazard,
    hazard: cleanProse(hazard.hazard, profile.source, profile),
    controlMeasures: (Array.isArray(hazard.controlMeasures) ? hazard.controlMeasures : [])
      .map((control) => cleanProse(control, profile.source, profile))
      .filter(Boolean),
  })).filter((hazard) => hazard.hazard);

  if (Array.isArray(swms.plantAndEquipment)) {
    swms.plantAndEquipment = swms.plantAndEquipment.map((item) => ({
      ...item,
      makeModel: stripInjectedWords(stripAddedFacts(cleanProse(item.makeModel, profile.source, profile) || scrubUnstated(item.makeModel, profile.source), profile.source), profile.jobText),
      operator: plantOperator(item.operator, profile.source),
    }));
  }
  if (profile.plantPhrase) {
    const items = Array.isArray(swms.plantAndEquipment) ? swms.plantAndEquipment : [];
    const index = items.findIndex((item) => /liebherr|\bcrane\b|\d+\s*t/i.test(`${item.makeModel || ''} ${item.name || ''}`));
    if (index >= 0) {
      items[index].makeModel = profile.plantPhrase;
      items[index].operator = plantOperator(items[index].operator, profile.source);
    } else {
      items.unshift({
        makeModel: profile.plantPhrase,
        operator: 'Not provided',
        rego: 'Not provided',
        inspectionDate: 'Not provided',
      });
    }
    swms.plantAndEquipment = items;
  }

  const emergency = asObject(swms.emergencyProcedures);
  if (profile.nz) {
    emergency.emergencyPhone = '111';
    emergency.emergencyNumber = '111';
    for (const field of ['nearestHospital', 'hospitalAddress', 'firstAider', 'firstAiderContact', 'musterPoint']) {
      emergency[field] = stripAuEmergency(emergency[field] || '');
    }
  }
  swms.emergencyProcedures = emergency;

  ensureMethodology(swms, profile);
  ensureHazards(swms, profile);
  ensurePpe(swms);
  ensureReferences(swms, profile);
  ensurePersonnel(swms, profile);
  swms.workerSignoff = [];
  return swms;
}

// deepseek-flash copies a JSON object placed at the end of the user prompt, including empty
// arrays and placeholder steps. Describe the document in prose and reject a template reply.
// Crane and rigging limits below are the constraints Clive's specialist stated. They are not
// a precast-erection procedure, and none is invented here.
function buildSwmsMessages(ctx) {
  const today = todayDdMmYyyy();
  const profile = jobProfile(ctx);
  const correction = ctx.correction
    ? 'The previous reply was rejected. It was a blank template, it invented facts that were not supplied, or it did not describe this job. Write the finished record now.\n\n'
    : '';
  const emergencyRule = profile.nz
    ? 'This is a New Zealand site. emergencyProcedures.emergencyPhone is 111. Do not print an Australian emergency number.'
    : (profile.au
      ? 'This is an Australian site. emergencyProcedures.emergencyPhone is 000.'
      : 'emergencyProcedures.emergencyPhone is 111 for New Zealand or 000 for Australia, matching the country of the site.');
  const cogSupplied = /\b(?:centre|center) of gravity\b/.test(profile.source);
  const panelRule = profile.panelWeight && profile.panelCount
    ? `This job states ${profile.panelCount} panels at ${profile.panelWeight}T each. Each panel is its own ${profile.panelWeight}T lift. Do not add them into one ${Number(profile.panelWeight) * Number(profile.panelCount)}T pick.${cogSupplied ? '' : ` ${profile.panelWeight}T is the weight given, not a calculated centre of gravity.`}`
    : `If more than one load is named, lift each load on its own. Do not add the stated weights into one pick.${cogSupplied ? '' : ' A stated weight is not a calculated centre of gravity.'}`;
  const packReady = packComplete(packFlags(profile));
  const classRule = chartStatesAllowableLoad(profile)
    ? 'The supplied chart states the load. Do not also say the crane class is not the chart. Do not invent a different load.'
    : (profile.craneClass
      ? `${profile.craneClass}T is the crane class, not the chart.`
      : 'A stated crane class is not the chart.');
  const heightRule = profile.onlyGroundAndCab
    ? `The stated height is up to ${profile.heightM || 'the height given'} m. A fall plan applies only if a person can fall. Riggers are on the ground and the crane operator is in the cab. Do not invent a connector, an EWP, or a scaffold. Advancing edges of precast erection are a hazard to consider, not a procedure.`
    : 'A fall plan applies only if a person can fall. Do not place a person at height unless the job says that person is there.';
  return [
    {
      role: 'system',
      content: `You write a finished work-method record for the job in the user message.
Return one JSON object and no other text. Do not wrap it in markdown.
Do not return a schema, a sample, or placeholders.
${packComplete(packFlags(profile)) ? 'An erection design was supplied. The method uses it. Do not say that no precast-erection procedure is held, and do not invent a different sequence.' : 'Do not invent a precast-erection procedure. None has been supplied. Do not invent one from the 2002 precast ACOP.'}
Do not invent worker names, licence numbers, a hospital, a supervisor phone, a working radius, a crane chart, ground bearing, a lifting-anchor type or capacity, a numeric wind stop, overhead or underground services, a brace angle, a brace type, an insert type or layout, a strongback, or a tailing crane.
If a fact was not supplied, write "Not provided" or leave it out. Do not guess it.
When the erection design, the centre of gravity, the crane chart at the working radius, or the brace arrangement was not supplied, the method has one hold: the lift does not start until those missing items are in the pack. Do not write separate steps that tell the crew to confirm them, and do not write "do not invent a brace" in place of the brace arrangement. While any of those is still missing, do not describe anyone going under the panel, and do not write a procedure for fitting braces. When the job or the answers contain all four, do not write the hold. Brief how the panels are stood up from the supplied erection design, centre of gravity, chart at the stated radius, and brace arrangement. Do not invent a radius, a brace type, a centre of gravity, or an erection sequence that was not given. Do not send anyone under the panel unless that brace arrangement says so.
For a New Zealand job, do not claim that a document called a SWMS is required, and do not copy an Australian or NSW SWMS form onto the job.
The crane ACOP and the rigging ACOP are still published by WorkSafe. Both pages say the guidance has not been updated for HSWA 2015. Use them as published practice with that status, not as a current approved code under HSWA.
Where crane or rigging qualification evidence was not supplied, record that it was not provided. Unit standards 3795 and 3789 are the minimum the crane ACOP table names. The erection supervisor, crane operator, and dogman or rigger are required roles and were not supplied. Do not invent who holds them.
Do not decide whether the lift is notifiable under the Health and Safety in Employment Regulations 1995, reg 26, and do not tick that notice as done or not done. Do not decide reg 21 either: whether any employee may fall more than 3 metres was not stated.
workerSignoff must be an empty list because nobody has signed yet.`,
    },
    {
      role: 'user',
      content: `${correction}Write the work-method record as JSON for this job.

Site address: ${ctx.siteAddress || 'Not provided'}
Selected plant: ${ctx.selectedPlants.length ? ctx.selectedPlants.join(', ') : 'None listed separately'}
Subcontractor: ${ctx.companyNameText}
dateCreated: ${today}

Job description:
${ctx.jobDescription}

Additional information (when an answer is "Not provided", that fact is unknown):
${ctx.extraAnswers}

How to write it:
- document.title is "Safe Work Method Statement". document.swmsNumber is "SWMS-${today.slice(-4)}-001". document.dateCreated is ${today}. document.version is "1.0". The title is the name of this record. For a New Zealand job, do not say a document called a SWMS is required.
- projectDetails uses only the site address, principal contractor, and subcontractor given above. Anything missing is "Not provided".
- taskDescription.workMethodology is one numbered morning brief. Number each step once. ${packReady ? 'The erection design, the centre of gravity, the chart and radius, and the brace arrangement were supplied. Do not write the hold. Brief how these panels are stood up using those supplied words. Do not invent a radius, a brace type, a centre of gravity, or an erection sequence that the answer did not give. Do not send anyone under the panel unless the supplied brace arrangement says so.' : 'The first step is a single hold for whichever of the erection design, the centre of gravity, the crane chart at the working radius, and the brace arrangement this job did not give. Do not split that hold into confirm-steps. Do not describe anyone going under the panel. Do not write a step that only says a check is required.'}
- ${panelRule}
- One signaller. Anyone may stop the lift. Do not pass a load over a person.
- Keep at least 4.0 m from a live overhead line unless the line owner agrees in writing. Underground services, and whether a road is inside the zone, are required checks, not findings. One hazard covers overhead lines. Do not add a second overhead-line hazard.
- ${classRule} No free-fall with a load. Do not describe the crane as a mobile crane unless the job used those words. plantAndEquipment.makeModel is exactly the plant string from the job.
- ${heightRule}
- ${emergencyRule} Do not name a hospital. Do not invent a supervisor phone. Do not add the words tomorrow or commercial unless that field is a copy of the job sentence.
- Do not decide the 24-hour notice, and do not tick it done or not done. Do not paste the October 2018 guide back as method steps. Cite it once.
- Do not invent ground bearing, insert type, brace type, or this panel's working load limit.
- Hazards have to include: an exclusion zone under the operating and lifting area; a swinging load, unsuitable slings, people under the load, and unclear signals; power lines, underground services and obstructions looked for, not assumed; wind, acceleration, and braking as toppling forces, with no numeric wind stop; work under a raised object and a falling object, with an exclusion zone if the fall cannot be prevented or arrested.
- Each hazard has hazard, risk (Low, Medium, High, or Extreme), residualRisk, controlMeasures, and responsiblePerson. responsiblePerson is "Not provided" when no person was named. Do not invent likelihood numbers.
- For a New Zealand crane or panel lift, highRiskCategories states the work that applies: work under a raised object and a falling object (GRWM regs 24 and 25). Do not use an Australian high-risk construction work list instead of that.
- plantAndEquipment lists only plant named in the job. Use the crane words from the job. Do not add "mobile crane". rego, inspection date, radius, and chart are "Not provided" unless stated. operator is "Not provided" when no person was named. Do not write a role plus "not provided", and do not add brackets.
- projectDetails.subcontractor is "Not provided" unless a subcontractor was named. Do not copy the principal contractor into the subcontractor field.
- personnel lists the roles named in the job. name and licenceNumber are "Not provided" unless supplied. Record that crane and rigging qualification evidence was not provided, and that unit standards 3795 and 3789 are the minimum the crane ACOP table names. Do not invent a person's name.
- references is an array of strings, never objects. Include HSWA, GRWM regs 24 and 25, the October 2018 precast good practice guidelines, the crane ACOP and the rigging ACOP as published WorkSafe practice that the pages say has not been updated for HSWA 2015, and the working-at-height guideline with its HSWA status not confirmed. State Health and Safety in Employment Regulations 1995 reg 26 as a check that is not decided. Do not tick the 24-hour notice.
- ppe lists an item only when a hazard in this record names that item. Do not attach a default kit. workerSignoff is empty.

An empty hazards list, or a methodology that does not describe these lifts, is an invalid reply.`,
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
  document.title = blankToNotProvided(document.title);
  if (!document.title || /^swms$/i.test(document.title)) document.title = 'Safe Work Method Statement';
  document.swmsNumber = blankToNotProvided(document.swmsNumber) || `SWMS-${todayDdMmYyyy().slice(-4)}-001`;
  document.dateCreated = todayDdMmYyyy();
  document.version = blankToNotProvided(document.version) || '1.0';
  swms.document = document;

  const project = asObject(swms.projectDetails);
  project.siteAddress = ctx.siteAddress || scrubUnstated(project.siteAddress, source);
  project.principalContractor = scrubPrincipal(project.principalContractor, source);
  const namedPrincipal = statedPrincipal(ctx.jobDescription);
  if (project.principalContractor === 'Not provided' && namedPrincipal) project.principalContractor = namedPrincipal;
  const namedSubcontractor = explicitSubcontractor(ctx);
  const suppliedCompany = isUnstated(ctx.companyNameText) ? '' : ctx.companyNameText;
  const subcontractor = namedSubcontractor || suppliedCompany;
  project.subcontractor = !subcontractor || namesMatch(subcontractor, project.principalContractor)
    ? 'Not provided'
    : subcontractor;
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
      operator: plantOperator(item.operator, source),
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
  return applyJobLimits(swms, ctx);
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
    return { swms: groundSwms(fallbackSwms(ctx), ctx), unfinished: false };
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
  const companyNameText = textField(body.companyName, 200) || 'Not provided';
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
