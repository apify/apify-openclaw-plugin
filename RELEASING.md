# Releasing

## Development workflow

The primary development happens in the openclaw fork at `extensions/apify-social/`.
This standalone repo is the publishing vehicle for npm.

```
[openclaw fork]                    [this repo]                  [npm]
extensions/apify-social/  --sync-->  src/          --publish-->  @apify/apify-openclaw-integration
  develop & test here               review & tag                users install from here
```

### Day-to-day development

1. Make changes in the openclaw fork (`extensions/apify-social/`)
2. Run tests there: `pnpm test` (uses monorepo vitest)
3. When ready to release, sync to this repo

### Syncing changes

```bash
# From this repo's root:
./scripts/sync-from-fork.sh

# Or with explicit path:
./scripts/sync-from-fork.sh /path/to/openclaw

# Review what changed:
git diff

# The script syncs social-platforms-tool.ts and util.ts automatically.
# index.ts, tests, README, and manifest need manual sync if changed
# (import paths differ between monorepo and standalone).
```

### Running tests here

```bash
npm install        # first time or after dep changes
npx tsc --noEmit   # type check
npx vitest run     # run tests
```

## Publishing a release

### Prerequisites

- `NPM_TOKEN` secret configured in GitHub repo settings
- npm access to the `@apify` scope

### Automated (recommended)

1. Sync latest changes: `./scripts/sync-from-fork.sh`
2. Bump version in `package.json`
3. Commit: `git commit -am "release: v0.2.0"`
4. Push: `git push`
5. Create a GitHub release with tag `v0.2.0`
6. The `release.yml` workflow runs tests and publishes to npm automatically

### Manual

```bash
# Verify everything is clean
npx tsc --noEmit && npx vitest run && npm pack --dry-run

# Publish
npm publish --access public
```

## Versioning

- Use semver: `0.x.y` while pre-1.0
- Bump **minor** for new platform support, new features, breaking param changes
- Bump **patch** for bug fixes, formatter improvements, dependency updates

## Keeping compatible with OpenClaw

The `peerDependencies` field specifies `"openclaw": ">=2026.1.0"`. When OpenClaw makes breaking changes to the plugin SDK:

1. Update the `openclaw` devDependency version
2. Fix any type errors or API changes
3. Update the peer dependency range if needed
4. Test with the new OpenClaw version
5. Release a new version

### What to watch for in OpenClaw updates

- Changes to `openclaw/plugin-sdk` exports (new helpers becoming available, deprecations)
- Changes to the `AnyAgentTool` interface or `AgentToolResult` shape
- Changes to `jsonResult`, `readStringParam`, `readNumberParam`, `stringEnum` signatures
- Changes to the plugin manifest schema (`openclaw.plugin.json`)
- New tool schema validation rules
