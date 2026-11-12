import { useEffect, useRef, useState } from "react";
import type { AiConfiguration, AiConnectionsState, ConnectionTestResult, WorkiqConfiguration } from "../../../shared/ai";
import { useUpdateBlocker } from "../../state/UpdateProvider";
import { Button } from "../ui/Button";
import { TextField } from "../ui/TextField";
import { ErrorBanner } from "../ui/ErrorBanner";
import { Spinner } from "../ui/Spinner";

function TestOutcome({ result }: { result: ConnectionTestResult | null }) {
  if (!result) return null;
  return (
    <div className={`connection-outcome connection-${result.status}`} role={result.status === "error" ? "alert" : "status"}>
      <strong>{result.message}</strong>
      <p className="field-hint">Tested {new Date(result.checkedAt).toLocaleString()}{result.identity ? ` as ${result.identity}` : ""}.</p>
      {result.response ? <pre className="connection-response">{result.response}</pre> : null}
      {result.details ? <p>{result.details}</p> : null}
    </div>
  );
}

export function AiConnectionsPanel() {
  const [state, setState] = useState<AiConnectionsState | null>(null);
  const [ai, setAi] = useState<AiConfiguration>({ runtimePath: "", model: "" });
  const [workiq, setWorkiq] = useState<WorkiqConfiguration>({ executablePath: "", tenantId: "" });
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<"ai" | "workiq" | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);
  const localTest = useRef(false);
  const dirtyAi = state !== null && (ai.runtimePath !== state.ai.runtimePath || ai.model !== state.ai.model);
  const dirtyWorkiq = state !== null && (workiq.executablePath !== state.workiq.executablePath || workiq.tenantId !== state.workiq.tenantId);
  const aiReady = !dirtyAi && state?.aiTest?.status === "success";
  useUpdateBlocker(Boolean(testing) || dirtyAi || dirtyWorkiq);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await window.desktop.getAiConnections();
      if (!mounted.current) return;
      setState(next);
      setAi(next.ai);
      setWorkiq(next.workiq);
      setTesting(next.testing);
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally { if (mounted.current) setLoading(false); }
  };

  useEffect(() => {
    mounted.current = true;
    void load();
    return () => {
      mounted.current = false;
      void window.desktop.cancelAiTest().catch(() => console.error("AI_TEST_CANCEL_FAILED"));
    };
  }, []);

  useEffect(() => {
    if (!testing || localTest.current) return;
    const timer = setInterval(() => {
      void window.desktop.getAiConnections().then((next) => {
        if (mounted.current) { setState(next); setTesting(next.testing); }
      }).catch((reason: unknown) => {
        if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason));
      });
    }, 500);
    return () => clearInterval(timer);
  }, [testing]);

  const test = async (kind: "ai" | "workiq") => {
    localTest.current = true;
    setTesting(kind);
    setError(null);
    // A retest invalidates the dependent connection immediately, not only after
    // the provider replies. The main process enforces the same gate.
    setState((current) => current && {
      ...current, ...(kind === "ai" ? { aiTest: null, workiqTest: null } : { workiqTest: null }),
    });
    try {
      const next = kind === "ai" ? await window.desktop.testAiAccess(ai) : await window.desktop.testWorkiqAccess(workiq);
      if (mounted.current) {
        setState(next);
        if (kind === "ai") setAi(next.ai);
        else setWorkiq(next.workiq);
      }
    } catch (reason) {
      if (mounted.current) setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      localTest.current = false;
      if (mounted.current) { setTesting(null); setCancelling(false); }
    }
  };

  const cancel = async () => {
    setCancelling(true);
    try { await window.desktop.cancelAiTest(); }
    catch (reason) {
      if (mounted.current) { setError(reason instanceof Error ? reason.message : String(reason)); setCancelling(false); }
    }
  };

  return (
    <>
      <section className="settings-section ai-connections" aria-labelledby="ai-access-heading">
        <h2 id="ai-access-heading">AI / LLM access</h2>
        <p>Use your existing GitHub Copilot sign-in. No API key, new Entra app registration, or MSX scope change is needed.</p>
        <p className="field-hint">The test saves these settings and sends one synthetic prompt to an actual LLM. It uses your Copilot allowance, not your portfolio data. Tests are reverified after each app launch.</p>
        {error ? <ErrorBanner message={error} onRetry={() => void load()} /> : null}
        {loading ? <Spinner label="Loading AI connections..." /> : (
          <>
            <fieldset disabled={Boolean(testing) || !state}>
              <legend>GitHub Copilot configuration</legend>
              <div className="connection-fields">
                <TextField label="Copilot runtime path (optional)" value={ai.runtimePath}
                  placeholder="Leave blank to use the bundled compatible runtime"
                  hint="An absolute path to a trusted Copilot .exe. The bundled runtime uses your existing official CLI sign-in."
                  onChange={(event) => setAi({ ...ai, runtimePath: event.target.value })} />
                <TextField label="Model ID (optional)" value={ai.model} placeholder="Use the runtime's default model"
                  hint="A model ID permitted by your Copilot plan and organization. No automatic fallback for a specified model."
                  onChange={(event) => setAi({ ...ai, model: event.target.value })} />
              </div>
              <Button variant="primary" onClick={() => void test("ai")}>Test AI access</Button>
            </fieldset>
            {testing === "ai" ? <Spinner label="Calling the LLM with a synthetic test prompt..." /> : null}
            {!dirtyAi ? <TestOutcome result={state?.aiTest ?? null} /> : <p className="field-hint">Configuration changed. Test AI access again to enable Work IQ.</p>}
          </>
        )}
        {testing ? <div className="settings-actions connection-stop">
          <Button disabled={cancelling} onClick={() => void cancel()}>{cancelling ? "Stopping test..." : "Stop connection test"}</Button>
        </div> : null}
        <p className="field-hint">If sign-in is needed, use the official Copilot CLI sign-in and retry. This initial version does not manage a separate OAuth login. Only the synthetic response is displayed; official clients may retain their own test diagnostics.</p>
      </section>

      <section className="settings-section workiq-connections" aria-labelledby="workiq-access-heading">
        <h2 id="workiq-access-heading">Work IQ access</h2>
        <p>Connect an existing, trusted official local Work IQ MCP installation. Its client owns Microsoft sign-in and existing permissions; MCAPS never copies its tokens.</p>
        {!aiReady ? <p className="callout" role="note">First complete a successful AI access test above. Work IQ configuration and testing are locked until then.</p> : null}
        <fieldset disabled={!aiReady || Boolean(testing)}>
          <legend>Existing Work IQ client</legend>
          <div className="connection-fields">
            <TextField label="Work IQ installation path (optional)" value={workiq.executablePath}
              placeholder="Automatically detect the existing local installation"
              hint="Official .exe, npm shim (.cmd / .ps1), or bin\\workiq.js. Testing executes this trusted installation; no download or installation occurs."
              onChange={(event) => setWorkiq({ ...workiq, executablePath: event.target.value })} />
            <TextField label="Work IQ tenant ID (optional)" value={workiq.tenantId}
              placeholder="Use the official client's default tenant"
              hint="Directory tenant GUID, not an email address. Leave blank to use the existing client's selection."
              onChange={(event) => setWorkiq({ ...workiq, tenantId: event.target.value })} />
          </div>
          <Button variant="primary" onClick={() => void test("workiq")}>Test Work IQ access</Button>
        </fieldset>
        {testing === "workiq" ? <Spinner label="Checking the Work IQ service with a synthetic question..." /> : null}
        {aiReady && !dirtyWorkiq ? <TestOutcome result={state?.workiqTest ?? null} /> : null}
        <p className="field-hint">The test makes a real service call using your existing access and billing, asking only for a test marker. It does not request workplace content and does not verify search permissions. Cowork-only browser sessions and remote-only MCP setups are not connected by this initial local-client integration.</p>
      </section>
    </>
  );
}
