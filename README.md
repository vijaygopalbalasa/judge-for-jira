# Judge for Jira

Done means the checks passed. Freeze a Jira work item's acceptance checks before work starts. Judge checks every delivery, from a person or an AI agent, with a fixed program (no AI decides the result), posts a pass or fail receipt anyone can re-run, and can block Done until a delivery passes.

Built on Atlassian Forge for Codegeist 2026. Runs entirely on Atlassian's cloud: no outside servers, no egress, no outside AI service, no personal data stored.

## How it works

1. **Freeze.** In the Judge panel on a work item, write the required text (one item per line) and word limits, or JSON checks for data deliveries. Judge stores them in app-private Forge storage and posts a comment with the exact checks and their SHA-256.
2. **Deliver.** Attach a file, or post a comment whose first line starts with `Delivery`. Judge runs the frozen checks and posts PASS or FAIL with a reason for each check. Discussion comments, and comments limited to a role or group, are never judged.
3. **Gate.** The workflow rule "Judge acceptance checks passed" blocks the move to Done until the latest delivery passes the checks frozen now.
4. **Re-check.** The panel's Re-check receipt button re-reads the delivery from Jira and runs the checks again. Outside Jira:

```
node bin/recheck.js --checks checks.json --receipt receipt.json --file <delivered file> --expect <receipt hash>
node bin/recheck.js --checks checks.json --receipt receipt.json --comment comment.json --expect <receipt hash>
```

`checks.json` is the JSON in Judge's freeze comment; `receipt.json` is the JSON in its receipt comment. Use `--file` for an attachment delivery, or `--comment` with the comment's JSON from `GET /rest/api/3/issue/<KEY>/comment/<ID>` (the ID is `delivery.id` in the receipt). It prints `CONFIRMED` with the same receipt hash, or `DIFFERENT` and what differs. [`examples/kan-3`](examples/kan-3) is a real receipt from the live app to try it on.

5. **Agents.** The Judge agent in Rovo drafts checks and explains failures from the real receipt. Two read-only actions, `get-judge-status` and `check-delivery`, are also exposed through `rovo:mcp`, so outside MCP clients can test a draft before handing it in. [`skills/judge-for-jira/SKILL.md`](skills/judge-for-jira/SKILL.md) teaches any agent that workflow.

## Checks

| Kind | Passes when |
|---|---|
| `contains` | every listed term appears (optionally as whole words) |
| `length` | the word or character count is within `min` and `max` |
| `schema` | the delivery is a JSON object with the required fields and types |
| `json` | the delivery is JSON of the agreed shape |
| `checksum` | the delivery's SHA-256 equals the frozen value |

## Setup on your site

1. Install with the installation link (site admin).
2. To gate Done: open the project's workflow editor, select the transition into Done, add "Judge acceptance checks passed" under Validate details, and update the workflow. If you uninstall and reinstall the app, delete the leftover "Unavailable rule" and add the rule again.
3. For MCP clients: Atlassian Administration, Apps, Sites, your site, Connected apps, Judge for Jira, turn on "Expose tools to MCP-compatible apps". Server URL: `https://mcp.atlassian.com/forge/d77a4411-b23f-476d-96ef-967ea95fe99c`.

## Develop

```
npm install
npm test            # unit and behaviour tests with in-memory fakes of Jira and storage
forge deploy && forge install
```

The checking engine comes from [Judge Protocol](https://github.com/vijaygopalbalasa/judge-protocol) (MIT). Privacy: [PRIVACY.md](https://github.com/vijaygopalbalasa/judge-protocol/blob/master/jira/PRIVACY.md).

## License

MIT
