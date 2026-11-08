# Contributing / Bidrag

Thank you for helping improve PromptSkjold. Tak, fordi du vil hjælpe.

PromptSkjold is open source (Apache-2.0) and in public beta. It is a fork of DFKI's *Privacy Guardrail*; see [NOTICE](NOTICE) and [FORK_NOTES.md](FORK_NOTES.md). Contributions should keep the extension's local-first privacy posture intact.

## Report a bug (Indmeld fejl)

Open an issue: <https://github.com/segiITU/PromptSkjold/issues/new/choose>

- Describe what you did, what you expected and what happened. Danish or English is fine.
- Use **made-up** examples. Never paste real personal data, real documents, screenshots with real data, or real prompts.
- For a missed or wrongly flagged item, the sentence with fake values and the category is enough.
- Security or privacy problems that must not be public: use GitHub's private vulnerability reporting (the repository's Security tab) instead of a public issue. See [SECURITY.md](SECURITY.md).

## Contribution Model

- Start with an issue before opening a pull request.
- Keep pull requests small and scoped.
- Use design discussion for large changes, broad refactors, new detection strategies, or changes that affect extension permissions.
- Expect extra review for privacy-sensitive or security-sensitive changes.
- Use synthetic or sanitized examples in issues, tests, screenshots, and documentation.

Helpful places to start: Danish and English test sentences the detector gets wrong, support for more chat sites (see `src/shared/suggested-sites.ts` and `src/content/site-adapters/`), wording and translations, and documentation.

## Out Of Scope By Policy

The following feature categories are out of scope for this project:

- telemetry
- analytics
- automatic remote feedback collection
- automatic upload of clipboard content, prompts, responses, detected entities, identity maps, vault data, feedback logs, or model input
- training on user content or local feedback logs unless a user separately creates and contributes a sanitized sample outside the extension

## Development Basics

Install dependencies and run the main checks:

```bash
npm install
npm test
npm run check:svelte
npm run test:rust
```

Some full local AI workflows require prepared model assets that are not committed to the repository. A model-free build path is acceptable for routine development, but release validation must use the strict release process once it exists.

## Pull Request Expectations

Pull requests should include:

- a clear description of the user-facing or maintainer-facing change
- focused tests or a clear explanation when tests are not practical
- documentation updates when behavior, permissions, privacy posture, or release workflow changes
- no private planning documents, generated local artifacts, benchmark corpora, local model sources, or raw release archives

Do not include real user content in commits, tests, fixtures, screenshots, or issue discussions.

By contributing you agree that your contribution is licensed under the Apache License 2.0, like the rest of the project.

## Good First Issues

The `good-first-issue` label is reserved for genuinely small, low-risk, well-scoped work.
