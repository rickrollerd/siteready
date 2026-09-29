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
    ctx.companyNameText,
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
  };
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
  if (!/\b(notifiable|reg(?:ulation)?\s*26)\b/i.test(line)) return false;
  return /\b(is notifiable|is not notifiable|notice (?:has been|was) (?:given|sent|done)|no notice is required|notice is required|notice has been lodged)\b/i.test(line);
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
      if (!part.trim() || shouldDropLine(part, source, profile)) continue;
      parts.push(part.trim());
    }
    if (parts.length) kept.push(parts.join(' '));
  }
  return kept.join('\n').trim();
}

function methodGaps(existing, profile) {
  if (!profile.crane) return [];
  const text = existing.toLowerCase();
  const has = (pattern) => pattern.test(text);
  const gaps = [];
  const weight = profile.panelWeight;
  const combined = weight && profile.panelCount ? Number(weight) * Number(profile.panelCount) : null;
  if (weight && profile.panelCount) {
    if (!has(new RegExp(`\\b${weight}\\s*t`)) || !has(/\beach panel\b|\bits own\b|\bseparate\b|\bone at a time\b/)) {
      gaps.push(`Each panel is its own ${weight}T lift. There are ${profile.panelCount} separate lifts.`);
    }
    if (!has(new RegExp(`\\b${combined}\\s*t`)) || !has(/\bnot added\b|\bdo not add\b/)) {
      gaps.push(`Do not add the panels into one ${combined}T pick. ${weight}T is the weight given, not a calculated centre of gravity.`);
    }
  }
  if (!has(/centre of gravity|center of gravity/) || !has(/drawing|calculation|weighed|marked weight/)) {
    gaps.push('The centre of gravity still has to come from a drawing, a calculation, a weighed piece, or a marked weight. That information was not provided.');
  }
  if (!has(/\bsling/) || !has(/balanced|stable/) || !has(/\bhook\b/)) {
    gaps.push('The slinging method and the gear on hand were not provided. Before a panel leaves the ground it has to be balanced and stable, with the hook over the centre of gravity.');
  }
  if (profile.panel && !has(/competent person for erection design|erection design should/)) {
    gaps.push('Design is not this record. A competent person for erection design should agree the procedure and sequence, give the manufacturer the lifting-anchor locations, and produce the rigging configuration, sequence and drawings, including braces. A competent person should sign off falsework before erection. The sequence, the brace angle, and whether a strongback or a tailing crane is needed were not given. Do not invent them. If a strongback is used as a lifting beam, that design must be certified by a chartered professional engineer or a WorkSafe-approved Design Verifier. This job is not said to use one.');
  }
  if (profile.panel && !has(/cast-in lifting anchors/) && !has(/factor 3\.0/)) {
    const statedWeight = weight ? `${weight} tonnes` : 'the stated panel weight';
    gaps.push(`The WorkSafe Good Practice Guidelines, Safe work with precast concrete (October 2018), are advice. In that guide, must is a legal requirement and should is recommended. The guide allows cast-in lifting anchors. It does not allow impact-driven or explosive-charge fixings, or reinforcing bars as lifting loops. The recommended factors are guidance, not this panel's working load limit: anchors 3.0 general and 5.0 repetitive; mobile crane dynamic factor 1.0 for lift and place, 2.0 for lift travel and place on a prepared even surface, and 4.0 on rough terrain. A competent person calculates the actual working load limit. Edge distance, concrete strength, embedment and sling angle can reduce it. Clutches: factor 5.0, compatible anchors only, a daily visual check, and inspection at least every 12 months. Before erection the erector should be given the weight, the centre of gravity, and any special handling. Suction depends on surface area, not the ${statedWeight}, and can overload the crane and the anchors. Insert type and layout were not given.`);
  }
  if (profile.panel && !has(/two restraints|temporary supports/)) {
    gaps.push('Erection documents have to show temporary supports. The minimum is two restraints unless the erection design clearly says otherwise. Fix braces before the lift where possible. If that is not possible, the crane holds the panel while the braces go on. Keep the braces on until the panel is in the final structure. Brace footings must have reached the specified strength first. Base restraint against sliding is required, and the panel weight may not provide it. Brace connections: factor 2.5 against failure, and 3.0 for post-installed drilled-in inserts. No deformation-controlled anchors. Chemical-only bonded anchors only if each fixing is proof-tested to the working load limit. Brace type was not given.');
  }
  if (!has(/swing/) || !has(/4(?:\.0)?\s*m/) || !has(/underground/)) {
    gaps.push('Planning must cover overhead power lines and underground services. That is a required check, not a finding that a line or service is there. Check the swing area for power lines and other obstructions. Keep at least 4.0 m from live overhead lines unless the line owner gives written consent for less. Whether any overhead or underground service exists at this address was not provided. Do not assume a service is present or absent.');
  }
  if (!has(/directly involved/) || !has(/breached/) || !has(/authoris/)) {
    gaps.push('Only people directly involved in the lift are inside the exclusion zone. Stop the lift if the zone is breached. One designated person signals, and anyone may call stop. Only trained people rig. Loads should not pass over a person. Workers go under a raised panel only to secure braces, and only when authorised. If a footpath or road is inside the zone, the public and traffic stay out until the panels are fully secured. Do not say the road at this address is inside the zone. The check is required.');
  }
  const classSentence = profile.craneClass
    ? `${profile.craneClass}T is the crane class given, not the allowable load at the working radius, and not the chart.`
    : 'The crane class given is not the allowable load at the working radius, and not the chart.';
  if (!has(/manufacturer's specification|manufacturers specification/) || !has(/certificate of inspection/) || !has(/1\.5\s*m/)) {
    gaps.push(`Set the crane up to the manufacturer's specification on ground that can support the crane and the suspended load. No bearing value was given for this site. A current certificate of inspection from a recognised inspection body is required. Operate within the crane's design limits, with the rating sheets and the manual available to the operator. The crane layout drawing should show the working radius. None was given. For face-lifted tilt panels the guide says the true working radius may be up to 1.5 m more than the finished-panel radius. That is general guidance, not this job's number. ${classSentence}`);
  }
  if (!has(/free-?fall/)) {
    gaps.push(profile.panel
      ? 'No free-fall with a load. Panel erection is not an exception.'
      : 'No free-fall with a load.');
  }
  if (!has(/tag line/) || !has(/lean/) || !has(/no site wind|no numeric wind/)) {
    gaps.push('Wind, acceleration, and braking are toppling forces on the crane and the load. A large panel can force a lower crane working wind speed, or no lift until the wind drops. A tag line is for light winds. If a worker has to lean and lug, do not lift. No site wind limit was stated. Do not invent one.');
  }
  if (profile.heightM && profile.onlyGroundAndCab && (!has(/person can fall|only if a person/) || !has(/precast-erection procedure|not a procedure/))) {
    const where = [
      profile.riggersOnGround ? 'Riggers are on the ground' : '',
      profile.operatorInCab ? 'the crane operator is in the cab' : '',
    ].filter(Boolean).join(' and ');
    gaps.push(`The job states a height of up to ${profile.heightM} m. That figure was not stated to be the vertical distance of the lift. A fall plan applies only if a person can fall. ${where}. Nobody is named as able to fall. Do not invent a connector, an EWP, or a scaffold. Advancing edges of precast erection are a hazard to consider, not a procedure. No precast-erection procedure is held for this work, and none is taken from the 2002 precast ACOP.`);
  }
  if (profile.panel && !has(/erection supervisor/) && !has(/dogman/)) {
    gaps.push('The guide expects an erection supervisor, a competent crane operator, and a competent dogman or rigger. Those roles are required and were not supplied. Do not invent names or licences.');
  }
  if (profile.nz && profile.crane && !has(/reg(?:ulation)?\s*26/) ) {
    gaps.push('Health and Safety in Employment Regulations 1995, reg 26, is written notice at least 24 hours before notifiable work. Do not decide whether this lift is notifiable, and do not tick the notice as done or not done. Three facts are missing: the crane is described only by the class given, so it is not shown to be or not be a self-propelled mobile crane (that category is excluded from one lifting notice); the vertical distance of the lift is not stated, and the stated height was not stated to be that distance; nobody is named as able to fall 5 metres. Reg 21 requires means to prevent a fall where any employee may fall more than 3 metres, and that fact is also missing. The check is required.');
  }
  if (!has(/first aid/) || !has(/\b111\b/) || !has(/hospital/)) {
    const emergency = profile.nz
      ? 'The emergency number for this New Zealand site is 111.'
      : 'Use the public emergency number for the country of the site.';
    gaps.push(`Have first aid and an emergency plan before the lift. ${emergency} No hospital was named. No supervisor phone was provided.`);
  }
  return gaps;
}

function ensureMethodology(swms, profile) {
  const task = asObject(swms.taskDescription);
  let text = cleanProse(task.workMethodology || '', profile.source, profile);
  if (isPlaceholderMethod(text)) text = '';
  const gaps = methodGaps(text, profile);
  if (gaps.length) {
    const start = text ? text.split('\n').filter(Boolean).length : 0;
    const numbered = gaps.map((gap, index) => `${start + index + 1}. ${gap}`);
    text = text ? `${text}\n${numbered.join('\n')}` : numbered.join('\n');
  }
  task.workMethodology = text;
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
        'Workers go under a raised panel only to secure braces, and only when authorised',
        'If a footpath or road is inside the zone, the public and traffic stay out until the panels are fully secured. Do not say the road at this address is inside the zone. The check is required',
      ],
    );
  }
  blob = covered();
  if (!(/swing/.test(blob) && /sling/.test(blob) && /signal/.test(blob))) {
    add(
      'Swinging load, unsuitable slings, a person under the load, or an unclear signal',
      [
        'Only trained people rig',
        'One designated person signals, and anyone may call stop',
        'The slinging method and the gear on hand were not provided. The load has to be balanced and stable, with the hook over the centre of gravity, before it leaves the ground',
        'Loads should not pass over a person',
      ],
    );
  }
  blob = covered();
  if (!(/underground/.test(blob) && /4(?:\.0)?\s*m/.test(blob) && /not provided|do not assume|not a finding|required check/.test(blob))) {
    add(
      'Overhead power lines, underground services, and other obstructions, which have to be looked for and not assumed',
      [
        'Planning must cover overhead power lines and underground services. That is a required check, not a finding that a line or service is there',
        'Check the swing area for power lines and other obstructions before the lift',
        'Keep at least 4.0 m from live overhead lines unless the line owner gives written consent for less',
        'Whether any overhead or underground service exists at this address was not provided',
      ],
    );
  }
  blob = covered();
  if (!(/tag line/.test(blob) && /lean/.test(blob) && /acceleration/.test(blob))) {
    add(
      'Wind, acceleration, and braking as toppling forces, and a large panel in wind',
      [
        'Wind, acceleration, and braking are toppling forces on the crane and the load',
        'A large panel can force a lower crane working wind speed, or no lift until the wind drops',
        'A tag line is for light winds. If a worker has to lean and lug, do not lift',
        'No site wind limit was stated. Do not invent one',
      ],
    );
  }
  blob = covered();
  if (!(/raised object|falling object/.test(blob) && /exclusion zone/.test(blob))) {
    add(
      'Work under a raised object, and a falling object where the fall cannot be prevented or arrested',
      [
        'Do not work under a raised object except to secure braces, and only when authorised',
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
        'Insert type and layout were not given',
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
        'Brace type was not given. Do not invent the brace angle, a strongback, or a tailing crane',
      ],
    );
  }
  blob = covered();
  if (profile.panel && profile.onlyGroundAndCab && !/advancing edge/.test(blob)) {
    add(
      'Advancing edges of precast erection',
      [
        'Treat advancing edges as a hazard to consider, not as a procedure',
        'No precast-erection procedure is held, and none is taken from the 2002 precast ACOP',
        'Do not invent a connector, an EWP, or a scaffold. Whether any employee may fall more than 3 metres was not stated. The check is required',
      ],
    );
  }
  swms.hazards = hazards;
}

