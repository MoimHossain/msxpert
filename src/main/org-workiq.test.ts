import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  options: [] as Record<string, unknown>[],
  connect: vi.fn(async () => {}),
  tools: vi.fn(async () => ({ tools: [{ name: "ask_work_iq", inputSchema: { properties: { question: { type: "string" } }, required: ["question"] } }] })),
  call: vi.fn(),
  close: vi.fn(async () => {}),
  transportClose: vi.fn(async () => {}),
}));
vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class { connect = mocks.connect; listTools = mocks.tools; callTool = mocks.call; close = mocks.close; },
}));
vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: class {
    stderr = { on: vi.fn() };
    close = mocks.transportClose;
    constructor(options: Record<string, unknown>) { mocks.options.push(options); }
  },
}));
vi.mock("./ai-runtime", async () => {
  const actual = await vi.importActual<typeof import("./ai-runtime")>("./ai-runtime");
  return { ...actual, workiqCommand: vi.fn(() => ({ command: "trusted-workiq.exe", args: [], env: { DO_NOT_TRACK: "1" } })) };
});

import { openOrgWorkiqSession, orgProfileQuestion, readOrgWorkiqResult, OrgResponseError, OrgWorkiqError } from "./org-workiq";
const profile = (overrides = {}) => ({ name: "Synthetic Example", upn: "example@example.test", jobTitle: "CSA", hasReports: false, ...overrides });
const facts = (overrides = {}) => ({ person: profile(), manager: null, reports: [], complete: true, limitations: [], ...overrides });
const mcp = (text: string) => ({ content: [{ type: "text", text }] });
beforeEach(() => {
  vi.clearAllMocks();
  mocks.options.length = 0;
  mocks.call.mockResolvedValue(mcp(JSON.stringify(facts())));
});

describe("Work IQ profile response validation", () => {
  it("accepts known fences/wrapped response strings and extracts an Office display label without using the link as identity", () => {
    const body = facts({ person: profile({ name: "[Synthetic Person](https://office.com/people/opaque-entity)" }) });
    const parsed = readOrgWorkiqResult(mcp(JSON.stringify({ response: `\`\`\`json\n${JSON.stringify(body)}\n\`\`\`` })), "EXAMPLE@example.test");
    expect(parsed.person).toMatchObject({ name: "Synthetic Person", upn: "example@example.test" });
    expect(parsed.complete).toBe(true);
    expect(JSON.stringify(parsed)).not.toContain("opaque-entity");
  });

  it.each([
    mcp("The person's name is Example."),
    mcp('{"person":'),
    mcp(JSON.stringify(facts({ person: profile({ upn: "EntityRepresentationId:123" }) }))),
    mcp(JSON.stringify(facts({ person: profile({ upn: "other@example.test" }) }))),
  ])("rejects prose, malformed JSON and invalid/mismatched exact identities", value => {
    expect(() => readOrgWorkiqResult(value, "example@example.test")).toThrow();
  });

  it.each([
    { isError: true, content: [] },
    mcp(JSON.stringify({ result: { error: { code: "Forbidden" } } })),
    { structuredContent: { result: { statusCode: 403 } }, content: [{ type: "text", text: JSON.stringify(facts()) }] },
    mcp(JSON.stringify({ response: JSON.stringify({ errors: ["Permission denied"] }) })),
  ])("rejects nested service errors without retrying prose", value => expect(() => readOrgWorkiqResult(value)).toThrow(/service error/));

  it("keeps usable facts while marking missing fields, invalid reports, truncation and unknown report status partial", () => {
    const parsed = readOrgWorkiqResult(facts({
      person: { upn: "example@example.test" }, manager: { upn: "not-an-address" },
      reports: [profile(), profile({ upn: "invalid" })], complete: false,
      limitations: ["Sensitive unneeded prose must not be stored"],
    }));
    expect(parsed.person.hasReports).toBeNull();
    expect(parsed.reports).toHaveLength(1);
    expect(parsed.manager).toBeNull();
    expect(parsed.complete).toBe(false);
    expect(parsed.limitations.length).toBeGreaterThan(0);
    expect(JSON.stringify(parsed)).not.toContain("Sensitive");
  });

  it("marks only malformed JSON-shaped profile responses as eligible for format correction", () => {
    for (const [value, correctable] of [
      [mcp('{"person":'), true],
      [mcp("I cannot provide this profile."), false],
      [facts({ person: profile({ upn: "other@example.test" }) }), false],
      [facts({ person: null }), false],
    ] as const) {
      try {
        readOrgWorkiqResult(value, "example@example.test");
        expect.fail("Expected profile rejection");
      } catch (error) {
        expect(error).toBeInstanceOf(OrgResponseError);
        expect((error as OrgResponseError).correctableFormat).toBe(correctable);
      }
    }
  });

  it.each([
    mcp("Access denied by policy."),
    mcp('{"person":null,"limitations":["Permission denied'),
    facts({ limitations: ["I do not have access to the direct reports."] }),
  ])("stops on an explicit denial rather than treating it as a correctable format error", value => {
    expect(() => readOrgWorkiqResult(value)).toThrow(OrgWorkiqError);
  });

  it("asks only profile facts with exact UPNs and disallows unrelated content/actions", () => {
    const question = orgProfileQuestion("example@example.test", true);
    expect(question).toContain('"example@example.test"');
    expect(question).toContain("immediate direct reports only");
    expect(question).toContain("Do not read email");
    expect(question).toContain("Do not invent paging");
    expect(question).toContain("Do not try to determine the client's signed-in account");
    expect(question).toContain("return person=null");
    expect(question).not.toContain("or query Microsoft Graph");
    expect(() => orgProfileQuestion("display name", true)).toThrow();
  });
});

