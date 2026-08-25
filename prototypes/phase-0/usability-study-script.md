# Phase 0 moderated usability script

## Purpose

Validate the low-fidelity information architecture and language before production UI
lock. This study tests comprehension and recovery, not visual preference or participant
performance. Use only the disposable synthetic sample vault.

## Participant mix for `UXR-004`

Recruit at least five people who have recently searched for work or managed a large
application pipeline. Include at least one keyboard-heavy participant and at least one
participant unfamiliar with developer/storage terminology. Do not collect employers,
applications, resumes, credentials, or other real job-search content.

## Moderator setup

1. Open the prototype at its Home screen in Desktop mode.
2. Read: “This is an early, nonfunctional prototype with fictional data. We are testing
   the design, not you. Please think aloud. Nothing you do is saved or sent anywhere.”
3. Do not teach navigation or define “vault,” “evidence,” “preflight,” or pipeline
   labels before the participant encounters them.
4. After task 7, switch to Mobile mode. Reset the prototype between participants.

## Ten scripted tasks

1. **Storage and start:** Imagine this is your first visit. Choose how you would start
   quickly, then explain where you believe your job-search data would live.
2. **First job:** Add a first job without filling in a career profile. Stop when you
   believe it has been safely recorded.
3. **Capture conflict:** Review the Northstar capture. Resolve the conflicting title and
   salary without losing sight of where each value came from.
4. **Board/Table and next action:** Find Juniper Works, switch presentation once, move
   the job to the stage you think is appropriate, and set the next action to follow up.
5. **Job context:** From Pipeline, open Northstar and find its original source plus the
   evidence-coverage explanation. Explain Strength, Partial, Gap, and Unknown in your
   own words.
6. **Submitted artifact:** Find the exact resume version submitted to Juniper Works and
   say what gives you confidence it is the submitted copy rather than the latest draft.
7. **Unsupported claim:** In the document studio, identify the unsupported sentence and
   choose how you would correct it without silently regenerating the rest of the draft.
8. **Mobile quick add:** On Mobile, record a fictional job with only title, company, and
   source URL. Explain whether you expect it to appear on a different device.
9. **Network preflight:** Prepare the draft-assistance action and identify the exact
   destination, what will leave the device, and what will stay local before confirming.
10. **Recovery:** Return to Desktop. Locate backup/restore and explain how you would
    recover a queued extension capture that has not reached the app.

## Observation rubric

For every task record completion (`independent`, `prompted`, `not completed`), wrong
turns, misunderstood language, whether the participant noticed provenance/destination,
and a 1–5 perceived-trust and stress rating. Capture short paraphrases, not identifying
details or verbatim personal job-search stories.

After all tasks ask:

- What did “vault,” “evidence,” “Inbox,” and “network preflight” mean to you?
- At any point were you unsure whether data was local, saved, or sent elsewhere?
- Which screen felt most stressful or crowded, and why?
- Would you prefer Quick start or Guided setup for a real first session?

## Stop and synthesis rules

Stop a task after three minutes or when distress is visible. Treat a recurring failure
for two participants as an immediate design-review candidate; do not wait for aggregate
speed metrics. Report anonymized patterns, severity, affected task, and proposed design
change. Do not resolve `Q-006` or promote provisional interface decisions until at least
five representative sessions and the required accessibility/vocabulary synthesis exist.
