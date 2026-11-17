// A tiny vendor MCP server ("Acme", a fake company-data product) with Within installed,
// following the quickstart in https://www.getwith.in/docs. Runs over stdio so Claude Code
// can start it. WITHIN_URL decides where the SDK sends its calls (our stub/proxy by default).
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { SERVER_INSTRUCTIONS, SupportBridge } from "@getwithin/sdk";

const COMPANIES = [
  { name: "Ledgerly", sector: "fintech", city: "New York", stage: "Series A" },
  { name: "Paywise", sector: "fintech", city: "Boston", stage: "Seed" },
  { name: "Clearbank Labs", sector: "fintech", city: "Austin", stage: "Series B" },
  { name: "Vaultline", sector: "fintech", city: "Chicago", stage: "Series A" },
  { name: "Coinrail", sector: "fintech", city: "Miami", stage: "Seed" },
  { name: "Medora", sector: "healthcare", city: "Boston", stage: "Series B" },
  { name: "Carepath", sector: "healthcare", city: "Denver", stage: "Seed" },
  { name: "Shipwell Robotics", sector: "logistics", city: "Seattle", stage: "Series A" },
  { name: "Guardpoint", sector: "security", city: "Boston", stage: "Series A" },
  { name: "Invoicr", sector: "billing software", city: "Toronto", stage: "Seed" },
];

const server = new McpServer(
  { name: "acme", version: "1.0.0" },
  { instructions: `Acme is a database of private companies. Use search_companies to find companies by sector or city. ${SERVER_INSTRUCTIONS}` },
);

const support = SupportBridge.install(server, {
  apiKey: process.env.SUPPORTBRIDGE_API_KEY || "sb_local_stub",
  baseUrl: process.env.WITHIN_URL || "http://127.0.0.1:8787",
  source: "acme-trigger-check",
  vendorName: "Acme",
});

const register = (tool) =>
  server.registerTool(tool.name, { title: tool.title, description: tool.description, inputSchema: tool.inputSchema }, tool.handler);

register(support.wrapTool({
  name: "search_companies",
  title: "Search companies",
  description: "Search Acme's database of private companies by sector, city or name.",
  inputSchema: { query: z.string().describe("Sector, city or name, e.g. 'fintech' or 'Boston'") },
  handler: async ({ query }) => {
    const q = query.toLowerCase();
    const hits = COMPANIES.filter((c) => Object.values(c).some((v) => v.toLowerCase().includes(q)));
    return {
      content: [{ type: "text", text: hits.length ? hits.map((c) => `${c.name} (${c.sector}, ${c.city}, ${c.stage})`).join("\n") : "No companies found." }],
      structuredContent: { query, companies: hits },
    };
  },
}));

register(support.wrapTool({
  name: "get_company",
  title: "Get company",
  description: "Get the full Acme profile of one company by exact name.",
  inputSchema: { name: z.string() },
  handler: async ({ name }) => {
    const c = COMPANIES.find((x) => x.name.toLowerCase() === name.toLowerCase());
    return { content: [{ type: "text", text: c ? JSON.stringify(c) : `No company named ${name}.` }] };
  },
}));

await server.connect(new StdioServerTransport());
