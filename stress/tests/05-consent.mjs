import { boot, searchTool, textOf } from "../lib/harness.mjs";
const G = "Consent";
const OFFER = { id: "offer_1", status: "pending", source: "manual", representativeName: "Sarah", representativeRole: "Sales", vendorName: "Acme" };

export const tests = [
  {
    id: "E1", group: G, title: "The model calls confirm_assistance with no arguments while a rep's offer is pending. What does the SDK send?",
    basis: 'Docs: "With no offer id, it accepts the pending manual offer for this session." and "confirm_assistance checks the nonce when a caller sends one. A text host may omit it." Docs trust section: "The vendor is contacted only after confirm_assistance or file_note succeeds."',
    async run() {
      const s = await boot({ setup: ({ server, support }) => searchTool(support, server) });
      s.stub.cfg.offer = OFFER;
      const r = await s.call("confirm_assistance", {});
      const accept = s.stub.byPath("/v1/offers/offer_1/accept")[0];
      await s.close();
      const accepted = r.structuredContent?.status === "accepted";
      return {
        verdict: accepted && accept && !("consentNonce" in (accept.body ?? {})) ? "gap" : "pass",
        expected: "n/a: documented. Records what protects the customer's choice.",
        observed: `the SDK sent the accept to Within with no customer click and no nonce: ${!!accept && !("consentNonce" in (accept.body ?? {}))}; the model was told: "${textOf(r)}"`,
        evidence: { acceptBody: accept?.body ?? null, status: r.structuredContent?.status },
      };
    },
  },
  {
    id: "E2", group: G, title: "Is confirm_assistance visible to the model, or limited to the card?",
    basis: "MCP Apps convention: a tool meant only for the card can be marked visibility [\"app\"] so the model never sees it. Measurement of how Within registers it.",
    async run() {
      const s = await boot({ setup: ({ server, support }) => searchTool(support, server) });
      const tools = (await s.client.listTools()).tools;
      await s.close();
      const info = Object.fromEntries(["get_vendor_answer", "confirm_assistance", "decline_assistance"].map((n) => { const t = tools.find((x) => x.name === n); return [n, { listedToModel: !!t, visibility: t?._meta?.ui?.visibility ?? null }]; }));
      return {
        verdict: ["confirm_assistance"].every((n) => info[n].listedToModel && (!info[n].visibility || info[n].visibility.includes("model"))) ? "gap" : "pass",
        expected: "n/a",
        observed: JSON.stringify(info),
        evidence: info,
      };
    },
  },
  {
    id: "E3", group: G, title: "The model passes an offer id the customer was never shown: does the SDK check it?",
    basis: "Measurement. The SDK is a thin client, so authorizing an id is the server's job; this records what the SDK itself does.",
    async run() {
      const s = await boot({ setup: ({ server, support }) => searchTool(support, server) });
      const r = await s.call("confirm_assistance", { offerId: "offer_never_shown_999" });
      const sent = s.stub.byPath("/v1/offers/offer_never_shown_999/accept")[0];
      await s.close();
      return {
        verdict: "info", expected: "n/a",
        observed: `the SDK forwarded the id to Within without checking: ${!!sent}. What Within's server does with it cannot be seen from here.`,
        evidence: { forwarded: !!sent, path: sent?.path ?? null },
      };
    },
  },
];
