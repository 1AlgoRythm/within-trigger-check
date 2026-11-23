import { boot, searchTool, SERVER_INSTRUCTIONS } from "../lib/harness.mjs";
const G = "Server instructions";
const NOTE = 'Docs: "Your own instructions stay first. Keep them free of the phrases next tool call, Do not call, Do not ask, Do not say, and Do not mention. A paragraph that contains one of those is replaced by the Within instructions."';

const after = async (instructions) => {
  const s = await boot({ instructions, setup: ({ server, support }) => searchTool(support, server) });
  const got = s.client.getInstructions() ?? "";
  await s.close();
  return got;
};
const p1 = "Use search to find companies by sector or city. Prefer exact sector names.";
const p2 = "Do not mention competitors.";

export const tests = [
  {
    id: "D1", group: G, title: "Vendor instructions with 2 paragraphs, the second holding a banned phrase: what is left of the first?",
    basis: NOTE,
    async run() {
      const got = await after(`${p1}\n\n${p2}`);
      const kept1 = got.includes(p1), kept2 = got.includes(p2);
      return {
        verdict: kept1 ? "pass" : "fail",
        expected: "paragraph 1 kept, only paragraph 2 replaced",
        observed: `paragraph 1 kept: ${kept1}; paragraph 2 kept: ${kept2}; instructions are now exactly Within's text: ${got === SERVER_INSTRUCTIONS}`,
        evidence: { paragraph1Kept: kept1, paragraph2Kept: kept2, equalsWithinText: got === SERVER_INSTRUCTIONS, length: got.length },
      };
    },
  },
  {
    id: "D2", group: G, title: "Which phrases trigger the replacement (docs list five)?",
    basis: NOTE,
    async run() {
      const rows = [];
      for (const phrase of ["next tool call", "Do not call", "Do not ask", "Do not say", "Do not mention", "do not mention", "Never mention", "Don't mention", "Do NOT mention"]) {
        const got = await after(`${p1}\n\nPlease ${phrase} the pricing page.`);
        rows.push({ phrase, replaced: !got.includes(`Please ${phrase} the pricing page.`), inDocsList: ["next tool call", "Do not call", "Do not ask", "Do not say", "Do not mention"].includes(phrase) });
      }
      const docsBroken = rows.filter((r) => r.inDocsList && !r.replaced);
      return {
        verdict: docsBroken.length ? "fail" : "info",
        expected: "the five listed phrases replace; others pass through",
        observed: rows.map((r) => `"${r.phrase}": ${r.replaced ? "replaced" : "kept"}`).join("; "),
        evidence: { rows },
      };
    },
  },
  {
    id: "D3", group: G, title: "Docs' own quickstart pattern (vendor pastes SERVER_INSTRUCTIONS into its instructions): is a banned phrase still removed?",
    basis: 'Docs quickstart: instructions: `Your business instructions. ${SERVER_INSTRUCTIONS}`',
    async run() {
      const got = await after(`${p1} ${p2} ${SERVER_INSTRUCTIONS}`);
      return {
        verdict: "info",
        expected: "n/a",
        observed: `with the pasted text, the vendor's own sentences were kept: ${got.includes(p1) && got.includes(p2)}. So the replacement rule only runs when the vendor does NOT paste SERVER_INSTRUCTIONS.`,
        evidence: { kept: got.includes(p1) && got.includes(p2) },
      };
    },
  },
  {
    id: "D4", group: G, title: "Normal vendor instructions with no banned phrase: vendor text first, Within's after?",
    basis: 'Docs: "Your own instructions stay first."',
    async run() {
      const got = await after(p1);
      const ok = got.startsWith(p1) && got.endsWith(SERVER_INSTRUCTIONS);
      return { verdict: ok ? "pass" : "fail", expected: "vendor text, then Within's", observed: `starts with vendor text: ${got.startsWith(p1)}; ends with Within's text: ${got.endsWith(SERVER_INSTRUCTIONS)}`, evidence: {} };
    },
  },
  {
    id: "D5", group: G, title: "How long is the text Within adds to every server's instructions?",
    basis: "Measurement. This is the text the model reads to decide whether to call Within.",
    async run() {
      return { verdict: "info", expected: "n/a", observed: `${SERVER_INSTRUCTIONS.length} characters`, evidence: { characters: SERVER_INSTRUCTIONS.length, text: SERVER_INSTRUCTIONS } };
    },
  },
];
