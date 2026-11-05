# Technical design

Use a locally stored mobile app with a scoring engine independent of the interface. The first user records on an Android phone; the same product should later support other families and coaches without treating their information as public.

## Application layers

| Layer | Responsibility |
| --- | --- |
| Mobile interface | Setup, point entry, history, corrections, reports, accessibility |
| Application operations | Validate and save recording actions, coordinate recovery and exports |
| Tennis domain | Match rules, score transitions, service order, completion, statistics |
| Local persistence | SQLite transactions, schema migrations, match actions, saved observations |
| Optional remote services | Accounts, backup, synchronization, authorized sharing |

Use React Native and Expo for the interface and TypeScript throughout. The domain layer must not import React Native, Expo, SQLite, or a cloud SDK. This allows scoring tests without a phone and reuse in future web tools.

SQLite through expo-sqlite is the primary local store. The UI should show a point as saved only after the transaction succeeds. A failed write must retain the entry and offer recovery. Save drafts as well as completed points, and restore the active match after process termination.

Start with a single repository. Keep the domain in an independent module; a monorepo and separate deployed services are unnecessary for the initial app. Select package versions at implementation time and commit the lockfile.

## Configurable scoring

Store a versioned rules snapshot with every match, separately from the reusable preset that created it. Updating a preset must not reinterpret old matches.

Compose rules from game rules, set rules, tie-break rules, and a match structure. Represent a deciding match tie-break distinctly from a regular set. A sequence of tie-breaks must not depend on pretending that every stage contains ordinary service games.

The model must express targets, winning margins, any hard cap or deciding point, when a tie-break begins, tie-break service rules, and deciding-stage overrides. Timed play additionally requires clock, expiry, and tied-result policies. Validate contradictory or unsupported combinations before starting.

Offer presets as conveniences over validated rules. Describe the resulting format in ordinary language. Version scoring behaviour so future bug fixes can be reconciled explicitly with saved match results.

## Core records

| Record | Purpose |
| --- | --- |
| Player | Reusable profile, with optional details beyond a display name |
| Competition or group | Tournament, practice session, or other match grouping |
| Match | Rules snapshot, date, participants, tracked player, conditions, lifecycle |
| Match side and participant | Stable match identity separate from the observer's perspective |
| Point | Stable identity, sequence, awarded winner, completion state |
| Observation | Serve attempts, return, ending, stroke, rally tags, calls, disputes, notes |
| Match action | Ordered, durable record of points, edits, corrections, clock and lifecycle changes |
| Score projection | Reconstructable current score, server, stage, and completion state |

Use generated stable identifiers so records can be exported and later synchronized. Model sides separately from player identity to leave room for doubles. Store historical display details where needed so a profile edit does not erase who appeared in an old match report.

Prefer explicit typed fields for core scoring and shot observations. Optional tags and notes extend the data without turning scoring into an unvalidated collection of arbitrary properties. Unknown, not applicable, and observed negative values have different meanings.

Stroke is a core field for every observed winner or error. Quick endings collects the ending player, outcome, and stroke before committing the point. Preserve an explicit unknown value only when the observer chooses that escape. Keep stroke categories extensible, and compute per-player stroke breakdowns consistently in match reports and longer-term statistics.

## Match history and corrections

Keep an ordered action history and derived views in the same local database. A completed-point action identifies the point; later edits refer to that identity. Undo is recorded as a reversal with a target action, so an export or later sync preserves what changed. Update action history and projections atomically.

Do not rebuild the whole application around a distributed event platform. The initial implementation needs local transactions, deterministic replay, and explicit corrections. Snapshots can make loading fast while the action history explains the result.

A manual score correction establishes a score and service checkpoint. Later actions replay from it; unknown earlier points do not become invented statistics. Editing before a checkpoint requires reconciling that checkpoint. If a changed earlier winner invalidates later game boundaries or the end of the match, preview the conflict and require an explicit resolution.

Keep participant and observer roles distinct. A point's awarded winner is authoritative for score calculation; a winner or error classification can suggest that winner during entry. A dispute or perceived bad call is an observation, not an automatic score adjustment.

## Statistics and export

Compute statistics from the effective recorded points and observations after corrections. Every metric specifies its eligible records, numerator, denominator, and coverage. Unknown data and score gaps must not count as faults, errors, or losses.

Implement a versioned JSON backup containing the complete restorable match data. CSV serves analysis; PDF serves human review. Neither CSV nor PDF replaces the restorable backup. Validate imports, preview duplicates, and apply them in a transaction without silently overwriting newer records.

## Public use and data ownership

The initial app can work without an account. Model a local workspace as the ownership boundary for profiles and matches, so future accounts can claim or connect a local collection without changing player identities. A profile of a child is not a login account.

Private records remain the default. Future cloud access needs server-enforced workspace membership and explicit coach permissions; hiding data in the interface is insufficient. Sharing a report and granting continuing access to a player history are separate actions.

Provide export and deletion as normal user features. Keep player identities, notes, and match contents out of diagnostic logs. Public distribution will also need appropriate privacy information, support, and a defined retention policy for any hosted data.

Database upgrades must preserve existing users' matches. Backups require their own format version and compatibility checks. Avoid embedding one family's names or assumptions into code or presets.

## Cloud services when introduced

Choose the hosted database and authentication service when backup and sharing requirements are concrete. Keep remote access behind an adapter. Each recording action must remain a local transaction; a network outage cannot block play.

Synchronize with unique operation identifiers and acknowledged revisions. Retrying an upload must not duplicate a point. Initially allow one active recording device per match; stale concurrent changes must produce an explicit conflict instead of merging points by arrival time. Shared read access is simpler than simultaneous editing.

A relational hosted database is a reasonable future fit, but no provider is committed yet. A cloud account, subscription, or public deployment is not needed for the design stage.

## Verification priorities

Use automated domain tests for scoring boundaries, configurable formats, service order, tie-breaks, timed expiry, retirement, correction checkpoints, and undo. Include invariants such as replay matching the saved score and unknown observations leaving metric denominators unchanged.

Test database upgrades, interrupted saves, duplicate imports, and backup restoration with representative matches. Validate the recording flow on a real Android phone, including airplane mode, app termination, screen locking, large text, and TalkBack. Add iOS device checks when that platform enters scope.

## Delivery stages

1. Review representative match examples and prototype the courtside controls.
2. Build tested scoring for the first selected formats and the Android entry flow.
3. Add durable recording, corrections, history, reports, and backup restoration.
4. Run courtside trials, measure entry friction, and broaden supported formats.
5. Prepare a public beta with migration checks, recovery guidance, and release packaging.
6. Introduce accounts, cloud backup, and permission-based coach sharing as required.

Public availability can begin with local-only use and exports. Hosted services add ongoing operating costs and access-control responsibilities, so their launch should follow a defined user need.
