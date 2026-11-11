---
name: Assistant navigation decisions
description: Accuracy and interaction constraints when chat opens a filtered finance page.
---

Assistant navigation is an explicit button action, not an automatic redirect. A requested airline and reporting period must never silently become the page's default airline.

**Why:** A request for Emirates' balance sheet previously left Air Busan selected. That can make correct figures appear to answer a different airline's question.

**How to apply:** Validate requested selections against the loaded dataset, clarify unavailable or ambiguous choices, and state what the button will select. Deliberate navigation must reapply selections even on an already-open page or after manual filter changes; ordinary renders must not overwrite manual choices.

Keep conversation selections and pending requests within the current chat, independently of the recent transcript window. Do not persist transcripts or use previous generated financial figures as evidence.

**Why:** A short history window lost the airline and pending destination after several exchanges. A bare “Emirates” reply must complete the preceding clarification, not start an unrelated request.

**How to apply:** Retain validated selections through tab changes and retries, give explicit new selections precedence, and ask when any requested entity remains unresolved—even if the model omitted it. Revalidate carried selections against the current dataset.
