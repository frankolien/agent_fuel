<!--
Pull request template for Agent Fuel.
Keep the headings; replace the placeholder text under each.
-->

## What

<!-- One-line summary of the change. -->

## Why

<!--
Motivation. Reference the ADR, phase slice, or issue that authorized
this work. If this work was not pre-authorized by an ADR or planning doc,
explain why and what authorizes it now.
-->

## How

<!--
2–4 bullets on the implementation approach. Note any deviations from
the spec or the original plan, and the reason for each deviation.
-->

-
-

## Test plan

- [ ] `cargo fmt --all --check` clean
- [ ] `cargo clippy --all-targets -- -D warnings` clean
- [ ] `cargo test --all` green
- [ ] `anchor build` clean
- [ ] Manual verification: <!-- specific steps -->

## Risk and blast radius

<!--
What breaks if this change is wrong? Who is affected? Is the change
reversible? If on-chain account layout changes, does it require a
migration plan?
-->

## Related

<!-- Links to ADRs, issues, or prior PRs. -->
