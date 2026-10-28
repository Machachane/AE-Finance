---
name: Airline financial evidence
description: Evidence and disclosure rules for airline financial figures and exports.
---

For airline financial datasets, include only values supported by an official filing or airline/parent-company publication with a direct source link. Do not treat missing disclosure as zero or as proof of “No” administration status. Mark unsupported values unavailable. If a requested compound metric is only partially represented by a source line, disclose the limitation and mark it for review rather than calling it verified.

**Why:** The user emphasized accuracy, official-only sources, and traceable reporting periods.

**How to apply:** Keep each amount tied to its reported company, fiscal period, currency, scope, and source document. Preserve gaps and disclose when reporting is consolidated at the parent level.

Preserve reported AMOUNT values in their original CURRENCY throughout the platform. Do not display or calculate from converted USD amounts. Ratios must use inputs matched on reporting basis, currency, and unit.

**Why:** The user no longer needs USD-normalized amounts and wants the original AMOUNT column shown.

**How to apply:** Use source amounts and currency labels in tables, exports, analytics, and ratio inputs; do not convert currencies. Keep USD only where the supplied source itself reports USD.
