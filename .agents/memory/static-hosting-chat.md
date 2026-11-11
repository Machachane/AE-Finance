---
name: Static hosting and chat
description: Why the GitHub Pages frontend uses a separately hosted assistant backend.
---

Keep the assistant backend separate from the static GitHub Pages frontend, with OpenRouter credentials available only to the backend. The frontend may contain the public API endpoint, never the API key.

**Why:** The user hosts the platform on GitHub Pages, which returned HTTP 405 for assistant POST requests. Uploading the frontend did not deploy the server.

**How to apply:** Preserve same-origin requests for the full-stack app and an explicitly configured external endpoint for static builds. Verify that the published backend is reachable and permits the frontend's origin; never substitute a temporary development URL.
