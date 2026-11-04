# Worked example: KAN-4 (the one in the demo video)

A real receipt from the live app (work item KAN-4, Nov 5 2026). The first delivery failed (missing "## How it was tested"); the second, this one, passed both frozen checks.

- `checks.json`: the JSON block in Judge's "Acceptance checks frozen" comment.
- `receipt.json`: the JSON block in Judge's PASS comment.
- `comment.json`: the delivery comment as Jira returns it from `GET /rest/api/3/issue/KAN-4/comment/10019`.

```
node bin/recheck.js --checks examples/kan-4/checks.json --receipt examples/kan-4/receipt.json \
  --comment examples/kan-4/comment.json --expect f5961c3ea56286802eefff50acfcb267c135e1b0eb92c4e60d04a96705f603fc
```

Prints `CONFIRMED receipt f5961c3e...`, the same receipt hash Judge showed in Jira. Change one word in `comment.json` and it prints `DIFFERENT`.
