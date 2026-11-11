import { afterEach, describe, expect, it, vi } from "vitest";
import type { AccountSearchResult, PortfolioAccount, SalesTerritory, TerritoryImportProgress } from "../shared/types";
import { TerritoryImportService } from "./territory-import-service";

const territories: SalesTerritory[] = ["one", "two"].map((id) => ({
  id, name: `Demo ${id}`, accountTeamUnitGroup: "Demo group", salesUnit: "Demo unit",
  salesGroup: "Demo sales group", fiscalYear: null,
}));
function account(id: string, tpid: string | null): AccountSearchResult {
  return { id, tpid, name: "Same demo name", parentingLevel: "Child", country: null };
}
function fixture() {
  const active: PortfolioAccount[] = [{
    id: "local", name: "Existing demo", tpid: "100", msxAccountId: "top-100", country: null, createdAt: "2026-01-01",
  }];
  const msx = {
    listTerritories: vi.fn(async () => territories),
    accountsForTerritory: vi.fn(async (id: string) => id === "one" ?
      [account("child-a", "100"), account("child-b", "100"), account("child-c", "200")] :
      [account("child-c", "200"), account("child-d", "300")]),
    resolveTopParent: vi.fn(async (tpid: string) => ({
      id: `top-${tpid}`, name: "Same demo name", tpid, parentingLevel: "Top", country: null, url: "https://example.invalid",
    })),
  };
  const portfolio = {
    listAccounts: () => active,
    addAccount: vi.fn(async (id: string) => {
      const added: PortfolioAccount = { id, tpid: id.replace("top-", ""), name: "Demo",
        msxAccountId: id, country: null, createdAt: "2026-01-01" };
      active.push(added);
      return added;
    }),
  };
  const auth = { getAccountKey: vi.fn(async () => "demo-account") };
  return { msx, portfolio, auth, service: new TerritoryImportService(msx, portfolio, auth) };
}
afterEach(() => { vi.useRealTimers(); });

describe("territory top-parent import", () => {
  it("previews all selected territories, resolves each TPID once and never writes accounts before confirmation", async () => {
    const test = fixture();
    const preview = await test.service.preview(["one", "two", "one"]);
    expect(preview.territories).toHaveLength(2);
    expect(preview.accounts.map((item) => item.tpid)).toEqual(["100", "200", "300"]);
    expect(preview.alreadyPresent).toBe(1);
    expect(test.msx.resolveTopParent).toHaveBeenCalledTimes(3);
    expect(test.portfolio.addAccount).not.toHaveBeenCalled();
  });

  it("imports only unique top parents with existing add logic, skips present TPIDs and reports progress", async () => {
    const test = fixture();
    const preview = await test.service.preview(["one", "two"]);
    const progress: TerritoryImportProgress[] = [];
    expect(await test.service.import(preview.id, (value) => progress.push(value)))
      .toEqual({ added: 2, skipped: 1, failures: [] });
    expect(test.portfolio.addAccount.mock.calls.map(([id]) => id)).toEqual(["top-200", "top-300"]);
    expect(progress.at(-1)).toEqual({ completed: 3, total: 3, added: 2, skipped: 1, failed: 0 });
    await expect(test.service.import(preview.id, () => undefined)).rejects.toThrow("expired");
  });

  it("reports partial failures and safely skips successful imports on a new preview", async () => {
    const test = fixture();
    test.portfolio.addAccount.mockRejectedValueOnce(new Error("MSX temporarily unavailable"));
    const preview = await test.service.preview(["one", "two"]);
    const result = await test.service.import(preview.id, () => undefined);
    expect(result).toMatchObject({ added: 1, skipped: 1, failures: [{ id: "top-200", message: "MSX temporarily unavailable" }] });
    const retry = await test.service.preview(["one", "two"]);
    expect(retry.alreadyPresent).toBe(2);
    expect(await test.service.import(retry.id, () => undefined)).toEqual({ added: 1, skipped: 2, failures: [] });
  });

  it("shows unresolved TPIDs and missing TPIDs rather than selecting a child as a fallback", async () => {
    const test = fixture();
    test.msx.accountsForTerritory.mockResolvedValue([account("child", "200"), account("missing", null)]);
    test.msx.resolveTopParent.mockRejectedValue(new Error("No accessible top parent"));
    const preview = await test.service.preview(["one"]);
    expect(preview.accounts).toEqual([]);
    expect(preview.unresolved).toHaveLength(2);
    expect(test.portfolio.addAccount).not.toHaveBeenCalled();
  });

  it("rejects stale, reset, or cross-user previews before adding accounts", async () => {
    const test = fixture();
    const preview = await test.service.preview(["one"]);
    test.auth.getAccountKey.mockResolvedValue("different-user");
    await expect(test.service.import(preview.id, () => undefined)).rejects.toThrow("session");
    test.auth.getAccountKey.mockResolvedValue("demo-account");
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 16 * 60 * 1000);
    await expect(test.service.import(preview.id, () => undefined)).rejects.toThrow("expired");
    test.service.clear();
    await expect(test.service.import(preview.id, () => undefined)).rejects.toThrow("expired");
    expect(test.portfolio.addAccount).not.toHaveBeenCalled();
  });
});
