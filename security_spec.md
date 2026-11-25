# RahaL TV Security Specification (Phase 0)

## 1. Data Invariants
1. **Default Deny**: All unspecified Firestore paths return `PERMISSION_DENIED`.
2. **Media Integrity**: Only verified administrators (`isAdmin()`) may create, update, or delete `/media/{mediaId}` entries. Public visitors have read-only access.
3. **RBAC Anti-Escalation**: A regular signed-in user registering `/users/{userId}` MUST set `role == 'member'` and cannot elevate their own role or write to `/admins/{adminUid}`.
4. **PII Isolation**: User email is isolated in `/users/{userId}/private/info` and readable only by `isOwner(userId)` or `isAdmin()`.
5. **Email Verification Guard**: Any admin check on runtime email (`rahalahmed348@gmail.com`) strictly requires `request.auth.token.email_verified == true`.
6. **Temporal Integrity**: All `createdAt` and `updatedAt` timestamps on creates and updates must equal `request.time`, and `createdAt` is immutable on update.

7. **Rating Ownership & Bounded Range**: Users may only create or update `/ratings/{mediaId}__{uid}` documents matching their own `request.auth.uid`, with integer `stars` strictly between `1` and `5`, and immutable `mediaId`, `userId`, and `createdAt`.
8. **Scraper Adapters RBAC & Schema Integrity**: Only verified staff (`isStaffAdmin()`) may read, create, update, or delete `/scraper_adapters/{adapterId}` or append immutable version snapshots to `/scraper_adapters/{adapterId}/versions/{versionId}`. All adapter fields and nested rule maps enforce strict key whitelisting (`hasAll`/`hasOnly`) and bounded lengths/counts.
9. **Admin Workspace Appearance & Nav Layout Isolation**: Only verified owner admins (`isOwnerAdmin()`) may read, create, update, or delete `/admin_workspace/appearance` and `/admin_workspace/nav_layout`, with strict key whitelisting (`kind`, `config`, `updatedBy`, `updatedAt`).
10. **Image Placeholder Settings Integrity**: Public visitors have read-only (`get`) access to `/settings/image_placeholders`, while only verified owner admins (`isOwnerAdmin()`) may list or write validated hex colors, shimmer presets, and per-slot overrides (`poster`, `backdrop`, `cast`, `episode`).
11. **Recently Watched Ownership & Privacy**: `/recently_watched/{uid}__{mediaId}` documents are strictly owner-only (`request.auth.uid == userId`) across `get`, `list`, `create`, `update`, and `delete`, with immutable `id`, `userId`, `mediaId`, and `createdAt`, preventing cross-user history leakage or enumeration.
12. **Database Connections & Active Pointer Isolation**: `/admin_workspace/db_connections` is strictly owner-only (`isOwnerAdmin()`) for reads and writes and stores only public connection metadata (never server secrets). `/settings/active_database` allows public `get` (so visitors and mobile devices connect to the active database) while writes require `isOwnerAdmin()`.
13. **Moderator Sub-Permissions Integrity**: `/admin_workspace/moderator_perms` may be read by verified staff (`isStaffAdmin()`) so moderators enforce live owner restrictions across devices, while writes are restricted to `isOwnerAdmin()` with strict 7-key boolean schema enforcement.
14. **Hero Slider Modes & Bounded Media Maps**: `/settings/hero_slider_mode`, `/settings/showcase_slider`, and `/settings/stream_v4_slider` allow public `get` and `isOwnerAdmin()` writes with bounded slider dimensions, enum validation, and capped map key counts (`<= 60`).

## 2. The "Dirty Dozen" Attack Payloads
1. Unauthenticated write to `/media/fake-movie` -> DENIED.
2. Non-admin verified user attempting to create or delete `/media/running-man` -> DENIED.
3. Spoofed admin email with `email_verified: false` attempting admin write -> DENIED.
4. Non-admin user creating `/users/{uid}` with `role: 'admin'` -> DENIED.
5. Non-admin user updating `/users/{uid}` to change `role` -> DENIED.
6. User A attempting `get` on `/users/userB/private/info` -> DENIED.
7. User injecting a 1,500-character document ID (`isValidId` guard) -> DENIED.
8. Payload with shadow field (`isSuper: true`) -> DENIED (`hasOnly` strict key enforcement).
9. Visitor request created with `status: 'approved'` instead of `'pending'` -> DENIED.
10. Visitor request created with `userId` belonging to another UID -> DENIED.
11. Updating `/media/{id}` with forged past `createdAt` timestamp -> DENIED.
12. Non-admin attempting `list` on `/requests` without `userId == request.auth.uid` filter -> DENIED.
13. Rating payload with `stars: 10` or `stars: 4.5` or spoofed `userId` -> DENIED.
14. Non-admin writing to `/fonts/arabic` or injecting invalid font slot `/fonts/malicious` -> DENIED.
15. Typography config with out-of-bounds `baseFontSizePx: 120` -> DENIED.
16. Unauthenticated or regular member reading/writing `/scraper_adapters/evil` -> DENIED.
17. Staff creating `/scraper_adapters/bad` with `episodeRules.maxEpisodes: 99999` or shadow key `evalJs: "..."` -> DENIED.
18. Staff mutating immutable version snapshot in `/scraper_adapters/{id}/versions/{versionId}` (`update`) -> DENIED.
19. Signed-in User A attempting to read, write, or delete User B's `/recently_watched/userB__movie` -> DENIED.
20. Non-owner moderator attempting to write `/settings/image_placeholders` with invalid hex color -> DENIED.
21. Moderator or regular user attempting to read or overwrite `/admin_workspace/db_connections` -> DENIED.
22. Moderator attempting to elevate permissions by writing `/admin_workspace/moderator_perms` -> DENIED.
23. Non-owner or shadow-field payload attempting to switch `/settings/active_database` -> DENIED.
24. Oversized (> 60 entries) `titleLogos` map or invalid hex color written to `/settings/stream_v4_slider` -> DENIED.



