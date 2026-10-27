# Contributing

Use Node.js 22 or newer. Builds and unit tests need no package installation:

```sh
npm test
npm run build:example
npm run check:public
```

Install development-only browser tooling with `npm ci`, then `npx playwright install chromium webkit` and `npm run test:browser`. Browser tests simulate lifecycle and navigation behavior; actual app-to-browser handoff needs the device checklist in [testing](docs/testing.md).

Keep local settings at ignored `config/site.json`. Use neutral synthetic fixtures and screenshots. Never include production configs, destinations, secrets, or generated production output in issues, recordings, public artifacts, or pull requests.

A strategy change belongs in `src/client/browser-opening.js`, with URL tests and an updated compatibility note. Keep DOM behavior in `app.js` and lifecycle decisions in `handoff-controller.js`. Preserve static anchor hrefs and explicit direct fallback. Report an attempted scheme separately from observed page hiding; neither proves success.

For UI changes, edit `config/theme.json`, update the shared template if needed, then run `npm run example:refresh`. Do not hand-edit the generated standalone snapshot. `npm run screenshots` captures only the neutral renderer. Review the images before committing them.

For config changes, update the schema, executable validation, sample, and documentation together. PR descriptions should state the visitor-visible change, validation performed, and device or environment limitations. See [implementation status](docs/implementation-status.md) for outstanding verification and specification coordination.
