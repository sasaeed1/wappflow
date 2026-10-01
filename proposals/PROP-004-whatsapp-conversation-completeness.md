# Technical Proposal — WhatsApp conversation completeness

- **Proposal ID / date:** PROP-004 · 2026-10-01
- **Author:** Claude Code, for the owner
- **Status:** implemented. The owner approved items 1–9 explicitly. This lifts the standing "never touch the WhatsApp message flow" constraint for this change only.
- **Priority-order rank:** Data Integrity (items 1–4), then UX (items 5–9)

---

## 1. Problem
WappFlow listened to exactly one WhatsApp event: an inbound message (`backend/whatsapp-service.js`, the `message` listener). Everything else WhatsApp reports never reached the CRM:

1. **Replies typed on the phone were invisible.**
   - There was no `message_create` listener.
   - The missed-message sync skipped `fromMe` messages on purpose.
   - Threads looked unanswered, and the AI and the "needs attention" list judged half a conversation.
2. **Locations, contact cards and polls were dropped.** The "skip empty" guard rejected anything with no text and no file.
3. **There was no delivery or read state.** Worse, the lead thread drew a **hardcoded blue ✓✓** on every outgoing message (`leads/[id]/page.js`), claiming "read" for messages WhatsApp may never have delivered.
4. **LID senders could lose their phone number.** When WhatsApp hid a number behind an `@lid` id, the LID itself was stored as `customer_phone`. That lead could not be called and could not be matched to the same person later.
5. **Replies:** no quoted-message context in either direction.
6. **Reactions** were not recorded and could not be sent.
7. **Edits and "deleted for everyone"** were not reflected.
8. **Linking needed a QR scan**, which is impossible from the same phone that shows it.
9. **WhatsApp calls** left no trace on the lead.

## 2. Proposed solution
whatsapp-web.js 1.34.7 (already installed, and the latest release) exposes all of this. We add one listener per event. Each listener is a **method** on `WhatsAppService`, so it can be tested without a live session. Each is wrapped in a guard, so a failure can never take the session or the inbound pipeline down.

| # | Event / call | Behaviour |
|---|---|---|
| 1 | `message_create` | After a short settle (2.5 s), the handler does one of two things. If WappFlow sent the message, its route already inserted the row without WhatsApp's id, so the handler **links** that row. Otherwise the message came from the phone or another linked device, so it is **inserted** as `from_me=1`, and only on an existing lead (personal chats stay out). The missed-sync now imports `fromMe` messages on existing leads. |
| 2 | `waSpecialContent()` | Location, vCard and poll messages become a readable body plus JSON `meta`. The thread renders them as a map link, a contact card or a poll card. |
| 3 | `message_ack` | `messages.ack` only moves forward. A tick that arrives before its row exists is stashed and applied later. The send route now stores WhatsApp's id directly. |
| 4 | `getContactLidAndPhone` + `leads.wa_lid` | Resolve the real number before falling back to the LID. Match on `wa_lid` first, so the same person always lands on the same lead. A lead stored with its LID as the phone is upgraded once the number is known. |
| 5 | `getQuotedMessage` / `quotedMessageId` | Inbound replies store `quoted_wa_id` and `quoted_body`. The composer can reply to a message, and the quote is sent through WhatsApp. |
| 6 | `message_reaction` / `msg.react()` | `messages.reactions` is JSON, `{me, them}`. Reactions can be sent from the thread. |
| 7 | `message_edit` / `message_revoke_everyone` | An edit shows the new text and keeps the first version (`original_body`). A deletion is **marked** (`deleted_at`), but the text is kept: a CRM is a record. |
| 8 | `requestPairingCode` | The QR screens get "Link with phone number instead", which shows an 8-character code. |
| 9 | `call` | The call is recorded on the lead's thread, and a notification is sent. An unknown caller becomes a lead. The call is deduplicated by call id. |

## 3. Golden-Rule check
- **Reused:** `waMessageKey`, `_downloadMediaFor`, `isIngestableChat`, `_emit` (workspace fan-out), `notify` (the bell), `getScopedLead` (route scoping), and the existing lead-matching rules (now in `_leadByPhone`).
- **No second implementation:** the six existing outbound send sites are not rewritten. Linking in `message_create` covers all of them.

## 4. Affected modules
CRM (lead thread, settings → connections, the WhatsApp page) and Platform (the WhatsApp service).

## 5. Database changes
All changes are additive, nullable, and applied with `safeAlter`. Existing rows simply have NULLs.
- `messages`: `ack`, `quoted_wa_id`, `quoted_body`, `reactions`, `edited_at`, `original_body`, `deleted_at`, `meta`
- `leads`: `wa_lid`
- Index: `idx_leads_wa_lid (workspace_id, wa_lid)`

## 6. APIs
- `POST /api/leads/:leadId/messages` accepts an optional `reply_to` (a message id, which must belong to this lead). The response adds `sent`, the stored row.
- `POST /api/leads/:leadId/messages/:messageId/react` takes `{ emoji }`; an empty emoji removes the reaction. It is lead-scoped. It returns 400 for messages that have no WhatsApp id.
- `POST /api/whatsapp/accounts/:id/pair-code` and `POST /api/whatsapp/pair-code` take `{ phone }` and return `{ code }`. They are workspace-scoped and audited (`whatsapp_pair_code`).
- New SSE frame: `message_updated { lead_id, message }`. It is unnamed, consistent with the existing frames.

## 7. UI impact
- **Lead thread:** real ticks, quoted-message strip, location/contact/poll/call cards, reactions, "Edited" (with the original text on hover) and "Deleted by sender".
  - A reply/react bar appears on hover (mouse) or long-press (touch).
  - A "Replying to…" strip appears in the composer.
- **QR screens:** a `PairWithPhone` panel.
- New files: `components/WaMessageParts.js` and `components/PairWithPhone.js`.

## 10. Backward compatibility
- The inbound pipeline's behaviour is unchanged for ordinary text and media.
- Old rows render as before, except that legacy outgoing rows (`ack` NULL) now show a single ✓ ("sent", which is all that is known) instead of a false blue ✓✓.

## 11. Risks & mitigations
- **Linking the wrong WappFlow row.** Matching is constrained to the same lead, outgoing direction, no WhatsApp id yet, the last 5 minutes, and the same body (or both media). Text sends from the main route store the id directly, so they never need linking.
- **Personal chats leaking into the CRM.** Phone-sent messages are recorded only on existing leads. The missed-sync creates a lead only from an inbound message.
- **Library field drift.** Every handler is guarded and best-effort. `test-whatsapp-events.js` pins the event shapes.

## 12. Rollout plan
Deploy as usual. No flag is needed: every change is additive.

**Verification:** `node test-whatsapp-events.js` (24 checks), plus the existing `test-whatsapp-media.js` and `test-security-whatsapp-tenancy.js`. Then on a live number, check:
- a reply typed on the phone appears in the thread
- the ticks turn blue when the message is read
- a pin, contact or poll arrives
- the pairing code links a device

**Rollback:** revert the commit. The new columns are harmless if left in place.
