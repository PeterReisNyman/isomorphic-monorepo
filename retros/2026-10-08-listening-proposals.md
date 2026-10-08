# Proposed text from the listening calibration (2026-10-08)

Drafted by the agent that restored and calibrated Gemini listening. Not applied: HARNESS.md and the skills are the operator's, to be placed one at a time. Calibration ran on `gemini-3.5-flash` because the key's free tier (20 requests per model per day) was spent on `gemini-3.8-flash`; repeat it there before trusting the wording below.

## HARNESS.md, in "The tools that live outside the worktree"

- `media-context` — listening and media evidence for files on disk. `ask_audio` sends a file's audio, or an interval of it, with one question to a Gemini audio model and returns an answer, observations at approximate times, interpretations and uncertainties: a model's judgment, not a measurement. Each call uploads that audio and is paid; `get_capabilities` says whether listening is on in this run. `analyze_audio`, `view_audio`, `crop_audio`, `get_audio_info`, `get_video_info` and `inspect_video` measure, draw, cut and sample frames locally without uploading. Paths are absolute and times are seconds of the original file; results are saved in the run folder's `takes/media-context/`. What its ear can be trusted with is in `$sound`.

## Sound skill, Verify section, replacing "Listen to the take and the finished track where you can…"

- Listen with `ask_audio` (media-context): a transcript, a duration or a pitch number cannot establish delivery, acting, pacing or quality. One focused question per call, `detail: "detailed"`. To compare takes, put them in one level-matched clip with blind labels and their times in the question.
- Its ear is evidence for which of two matched takes is flatter or more expressive, for processing artefacts (robotic, phasey, warbling) in converted or heavily processed speech, for what a sound physically is, and for takes to discard (whispered, wrong voice, broken pauses).
- It does not decide which good take the operator will prefer, whether an effect sounds cheap or premium, which speaker a take is, or where a drop or seam is. Its times are approximate, often whole seconds; it has heard a designed music change as a splice, missed a seam the operator heard, and called a pure sine a rooster. Bring taste calls to the operator with its notes; check timing with `view_audio` or the beats.
- The report says what you asked it, what it answered, and what nobody heard ($evidence).

## Edit skill, Deliver section, after "disclose any continuous playback or listening you could not do"

- Before delivery, ask `ask_audio` about the exported master: the music's sections, entry and drop with times, any point that sounds like two parts joined, and anything clipped, masked or processed in the voice. Treat what it flags as a place to inspect (`view_audio` around it, the timeline's music edits), not a verdict; a seam it does not flag is not shown to be clean.

## Calibration summary (gemini-3.5-flash, 16 blind calls)

| Test | Operator's verdict | Model | Score |
| --- | --- | --- | --- |
| Voice ranking, 4 lines × 20 takes | the operator's picks | ranked them 5, 14, 11, 5 of 20 (chance about 10.5) | partly |
| Two male timbres apart | F ≠ C | mostly right, but miscounted voices | partly |
| Fish S1 vs Drama 3, 4 pairs | Drama 3 more expressive | Drama 3 all four times | agree |
| Synthesized sounds vs accepted pops | pings, chime, sweep, snap cheap; pops fine | 2 of 8 match | disagree |
| Posted reel music structure | entry 3.0 s, drop 11.0 s, hidden jump 27 s | entry right, drop at 8 s, jump missed | partly |
| MASTER-v6 (spliced drop) | seam at 9 s | no seam there, claimed one at 28 s | disagree |
| MASTER-v8 (seam fixed) | fine | "abrupt edit" at 9 s | disagree |
| v18 converted vs v19 clean line | v18 had artefacts | v18 "robotic, phasey, warbling", v19 clean | agree |

Raw answers, clips, answer keys and the scripts: `media-context-mcp/.media-context/calibration/`. Re-run on 3.8 Flash: `.venv/bin/python .media-context/calibration/calibrate.py gemini-3.8-flash` from the media-context-mcp folder with the key exported.
