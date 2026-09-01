# Contributing

Thanks for your interest. This is a small, deliberately scoped project — the
constraints below are what keep it useful.

## Ground rules

**Read-only is not negotiable.** The server cannot create, modify, or delete
anything in Mural, and that is enforced in four places (see
[SECURITY.md](SECURITY.md#design-guarantees)). PRs adding write capability will
not be merged. If you need writes, fork it — but please rename, so users are not
misled by a familiar name that now mutates their boards.

**Never commit a credential.** Not in code, not in a test fixture, not in an
issue, not in a screenshot. CI runs gitleaks plus a tracked-file scan on every
push, but neither catches a secret you paste into a comment.

**Real data must be scrubbed.** Board ids, workspace ids, user emails, and
sticky-note contents from actual workshops are all sensitive. Use `abc123`,
`workspace-1`, and invented content in examples.

## Getting set up

```bash
git clone https://github.com/stephschofield/mural-mcp.git
cd mural-mcp
npm install
npm run build
```

You will need your own Mural app to test against the live API — see the
[installation guide](docs/INSTALLATION.md#step-1--create-a-mural-app).

```bash
npm run dev        # tsc --watch
npm run typecheck  # no emit — must pass before you push
npm run build      # compile (chmod on Unix only)
npm test           # widget fixtures + MCP handshake
```

## Making a change

1. **Branch** from `main`.
2. **Keep it focused.** One concern per PR.
3. **Run `npm run typecheck`.** CI runs it on Node 18, 20, and 22.
4. **Test against a real board** if you touched the client, auth, or widget
   parsing. Type-checking does not catch an envelope shape you guessed wrong.
5. **Update the docs.** A new tool needs an entry in
   [docs/API.md](docs/API.md); a new action needs a row in the catalog table.

### Commit messages

Conventional commits:

```
feat: add list_mural_chat action
fix: handle numeric-keyed envelope on the templates endpoint
docs: clarify the redirect URL requirement
chore: bump the MCP SDK
```

## What makes a good PR here

### Adding a long-tail read endpoint

The most common contribution, and the easiest. Append to `ACTIONS` in
`src/actions.ts`:

```ts
{
  id: "list_mural_chat",
  description: "List chat messages posted on a mural.",
  path: "/murals/{muralId}/chat",
  params: [pathParam("muralId", "The mural id.")],
  scope: "murals:read",
  keywords: ["chat", "message", "discussion", "thread"],
  paginated: true,
}
```

No other code changes. Please:

- **Verify the path against the live API.** The docs are not always right —
  `/current-user` is documented but 404s; the working path is `/users/me`. If
  you found a discrepancy, note it in a comment as that entry does.
- **Be generous with keywords.** They are the only thing making the action
  discoverable via `search_actions`. Include the words a user would actually
  say, not just the API's terminology.
- **Confirm it is a GET.** Mutating endpoints do not belong in the catalog.
- **Add it to the catalog table** in `docs/API.md`.

### Adding a dedicated tool

Justified only when a call is high-traffic, needs response shaping, or needs
validation the catalog cannot express. Every dedicated tool costs context window
on every single request, so the bar is high — if in doubt, add an action
instead.

If you do add one: set `readOnlyHint: true`, write the description to say *when*
to reach for it rather than only what it does, and document it in
`docs/API.md`.

### Improving widget parsing

`src/widgets.ts` is pure — no I/O, no network — so it is the easiest module to
work on and to test.

- New widget type: add to `TEXT_BEARING_TYPES` and `TYPE_LABELS`.
- Text in an unexpected field: add to `TEXT_FIELDS`.
- Include a real (scrubbed) example of the widget JSON in the PR description.

### Reporting a bug

Include:

- Node version and OS
- What you asked for and what happened
- The exact error text, **with ids and secrets redacted**
- Whether `check_connection` succeeds

## Style

The existing code sets the standard:

- **TypeScript, strict.** No `any` in application code — use `unknown` and
  narrow.
- **Comment the why, not the what.** Most comments here explain a decision or a
  constraint discovered against the live API. That is the kind worth writing.
- **Fail with guidance.** Error messages should say what to do next. Compare
  `explain()` in `src/client.ts`.
- **Small modules.** Each file has one job.
- **stderr for diagnostics.** stdout belongs to the MCP protocol; a stray
  `console.log` corrupts the transport.

## Security issues

Do not open a public issue. See [SECURITY.md](SECURITY.md#reporting-a-vulnerability).

## License

Contributions are licensed under the [MIT License](LICENSE).
