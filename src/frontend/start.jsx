import React from "react";
import ForgeReconciler, { Heading, List, ListItem, SectionMessage, Stack, Text } from "@forge/react";

function GetStarted() {
  return (
    <Stack space="space.300">
      <Stack space="space.100">
        <Heading size="large">Judge for Jira</Heading>
        <Text>Done means the checks passed, not that someone said so. Freeze a work item's acceptance checks before work starts. Judge checks every delivery, from a person or an AI agent, with a fixed program, posts a pass or fail receipt anyone can re-run, and can block Done until a delivery passes.</Text>
      </Stack>

      <Stack space="space.100">
        <Heading size="small">1. Freeze the checks</Heading>
        <Text>Open a work item, select the apps button under its title, and choose Judge. Write the required text (one item per line, for example "## Summary") and any word limits, then press Freeze checks. Judge posts a comment with the checks and their SHA-256.</Text>
      </Stack>

      <Stack space="space.100">
        <Heading size="small">2. Deliver the work</Heading>
        <Text>Attach the file to the work item, or post a comment whose first line starts with "Delivery". Within seconds Judge posts PASS or FAIL, with a plain reason for each check. Discussion comments are never judged.</Text>
      </Stack>

      <Stack space="space.100">
        <Heading size="small">3. Block Done until it passes (admin, one time)</Heading>
        <List type="ordered">
          <ListItem><Text>Open the project's workflow editor (for example from a work item's status menu, View workflow, then Edit workflow).</Text></ListItem>
          <ListItem><Text>Select the transition into Done.</Text></ListItem>
          <ListItem><Text>Under Validate details, add the rule "Judge acceptance checks passed", then update the workflow.</Text></ListItem>
        </List>
        <Text>Work items without frozen checks are never blocked.</Text>
      </Stack>

      <Stack space="space.100">
        <Heading size="small">4. Ask the Judge agent (Rovo)</Heading>
        <Text>In Rovo chat, pick the Judge agent: it drafts checks from a work item's description and explains why a delivery failed, reading the real receipt.</Text>
      </Stack>

      <Stack space="space.100">
        <Heading size="small">5. Let outside AI agents test their work (MCP)</Heading>
        <Text>In Atlassian Administration, open your site's Connected apps, choose Judge for Jira, and turn on "Expose tools to MCP-compatible apps". MCP clients can then read a work item's checks and test a draft before handing it in. They cannot change the checks.</Text>
      </Stack>

      <SectionMessage appearance="information" title="Re-check any receipt">
        <Text>The panel's Re-check receipt button re-reads the delivery and runs the frozen checks again. Judge's comments also carry the exact checks and receipt data, so anyone can re-run a receipt outside Jira and get the same hash.</Text>
      </SectionMessage>
    </Stack>
  );
}

ForgeReconciler.render(
  <React.StrictMode>
    <GetStarted />
  </React.StrictMode>,
);
