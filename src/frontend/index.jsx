import React, { useEffect, useState } from "react";
import ForgeReconciler, { Button, Code, Heading, Inline, List, ListItem, Lozenge, SectionMessage, Spinner, Stack, Text, TextArea } from "@forge/react";
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
        <Text>{passed} of {core.results.length} checks passed · {what}</Text>
      </Inline>
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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const load = async () => setState(await invoke("status"));
  useEffect(() => { load(); }, []);

  const freeze = async () => {
    setBusy(true);
    setError(null);
    const r = await invoke("freeze", { checksText: draft });
    setBusy(false);
    if (!r.ok) setError(r.error);
    await load();
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
          <TextArea value={draft} onChange={(e) => setDraft(e.target.value)} resize="vertical" />
          <Inline space="space.100">
            <Button appearance="primary" onClick={freeze} isDisabled={busy}>Freeze checks</Button>
          </Inline>
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
      <Inline space="space.100">
        <Button onClick={load}>Refresh</Button>
      </Inline>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
