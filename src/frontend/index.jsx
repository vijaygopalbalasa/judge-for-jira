import React, { useEffect, useState } from "react";
import ForgeReconciler, { Button, Checkbox, Code, Heading, Inline, Label, List, ListItem, Lozenge, SectionMessage, Spinner, Stack, Text, TextArea, Textfield } from "@forge/react";
import { invoke } from "@forge/bridge";

const EXAMPLE = JSON.stringify({
  version: 1,
  checks: [
    { kind: "contains", params: { all: ["## Summary", "## How it was tested"] } },
    { kind: "length", params: { max: 400, unit: "words" } },
  ],
}, null, 2);

const short = (hash) => (hash ? `${hash.slice(0, 12)}…` : "");

function Receipt({ receipt }) {
  const { core } = receipt;
  const passed = core.results.filter((r) => r.pass).length;
  const what = core.delivery.source === "attachment" ? `attachment ${core.delivery.name || core.delivery.id}` : `comment ${core.delivery.id}`;
  return (
    <Stack space="space.100">
      <Inline space="space.100" alignBlock="center">
        <Lozenge appearance={core.pass ? "success" : "removed"} isBold>{core.pass ? "PASS" : "FAIL"}</Lozenge>
        <Text>{passed} of {core.results.length} checks passed</Text>
      </Inline>
      <Text>Delivery: {what}</Text>
      <List type="unordered">
        {core.results.map((r, i) => (
          <ListItem key={i}><Text>{r.pass ? "✓" : "✗"} {r.label}: {r.detail}</Text></ListItem>
        ))}
      </List>
      <Text>Receipt <Code>{short(receipt.receiptHash)}</Code></Text>
    </Stack>
  );
}

function App() {
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState(EXAMPLE);
  const [required, setRequired] = useState("## Summary\n## How it was tested");
  const [minWords, setMinWords] = useState("");
  const [maxWords, setMaxWords] = useState("400");
  const [wholeWords, setWholeWords] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [recheckResult, setRecheckResult] = useState(null);

  const load = async () => setState(await invoke("status"));
  useEffect(() => { load(); }, []);

  const run = async (name, payload) => {
    setBusy(true);
    setError(null);
    const r = await invoke(name, payload);
    setBusy(false);
    if (!r.ok) setError(r.error);
    await load();
  };
  const freezeForm = () => run("freezeForm", { form: { requiredText: required, minWords, maxWords, wholeWords } });
  const freezeJson = () => run("freeze", { checksText: draft });
  const recheckReceipt = async () => {
    setBusy(true);
    setRecheckResult(null);
    const r = await invoke("recheck");
    await load();
    setRecheckResult(r);
    setBusy(false);
  };

  if (!state) return <Spinner label="Loading Judge" />;

  return (
    <Stack space="space.200">
      {state.frozen ? (
        <Stack space="space.100">
          <Inline space="space.100" alignBlock="center">
            <Heading size="small">Acceptance checks</Heading>
            <Lozenge appearance="inprogress">Frozen</Lozenge>
          </Inline>
          <List type="unordered">
            {state.checks.map((c, i) => <ListItem key={i}><Text>{c}</Text></ListItem>)}
          </List>
          <Text>Checks <Code>{short(state.frozen.checksHash)}</Code> · frozen {state.frozen.frozenAt.slice(0, 16).replace("T", " ")} UTC</Text>
        </Stack>
      ) : (
        <Stack space="space.100">
          <SectionMessage appearance="information" title="No acceptance checks yet">
            <Text>Write the checks the work must pass, then freeze them before work starts. Every delivery (an attachment, or a comment that starts with "Delivery") is checked against exactly these checks.</Text>
          </SectionMessage>
          <Label labelFor="judge-required">Required text, one item per line</Label>
          <TextArea id="judge-required" value={required} onChange={(e) => setRequired(e.target.value)} resize="vertical" />
          <Checkbox label="Each item must stand on its own as whole words" isChecked={wholeWords} onChange={(e) => setWholeWords(e.target.checked)} />
          <Inline space="space.200">
            <Stack space="space.050">
              <Label labelFor="judge-min">Minimum words</Label>
              <Textfield id="judge-min" value={minWords} onChange={(e) => setMinWords(e.target.value)} />
            </Stack>
            <Stack space="space.050">
              <Label labelFor="judge-max">Maximum words</Label>
              <Textfield id="judge-max" value={maxWords} onChange={(e) => setMaxWords(e.target.value)} />
            </Stack>
          </Inline>
          <Inline space="space.100">
            <Button appearance="primary" onClick={freezeForm} isDisabled={busy}>Freeze checks</Button>
            <Button appearance="subtle" onClick={() => setAdvanced(!advanced)}>{advanced ? "Hide JSON" : "Advanced: write checks as JSON"}</Button>
          </Inline>
          {advanced && (
            <Stack space="space.100">
              <TextArea value={draft} onChange={(e) => setDraft(e.target.value)} resize="vertical" />
              <Inline space="space.100">
                <Button onClick={freezeJson} isDisabled={busy}>Freeze JSON checks</Button>
              </Inline>
            </Stack>
          )}
        </Stack>
      )}
      {error && <SectionMessage appearance="error"><Text>{error}</Text></SectionMessage>}
      {state.receipt && (
        <Stack space="space.100">
          <Heading size="small">Latest delivery</Heading>
          <Receipt receipt={state.receipt} />
        </Stack>
      )}
      {state.frozen && (
        <SectionMessage appearance={state.gate.allow ? "success" : "warning"} title={state.gate.allow ? "Can move to Done" : "Done is blocked"}>
          <Text>{state.gate.message}</Text>
        </SectionMessage>
      )}
      {recheckResult && (recheckResult.ok ? (
        <SectionMessage appearance={recheckResult.same ? "success" : "warning"} title={recheckResult.same ? "Receipt confirmed" : "Re-check found a difference"}>
          {recheckResult.same
            ? <Text>Re-reading the delivery from Jira and running the frozen checks again gives the same receipt: <Code>{short(recheckResult.receiptHash)}</Code></Text>
            : <List type="unordered">{recheckResult.problems.map((p, i) => <ListItem key={i}><Text>{p}</Text></ListItem>)}</List>}
        </SectionMessage>
      ) : (
        <SectionMessage appearance="error"><Text>{recheckResult.error}</Text></SectionMessage>
      ))}
      <Inline space="space.100">
        {state.receipt && <Button onClick={recheckReceipt} isDisabled={busy}>Re-check receipt</Button>}
        <Button onClick={() => { setRecheckResult(null); load(); }}>Refresh</Button>
      </Inline>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
