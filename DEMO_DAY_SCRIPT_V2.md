# VIGIA Finale Demo Queries — Evidence-Safe Version

These prompts replace older versions that asked for one builder for all of NH-44, mapped a State PWD engineer to an NHAI project, or treated an O&M commencement as a physical relaying date. Those claims are not supported by the indexed sources.

## Query 1 — Scoped road, operator, and finance

`For the NH-44 Hyderabad-Nagpur corridor, what is the road type, current O&M concessionaire, and TOT award value?`

Narrate: “This is a scoped corridor query, not a claim about all 4,113 km of NH-44. VIGIA identifies the 6-lane road, Highway Infrastructure Trust as the O&M concessionaire, and ₹6,661 crore as the TOT concession award value. The Sources panel exposes the retrieved passage and link.”

## Query 2 — Responsibility without officer substitution

`Who is responsible for NH 44?`

Narrate: “VIGIA confirms that NH-44 project records are indexed. Because the evidence does not publish a project-specific named NHAI officer, it does not substitute a State PWD engineer. It routes the citizen to the NHAI PIU, CPGRAMS, and 1033.”

## Query 3 — NH-163G complaint routing

`For NH-163G, what verified project records exist and where should I file a pothole complaint? Do not name an officer unless the source explicitly does.`

Narrate: “The exact road identifier retrieves the NH-163G packages and their NHAI PDF passages. Complaint routing comes from the separate verified authority matrix. Project evidence and authority evidence remain visibly separate.”

## Query 4 — Anti-hallucination proof

`Who is the executive engineer for NH-9999?`

Narrate: “The exact-ID gate rejects semantically similar records from other highways. VIGIA says no exact indexed project record was found and provides only the official NHAI escalation route.”

## Query 5 — Maintenance-date semantics

`For NH-44 Hyderabad-Nagpur, what does the maintenance-related date 2024-09-18 represent?`

Narrate: “The date is identified as TOT Bundle-16 O&M commencement. VIGIA does not relabel it as a physical relaying or resurfacing date.”

## Pre-demo release gate

Run `npm run test:demo:live`. All six checks must pass, including the whole-road budget scope regression. Each substantive answer must carry an HTTPS source and retrieved excerpt.
