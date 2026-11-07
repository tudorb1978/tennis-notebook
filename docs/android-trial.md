# Android practice match trial

The first Android build is for a practice-match trial of the courtside recording workflow. It works without an account and stores records on the device.

## Install and start

Copy `output/android/tennis-tracker-preview.apk` to your Android phone and open it. Android may ask you to allow installation from the app you used to open the file. Once installed, open Tennis Notebook.

Tap Start recording your first match in an empty library or New match & event once you have saved matches. Enter your player's name and the opponent, select a format and recording depth, then save the match. Open it and choose Start match when play is about to begin; only then select the first server. To reuse the venue and court details from a previous match, tap Add match to event and pick the event. The three match formats and their scoring rules are confirmed in [Initial match formats](match-formats.md).

Use Match details in the match header to fill in or update the event, date, round, venue, surface, indoor or outdoor setting, and conditions during or after the match.

In Score & last shot mode, choose the point winner, then tap Forehand, Backhand or Volley under the relevant winner or error. This saves the point immediately. The racket button opens Overhead, Other and I'm not sure for an unknown stroke. Serve is also available for the server's winner or unforced error if no serve or return result has been entered; it records an ace or double fault respectively. Close returns to the shot choices without saving. I'm not sure how it ended saves only the selected point winner.

## What to try

1. Record several forehand and backhand winners and errors. Check both players' breakdowns in Report.
2. Close and reopen the app during a game. Try the same while the racket menu is open.
3. Under Previous point or in History, use Edit point to correct a stroke and Add notes for observations, questionable calls, and disputes. Undo reverses the latest saved change.
4. Switch to Score, serve & last shot. Follow the single active question from serve to return, then finish the point. Try I'm not sure / didn't see on a serve: it should still ask about the return. Use Back to revisit a choice, and reopen the app during an unfinished return to check recovery.
5. Try Correct score next to Switch server on the scoreboard. Supply the next server. Missing points affect the official score without inventing stroke statistics.
6. Use Pause and Resume recording for a break in play. The clock starts at Start match, and the finished match report shows playing time with pauses deducted. Use Finish early for retirement or abandonment.
7. Return to Matches. Open Event performance beside an event or Player performance from the match list. Choose a player and date range, then export the filtered report as a PDF.

The most useful feedback is whether you can record a full match while keeping your attention on play, and where input slows you down. Check sunlight readability, accidental taps, access to Undo, and whether the right stroke choices are available.

## Keep a backup

Open Settings in the home screen header and choose Back up all records to make a JSON backup, then save or share it to a location outside the app. The backup contains restorable profiles, match history, observations, and unfinished entry drafts.

Restore backup in Settings previews new records, identical matches, and conflicts. It imports new records and preserves existing conflicting records. Copy a backup before uninstalling the app or moving phones.

PDF report and Export points CSV are available from a match's Report tab. Sharing opens the device's chooser; the app does not publish reports or send them automatically.

## Current scope

The first build supports singles and the three confirmed match formats, profiles for tracked players, opponents stored with each match, tournament/date grouping, surface and conditions, three recording depths, stroke statistics, serve/return observations, notes and call tags, history, edits, undo, active-stage score corrections, suspension, retirement, abandonment, backups, and report exports.

It does not yet include accounts, cloud synchronization, coach access, timed formats, doubles service order, editing completed set scores, automatic change-of-ends reminders, or a custom format editor. Those remain separate work from testing the core recording experience.

The APK uses local preview signing. A public store release will need production signing, release packaging, privacy/support information, and broader device testing.
