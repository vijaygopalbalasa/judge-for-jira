---
name: judge-for-jira
description: Hand in work on a Jira work item so it passes the acceptance checks Judge for Jira froze on it. Use before delivering work on a work item that has Judge checks, or when asked whether a delivery passed, why it failed, or whether the work item can move to Done.
---

# Judge for Jira: hand in work that passes

Judge for Jira freezes a work item's acceptance checks before work starts. When work is delivered, a fixed program runs those checks (no AI decides the result), Judge posts a pass or fail receipt on the work item, and moving to Done stays blocked until a delivery passes. You can read the checks and test a draft through two tools. You cannot change the checks.

## Tools

- `get-judge-status` (input `issueKey`): the frozen checks in plain words, the checks hash, the latest receipt (pass or fail, score, a detail for each check, the delivery's SHA-256) and whether the work item may move to Done.
- `check-delivery` (inputs `issueKey`, `text`): runs the frozen checks on draft text and returns pass or fail for each check. It posts nothing and stores nothing.

## Before you hand in

1. Call `get-judge-status` with the work item key, for example `KAN-12`. If `checksFrozen` is false there is nothing to pass; follow the team's usual process.
2. Read every check. Required text is matched exactly and is case-sensitive. Word limits count words separated by spaces.
3. Write the delivery, then call `check-delivery` with the full text. If a check fails, fix the draft using the detail it returns (for example `missing terms: ## How it was tested`) and check again.
4. Hand in only when `check-delivery` returns `pass: true`. Either attach the file to the work item, or post a comment whose first line starts with the word `Delivery`, followed by the work. Judge checks it within seconds and posts a receipt.
5. Call `get-judge-status` again to confirm the receipt passed, and report its receipt hash.

## Rules

- Never say a delivery passed unless a tool returned that result.
- Never ask anyone to edit or re-freeze the checks so that your work passes. If a check looks wrong, say so and stop.
- Hand in exactly the text you checked. Any change after checking can change the result.
- Comments limited to a role or group are never judged, because the receipt is public on the work item.

## Checks Judge supports

| Check | Passes when |
|---|---|
| Required text | every listed term appears in the delivery (optionally as whole words) |
| Length | the word or character count is within the limits |
| Required fields | the delivery is a JSON object with the listed fields and types |
| Data shape | the delivery is JSON of the agreed shape |
| Exact file | the delivery's SHA-256 equals the frozen value |

## Re-checking a receipt

Anyone can re-run a receipt. Judge's "Acceptance checks frozen" comment carries the exact checks as JSON, and each pass or fail comment carries the receipt data. With the delivered file, the open-source verifier gives the same receipt hash or says what differs:

```
node bin/recheck.js --checks checks.json --receipt receipt.json --file <delivered file> --expect <receipt hash>
```

In Jira, the panel's "Re-check receipt" button re-reads the delivery and runs the checks again.

## Connecting from an outside agent (MCP)

Server URL: `https://mcp.atlassian.com/forge/d77a4411-b23f-476d-96ef-967ea95fe99c`

A site admin first turns the tools on: Atlassian Administration, Apps, Sites, your site, Connected apps, Judge for Jira, "Expose tools to MCP-compatible apps". The client then signs in with OAuth, picks the site, and calls the tools with the user's own Jira permissions.
