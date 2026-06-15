# Contracts Studio — Design & Build Plan

A first-class WappFlow module (alongside CRM, Media Studio, Flux). **Not** a
DocuSign clone, **not** standalone. Client-centric: the contract is part of the
relationship, not an isolated PDF. The workflow + the signing + the client
experience are the product.

Feel: premium, elegant, alive, luxury, human — closer to Apple / Stripe / Notion
/ Framer than to legal/enterprise software. Mobile-first. Three theme identities
(**Monochrome / Editorial / Executive** — distinct workspaces, not colour swaps).

App-switcher: CRM · Media Studio · Flux · **Contracts Studio**.

## Sections
Contracts · Templates · Approvals · Signatures · Proposals · Client Vault · Analytics · Settings

## Core concepts
- **Document** = a contract / proposal / quote / NDA / SOW / retainer / hybrid.
  Built from **blocks** (Notion/PandaDoc-style), not a Word form.
- **Blocks**: text, heading, image, gallery, video, pricing table, package,
  optional add-ons, timeline, checklist, FAQ, signature, approval, testimonial,
  divider, callout, button, embed, custom section.
- **Interactive proposals**: client selects packages + toggles add-ons → totals
  update live. Opened as a premium experience (animations, progress), never a PDF.
- **Signing**: draw / type / upload signature, initials, date, checkboxes,
  approval buttons; multi-party (client/company/witness/co-signer), sequential
  OR parallel signing order.
- **Approvals**: internal chains (manager/sales/finance/legal) before send.
- **AI assistant**: draft, improve, explain clauses, summarize, find risks/gaps,
  suggest templates, generate scope/deliverables/terms. Plain-language client Q&A
  ("what does this clause mean?"). Advisory only — never replaces the human.

## Deep integration (the differentiator)
Every document links to a Lead/Client/Deal/Project/Pipeline + timeline. Delivery
over WhatsApp + email + link. Automations on events (signed → move pipeline stage,
create invoice, create project, create Media Studio project, send welcome; expired
→ notify team). Payments (deposit / milestone / full / plan / retainer). Client
Vault aggregates a client's contracts/proposals/invoices/files/deliverables.

## Analytics
Views, time-on-page, per-block drop-off, signature completion %, proposal
acceptance %, package popularity, revenue & pipeline impact, conversion.

## Security
Audit trail, IP logging, timestamping, versioning, signature verification, access
logs, tamper detection (hash), download tracking, expiration + revocation.

## Data model (`cs_*` namespace — fresh, separate from the scrapped `contracts*`)
- **cs_documents**: id, workspace_id, lead_id, type, title, status (draft|sent|
  viewed|signed|completed|declined|expired|approved), blocks(JSON), theme,
  settings(JSON: accent, payment, expiry…), totals(JSON), token, created_by,
  sent_at/viewed_at/completed_at/expires_at, version, doc_hash.
- **cs_signers**: id, document_id, workspace_id, role, name, email, phone,
  sign_order, mode(sequential|parallel), status, token, typed_name,
  signature_data, consent, ip, user_agent, signed_at.
- **cs_events**: id, document_id, workspace_id, type, actor, ip, user_agent,
  meta(JSON), created_at  (audit + analytics).
- **cs_approvals**: id, document_id, approver_user_id, role, sign_order, status,
  note, decided_at.
- **cs_templates**: id, workspace_id, type, industry, title, blocks(JSON), created_by.

## Phased build
- **Phase 1 — Foundation** (this pass): cs_* schema + module mount, document CRUD
  + templates, ContractsStudioShell + app-switcher entry, the living **dashboard**
  (status lanes, recent activity, impact stats).
- **Phase 2 — Block builder**: visual block editor (the flagship), themes.
- **Phase 3 — Client portal + signing**: premium interactive viewer, package/add-on
  selection w/ live totals, multi-party signing, audit + signed record.
- **Phase 4 — Send + delivery**: WhatsApp + email + link, reminders, CRM timeline.
- **Phase 5 — Approvals + automations + payments**.
- **Phase 6 — AI assistant + client Q&A**.
- **Phase 7 — Analytics, Client Vault, template/industry packs**.

Source of truth for the vision: this doc. Built incrementally; user guides priorities.
