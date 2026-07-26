# Keeping design-system/ ↔ Claude Design in sync

`design-system/` is the repo mirror of the **Terrace Design System** project on
claude.ai/design (project id `e967794f-9d22-4613-8010-d1ae7d73467a`). Each
`*.html` is a design card (first line carries an `@dsCard` marker); `brief.md`
is product direction.

## The model: push-on-change
Claude pushes cards up with the DesignSync tool (agent-only — there is no CLI),
so sync is **per-revamp**, not a live daemon:

- **Code → Design:** when a screen is revamped, its `*.html` card is updated and
  pushed to the project, then the synced baseline is recorded:
  `scripts/design-sync.sh mark`.
- **Design → Code:** if a card is edited in Claude Design, Claude pulls it back
  into this folder and reconciles against the code.

## Drift guard (git pre-push hook)
A non-blocking pre-push hook warns when `design-system/` has changed since the
last recorded sync, so a design edit doesn't silently ship without going up.

Enable once per clone:

```sh
git config core.hooksPath .githooks
```

Commands:

```sh
scripts/design-sync.sh check   # list design files changed since last sync
scripts/design-sync.sh mark    # record the current files as the synced baseline
```

`.sync-state` holds the baseline hashes and is committed, so the whole team
shares the same "last synced" reference.

## Fully automated option (not enabled)
A scheduled cloud agent could reconcile the two on a cron. Caveat: DesignSync
uses the interactive claude.ai login, which may be unavailable in a headless
run — so the reliable path today is push-on-change with this hook as the guard.
