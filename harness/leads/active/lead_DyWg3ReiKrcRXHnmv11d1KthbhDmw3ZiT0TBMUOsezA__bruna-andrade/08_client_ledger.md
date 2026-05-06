---
close_lead_id: lead_DyWg3ReiKrcRXHnmv11d1KthbhDmw3ZiT0TBMUOsezA
lead_name: Bruna Andrade
generated_at: 2026-05-06T00:49:27.241Z
from_hash: sha256:c5bdc024a7fa73b14e3b90c0b72ede2b242e6f9225aeffc60a9ac8538a86e6aa
---
## Cadence position
- **Current lifecycle state (Close pipeline status):** `Sales: 🔥 05A. Quote sent` (status_id: `stat_vZwZN4xJrTPIc6F7P2efylTbDWGFFgBcx8gHD9SM30N`)
- **Most recent activity (from continuity log):** `2026-05-05` outbound SMS `acti_xkR8Ho4p5XCZojWYwzFSrItgtD3cOs4ZyX3xRUR35FK`
- **Lead needs operator review?** **Yes.** There’s an active task due `2026-05-07` (“DAY 3 - EMAIL ONLY”) but the contact has received multiple outbound touches without a clear “quote delivered / follow-up received” signal captured here (only status says “Quote sent”).
- **Seven-day plan stale?** **Potentially yes.** Event date is `2026-05-23`. We’re already beyond early cadence touches, and the last recorded outreach is `2026-05-05`, with no captured tasting booking completion or BEO/acceptance signals in the provided substrate.

## Recent fires
| date | channel | actor | activity_id | factual one-line content description |
|---|---|---|---|---|
| 2026-05-02 | SMS outbound | Sales Team Event Consultant Team | `acti_rN9TzJeWm6kuAxJkwp8Dyi8AlZ3mbZNwritvekpVaJF` | “Got your bar service request Bruna! We'll connect shortly. -❤️ Comeketo…” |
| 2026-05-02 | SMS outbound | Sales Team Event Consultant Team | `acti_43lEu9SEbBI7MzBunw9FHDSsgY80g91ubni7tAVa0Uz` | Asked best time of day to give a call. |
| 2026-05-02 | SMS outbound | Sales Team Event Consultant Team | `acti_fd0vnkCmNW7JmNS3jCicXrqjNEbpgiemlzv9DCyACqu` | Confirmed free tasting request and said consultant will reach out. |
| 2026-05-02 | call outbound | Event Consultant | `acti_dJROrYYD2YpJ5puHzfIR7j0TD1RC5t9WoRdGA2bNctU` | Outbound call answered (recording duration 18s); no transcript/notes included in substrate. |
| 2026-05-03 | call outbound | (same agent user) | `acti_lDtnyqJSEgqilSQxyY5HTmPDNgbHD6pZQPdY3WrFLki` | Outbound call attempt (no content/answer details in snippet). |
| 2026-05-03 | call outbound | (same agent user) | `acti_wnsdtjAB5VtI16KOiR0K0xuuI6iKEymirPIVx435fv9` | Outbound call attempt (no content/answer details in snippet). |
| 2026-05-03 | SMS outbound | (same agent user) | `acti_dg4hh76tf52vrVK19hf3ZHADUOiXcQ6IKfNhXu6u8bd` | SMS sent (content not shown in continuity snippet). |
| 2026-05-04 | call outbound | Andre Raw | `acti_76YVQ54QcjU7UeahgdDyVnvUGcXHdjxFTlrZ4XXOp31` | Outbound call attempt (no content/answer details in snippet). |
| 2026-05-04 | SMS outbound | Andre Raw | `acti_IbhSb1u1xRfVQHYtqtbnt3U57wej5TuNiTgQffX1JmV` | SMS sent (content not shown in continuity snippet). |
| 2026-05-04 | email outgoing | Andre Raw | `acti_NA8168FWtqXDUmNc94W1DSqY4NLIKp95VdMv71yzKqP` | Email sent (content not shown in substrate). |
| 2026-05-05 | SMS outbound | Andre Raw | `acti_cq7WOvFy0gN2waobiaWk27O2gQ5pzHeASSyZktkCUFX` | SMS sent (content not shown in substrate). |
| 2026-05-05 | SMS outbound | Andre Raw | `acti_xkR8Ho4p5XCZojWYwzFSrItgtD3cOs4ZyX3xRUR35FK` | SMS sent (content not shown in substrate). |

## Inbound activity
| date | channel | activity_id | factual one-line content description |
|---|---|---|---|
| 2026-05-02 | SMS inbound | `acti_50L3GxSX125DAsoLhaNYCIW89LCqUpjqlsJcXR3NbGV` | Inbound SMS received from the lead (message text not included in provided snippet). |
| 2026-05-05 | SMS inbound | `acti_dHUBLMM674lf76TysqytGf4wK449zZHW4JtyEk4D3FP` | Inbound SMS received from the lead (message text not included in provided snippet). |

## State changes
- **2026-05-02:** Lead created (lead object `lead_DyWg3ReiKrcRXHnmv11d1KthbhDmw3ZiT0TBMUOsezA`); request identified as **bar service** with **Event Date: 2026-05-23** (from `description` on lead record).
  - Note captured: `acti_8uzTPKEaYIGj5RLxEfpH1jbKgpu51NtKzaf4IungMtl` (“THIS IS FOR BAR SERVICE ONLY … From Facebook Ads … Event Date: May 23 … Ad Name: [BARSERV] -QUOTE-FINAL-4-6-26-copy …”)
- **2026-05-04 to 2026-05-05:** Opportunity exists with status **“🔥 05A. Quote sent”**:
  - Opportunity id `oppo_3H1vohppAs2qUtY7CoCMXwSn7wy9nIgVr4vBLv1ofyE`
  - Status label: `Sales: 🔥 05A. Quote sent`
  - Confidence: `20`
  - Note: substrate does **not** include a dedicated “quote sent” event activity_id, only the pipeline status and subsequent outreach touches.
- **2026-05-03:** Tasks exist; current visible task:
  - Task id `task_gypeA3vIt2R1gO1VDX55Ta35WbPNUb8f4JCwrq9UdSW`, due `2026-05-07`, incomplete
  - Text: `DAY 3 - EMAIL ONLY`
