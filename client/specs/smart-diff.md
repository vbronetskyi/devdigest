# Spec: Files changed tab — Smart Diff (HW L03)

Data: `useSmartDiff` → `GET /pulls/:id/smart-diff` (server spec:
`server/specs/smart-diff.md`). The query key is `["reviews", prId, "smart-diff"]`
on purpose: every place that invalidates `["reviews", prId]` (a run finished, a
finding accepted or rejected) refreshes the markers too.

- **Smart order** (default): sections Core logic → Wiring → Tests → Docs →
  Boilerplate, each with its own label, a one-line "how closely to read", the
  number of its files with findings (dot in the worst severity's colour) and a
  file count. Boilerplate files start folded and say why they are there
  (`lockfile`, `generated`, `entry point`…); every non-source file carries the
  same note. A file with findings always starts open.
- **Original order**: the files as GitHub lists them. Finding markers stay;
  role notes and folding rules do not.
- **Finding markers**: a severity-coloured bar on every line a finding covers
  (worst severity wins) and, on its first shown line, the severity as a word —
  `blocker`, `warning`, `suggestion` — with "+N" when several start there and the
  titles in the tooltip. The file header has a plain dot in the worst colour.
- **Finding card in the diff**: the word is a button; it opens the same
  `FindingCard` as the Agent runs tab right under the line — rationale, suggested
  fix, Accept / Reject. DiffTab owns the data (`usePrReviews`, by finding id) and
  the action (`useFindingAction`) and hands the viewer a `DiffFindingApi`
  (`visible`, `render`), so `components/diff-viewer` never imports the page.
- **Findings off the patch**: a finding none of whose lines the patch shows is
  listed at the end of its file ("N findings on lines this diff does not show",
  with its lines), and opens the same card. One that starts above a hunk is
  labelled on its first shown line (`anchorFindings`).
- **One switch** for comments and findings: "Hide comments and findings (N)"
  hides GitHub threads, bars, labels and the off-patch list together, for a clean
  read. Both are shown by default.
- **Split banner** when `too_big`: reviewable vs total lines and the proposed
  slices (first four paths, "+N more"); "no clean cut" when there are none.
- The toolbar says where the markers come from ("latest review of each of N
  agents", or "no review yet"), and warns instead when `markers_stale` — the
  head moved since the last review, so lines may have shifted.
- When the endpoint fails the tab falls back to Original order with a note;
  a file the smart diff does not list is shown at the end of the last section,
  never dropped.

- **Focus** (HW L05): `?file=&line=` from the Brief card reaches the viewer as
  `FileAnnotation.focus` (`withFocus` in `DiffTab/helpers.ts`): the file opens even
  when its role folds it, the new-side line gets a focus ring and is scrolled into
  view. A line the diff does not show leaves the file scrolled to its header.
- **git-why** (HW L05): `DiffViewer` takes an optional `why` (`WhyApi`): removed and
  context lines show a button that toggles `WhyPanel` under the line, keyed by the
  base line number. `DiffTab` passes it only when the PR's base is the default branch.

Tests: `DiffTab/DiffTab.test.tsx`, `DiffTab/_components/WhyPanel/WhyPanel.test.tsx`,
`src/components/diff-viewer/helpers.test.ts`.
