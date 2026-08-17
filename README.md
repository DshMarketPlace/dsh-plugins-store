# dshmarketplace-plugin

Browse and install DeepSeek Harness plugins from inside DSH, in English or
Chinese. Backed by [DSH Marketplace](https://dshmarketplace.dev).

> The npm package is `dshmarketplace-plugin`; this repository is
> `dsh-plugins-store`. The names differ because the shorter one was already
> taken on npm.

```bash
dsh plugin add dshmarketplace-plugin
```

Then `/store` in any session, or open **Settings → Plugins → Plugin store**.

## What it does

- **`/store`** opens the catalogue over the session — search by capability,
  read what each plugin reaches, install without leaving the harness.
- **Two agent tools.** `dshmarketplace_search` and `dshmarketplace_install`, so
  "find me a memory plugin and set it up" works in conversation. A bundled
  skill teaches the agent to search rather than recall a plugin name from
  training data, which for an ecosystem this young is usually wrong.
- **Risk confirmation.** Listings carry detected `install script`,
  `terminal surface` and `requires credentials` flags. Anything flagged stops
  for an explicit confirmation, on the UI path and on the agent path both.
- **Bilingual.** Every listing in the catalogue has a hand-written English and
  Chinese description; the plugin shows the one matching your DSH language.

## Safety

Plugins run with your agent's permissions, and a listing is not a security
review. Two things this plugin does about that:

**Install commands are validated, never interpolated.** The catalogue supplies
a command already built; `src/installer.js` accepts only a bare npm specifier
or `github:owner/repo#subpath`, rejects anything containing `..`, and passes
arguments as an array rather than through a shell. If the catalogue were ever
compromised, the blast radius stops there. `tests/installer.test.js` covers
that boundary specifically.

**The browser half cannot reach the shell.** It talks to two exact-path local
endpoints, and the install endpoint takes a catalogue entry rather than a
command, so the client cannot widen what runs.

## Privacy

The plugin sends exactly one thing anywhere: after a successful install, the
plugin's public identifier, to count installs. No machine id, no session id, no
user, no query, no telemetry of any other kind. Searches go to the public
catalogue API in order to answer them and carry no identifiers.

```bash
DSHM_NO_TELEMETRY=1   # disables the install count entirely
DSHM_API=https://…    # point at a different catalogue
```

## Development

```bash
npm install
npm test         # the install-command boundary, and catalogue helpers
npm run build    # esbuild → lib/index.js (node) and lib/client.js (browser)
```

The browser bundle may only require `react` and
`@deepseek-ai/dsh-client-ui-primitives`. `build.mjs` enforces that against the
emitted code before writing it, so an unsupported import fails here instead of
inside someone else's harness.

## Related

- [dshmarketplace.dev](https://dshmarketplace.dev) — the catalogue, with a
  written page per plugin
- [`dshmarketplace-cli`](https://www.npmjs.com/package/dshmarketplace-cli) —
  the same catalogue for coding agents outside DSH
- `GET /api/v1/plugins` — the public API all three read

## Contact

- **Community** — [LINUX DO](https://linux.do)
- **Issues** — [GitHub Issues](https://github.com/DshMarketPlace/dsh-plugins-store/issues)

## Acknowledgements

- [**LINUX DO**](https://linux.do) — where the DSH ecosystem is actually being
  discussed, and where this project is published and takes its feedback.
  Plugins whose authors posted them there carry a verified badge in the
  catalogue.
- [awesome-dsh-plugin](https://github.com/awesome-dsh-plugin/awesome-dsh-plugin)
  (CC0-1.0) — the community registry the catalogue is seeded from.
- [ZASENJC/dsh-plugins-store](https://github.com/ZASENJC/dsh-plugins-store)
  (MIT) — reading its source is how the DSH client plugin API was worked out.
  No code was copied; the manifest shape, the two entry points and the slot
  names are public interface, and having them written down saved a lot of
  guessing.

## License

MIT. Independent project, not affiliated with DeepSeek. DeepSeek and DeepSeek
Harness are marks of their respective owner, used here only to describe what
this plugin is for.