function ensureReferences(swms, profile) {
  const refs = Array.isArray(swms.references) ? swms.references.map((item) => String(item)) : [];
  const have = refs.join('\n').toLowerCase();
  const add = (line) => {
    if (!have.includes(line.toLowerCase())) refs.push(line);
  };
  if (profile.nz) {
    add('Health and Safety at Work Act 2015 (HSWA). This record does not claim that a document called a SWMS is required in New Zealand.');
    add('GRWM regulations.');
    add('NSW SWMS rules are not applied to this New Zealand site.');
    swms.highRiskCategories = ['Not applied. This New Zealand job does not use an Australian or NSW high-risk construction work SWMS form.'];
  }
  if (profile.crane) {
    add('Crane ACOP: still published by WorkSafe. The page says the guidance has not been updated for HSWA 2015. Use it as published practice with that status, not as a current approved code under HSWA.');
    add('Rigging ACOP: still published by WorkSafe. The page says the guidance has not been updated for HSWA 2015. Use it as published practice with that status, not as a current approved code under HSWA.');
    if (!profile.qualificationsSupplied) {
      add('Crane and rigging qualification evidence was not provided. Unit standards 3795 and 3789 are the minimum the crane ACOP table names.');
    }
    add('Health and Safety in Employment Regulations 1995, reg 26: written notice at least 24 hours before notifiable work. Whether this lift is notifiable is not decided, and the notice is not ticked as done or not done.');
    add('Health and Safety in Employment Regulations 1995, reg 21: means to prevent a fall where any employee may fall more than 3 metres. Whether any employee may fall more than 3 metres was not stated. The check is required.');
  }
  if (profile.panel) {
    add('WorkSafe Good Practice Guidelines, Safe work with precast concrete (October 2018). Advice: must is a legal requirement and should is recommended. No panel procedure is taken from the 2002 precast ACOP.');
  }
  if (profile.heightM || profile.crane) {
    add('Working-at-height guideline: status under the current HSWA is not confirmed.');
  }
  swms.references = refs.filter((line) => {
    if (/^(crane|rigging) acop: status under the current hswa is not confirmed\.?$/i.test(line.trim())) return false;
    if (!profile.nz) return true;
    if (/^safe work australia$/i.test(line.trim())) return false;
    if (/\b(nsw|new south wales)\b/i.test(line) && !/\b(not applied|are not|does not)\b/i.test(line)) return false;
    return true;
  });
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
  task.location = scrubUnstated(task.location, profile.source);
  task.duration = scrubUnstated(task.duration, profile.source);
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
      makeModel: cleanProse(item.makeModel, profile.source, profile) || scrubUnstated(item.makeModel, profile.source),
    }));
  }
  if (profile.onlyGroundAndCab && Array.isArray(swms.ppe)) {
    swms.ppe = swms.ppe.filter((item) => !/\b(harness|lanyard|fall arrest|ewp|scaffold)\b/i.test(String(item)));
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
  const panelRule = profile.panelWeight && profile.panelCount
    ? `This job states ${profile.panelCount} panels at ${profile.panelWeight}T each. Each panel is its own ${profile.panelWeight}T lift. Do not add them into one ${Number(profile.panelWeight) * Number(profile.panelCount)}T pick. ${profile.panelWeight}T is the weight given, not a calculated centre of gravity.`
    : 'If more than one load is named, lift each load on its own. Do not add the stated weights into one pick. A stated weight is not a calculated centre of gravity.';
  const classRule = profile.craneClass
    ? `${profile.craneClass}T is the crane class given, not the allowable load at the working radius.`
    : 'A stated crane class is not the allowable load at the working radius.';
  const heightRule = profile.onlyGroundAndCab
    ? `The stated height is up to ${profile.heightM || 'the height given'} m. A fall plan applies only if a person can fall. Riggers are on the ground and the crane operator is in the cab. Do not invent a connector, an EWP, or a scaffold. Advancing edges of precast erection are a hazard to consider, not a procedure.`
    : 'A fall plan applies only if a person can fall. Do not place a person at height unless the job says that person is there.';
  return [
    {
      role: 'system',
      content: `You write a finished work-method record for the job in the user message.
Return one JSON object and no other text. Do not wrap it in markdown.
Do not return a schema, a sample, or placeholders.
Do not invent a precast-erection procedure. None has been supplied. Do not invent one from the 2002 precast ACOP.
Do not invent worker names, licence numbers, a hospital, a supervisor phone, a working radius, a crane chart, ground bearing, a lifting-anchor type or capacity, a numeric wind stop, overhead or underground services, a brace angle, a brace type, an insert type or layout, a strongback, or a tailing crane.
If a fact was not supplied, write "Not provided" or leave it out. Do not guess it.
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
- taskDescription.workMethodology is a numbered sequence for this job. ${panelRule} Say the centre of gravity still has to come from a drawing, a calculation, a weighed piece, or a marked weight, and that this was not provided.
- State the slinging method and the gear on hand only if they were supplied. Otherwise say they were not provided. The load has to be balanced and stable before it leaves the ground, with the hook over the centre of gravity.
- The swing area is checked for power lines and other obstructions. Keep at least 4.0 m from live overhead lines unless the line owner gives written consent for less. Whether any overhead service exists at this address is unknown. Leave that unknown. Do not assume lines are present or absent.
- Design is not this record. A competent person for erection design should agree the procedure and sequence, give the manufacturer the lifting-anchor locations, and produce the rigging configuration, sequence and drawings, including braces. A competent person should sign off falsework before erection. Do not invent the sequence, the brace angle, or whether a strongback or a tailing crane is needed. If a strongback is used as a lifting beam, that design must be certified by a chartered professional engineer or a WorkSafe-approved Design Verifier. Do not say this job uses one.
- For precast, follow the WorkSafe Good Practice Guidelines, Safe work with precast concrete (October 2018), as advice. Must is a legal requirement. Should is recommended. The guide allows cast-in lifting anchors, not impact-driven or explosive-charge fixings, and not reinforcing bars as lifting loops. Quote its factors as guidance, not as this panel's working load limit: anchors 3.0 general and 5.0 repetitive; mobile crane dynamic factor 1.0 for lift and place, 2.0 for lift travel and place on a prepared even surface, 4.0 on rough terrain. A competent person calculates the actual working load limit. Edge distance, concrete strength, embedment and sling angle can reduce it. Clutches: factor 5.0, compatible anchors only, daily visual check, inspected at least every 12 months. Before erection the erector should be given weight, centre of gravity and any special handling. Suction depends on surface area, not the stated tonnes, and can overload the crane and the anchors. Insert type and layout were not given. Leave them blank.
- Braces: erection documents have to show temporary supports. Minimum two restraints unless the erection design clearly says otherwise. Fix braces before the lift where possible. If not, the crane holds the panel while braces go on. Keep them on until the panel is in the final structure. Brace footings must have reached the specified strength first. Base restraint against sliding is required. Panel weight may not provide it. Brace connections: factor 2.5 against failure, 3.0 for post-installed drilled-in inserts. No deformation-controlled anchors. Chemical-only bonded anchors only if each fixing is proof-tested to the working load limit. Brace type was not given. Leave it blank.
- Only trained people rig. One designated person signals, and anyone may call stop. Only people directly involved in the lift are inside the exclusion zone. Stop the lift if it is breached. Loads should not pass over a person. Workers go under a raised panel only to secure braces, and only when authorised. If a footpath or road is inside the zone, public and traffic stay out until the panels are fully secured. Do not say the road at this address is inside the zone. Say the check is required.
- Planning must cover overhead power lines and underground services. That is a required check, not a finding that a line is there. Keep at least 4.0 m from live overhead lines unless the line owner gives written consent for less.
- Set the crane up to the manufacturer's specification on ground that can support the crane and the suspended load. No bearing value for this site. Current certificate of inspection from a recognised inspection body. Operate within design limits, with the rating sheets and the manual available. ${classRule} The crane layout drawing should show working radius. None was given. For face-lifted tilt panels the guide says the true working radius may be up to 1.5 m more than the finished-panel radius. That is general, not this job's number. Do not invent a chart or a radius.
- No free-fall with a load. Panel erection is not an exception.
- Wind, acceleration and braking are toppling forces. A large panel can force a lower crane working wind speed, or no lift until the wind drops. A tag line is for light winds. If a worker has to lean and lug, do not lift. No site wind limit was stated. Do not invent one.
- ${heightRule}
- The guide expects an erection supervisor, a competent crane operator, and a competent dogman or rigger. Those roles are required and were not supplied.
- ${emergencyRule} Have first aid and an emergency plan. Do not name a hospital. Do not invent a supervisor phone.
- Do not invent ground bearing, insert type, brace type, or this panel's working load limit.
- Hazards have to include: an exclusion zone under the operating and lifting area; a swinging load, unsuitable slings, people under the load, and unclear signals; power lines, underground services and obstructions looked for, not assumed; wind, acceleration, and braking as toppling forces, with no numeric wind stop; work under a raised object and a falling object, with an exclusion zone if the fall cannot be prevented or arrested.
- Each hazard has hazard, risk (Low, Medium, High, or Extreme), residualRisk, controlMeasures, and responsiblePerson. responsiblePerson is "Not provided" when no person was named. Do not invent likelihood numbers.
- For a New Zealand job, highRiskCategories is a single note that an Australian high-risk construction work form is not used. Do not list Australian high-risk construction work categories.
- plantAndEquipment lists only plant named in the job. rego, inspection date, radius, and chart are "Not provided" unless stated. operator is the role when no name was given.
- personnel lists the roles named in the job. name and licenceNumber are "Not provided" unless supplied. Record that crane and rigging qualification evidence was not provided, and that unit standards 3795 and 3789 are the minimum the crane ACOP table names.
- references include HSWA, the GRWM regulations, the October 2018 precast good practice guidelines, the crane ACOP and the rigging ACOP as published WorkSafe practice that the pages say has not been updated for HSWA 2015, and the working-at-height guideline with its HSWA status not confirmed. State Health and Safety in Employment Regulations 1995 reg 26 and reg 21 as checks. Do not decide whether this lift is notifiable. Do not treat up to the stated height as the vertical distance of the lift, and do not treat the crane class as proof that it is or is not a self-propelled mobile crane. Nobody is named as able to fall 5 metres.
- ppe lists only PPE this job needs for the people who are actually there. workerSignoff is empty.

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
  if (project.principalContractor === 'Not provided') {
    const namedPrincipal = String(ctx.jobDescription || '').match(/principal contractor(?:\s+is|:)?\s+([^.\n]+)/i);
    if (namedPrincipal) project.principalContractor = namedPrincipal[1].trim().replace(/[.,;]+$/, '');
  }
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