describe("official question-only MCP session", () => {
  it("uses only the supported question tool, tenant args, drains diagnostics and closes idempotently", async () => {
    const session = await openOrgWorkiqSession({ executablePath: "", tenantId: "synthetic-tenant" }, new AbortController().signal);
    expect(mocks.options[0]).toMatchObject({ command: "trusted-workiq.exe", args: ["--tenant-id", "synthetic-tenant", "mcp"], stderr: "pipe" });
    const result = await session.query("example@example.test", true, new AbortController().signal);
    expect(result.person.upn).toBe("example@example.test");
    expect(mocks.call).toHaveBeenCalledWith(
      { name: "ask_work_iq", arguments: { question: expect.any(String) } }, undefined,
      expect.objectContaining({ signal: expect.any(AbortSignal), timeout: 90_000 }),
    );
    await session.close();
    await session.close();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.transportClose).toHaveBeenCalledOnce();
  });

  it("closes the process on cancellation and never discovers an alternative directory tool", async () => {
    const controller = new AbortController();
    await openOrgWorkiqSession({ executablePath: "", tenantId: "" }, controller.signal);
    controller.abort();
    await vi.waitFor(() => expect(mocks.transportClose).toHaveBeenCalledOnce());
    expect(mocks.call).not.toHaveBeenCalled();
  });

  it("uses the same exact-profile question tool for an explicit JSON format correction", async () => {
    const session = await openOrgWorkiqSession({ executablePath: "", tenantId: "" }, new AbortController().signal);
    await session.query("example@example.test", true, new AbortController().signal, { correctFormat: true });
    expect(mocks.call.mock.calls[0]?.[0]).toMatchObject({
      name: "ask_work_iq", arguments: { question: expect.stringContaining("FORMAT CORRECTION") },
    });
    expect(mocks.call.mock.calls[0]?.[0].arguments.question).toContain('"example@example.test"');
    await session.close();
  });
});

describe("milestone-person profile-only requests", () => {
  it("does not require or retain manager/report relationships to accept an exact profile", () => {
    const parsed = readOrgWorkiqResult({ person: { name: "Synthetic", upn: "example@example.test", jobTitle: "CSA" },
      complete: true, limitations: [] }, "example@example.test", true);
    expect(parsed).toMatchObject({ complete: true, manager: null, reports: [], limitations: [] });
    const question = orgProfileQuestion("example@example.test", false, true);
    expect(question).toContain("Do not retrieve a manager or any reports");
    expect(question).not.toContain("and that person's immediate manager");
    expect(() => readOrgWorkiqResult(facts({ person: profile({ upn: "other@example.test" }) }), "example@example.test", true)).toThrow();
  });
});
