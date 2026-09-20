# Emma 0.2 — morning walkthrough

## Open the update

1. In the terminal where you normally run Emma, press Ctrl+C.
2. Run `npm.cmd run dev` from your usual `Downloads\Emma_Web_POC_0.1\emma-web-poc` folder.
3. Open your usual `http://localhost:3000` page and press Ctrl+Shift+R.

Do not use port 3001 for your normal testing: that was an isolated development preview with separate browser data. Your existing patient records remain under the same browser storage key at your usual address.

## Try these

- Say **“I’m wiped out today.”** Emma acknowledges gently, uses shorter replies, and simplifies the home view. The state expires after 12 hours. Say **“Back to normal mode”** to end it sooner.
- Say **“Remember that I prefer short explanations.”** Emma must ask before keeping it. Confirm, then check Memory. Reload and check that it remains.
- Type **“Remember privately I like quiet music.”** Confirm. The memory shows as private and is excluded from future AI context. Spoken requests already pass through the external voice service; private memory does not undo that transmission.
- Ask **“Am I forgetting anything?”** Emma reads current Open Loops. Handled items can be reopened from their section.
- Search Journey for a symptom, medicine name, or date such as `2026-09-15`.
- Open **Your data & backup**. Enter a passphrase of at least 12 characters and download your encrypted `.emma` backup. Store the passphrase separately. There is no password recovery.

Medication confirmations, explicit amount clarification, and the estimated testing-credit counter remain available. Emma should use your name in the opening greeting, without repeating it after every answer.

## What changed underneath

Unreadable saved data is no longer silently replaced. Emma preserves it and offers recovery. A previous valid save is retained. Debug capture is opt-in for the current visit and excluded from new saved records and backups. Cancelling a pending voice connection releases the microphone when it arrives.

This remains a testing prototype. Browser records are not encrypted at rest; downloaded backups are. Voice and some typed messages use external AI. There are no scheduled reminders, clinical monitoring, document ingestion, appointment recording, or native Apple integrations yet.
