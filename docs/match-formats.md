# Initial match formats

The first three presets reflect the matches the user's sons play most often. Each match stores a complete versioned rules snapshot, allowing later preset changes without changing historical results.

## Presets

| Preset | Ordinary sets | Deuce | Set tie break | Deciding stage |
| --- | --- | --- | --- | --- |
| One FAST4 set | First to four games | Deciding point | At 3–3, first to seven, two clear | None |
| Two FAST4 sets and a deciding match tie break | First two stages use FAST4 rules | Deciding point | At 3–3, first to seven, two clear | At 1–1 in sets, first to ten points, two clear |
| Two normal sets and a deciding match tie break | First two stages are first to six games, two clear | Advantage | At 6–6, first to seven, two clear | At 1–1 in sets, first to ten points, two clear |

Both multi-stage formats finish immediately if a player wins the first two sets. A deciding match tie-break replaces the third set. Its points are stored separately, rather than as ordinary games; a result can be rendered as `4–2 2–4 [10–8]`.

## Defaults and local variations

The FAST4 scoring defaults follow the [LTA junior matchplay definition](https://www.lta.org.uk/support-centre/competing/junior-competitions/lta-youth-competitions/matchplay/what-is-fast4-tennis/). The [2026 LTA organiser manual](https://www.lta.org.uk/4a7821/siteassets/roles/officials/files/fast4-open-tour-2026-organiser-manual.pdf) also describes no-ad games, set tie-breaks to seven with two clear, and deciding match tie-breaks to ten with two clear.

The user has confirmed the three match structures and the deuce and tie-break rules above. Ordinary sets use advantage games. Service lets default to replay, with a separate play-on option in the format model. None of the tie-breaks in these presets has a point cap.

The model also supports alternative point targets, winning margins, and tie-break caps. A five-point sudden-death short-set tie-break is a distinct configuration, not an implicit consequence of the name FAST4.

## Service order

Ordinary games alternate server. Tie-breaks use one serve by the first server, then two serves by each player in turn. After a set tie-break, its first receiver serves the first game of the next set. Entering the deciding match tie-break preserves the service order from the preceding set.

Score corrections require the next server. For a tie-break correction, the engine reconstructs the position in the service sequence from the point total and specified next server.

## Current implementation boundaries

The app implements the three presets, scoring and service transitions, active-stage corrections, editing earlier point observations, detailed serve observations, suspension and resumption, retirement, abandonment, replay, and undo. Correcting an earlier completed set, timed formats, doubles service order, and change-of-ends reminders remain future implementation work.

Stroke is required for observed winners and errors. Explicit unseen strokes and winner-only records remain distinguishable. Aces count as serve winners. Double faults count as unforced serve errors and also have their own tally. Manual score corrections flag incomplete point coverage and do not invent shot observations.
