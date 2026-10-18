// What an answer that is too thin to print still needs, in plain words, with an example of an
// answer SiteWrite accepts (messy-user testing, 13 October 2026: a foreman typed "as per eng" for the
// load limits and the SWMS was stood down with no word on what would do). Said on the page under the
// box as the user types, and on a stood-down draft next to each answer it still needs.
//
// Each example passes the same check the draft makes (draft.js factState), so a user who writes an
// answer like it is not stood down again. Answers that are a choice need no help: they are picked.
const HELP = {
  // Asked only where the fall control is a procedure or a harness (Qld s 299(4)); its prompt starts with
  // when it is needed, so it has its own need (messy round 11, run 3: "Give only needed if the fall
  // control is ...").
  controlsConsidered: {
    need: 'Your fall control is a procedure or a harness, so list the other fall controls considered, such as edge protection, a scaffold or an elevating work platform, and why each was not used.',
    example: 'Edge protection was considered but cannot be fixed to the parapet; a scaffold cannot stand on the neighbour\'s land; an EWP cannot reach the rear roof.',
  },
  formworkDesign: {
    need: 'Name the formwork design (its drawing number), who designed it, and who inspects the formwork before the pour.',
    example: 'Formwork to the engineer\'s design FW-101 rev B, inspected and signed off by the formwork supervisor before the pour.',
  },
  temporarySupport: {
    need: 'Name the propping or temporary support design (its drawing number), and who checks the props are in place before loads go on.',
    example: 'Propping and back propping to the engineer\'s design TW-201 rev A, checked by the leading hand before loads are applied.',
  },
  loadLimits: {
    need: 'Give the allowable load on the deck or slab, where it is shown on site, and who checks it.',
    example: '3 kPa on the formwork deck, signs at each stair, packs landed over bearers, checked by the leading hand.',
  },
  systemInstructions: {
    need: 'Name the system used, its supplier, the supplier\'s instructions it is put up to (document and revision), and who trained the crew.',
    example: 'Deck system erected to the supplier\'s instructions UG-01 rev 3 by a crew trained by the supplier.',
  },
  erectionSequence: {
    need: 'Name the erection sequence and bracing drawing (number and revision), and who checks the structure is stable before each member is released.',
    example: 'Erection sequence and bracing to drawing S-501 rev C; the leading hand checks each frame is braced before the crane releases it.',
  },
  tierErection: {
    need: 'Name the precast erection design (drawing and revision), the bracing, and who checks each panel before the hook is released.',
    example: 'Panels erected to the engineer\'s erection design PC-12 rev B with two braces each, checked by the rigger before the hook is released.',
  },
  excavationPlan: {
    need: 'Give the dig sequence, the geotechnical design it follows (document and revision), the batter angle, and how plant and trucks move on site.',
    example: 'Dig in two stages to the geotechnical report GR-07 rev 2, batters no steeper than 1 in 1, trucks one way through the east gate.',
  },
  craneChart: {
    need: 'Give the crane\'s rated capacity in tonnes at the working radius in metres, from its chart.',
    example: '4.2 t at 18 m radius from the crane chart.',
  },
  groundBearing: {
    need: 'Say who confirmed the ground or slab can carry the crane\'s outrigger or track loads (an engineer\'s report or certificate, or the principal contractor\'s assessment: the operator looking at it is not enough), and the mats or pads used.',
    example: 'Geotechnical engineer\'s report GR-07 confirms 200 kPa under the outrigger pads; 1.2 m timber mats used.',
  },
  fallControl: {
    need: 'Say how a fall is prevented where the work is at height.',
    example: 'Edge protection to every open slab edge and stair void before work starts on the deck.',
  },
  silicaControls: {
    need: 'Say how silica dust is controlled, the respirator worn and its fit test, and where the written assessment is kept.',
    example: 'Cutting is done wet with a water-fed saw; P2 respirators fit tested; the silica assessment is kept in the site folder.',
  },
  hotWorkPermit: {
    need: 'Say who issues the hot work permit, who keeps the fire watch, and where the extinguishers are.',
    example: 'The builder issues the hot work permit; a fire watch stays 30 minutes after; a 4.5 kg extinguisher at the work.',
  },
  confinedSpace: {
    need: 'Give the entry permit, the gas testing, the standby person outside, and how a person is rescued.',
    example: 'Entry permit from the supervisor, gas tested before entry and every hour, standby person at the hatch with a tripod and winch.',
  },
  electricalSafety: {
    need: 'Say how far the work and plant stay from the lines, the network operator\'s permit, and who is the safety observer.',
    example: 'Plant stays 6.4 m from the 11 kV line, network permit NP-221 held, a trained safety observer watches every lift.',
  },
  isolationProcedure: {
    need: 'Say how circuits are isolated, locked and tagged, tested dead, and who holds the locks.',
    example: 'Circuits isolated at the board, personal locks and tags fitted, tested dead by the electrician before work.',
  },
  trenchSupport: {
    need: 'Say how the trench sides are held up (shoring, benching or battering), and who designed it.',
    example: 'Trench shoring boxes to the supplier\'s instructions for depths to 3 m, checked by the supervisor each morning.',
  },
  safetyDataSheet: {
    need: 'Name the product and say where its safety data sheet is kept.',
    // Not one trade's product (messy round 11, run 5: a curing compound example for a plumber).
    example: 'Each product by the name on its label, such as the sealant and primer used; their safety data sheets are in the site folder and the ute.',
  },
  harnessSystem: {
    need: 'Give the harness and lanyard used, the anchor points and who rated them, and who trained the users.',
    example: 'Full body harness with a 2 m shock-absorbing lanyard to rated anchors installed by the roofer; users trained by the supplier.',
  },
  plantIsolation: {
    need: 'Say how plant is isolated and locked out, and how it is tested before work.',
    example: 'Each energy source isolated with personal locks and tags, and tested by trying to start the plant before work.',
  },
  stressingProcedure: {
    need: 'Give the engineer\'s stressing sequence, the concrete strength needed, who does the stressing, and the exclusion zone at the jacks.',
    example: 'Stressing to the engineer\'s sequence ST-3 once the concrete reaches 22 MPa, by the stressing crew, no one behind the jacks.',
  },
  jumpformProcedure: {
    need: 'Give the supplier\'s climbing procedure, its wind limits, and who is trained to climb the jumpform.',
    example: 'Climbing to the supplier\'s procedure JF-2, no climb in winds over 40 km/h, by the trained climbing crew only.',
  },
  pilingPlatform: {
    need: 'Say who designed the piling platform, the rig it is designed for, its plant loading, and the certificate given to the operator.',
    example: 'Platform designed by the geotechnical engineer for the 60 t piling rig; certificate PP-1 given to the operator before work.',
  },
};

const lowerFirst = (text) => String(text || '').replace(/^[A-Z](?=[a-z])/, (letter) => letter.toLowerCase());

// The help for one question: { need, example }. A question with no help of its own asks for what its
// prompt names, and points to the standard answers, which are accepted.
function answerHelp(item) {
  const own = item && HELP[item.id];
  if (own) return { ...own };
  const prompt = String((item && item.prompt) || '').trim().replace(/[.?]+$/, '');
  const need = !prompt || /^choose\b/i.test(prompt)
    ? `Say more for ${lowerFirst((item && item.label) || 'this answer')}.`
    : /^(?:how|what|who|where|which|when|whether|is|are|does|has|will)\b/i.test(prompt) ? `Say ${lowerFirst(prompt)}.` : `Give ${lowerFirst(prompt)}.`;
  return { need, example: '' };
}

// The sentence said on the page and on a stood-down draft: what is needed, then the example.
function helpText(item) {
  const help = answerHelp(item);
  return help.example ? `${help.need} For example: "${help.example}"` : `${help.need} A standard answer above, with its blanks filled in, is accepted.`;
}

module.exports = { HELP, answerHelp, helpText };
