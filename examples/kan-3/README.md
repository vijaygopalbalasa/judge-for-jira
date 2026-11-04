# Worked example: KAN-3

A real receipt from the live app (work item KAN-3, Nov 5 2026). The comment delivery passed both frozen checks.

- `checks.json`: the JSON block in Judge's "Acceptance checks frozen" comment.
- `receipt.json`: the JSON block in Judge's PASS comment.
- `comment.json`: the delivery comment as Jira returns it from `GET /rest/api/3/issue/KAN-3/comment/10014`.

```
node bin/recheck.js --checks examples/kan-3/checks.json --receipt examples/kan-3/receipt.json \
  --comment examples/kan-3/comment.json --expect 27fd3721d96b196d78743a558343813107f9d75c6c146ad584730750599c5091
```

Prints `CONFIRMED receipt 27fd3721...`, the same receipt hash Judge showed in Jira. Change one word in `comment.json` and it prints `DIFFERENT`.
