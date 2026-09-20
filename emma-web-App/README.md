# Emma Web POC 0.1

A small proof-of-concept for **Emma — AI Care Companion**.

## What it proves
- realtime browser voice conversation via OpenAI WebRTC
- Emma persona instructions
- local patient memory that survives refreshes
- Journey events
- Open Loops
- typed fallback for testing without an API key
- Developer Debug view
- permanent OpenAI API key stays on the server

## Important
Engineering prototype only. Do not use for urgent care, clinical decisions, or real patient records.

## Setup
1. Install Node.js 20+.
2. Unzip the project and open a terminal in the folder.
3. Run `npm install`.
4. Copy `.env.example` to `.env`.
5. Put your OpenAI API key in `.env`.
6. Run `npm run dev`.
7. Open `http://localhost:3000`.
8. Tap **Start conversation** and allow microphone access.

## First test
Say: `My name is Susan. I had chemo yesterday and I have been nauseous today.`

End the session. Open Memory and Journey. Refresh the page. Start a new session and ask: `Emma, what do you remember about me?`

The second voice session receives a compact context packet built from the locally persisted data.

## Typed fallback
Even without an API key, use **Type instead** to test persistence:
- My name is Susan.
- I drank 500 mL of water.
- I took my nausea pill.
- My nausea is awful today.
- Remember to ask my doctor about tingling in my hands.

## Current limitations
- local extraction is heuristic, not clinically reliable
- no authentication or encrypted database yet
- no Share-to-Emma, Appointment Mode, Doctor Report, HealthKit or Watch support yet
- realtime schemas can evolve; Developer Debug is included so integration changes are easy to inspect
- web background audio on iOS is more limited than native mobile

## Next milestone
Replace the heuristic extractor with structured AI extraction producing JourneyEvent, MemoryCandidate, OpenLoopCandidate, PatientVocabularyCandidate, confidence, and provenance. Then add confirmation rules and real tool calls.

## Security
Never put a normal OpenAI API key in `public/app.js`, HTML, or any client-side bundle.
