import { useEffect, useMemo, useState } from "react";
import type {
  AccountPreview,
  AccountSearchResult,
  PortfolioAccount,
} from "../../../shared/types";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { Spinner } from "../ui/Spinner";
import { ErrorBanner } from "../ui/ErrorBanner";
import { formatNumber } from "../../lib/format";

interface AccountOnboardingProps {
  existingAccounts?: PortfolioAccount[];
  onAdded: (account: PortfolioAccount) => void;
  onOpenExisting?: (accountId: string) => void;
  onCancel?: () => void;
}

type Step = "search" | "preview";
type SearchMode = "name" | "tpid";

export function AccountOnboarding({
  existingAccounts = [],
  onAdded,
  onOpenExisting,
  onCancel,
}: AccountOnboardingProps) {
  const [step, setStep] = useState<Step>("search");
  const [searchMode, setSearchMode] = useState<SearchMode>("name");
  const [term, setTerm] = useState("");
  const debouncedTerm = useDebouncedValue(term.trim(), 300);
  const [results, setResults] = useState<AccountSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);

  const [preview, setPreview] = useState<AccountPreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  useEffect(() => {
    const valid =
      searchMode === "name"
        ? debouncedTerm.length >= 3
        : /^\d{3,20}$/.test(debouncedTerm);
    if (!valid) {
      setResults([]);
      setSearchError(null);
      return;
    }
    let cancelled = false;
    setSearching(true);
    setSearchError(null);
    window.desktop
      .searchAccounts(debouncedTerm)
      .then((found) => {
        if (!cancelled) setResults(found);
      })
      .catch((error: unknown) => {
        if (!cancelled) {
          setSearchError(error instanceof Error ? error.message : String(error));
        }
      })
      .finally(() => {
        if (!cancelled) setSearching(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedTerm, searchMode]);

  const existingByTpid = useMemo(
    () => new Map(existingAccounts.map((account) => [account.tpid, account])),
    [existingAccounts],
  );

  const selectResult = async (result: AccountSearchResult) => {
    setPreviewLoading(true);
    setPreviewError(null);
    setPreview(null);
    setAddError(null);
    try {
      const found = await window.desktop.previewAccount(result.id);
      setPreview(found);
      setStep("preview");
    } catch (error) {
      setPreviewError(error instanceof Error ? error.message : String(error));
    } finally {
      setPreviewLoading(false);
    }
  };

  const confirmAdd = async () => {
    if (!preview) return;
    setAdding(true);
    setAddError(null);
    try {
      const account = await window.desktop.addAccount(preview.topParent.id);
      onAdded(account);
    } catch (error) {
      setAddError(error instanceof Error ? error.message : String(error));
    } finally {
      setAdding(false);
    }
  };

  if (step === "preview" && preview) {
    const isChild = preview.selected.id !== preview.topParent.id;
    const existing = preview.topParent.tpid
      ? existingByTpid.get(preview.topParent.tpid)
      : undefined;
    return (
      <div className="onboarding-preview">
        {isChild ? (
          <div className="callout callout-info">
            <p>
              <strong>{preview.selected.name}</strong> is a child of{" "}
              <strong>{preview.topParent.name}</strong>. Tracking the child separately
              would duplicate milestones already included under the top parent, so CSU
              Console will track the top parent instead.
            </p>
          </div>
        ) : null}

        <dl className="preview-facts">
          <div>
            <dt>Top parent</dt>
            <dd>{preview.topParent.name}</dd>
          </div>
          <div>
            <dt>TPID</dt>
            <dd>{preview.topParent.tpid ?? "Unknown"}</dd>
          </div>
          <div>
            <dt>Country</dt>
            <dd>{preview.topParent.country ?? "Unknown"}</dd>
          </div>
          <div>
            <dt>Account tree size</dt>
            <dd>{formatNumber(preview.tree.length)} accounts</dd>
          </div>
          <div>
            <dt>Milestones in current window</dt>
            <dd>{formatNumber(preview.milestoneCount)}</dd>
          </div>
        </dl>

        {preview.alreadyTracked ? (
          <div className="callout callout-warning">
            <p>TPID {preview.topParent.tpid} is already tracked in this portfolio.</p>
            {existing && onOpenExisting ? (
              <Button variant="secondary" onClick={() => onOpenExisting(existing.id)}>
                Open {existing.name}
              </Button>
            ) : null}
          </div>
        ) : null}

        {addError ? <ErrorBanner message={addError} /> : null}

        <div className="onboarding-actions">
          <Button variant="ghost" onClick={() => setStep("search")} disabled={adding}>
            Back to search
          </Button>
          <Button
            variant="primary"
            onClick={() => void confirmAdd()}
            busy={adding}
            disabled={preview.alreadyTracked}
          >
            Add top parent
          </Button>
          {onCancel ? (
            <Button variant="ghost" onClick={onCancel} disabled={adding}>
              Cancel
            </Button>
          ) : null}
        </div>
        {adding ? (
          <p className="field-hint" role="status">
            Fetching the baseline set of milestones. This can take a moment for large
            account trees.
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="onboarding-search">
      <div className="search-mode-picker" role="group" aria-label="Account lookup method">
        <button
          type="button"
          className={searchMode === "name" ? "search-mode-active" : ""}
          aria-pressed={searchMode === "name"}
          onClick={() => {
            setSearchMode("name");
            setTerm("");
            setResults([]);
          }}
        >
          Search by name
        </button>
        <button
          type="button"
          className={searchMode === "tpid" ? "search-mode-active" : ""}
          aria-pressed={searchMode === "tpid"}
          onClick={() => {
            setSearchMode("tpid");
            setTerm("");
            setResults([]);
          }}
        >
          Enter TPID
        </button>
      </div>
      <TextField
        label={searchMode === "name" ? "Customer name" : "Top-parent TPID"}
        hint={
          searchMode === "name"
            ? "Enter at least 3 characters. Selecting any child account resolves to its top parent."
            : "Enter the numeric TPID. CSU Console finds the associated top-parent account."
        }
        value={term}
        onChange={(event) => setTerm(event.target.value)}
        placeholder={searchMode === "name" ? "e.g. Contoso" : "e.g. 1877639"}
        inputMode={searchMode === "tpid" ? "numeric" : undefined}
        autoFocus
      />
      {searching ? <Spinner label="Searching MSX..." /> : null}
      {searchError ? <ErrorBanner message={searchError} /> : null}
      {previewError ? <ErrorBanner message={previewError} /> : null}

      {!searching &&
      (searchMode === "name"
        ? debouncedTerm.length >= 3
        : /^\d{3,20}$/.test(debouncedTerm)) &&
      results.length === 0 &&
      !searchError ? (
        <p className="field-hint">No matching accounts found.</p>
      ) : null}

      <ul className="search-results" aria-label="Account search results">
        {results.map((result) => (
          <li key={result.id} className="search-result-row">
            <div>
              <p className="search-result-name">{result.name}</p>
              <p className="search-result-meta">
                {result.parentingLevel ?? "Unknown level"}
                {result.country ? ` - ${result.country}` : ""}
                {result.tpid ? ` - TPID ${result.tpid}` : ""}
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() => void selectResult(result)}
              busy={previewLoading}
            >
              Select
            </Button>
          </li>
        ))}
      </ul>

      {onCancel ? (
        <div className="onboarding-actions">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      ) : null}
    </div>
  );
}
