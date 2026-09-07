# Round save hardening v18

- Local-first persistence before any network submission.
- Queue item deleted only after confirmed `save_round` response.
- Failed online submissions remain queued for later sync.
- Duplicate save taps are blocked while save is in progress.
- Supervisor sees explicit saved-on-phone / saved-on-server status.
- Existing `client_uuid` is preserved to keep server-side duplicate protection.
