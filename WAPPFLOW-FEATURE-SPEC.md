# WappFlow — Complete Feature Set

> Auto-generated from a full source-code inventory of the WappFlow codebase (backend Express + better-sqlite3, web Next.js, desktop Electron). One section per module: overview, every feature, every API route, data model, rules/constraints, automations, AI behaviors, integrations. Generated 2026-06-27.

## Modules
1. CRM Core (wappflow backend/server.js)
2. Messaging + Real-time Transport (WhatsApp multi-account, IG/FB/Website lead capture, SSE, Web Push, AI text seam)
3. Media Studio core (ingest → library → cull)
4. Media Studio — Delivery + Client-Facing (backend/media-studio.js)
5. Media Intelligence (Track-0 + Brains + Style + Reel)
6. Video Studio (Media Studio — Video / Reel Editor)
7. Contracts Studio
8. Booking
9. Communications 2.0
10. Command Center (platform control plane)
11. Pricing, Entitlements & Storage
12. WappFlow Desktop (Electron shell)
13. Client Portal + Public/Token Surfaces + Web App Shape (wappflow-web, Next.js App Router)
14. Coverage sweep (all modules / routes / jobs / crons / events)

---

## 1. CRM Core (wappflow backend/server.js)

The CRM core is the monolithic Express + better-sqlite3 backend (backend/server.js, ~5618 lines) that powers WappFlow: a WhatsApp-first, multi-platform CRM. It owns leads/pipeline, clients, multi-channel inbox/messages, notes/reminders/tags/presets, invoices, email (SMTP send + IMAP receive + templates + per-lead workflows), analytics/reports, a unified notification center, audit logging, full JSON data export, internal team chat, workspace/team membership with role-permissions and email invites, Google/JWT auth + Flux SSO, AI assistance (Groq/Gemini-style provider via ai-engine, lead intelligence scoring, NBA suggestions, memories + knowledge base), platform-account management with Instagram/Facebook/website webhooks, lead merge/relations/timeline, plan/entitlement gating, Google Calendar/Calendly integration + meetings, and a unified client portal. Core guarantees: every authenticated request is scoped to a workspace (req.workspaceId), shared resources keyed to the workspace owner (req.workspaceOwnerId), role-based access (super_admin/admin/manager/user), soft-delete trash with 90-day auto-cleanup, plan-limit enforcement on creation, and additive migrations via safeAlter that never drop data.

### Features
- **JWT + Google + invite auth** — Email/password register (bcrypt hash, 10 rounds) creates user+workspace+super_admin member+default company_settings; login compares bcrypt and returns role from workspace_members; change-password requires current password and min 6 chars; Google Sign-In verifies ID token via google-auth-library, links by google_id or email, auto-creates workspace for new/legacy users (Google users get a throwaway hashed password); invite-info (public) + accept-invite (sets password, activates member, creates or updates user). Auth middleware accepts token from Authorization header OR ?token query (for SSE).
- **Flux SSO token mint** — POST /api/sso/flux-token issues a short-lived (60s) inline HS256-signed JWT (iss=wappflow, aud=flux, carries wf_workspace_id, wf_user_id, email, name, plan) using FLUX_SSO_SECRET; returns ssoUrl to flux.remoteops.co. unlocked=true for growth/enterprise/pro/business plans, else lands on Flux Free.
- **Profile + company settings** — GET/PUT /api/profile (full_name, phone, bio — full_name mirrored to workspace_members); avatar upload (multer, /uploads/avatars). Company settings: name/address/email/phone/website, currency + symbol + position, invoice prefix/counter, tax name/rate, email_signature; logo upload (5MB image-only, filename keyed to userId). Company settings keyed to workspaceOwnerId so the whole workspace shares one config.
- **Leads CRUD + pipeline** — List with filters status/assigned_to/source/platform/account_id/client (client=1 only clients, client=0 only leads, omitted=all); 'user' role sees only assigned leads. Create with duplicate phone detection (digit-normalised, last-10-digit suffix tolerant) + plan limit hard stop (402). Update via whitelist of allowed fields. Status update sets closed_at on Closed-Won/Lost, actual_sale on won, lost_reason on lost, last_contacted_at on Contacted/Interested/Negotiating. Each lead enriched with assignee name + platform account nickname/name. Soft delete to trash, restore, permanent delete (cascades children), trash list, manual + cron 90-day cleanup.
- **Clients (won → client)** — PUT /api/leads/:id/client toggles is_client flag (sets client_since on promote). Clients are hidden from the Leads list but kept in chat/analytics — fully reversible, never deletes. Adds contact_history entries 'Moved to Clients'/'Moved back to Leads'.
- **Bulk lead operations** — bulk-upload (JSON from CSV parse; skips blank phone + duplicates, enforces remaining monthly lead allowance mid-import with limitSkipped warning); bulk-assign (set assigned_to on many); round-robin assign (distributes across active members or a provided validated subset); bulk-trash (soft-delete many + SSE fan-out).
- **Lead merge + duplicate detection** — GET /api/leads/duplicates groups by normalised phone (>=6 digits) then by normalised name (>=3 chars, only ungrouped). POST /api/leads/merge folds duplicate_ids into primary: auto-discovers every table with a lead_id column and reassigns child rows (UPDATE OR IGNORE), backfills blank primary fields from duplicates (phone/email/address/source/account/values/assignee/etc.), soft-deletes duplicates to trash (recoverable), refreshes primary last_message_at, logs history + audit, SSE broadcasts.
- **Lead relations + connected channels** — lead_channels: extra comm channels per lead (platform+identifier+account, UNIQUE per lead/platform/identifier). lead_relations: link two leads (canonical sorted pair, UNIQUE). GET /related returns heuristic suggestions (phone last-10 / email / exact-name matches) plus already-linked relations.
- **Unified activity timeline** — GET /api/leads/:leadId/timeline merges activity_timeline rows + last 50 messages (mapped message_in/message_out) + last 30 notes + last 30 contact_history into one feed sorted desc, capped at 100.
- **Multi-channel messages** — Per-lead message list filterable by platform with per-platform counts. Send text (only WhatsApp truly delivered; other platforms saved as local draft with delivered:false). Voice notes (multer, preserves extension, WhatsApp send-or-draft), media (image/video/audio/document auto-typed, WhatsApp send-or-draft, 16MB). WhatsApp history sync per lead with 5-minute cooldown + dedup by wa_message_id.
- **Notes / reminders / contact history** — Notes CRUD per lead (add logs history). Reminders create/list/toggle (dual columns reminder_date/due_date + completed/is_completed for schema-drift tolerance); upcoming list for user; cron fires due reminders (push + SSE + notification). Contact history auto-logged on most lead actions (created, message, note, reminder, status_change, assignment, invoice, email, ai, merge, client).
- **Tags + presets** — Tags CRUD (workspace-owner scoped, default color #6366f1); attach/detach tag to lead (lead_tags, cascade on delete). Message presets CRUD (quick-reply templates). attachTags batch-loads tags for lead lists in a single workspace-scoped query (de-N+1'd).
- **Invoices** — CRUD scoped to workspace owner. Auto-generates invoice number from company prefix + counter (counter incremented on each create). Stores items as JSON, subtotal/tax/discount/total, currency from company settings, status (draft default), due_date, notes. Create logs contact_history + audit. parseInvoice deserialises items for the client.
- **Email templates + per-lead workflows** — Email templates CRUD (name/subject/body/delay_days/trigger_event default manual). Per-lead email_workflows: start a workflow from a template (pending, scheduled_at), list (joins template), update status (sets sent_at when status=sent). Logs history.
- **Email send (SMTP) + receive (IMAP)** — SMTP settings per workspace owner (host/port/secure/user/pass/from_name/from_email; password masked on read, preserved if masked on write; admin+ only). SMTP test endpoint verifies + sends a test mail. Compose+send per-lead email via nodemailer (records lead_emails sent, logs audit). IMAP settings (host/port/secure/user/pass/is_enabled, masked) + test. IMAP poller polls all enabled workspaces every 2 min: matches inbound mail to lead by email, dedups same-from/subject within 10 min, stores lead_emails received, logs history, SSE 'email_received'; manual poll-now endpoint.
- **Auto-reply rules** — CRUD for keyword-triggered auto-replies (keywords JSON, reply_message, match_type default 'contains', is_active toggle). Workspace-owner scoped. (Consumption/matching happens in whatsapp-service, not in these routes.)
- **Analytics + reports** — GET /api/analytics: total leads, leads today, total sales (sum actual_sale), closed_won count, conversion rate, leads-by-status, avg deal size, this-month vs last-month, currency symbol. GET /api/reports/overview: leads-over-time, revenue-over-time (closed_at), pipeline funnel (count+value by status), lead sources, assignee performance (total/won/lost/revenue per member), avg first-response time (minutes between lead creation and first outgoing message, positive-only), lost reasons, platform breakdown. Supports period (days) or custom start_date/end_date via bound params.
- **Unified notification center** — notify() inserts a notifications row (workspace-scoped, optional user-targeted) + SSE 'notification' fan-out. Feed endpoint returns last 60 + unread count; read-one and read-all. Fired on new lead, due reminder, and through DI seam from other modules. Best-effort — never blocks the action.
- **Audit log + data export** — logAudit writes audit_logs (workspace, user, action, entity, details JSON, ip). GET /api/audit-logs paginated with user join + total. GET /api/workspace/export streams a full JSON backup (leads + per-lead children, invoices, tags, bookings, contracts, media projects, galleries, last 2000 audit rows) as a downloadable attachment, logs an 'export' audit row.
- **Internal team chat** — Channels (auto-creates general/leads/random defaults per workspace; create slugifies name; private flag; delete cascades messages). Messages with reply_to, media upload, soft list with reactions JSON + before-cursor pagination. Delete own message (also clears pins). Emoji reactions toggle (UNIQUE per message/user/emoji). Real-time fan-out via Comms 2.0 DI seam (commsApi.afterMessage with @mentions) else SSE to sender.
- **Workspace + team members + roles** — GET /api/workspace returns workspace + ordered members + role-permission map + current role. Update workspace name (admin+). Invite member by email (admin+, validates role admin/manager/user, enforces seat plan limit, sends branded HTML invite email via workspace SMTP, returns link). Update member role/permissions + remove member (guards: cannot modify/assign super_admin unless super_admin, cannot remove owner or self). Legacy team_members CRUD also present for backward compat.
- **Role permissions** — DEFAULT_ROLE_PERMISSIONS for super_admin/admin/manager/user across view_all_leads, create/edit/delete_lead, view_reports, manage_settings/team/invoices/whatsapp. GET merges defaults with saved overrides; PUT (super_admin only) upserts per-role permission JSON into workspace_role_permissions.
- **AI assistant suite** — Per-lead: AI summary, 3 reply suggestions (uses presets + memory context), analyze (persists lead_score/sentiment/urgency/intent_category via ai-engine). Generic: sentiment, rewrite (tone, falls back to workspace tone), translate, shorten, status (active provider). Workspace AI profile GET/PUT (business_description, tone, language, signature, dos/donts, auto_analyze). All LLM calls metered into ai_usage (provider/model/tokens/latency/est_cost).
- **AI command center (NL)** — POST /api/ai/command: classifies a natural-language command into intents (show_leads, show_stats, show_reminders, summarize_today, find_lead, show_hot_leads, show_won_leads, show_lost_leads, show_recent, unknown) then executes against the DB and returns data + an AI-written friendly summary for stats/today.
- **Industry detection + vertical actions** — Per-lead and workspace industry detection (keyword heuristic, AI fallback via INDUSTRY_WORKFLOWS for training_institute/real_estate/clinic/agency/salon/logistics/ecommerce/general). Vertical-action sends a predefined or custom message via WhatsApp; vertical-suggest returns AI next_action + suggested_message + buying_stage.
- **Business memory + knowledge base** — ai_memories CRUD (type/key/value/confidence/source). Knowledge documents: upload PDF/DOCX/TXT (pdf-parse/mammoth), background text extraction + AI memory extraction (processed flag 0/1/2), list, delete (removes file + memories), per-doc memories. learn-from-messages: extracts reusable memories from last 100 staff outgoing replies (filters media/url placeholders, needs >=5).
- **Platform accounts + webhooks** — platform_accounts CRUD (max 5 per platform; WhatsApp plan-limited; auto-starts/stops WA session on create/delete; per-account webhook_verify_token; credentials JSON). WhatsApp per-account connect/disconnect/status, legacy reconnect/disconnect/sync-missed/send. Instagram + Facebook webhook verify (GET) + receive (POST, routes to account by page id). Website form submit (public, tokenized, normalises WappFlow/Formspree fields, creates lead + first message + SSE).
- **Plan / entitlements** — GET/PUT /api/workspace/plan (raw row). GET /api/workspace/plan-info resolves features+limits via entitlements resolver + rich per-metric usage/quota from pricing engine + founding status + all plans + provenance sources. Public GET /api/plans for landing catalog. Inline PLAN_DEFINITIONS (free/starter/growth/enterprise) also present as legacy fallback. Module gate middleware blocks /api/{media,studio-ai,video-ai,cs,booking,store,payments}/* when a feature flag is explicitly false (public tokenized routes exempt).
- **Integrations + meetings** — Calendly URL save (validated calendly.com). Google Calendar connect (OAuth code → refresh token, stores email), status, disconnect. Per-lead meetings: create Google Meet event (refreshes access token, creates Calendar event w/ Hangouts Meet + attendees, stores meeting + activity_timeline row), list meetings.
- **WhatsApp groups** — ready-accounts (connected WA sessions filtered to workspace). Create group from lead_ids (<=256, filters to valid WA numbers/JIDs, reports ineligible, persists whatsapp_groups row). PATCH group name/description/icon (multipart) with local mirror update.
- **Client portal** — POST /api/client-portal/:leadId mints/returns a per-client token (client_portals table) + branded URL. Public GET /api/client-portal/public/:token returns the client's projects/galleries (cross-module) without auth.
- **Web push + SSE** — VAPID web-push: vapid-key, subscribe (dedup by endpoint), unsubscribe, test; auto-removes expired (410) subscriptions. SSE /api/events per-user stream with heartbeat; broadcastToUser/broadcastToWorkspace fan-out used across modules.

### API endpoints (178)
- `GET /api/events` — Per-user SSE stream (token via header or query)
- `POST /api/auth/register` — Create user + workspace + super_admin member
- `POST /api/auth/login` — Email/password login, returns JWT + role
- `PUT /api/auth/password` — Change own password (requires current)
- `GET /api/auth/me` — Current user + company + workspace + role
- `GET /api/auth/invite-info/:token` — Public invite details by token
- `POST /api/auth/accept-invite` — Set password + activate invited member
- `POST /api/auth/google` — Google Sign-In / sign-up
- `POST /api/sso/flux-token` — Mint short-lived Flux SSO token
- `GET /api/profile` — Current user profile
- `PUT /api/profile` — Update full_name/phone/bio
- `POST /api/profile/avatar` — Upload avatar
- `GET /api/settings/company` — Get company settings (auto-creates)
- `PUT /api/settings/company` — Update company settings
- `POST /api/settings/logo` — Upload company logo
- `GET /api/team` — List workspace + legacy team members
- `POST /api/team` — Add legacy team member (invite token)
- `PUT /api/team/:id` — Update legacy team member
- `DELETE /api/team/:id` — Remove legacy team member
- `POST /api/leads/bulk-assign` — Assign many leads to a member
- `POST /api/leads/round-robin` — Round-robin assign leads
- `GET /api/leads` — List leads with filters (incl client/platform)
- `GET /api/leads/trash` — List soft-deleted leads
- `POST /api/leads/bulk-upload` — Bulk import leads from JSON
- `GET /api/leads/:leadId/messages` — Lead messages + per-platform counts
- `POST /api/leads/:leadId/messages` — Send text message (WA delivered, others draft)
- `POST /api/leads/:leadId/messages/voice` — Send voice note
- `POST /api/leads/:leadId/messages/sync` — Sync WA history (5-min cooldown)
- `GET /api/leads/:leadId/history` — Contact history feed
- `GET /api/leads/:leadId/invoices` — Invoices for a lead
- `GET /api/leads/:leadId/email-workflows` — Email workflows for a lead
- `POST /api/leads/:leadId/email-workflows` — Start an email workflow from template
- `PUT /api/email-workflows/:id/status` — Update workflow status (sent_at)
- `GET /api/leads/:id` — Lead detail bundle (notes/reminders/tags/etc.)
- `POST /api/leads` — Create lead (dup check + plan gate)
- `PUT /api/leads/:id` — Update lead (whitelisted fields)
- `PUT /api/leads/:id/client` — Toggle won lead ↔ client
- `PUT /api/leads/:id/status` — Change status (closed_at/sale/lost_reason)
- `DELETE /api/leads/:id` — Soft-delete to trash
- `POST /api/leads/:id/restore` — Restore from trash
- `DELETE /api/leads/:id/permanent` — Hard-delete lead + children
- `DELETE /api/leads/trash/cleanup` — Purge trash older than 90 days
- `GET /api/leads/duplicates` — Duplicate groups by phone/name
- `POST /api/leads/merge` — Merge duplicates into a primary
- `GET /api/leads/:leadId/notes` — List notes
- `POST /api/leads/:leadId/notes` — Add note
- `DELETE /api/notes/:id` — Delete own note
- `GET /api/leads/:leadId/reminders` — List reminders
- `POST /api/leads/:leadId/reminders` — Create reminder
- `GET /api/reminders/upcoming` — Upcoming reminders for user
- `PUT /api/reminders/:id/toggle` — Toggle reminder completed
- `POST /api/leads/:leadId/messages/media` — Send media file
- `GET /api/invoices` — List invoices
- `GET /api/invoices/:id` — Get invoice
- `POST /api/invoices` — Create invoice (auto number)
- `PUT /api/invoices/:id` — Update invoice
- `DELETE /api/invoices/:id` — Delete invoice
- `GET /api/email-templates` — List email templates
- `POST /api/email-templates` — Create email template
- `PUT /api/email-templates/:id` — Update email template
- `DELETE /api/email-templates/:id` — Delete email template
- `GET /api/auto-reply` — List auto-reply rules
- `POST /api/auto-reply` — Create auto-reply rule
- `PUT /api/auto-reply/:id` — Update auto-reply rule
- `DELETE /api/auto-reply/:id` — Delete auto-reply rule
- `GET /api/analytics` — Dashboard KPI summary
- `GET /api/reports/overview` — Detailed report set (period/custom range)
- `GET /api/audit-logs` — Paginated audit log
- `GET /api/workspace/export` — Full workspace JSON export
- `GET /api/tags` — List tags
- `POST /api/tags` — Create tag
- `PUT /api/tags/:id` — Update tag
- `DELETE /api/tags/:id` — Delete tag (+ unlink)
- `POST /api/leads/:leadId/tags/:tagId` — Attach tag to lead
- `DELETE /api/leads/:leadId/tags/:tagId` — Detach tag from lead
- `GET /api/presets` — List message presets
- `POST /api/presets` — Create preset
- `PUT /api/presets/:id` — Update preset
- `DELETE /api/presets/:id` — Delete preset
- `GET /api/whatsapp/status` — Legacy WA connection status
- `GET /api/whatsapp/accounts/:id/status` — Per-account WA status
- `POST /api/whatsapp/accounts/:id/connect` — Reconnect a WA account
- `POST /api/whatsapp/accounts/:id/disconnect` — Disconnect a WA account
- `POST /api/whatsapp/disconnect` — Legacy disconnect (no auth)
- `POST /api/whatsapp/reconnect` — Legacy reconnect
- `POST /api/whatsapp/sync-missed` — Trigger missed-message sync
- `POST /api/whatsapp/send` — Send WA message by phone
- `GET /api/push/vapid-key` — Public VAPID key
- `POST /api/push/subscribe` — Save push subscription
- `DELETE /api/push/unsubscribe` — Remove push subscription
- `POST /api/push/test` — Send test push
- `GET /api/notifications` — Notification feed + unread count
- `POST /api/notifications/read-all` — Mark all read
- `POST /api/notifications/:id/read` — Mark one read
- `GET /api/chat/channels` — List chat channels (+ defaults)
- `POST /api/chat/channels` — Create channel
- `DELETE /api/chat/channels/:id` — Delete channel (creator only)
- `GET /api/chat/channels/:channelId/messages` — Channel messages + reactions
- `POST /api/chat/channels/:channelId/messages` — Post channel message
- `POST /api/chat/channels/:channelId/messages/media` — Post channel media
- `DELETE /api/chat/messages/:id` — Delete own chat message
- `POST /api/chat/messages/:id/react` — Toggle emoji reaction
- `GET /api/workspace` — Workspace + members + role perms
- `PUT /api/workspace` — Rename workspace (admin+)
- `POST /api/workspace/invite` — Invite member by email (admin+)
- `PUT /api/workspace/members/:id` — Update member role/permissions
- `DELETE /api/workspace/members/:id` — Remove member
- `GET /api/workspace/role-permissions` — Role permission matrix
- `PUT /api/workspace/role-permissions` — Update role perms (super_admin)
- `GET /api/settings/email-smtp` — Get SMTP settings (masked)
- `PUT /api/settings/email-smtp` — Save SMTP (admin+)
- `POST /api/settings/email-smtp/test` — Send SMTP test email
- `GET /api/settings/email-imap` — Get IMAP settings (masked)
- `PUT /api/settings/email-imap` — Save IMAP (admin+)
- `POST /api/settings/email-imap/test` — Test IMAP connection
- `GET /api/leads/:id/emails` — List lead emails
- `POST /api/leads/:id/email` — Compose + send email to lead
- `POST /api/settings/email-imap/poll-now` — Manually trigger IMAP poll
- `POST /api/leads/:id/ai/summary` — AI conversation summary
- `POST /api/leads/:id/ai/reply-suggestions` — 3 AI reply suggestions
- `POST /api/leads/:id/ai/analyze` — AI lead intelligence (persists fields)
- `POST /api/ai/sentiment` — Sentiment of text
- `POST /api/ai/rewrite` — Rewrite text in tone
- `POST /api/ai/translate` — Translate text
- `POST /api/ai/shorten` — Shorten text
- `GET /api/ai/status` — Active AI provider
- `GET /api/ai/profile` — Workspace AI profile
- `PUT /api/ai/profile` — Update workspace AI profile
- `POST /api/ai/industry-detect` — Workspace industry detection
- `GET /api/memories` — List AI memories
- `POST /api/memories` — Add memory
- `PUT /api/memories/:id` — Update memory
- `DELETE /api/memories/:id` — Delete memory
- `GET /api/knowledge` — List knowledge documents
- `POST /api/knowledge/upload` — Upload + process doc → memories
- `DELETE /api/knowledge/:id` — Delete doc + its memories
- `GET /api/knowledge/:id/memories` — Memories from a doc
- `POST /api/knowledge/learn-from-messages` — Learn memories from staff replies
- `POST /api/ai/command` — NL command interpreter
- `GET /api/leads/:id/industry` — Per-lead industry + workflow
- `GET /api/workspace/industry` — Workspace industry + workflow
- `POST /api/leads/:id/vertical-action` — Send vertical action message
- `POST /api/leads/:id/vertical-suggest` — AI vertical next-action
- `GET /api/platform-accounts` — List platform accounts
- `POST /api/platform-accounts` — Create platform account (max 5, plan gate)
- `PUT /api/platform-accounts/:id` — Update platform account
- `DELETE /api/platform-accounts/:id` — Delete platform account
- `GET /api/webhooks/instagram` — IG webhook verify
- `POST /api/webhooks/instagram` — IG inbound webhook
- `GET /api/webhooks/facebook` — FB webhook verify
- `POST /api/webhooks/facebook` — FB inbound webhook
- `POST /api/website-form/:formToken/submit` — Public website form → lead
- `OPTIONS /api/website-form/:formToken/submit` — CORS preflight for form
- `GET /api/leads/:leadId/channels` — List linked channels
- `POST /api/leads/:leadId/channels` — Link a channel
- `DELETE /api/leads/:leadId/channels/:channelId` — Unlink channel
- `GET /api/leads/:leadId/related` — Related-lead suggestions + linked
- `POST /api/lead-relations` — Link two leads
- `DELETE /api/lead-relations/:id` — Unlink two leads
- `GET /api/leads/:leadId/timeline` — Unified activity timeline
- `GET /api/workspace/plan` — Get raw plan row
- `PUT /api/workspace/plan` — Set plan/features/limits/trial
- `GET /api/workspace/plan-info` — Resolved plan + usage/quota
- `GET /api/plans` — Public plan catalog + founding
- `GET /api/message-queue` — Outbound queue status
- `POST /api/message-queue/:id/retry` — Retry queued message
- `GET /api/whatsapp/ready-accounts` — Connected WA accounts for group modal
- `POST /api/whatsapp/groups` — Create WA group from leads
- `PATCH /api/whatsapp/groups/:groupId` — Update group name/desc/icon
- `POST /api/leads/bulk-trash` — Soft-delete many leads
- `GET /api/integrations/status` — Calendly + Google Calendar status
- `PUT /api/integrations/calendly` — Save Calendly URL
- `POST /api/integrations/google-calendar/connect` — OAuth connect Google Calendar
- `DELETE /api/integrations/google-calendar` — Disconnect Google Calendar
- `POST /api/leads/:leadId/meetings` — Create Google Meet meeting
- `GET /api/leads/:leadId/meetings` — List meetings for lead
- `POST /api/client-portal/:leadId` — Mint client portal token/URL
- `GET /api/client-portal/public/:token` — Public client portal view

### Data model
- **users** — Account identities — _cols:_ id, email(unique), password(bcrypt), business_name, role, workspace_id, full_name, profile_picture, phone, bio, google_id
- **workspaces** — Tenant root — _cols:_ id, name, owner_id; (status used for suspension)
- **workspace_members** — Membership + role + invite — _cols:_ id, workspace_id, user_id, role(super_admin/admin/manager/user), permissions JSON, invite_email, invite_token(unique), invite_status(active/pending), full_name
- **workspace_role_permissions** — Per-workspace role overrides — _cols:_ workspace_id, role, permissions JSON; UNIQUE(workspace_id,role)
- **team_members** — Legacy team members (backward compat) — _cols:_ id, workspace_id, name, email, role, status, invite_token, user_id
- **leads** — Core lead/client record — _cols:_ id, user_id, workspace_id, customer_name/phone/email/address/date_of_birth, status, estimated_value, actual_sale, is_deleted/deleted_at, is_client/client_since, closed_at, lost_reason, last_contacted_at, assigned_to, lead_source, lead_score, sentiment, urgency, intent_category, ai_last_analyzed_at, platform_source, platform_account_id, total_messages, last_message_at
- **messages** — Per-lead conversation messages — _cols:_ id, lead_id, user_id, body, from_me, media_url/type, timestamp, wa_message_id, platform(default whatsapp), platform_account_id
- **notes** — Lead notes — _cols:_ id, lead_id, user_id, content, created_at
- **reminders** — Lead reminders — _cols:_ id, lead_id, user_id, title/message, due_date/reminder_date, completed/is_completed
- **contact_history** — Per-lead activity log — _cols:_ id, lead_id, user_id, type, description, metadata JSON
- **activity_timeline** — Structured timeline events — _cols:_ id, lead_id, workspace_id, user_id, actor_name, activity_type, platform, title, body, metadata JSON
- **tags** — Lead tags — _cols:_ id, user_id(owner), name, color
- **lead_tags** — Lead↔tag join — _cols:_ lead_id, tag_id (PK, cascade)
- **message_presets** — Quick-reply templates — _cols:_ id, user_id, title, body
- **invoices** — Invoices — _cols:_ id, user_id(owner), lead_id, invoice_number, customer fields, items JSON, subtotal/tax/discount/total, currency, status, due_date, notes
- **email_templates** — Email templates — _cols:_ id, user_id, name, subject, body, delay_days, trigger_event
- **email_workflows** — Per-lead email sequence instances — _cols:_ id, user_id, lead_id, template_id, status(pending/sent), scheduled_at, sent_at
- **email_smtp_settings** — Outbound email config — _cols:_ user_id(unique), smtp_host/port/secure/user/pass, from_name/from_email
- **email_imap_settings** — Inbound email config — _cols:_ user_id(unique), imap_host/port/secure/user/pass, is_enabled
- **lead_emails** — Sent/received emails per lead — _cols:_ id, lead_id, workspace_id, user_id, direction(sent/received), from/to_email, subject, body, status
- **auto_reply_rules** — Keyword auto-replies — _cols:_ id, user_id, name, keywords JSON, reply_message, match_type, is_active
- **audit_logs** — Audit trail — _cols:_ id, workspace_id, user_id, user_name, action, entity_type/id, details JSON, ip_address
- **notifications** — Unified notification feed — _cols:_ id, workspace_id, user_id(nullable), type, title, body, url, icon, is_read
- **push_subscriptions** — Web-push endpoints — _cols:_ id, user_id, endpoint(unique), p256dh, auth
- **chat_channels** — Internal team channels — _cols:_ id, workspace_id, name, description, is_private, created_by
- **chat_messages** — Internal chat messages — _cols:_ id, channel_id, user_id, sender_name, body, media_url/type, reply_to, is_edited
- **chat_reactions** — Chat emoji reactions — _cols:_ id, message_id, user_id, emoji; UNIQUE(message_id,user_id,emoji)
- **company_settings** — Per-workspace company/branding/billing config — _cols:_ user_id(unique owner), company_*, currency*, invoice_prefix/counter, tax_*, email_signature, company_logo
- **ai_memories** — Business knowledge facts — _cols:_ id, workspace_id, memory_type, key, value, confidence, source(manual/document/staff_replies), document_id
- **knowledge_documents** — Uploaded KB docs — _cols:_ id, workspace_id, document_name, file_path/type, extracted_text, memory_count, processed(0/1/2)
- **workspace_ai_profile** — Workspace AI command center settings — _cols:_ workspace_id(PK), business_description, tone, language, signature, dos, donts, auto_analyze
- **platform_accounts** — Connected channel accounts — _cols:_ id, workspace_id, platform, account_name, account_handle, nickname, credentials JSON, webhook_verify_token, status, slot_index
- **lead_channels** — Extra channels per lead — _cols:_ id, lead_id, workspace_id, platform, identifier, platform_account_id, display_name; UNIQUE(lead_id,platform,identifier)
- **lead_relations** — Lead↔lead links — _cols:_ id, lead_id_a, lead_id_b, relation_type, merged_into; UNIQUE(lead_id_a,lead_id_b)
- **workspace_plan** — Plan tier per workspace — _cols:_ workspace_id(PK), plan, features JSON, limits JSON, trial_ends_at
- **workspace_integrations** — Calendly + Google Calendar tokens — _cols:_ workspace_id(PK), calendly_url, google_calendar_refresh_token/email/connected_at
- **meetings** — Scheduled meetings — _cols:_ id, workspace_id, lead_id, user_id, provider, title, starts_at/ends_at, meet_link, event_id, html_link, notes, status
- **outbound_message_queue** — Outbound retry queue (largely dead) — _cols:_ id, workspace_id, lead_id, platform, message_type, payload, status, retry_count/max_retries, next_retry_at
- **webhook_events** — Webhook dedup — _cols:_ id, platform, event_id; UNIQUE(platform,event_id)
- **whatsapp_groups** — Created WA groups mirror — _cols:_ id, workspace_id, group_id, platform_account_id, name, description, invite_link, created_by; UNIQUE(workspace_id,group_id)
- **client_portals** — Unified client portal tokens — _cols:_ lead_id(PK), workspace_id, token(unique)
- **ai_usage** — AI metering ledger (created by Command Center; written here) — _cols:_ id, workspace_id, user_id, feature, provider, model, prompt/completion_tokens, latency_ms, est_cost, success

### Rules, constraints & guarantees
- Every authenticated route is scoped by req.workspaceId; shared resources (tags, presets, company settings, invoices, email templates/SMTP/IMAP, auto-reply) are keyed to req.workspaceOwnerId (the workspace's super_admin user_id).
- Auth accepts JWT from Authorization: Bearer header OR ?token query (for SSE). Missing/invalid → 401.
- Role 'user' can only see/list leads assigned to them (view_all_leads=false).
- Lead create + bulk-upload enforce monthly 'leads' plan limit (402 on hard stop / mid-import skip with warning). Workspace invite enforces 'users' seat limit. Platform account create caps at 5 per platform and enforces 'whatsapp_accounts' plan limit for WhatsApp.
- Duplicate leads blocked on create by digit-normalised phone match (exact + last-10-digit suffix); bulk-upload silently skips duplicates and blank phones.
- Lead delete is soft (is_deleted/deleted_at → trash), restorable; permanent delete cascades children; trash auto-purged after 90 days (cron + manual endpoint).
- Status changes set closed_at (Closed-Won/Lost), actual_sale (won), lost_reason (lost), last_contacted_at (Contacted/Interested/Negotiating).
- Clients (is_client=1) are hidden from the default Leads list but retained in chat/analytics; toggle is reversible, never deletes.
- Workspace mutations gated: rename/invite/SMTP/IMAP require admin+; member role/permission changes and role-permission edits guard super_admin (only super_admin can assign/modify super_admin or edit role permissions); cannot remove the owner or yourself.
- SMTP/IMAP passwords are masked (••••••••) on read and preserved if the masked value is sent back.
- Module gate middleware returns 403 for /api/{media,studio-ai,video-ai,cs,booking,store,payments}/* only when the entitlements resolver reports the feature flag === false; public/tokenized routes are exempt.
- Suspended workspaces (workspaces.status='suspended') are locked out of all API access (403) unless a Command Center admin is impersonating.
- Read-only impersonation (token imp claim, mode='read') blocks all non-GET/HEAD/OPTIONS requests with 403.
- Lead merge soft-deletes duplicates (recoverable), reassigns all child rows via auto-discovered lead_id FK tables, backfills only blank primary fields, and preserves the routing phone so inbound WhatsApp is unaffected.
- WhatsApp group creation requires valid phone/JID per lead, caps at 256 participants, and reports ineligible leads.
- Calendly URL must match https://calendly.com/...; meetings only support Google provider and require a connected Google Calendar refresh token.
- SSE backend emits UNNAMED frames carrying {type,...} — consumers must use onmessage + switch on data.type.
- Reports/overview uses bound parameters for date filters (no req.query SQL interpolation).

### Automations (crons / jobs / triggers / auto-behaviors)
- Cron every minute: fire due reminders (is_completed=0, reminder_date within last 2 min window) → web-push + SSE 'reminder_due' + notification to the reminder's owner.
- Cron daily at midnight: delete leads in trash older than 90 days.
- IMAP email poller: runs on boot then every 2 minutes over all IMAP-enabled workspaces — matches inbound mail to lead by email, dedups same from/subject within 10 min, stores lead_emails received, logs contact_history, SSE 'email_received'. Manual poll-now endpoint also available.
- Knowledge document upload: background (setImmediate) text extraction (PDF/DOCX/TXT) + AI memory extraction, then updates processed flag (1 success / 2 error).
- New lead create: SSE 'lead_created' + web-push to creator + notification 'New lead'.
- Lead update/status/client/merge/bulk-trash: SSE 'lead_updated'/'lead_deleted' fan-out to workspace.
- Platform account create/delete auto-starts/stops the corresponding WhatsApp session.
- Inbound Instagram/Facebook webhooks and the public website form auto-create/route leads + messages and push SSE.
- Notification center notify() auto-fires SSE 'notification' to the whole workspace and persists a row, used by core + other modules via DI seam.
- Internal chat send fans out in real-time via Comms 2.0 (commsApi.afterMessage with @mentions) when mounted, else SSE to sender.
- Expired (HTTP 410) web-push subscriptions are auto-deleted when a push send fails.

### AI behaviors
- LLM calls go through callGemini (Groq llama-3.1-8b-instant) and the centralized ai-engine provider chain; all calls are metered into ai_usage (provider/model/tokens/latency/est_cost/success) via recordAiUsage with per-model USD rate table.
- Per-lead AI summary and 3 reply suggestions — advisory text the user chooses to send; nothing is sent automatically.
- Per-lead AI analyze persists lead_score, sentiment, urgency, intent_category and ai_last_analyzed_at on the lead (COALESCE keeps existing score if AI returns none).
- Lead scoring (lead_score) drives 'hot leads' filters (>=7) in /api/ai/command and show_hot_leads; scoring is AI-produced via analyze, plus manual edit via PUT /api/leads/:id.
- NBA / next-best-action surfaced through vertical-suggest (next_action, suggested_message, buying_stage) and the AI command center — all suggestions, control stays with the user.
- Generic text AI utilities: sentiment, rewrite (tone, falls back to workspace tone), translate, shorten — operate on supplied text only.
- Industry detection: keyword heuristic first, AI fallback when confidence <30 and enough messages; maps to INDUSTRY_WORKFLOWS presets.
- Business memory/knowledge: AI extracts structured facts from uploaded docs and from staff outgoing replies (learn-from-messages); memories feed back as context into summary/reply/analyze prompts (workspace AI profile + top-confidence memories).
- AI command center classifies natural-language commands into a fixed intent set and executes read-only DB queries + AI-written summaries; no destructive AI actions.
- auto_analyze flag on workspace_ai_profile signals opt-in automatic analysis; AI features degrade gracefully (try/catch) and never block the underlying CRM action on AI failure.

### Integrations
- WhatsApp via whatsapp-service (whatsapp-web.js/Puppeteer) — multi-account sessions, send text/voice/media, history sync, groups
- Web Push (web-push / VAPID) for browser notifications
- Google Sign-In (google-auth-library OAuth2Client) for auth
- Google Calendar / Google Meet (OAuth2 code exchange + refresh, Calendar v3 events with Hangouts Meet conferencing)
- Calendly (stored scheduling URL)
- SMTP outbound email (nodemailer) for lead emails + team invite emails
- IMAP inbound email (imap + mailparser) polling for lead email capture
- Instagram + Facebook Messenger inbound webhooks (Meta Graph webhooks, verify-token per platform account)
- Website lead-capture form (public tokenized endpoint, WappFlow widget + Formspree field formats)
- Flux content engine SSO (inline HS256 token to flux.remoteops.co)
- Groq API (OpenAI-compatible) + ai-engine provider chain for LLM features
- pdf-parse + mammoth for knowledge-document text extraction
- entitlements.js + pricing.js engines for plan resolution / usage / soft-limit enforcement
- Additive modules mounted on the same app/db: media-studio (ms_*), contracts studio (cs_*), booking, print store, payments, comms 2.0 — gated by the module-gate middleware

---

## 2. Messaging + Real-time Transport (WhatsApp multi-account, IG/FB/Website lead capture, SSE, Web Push, AI text seam)

The messaging core lives in backend/server.js + backend/whatsapp-service.js + backend/ai-engine.js. WhatsApp is the only channel with a real two-way send path, driven by whatsapp-web.js (Puppeteer/Chromium) with multi-account isolation (one Chromium profile per account, keyed session-acct-<id>), aggressive lock/zombie cleanup, auto-reconnect with backoff, a heartbeat health check, an init watchdog, and missed-message backfill. Inbound messages are de-duplicated, multi-tenant-attributed to the workspace that owns the receiving account, and upserted into leads/messages atomically. Instagram, Facebook Messenger and Website-form are inbound-only lead-capture webhooks (verify-token GET + POST), which create leads/messages but have NO outbound send wired. Real-time delivery to the browser is over a single SSE stream (/api/events) via broadcastToUser/broadcastToWorkspace; Web Push (VAPID) provides off-tab notifications. A central AI text engine (ai-engine.js, multi-provider failover chain) plus an inline callGemini(Groq) power summaries/reply-suggestions/analysis, all metered into an ai_usage ledger. Hard constraint honored throughout: the WhatsApp flow is deliberately fragile and must not be touched (no getNumberId in send path, no PTT voice flag, async ffmpeg, idempotent reconnect guards).

### Features
- **WhatsApp multi-account manager** — WhatsAppManager holds a Map of accountId→WhatsAppService instances. loadAccounts() reads platform_accounts WHERE platform='whatsapp' ORDER BY slot_index, and STAGGERS each session start by i*12000ms to avoid Chromium CPU/RAM thrash and 'browser already running' races. If zero DB accounts exist, falls back to a legacy single session (instance key '__legacy__', LocalAuth clientId undefined). addAccount/removeAccount/reconnect/disconnect/getStatus proxy to the right instance. getReadyService(accountId) returns the requested account if ready, else legacy, else first ready instance. Every send/group method has an accountId param (default null = pick any ready).
- **Per-account Chromium session isolation** — Each account gets sessionName=acct-<accountId> → LocalAuth profile dir session-acct-<id> under /data/.wwebjs_auth (prod) or ./.wwebjs_auth (dev). Rationale documented inline: slot_index is only workspace-unique, so two workspaces' slot-0 would collide on the legacy 'session' dir; account-id keying prevents that.
- **Lock/zombie-process cleanup (_cleanLocks)** — Single most important reliability primitive. Windows (legacy only): wmic to find chrome.exe with wwebjs_auth in commandline, taskkill /F /T each PID, busy-wait 1s. Linux: pgrep -af user-data-dir=<profile>, then re-read /proc/PID/cmdline and kill -9 ONLY processes whose --user-data-dir EXACTLY matches our profile (avoids killing sibling sessions since 'session' is a prefix of 'session-wf-1'), also kills tracked browserPid. Then unlinks SingletonLock/SingletonCookie/SingletonSocket/.lock/lockfile.
- **QR generation** — On 'qr' event: status→qr_ready, stops init watchdog, qrcode.toDataURL(qr) stored as data URL in this.qrCode, qrTimestamp set, captures browserPid (Linux). getStatus exposes qrCode + qrAgeSeconds. QR cleared on ready/disconnect.
- **Connection lifecycle events** — Handlers for qr, ready (sets isReady, phoneNumber=client.info.wid.user, resets backoff, starts heartbeat, schedules syncMissedMessages after 4s), authenticated (status='authenticated'), auth_failure (status='auth_failed'), disconnected (status='disconnected', skips auto-reconnect if userLoggedOut or reason matches LOGOUT|NAVIGATION, else _scheduleReconnect).
- **Auto-reconnect with backoff** — _scheduleReconnect caps at maxReconnectAttempts=3 with delays [10s,30s,90s]; after cap sets status='reconnect_failed' (manual reconnect required). reconnect() is idempotent: no-op if QR session healthy (<45s old) or init in progress (<20s) unless force. Tears down old client (removeAllListeners to suppress disconnected event, destroy, SIGKILL lingering Chrome PID on Linux), waits 3s, re-initializes.
- **Heartbeat health check** — _startHeartbeat every 60s calls client.getState() racing an 8s timeout; if state!=='CONNECTED' or throws, increments heartbeatFailCount; at 3 consecutive fails sets status='unhealthy', isReady=false and triggers reconnect.
- **Init watchdog** — _startInitWatchdog: if status stays 'initializing' >60s, sets status='error', tears down client so next /connect can start fresh (avoids 'stuck Connecting forever').
- **Inbound WhatsApp message handler** — on('message'): skips groups (@g.us) and status@broadcast; skips truly-empty non-media; in-memory processedMessages Set (capped 1000) dedupes by message id; resolves customer phone (handles @lid by preferring contact.id._serialized/contact.number, else '+'+from.split('@')[0]); name = pushname||name||phone. Resolves owner workspace via _resolveOwner (account's workspace, NOT 'oldest user'). Atomic upsertLead transaction: exact digit-strip match, else last-10-digit LIKE suffix match, else INSERT lead (platform_source='whatsapp', platform_account_id). Downloads + saves media to /uploads/{voices|images|videos|files} with type-aware extension/filename, sets media_type (voice/image/video/media). Dedupes by wa_message_id before insert. Broadcasts lead_created (if new) + new_message to owner via SSE. Fires _maybeAutoAnalyze and checkAutoReply.
- **Outbound text send** — sendMessage(phone,message): throws if !isReady; resolves chat id directly via _resolveChatId (digits+'@c.us', or passes through @lid/@c.us/@s.whatsapp.net/@g.us) — deliberately NEVER calls getNumberId() (it queries WA servers and intermittently hangs, wedging the request).
- **Outbound media send** — sendMedia(phone,filePath,mimetype,filename,caption): base64-reads file into MessageMedia, sends with optional {caption}.
- **Outbound voice note send** — sendVoiceNote: ASYNC ffmpeg (execFile, 25s timeout) transcodes non-ogg input → ogg/opus (libopus 32k 48000 mono); never execSync (would block event loop). Builds MessageMedia with mime by ext. Deliberately does NOT pass sendAudioAsVoice:true (PTT path wedges the WA Web page and breaks all subsequent sends); sends as plain audio attachment.
- **saveOutgoingMessage** — Inserts a from_me=1 message row (platform='whatsapp', platform_account_id) so manually/AI-sent messages appear in chat history. Manager-level fallback inserts even with no ready service.
- **fetchHistory / per-lead sync** — fetchHistory(phone,limit=200): resolves chatId (getNumberId allowed here, not in hot send path), getChatById, fetchMessages, maps to {wa_id,body,from_me,ts,media_type}. Route /api/leads/:leadId/messages/sync imports them (5-min per-lead cooldown via syncCooldowns map, dedupe by wa_message_id, recomputes total_messages).
- **Missed-message backfill** — syncMissedMessages(): finds last imported message timestamp for the owning workspace (default 24h ago), iterates getChats() (skips groups, skips chats with no activity since), filters inbound newer than cutoff, finds-or-creates lead, inserts deduped messages with proper media_type, broadcasts lead_created + missed_sync_complete. Runs automatically 4s after ready and on every reconnect; manager.syncMissedMessages runs across all ready instances.
- **WhatsApp group create/edit** — createGroup(name,phones,description): _resolveParticipants maps E.164/@lid to participant IDs via getNumberId, returns skipped list; client.createGroup; sets description; fetches invite code → https://chat.whatsapp.com/<code>. setGroupSubject/setGroupDescription/setGroupPicture editing. Persisted to whatsapp_groups table (UNIQUE workspace+group). Routes enforce ≤256 participants and phone validity.
- **Auto-reply rules engine** — checkAutoReply(userId,lead,body): loads active auto_reply_rules for the user, parses keywords JSON, matches by match_type ('exact' equality else 'contains' includes); on match, after 1500ms delay sends rule.reply_message, saves outgoing, bumps total_messages; breaks after first match.
- **Auto-analyze new lead** — _maybeAutoAnalyze: 5s after lead creation, if workspace_ai_profile.auto_analyze is on, lazy-requires ai-engine, runs analyzeLeadIntelligence over up to 30 messages with memory+profile context, persists lead_score/sentiment/urgency/intent_category/ai_last_analyzed_at, broadcasts lead_updated. Silent on any failure.
- **Instagram lead capture** — GET verify (hub.mode=subscribe + matching webhook_verify_token returns hub.challenge, else 403). POST: requires body.object==='instagram', resolves account by entry.id (account_handle) else oldest IG account, skips echo messages, finds-or-creates lead (customer_phone=senderId, platform_source='instagram'), inserts inbound message (INSERT OR IGNORE), bumps counts, writes raw SSE 'new_lead' frame to workspace clients, fires notify(). No outbound send.
- **Facebook Messenger lead capture** — Symmetric to Instagram but body.object==='page', platform='facebook'. GET verify + POST inbound-only, finds-or-creates lead, inserts message, SSE 'new_lead', notify(). No outbound send.
- **Website form capture** — Public POST /api/website-form/:formToken/submit (CORS *, OPTIONS preflight). Resolves account by webhook_verify_token, normalizes name/phone/email/message across WappFlow widget + Formspree field names, creates lead (platform_source='website'), inserts message, broadcasts raw SSE 'new_lead'.
- **SSE event stream** — GET /api/events (auth): text/event-stream, sends {type:'connected'}, registers res in sseClients Map(userId→res[]), 25s heartbeat comment frames, cleans up on req close. Emits UNNAMED data frames (consume via es.onmessage + switch on data.type).
- **Web Push** — webpush.setVapidDetails on boot. sendPushToUser(userId,title,body,data): loads all push_subscriptions for user, sends JSON payload (title/body/data/icon/badge), deletes subscription on 410 Gone. Routes: vapid-key (public), subscribe (dedupe by endpoint), unsubscribe, test.
- **Unified notification center** — notify(workspaceId,{type,title,body,url,icon,userId}) inserts a notifications row and broadcasts SSE 'notification'. Feed routes list (last 60, workspace + user_id null/self), read-all, per-id read. Best-effort, never blocks the triggering action.
- **Internal team chat fan-out (comms seam)** — chat_messages send routes call commsApi.afterMessage(message, mentions) for Comms 2.0 real-time fan-out + @mentions; falls back to broadcastToUser if comms not mounted. (This is the team-chat fan-out, distinct from the WhatsApp customer flow.)
- **AI text engine seam** — ai-engine.callLLM provider abstraction with ordered failover chain (default cerebras,groq,openrouter; AI_PROVIDERS env), per-provider 60s rate-limit cooldown, 12000-char prompt cap with middle-trim, 2-pass retry with exponential backoff. Providers: Cerebras/Groq/OpenAI/OpenRouter (OpenAI-compatible) + Anthropic (messages API). High-level capabilities: analyzeLeadIntelligence, detectSentiment, summarizeConversation, suggestReplies, rewriteMessage, translateMessage, shortenMessage. Inline callGemini in server.js is actually Groq (llama-3.1-8b-instant) used by older AI routes.
- **AI usage metering** — recordAiUsage inserts into ai_usage (provider/model/tokens/latency/est_cost/success). AI_RATES map prices known models (Groq/Cerebras llama, gpt-4o-mini, claude-haiku, free 70b). aiEngine.setMeter(recordAiUsage) routes the failover path's usage to the same ledger; inline callGemini meters directly (success row on ok, failure row on throw).

### API endpoints (52)
- `GET /api/events` — SSE stream; registers user connection, emits connected + unnamed data frames + heartbeats
- `GET /api/leads/:leadId/messages` — List a lead's messages, optional ?platform filter, plus per-platform counts
- `POST /api/leads/:leadId/messages` — Send a text message (only whatsapp actually delivers; others persist as draft) + persist + contact history
- `POST /api/leads/:leadId/messages/voice` — Upload+send a voice note via WhatsApp (multer 'audio'), 502 on WA send failure but file saved
- `POST /api/leads/:leadId/messages/media` — Upload+send media via WhatsApp (multer 'file', caption); persists with media_type
- `POST /api/leads/:leadId/messages/sync` — Import WhatsApp history for one lead (5-min cooldown, dedupe by wa_message_id)
- `GET /api/whatsapp/status` — Legacy/first-account WhatsApp connection status
- `GET /api/whatsapp/accounts/:id/status` — Per-account status (workspace-scoped)
- `POST /api/whatsapp/accounts/:id/connect` — Reconnect a specific WhatsApp account
- `POST /api/whatsapp/accounts/:id/disconnect` — Disconnect a specific WhatsApp account
- `POST /api/whatsapp/disconnect` — Disconnect legacy WhatsApp session (NO auth middleware)
- `POST /api/whatsapp/reconnect` — Reconnect legacy session (responds immediately, reconnect runs async)
- `POST /api/whatsapp/sync-missed` — Manually trigger missed-message sync across ready accounts
- `POST /api/whatsapp/send` — Send a raw text to an arbitrary phone (auth, no lead context)
- `GET /api/whatsapp/ready-accounts` — List connected/usable WA accounts in the workspace (for group source picker)
- `POST /api/whatsapp/groups` — Create a WhatsApp group from lead_ids (≤256, validates numbers), persists to whatsapp_groups
- `PATCH /api/whatsapp/groups/:groupId` — Update group name/description/icon (multipart 'icon'), mirrors locally
- `GET /api/push/vapid-key` — Return public VAPID key
- `POST /api/push/subscribe` — Save a web-push subscription (dedupe by endpoint)
- `DELETE /api/push/unsubscribe` — Remove a web-push subscription for user+endpoint
- `POST /api/push/test` — Send a test push to the current user
- `GET /api/notifications` — Recent notification feed (last 60) + unread count
- `POST /api/notifications/read-all` — Mark all visible notifications read
- `POST /api/notifications/:id/read` — Mark one notification read
- `GET /api/platform-accounts` — List platform accounts (optional ?platform), parses credentials JSON
- `POST /api/platform-accounts` — Create account slot (max 5/platform, whatsapp metered by plan), generates webhook_verify_token, auto-starts WA session
- `PUT /api/platform-accounts/:id` — Update account_name/account_handle/credentials/status
- `DELETE /api/platform-accounts/:id` — Delete account + stop WA session if whatsapp
- `GET /api/webhooks/instagram` — Meta webhook verification (hub.challenge if verify_token matches an IG account)
- `POST /api/webhooks/instagram` — Inbound IG DM → lead + message + SSE new_lead + notify (no outbound)
- `GET /api/webhooks/facebook` — Meta webhook verification for Facebook page
- `POST /api/webhooks/facebook` — Inbound FB Messenger → lead + message + SSE new_lead + notify (no outbound)
- `POST /api/website-form/:formToken/submit` — Public website-form lead capture (CORS *), creates lead + message + SSE new_lead
- `OPTIONS /api/website-form/:formToken/submit` — CORS preflight for the public form endpoint
- `GET /api/leads/:leadId/channels` — List extra communication channels linked to a lead
- `POST /api/leads/:leadId/channels` — Link an extra platform channel to a lead (409 on duplicate)
- `DELETE /api/leads/:leadId/channels/:channelId` — Unlink a channel
- `POST /api/chat/channels/:channelId/messages` — Internal team chat send → commsApi.afterMessage fan-out + mentions
- `POST /api/chat/channels/:channelId/messages/media` — Internal team chat media send → comms fan-out
- `DELETE /api/chat/messages/:id` — Delete own team-chat message, broadcast chat_delete
- `POST /api/chat/messages/:id/react` — Toggle emoji reaction, broadcast chat_reaction
- `POST /api/leads/:id/ai/summary` — AI conversation summary (callGemini/Groq)
- `POST /api/leads/:id/ai/reply-suggestions` — 3 ready-to-send WhatsApp reply drafts (callGemini/Groq)
- `POST /api/leads/:id/ai/analyze` — Combined lead intelligence (score/sentiment/urgency/intent) via ai-engine, persists to lead
- `POST /api/ai/sentiment` — Quick single-message sentiment classification
- `POST /api/ai/rewrite` — Rewrite text in a tone (defaults to workspace profile tone)
- `POST /api/ai/translate` — Translate text to target language
- `POST /api/ai/shorten` — Shorten text keeping meaning
- `GET /api/ai/status` — Active AI provider for diagnostics
- `POST /api/ai/command` — NL command interpreter (Groq classify → query leads/stats/reminders/summaries; sends NO WhatsApp)
- `POST /api/leads/:id/vertical-action` — Send an industry-vertical action message via WhatsApp + save outgoing
- `POST /api/leads/:id/vertical-suggest` — AI next-action + suggested WhatsApp message by industry

### Data model
- **platform_accounts** — Connected channel slots (whatsapp/instagram/facebook/website) per workspace — _cols:_ id, workspace_id, platform, account_name, account_handle, credentials(JSON), webhook_verify_token, status, slot_index, nickname, created_at
- **messages** — All inbound/outbound messages across platforms — _cols:_ id, lead_id, user_id, body, from_me, media_url, media_type, timestamp, wa_message_id, platform(default whatsapp), platform_account_id
- **leads** — Customer/lead records (created by inbound messages); messaging adds platform_source + platform_account_id — _cols:_ id, workspace_id, user_id, customer_name, customer_phone, status, first_message, total_messages, last_message_at, platform_source, platform_account_id, lead_score, sentiment, urgency, intent_category, ai_last_analyzed_at, is_deleted
- **push_subscriptions** — Web Push endpoints per user — _cols:_ id, user_id, endpoint(UNIQUE), p256dh, auth, created_at
- **notifications** — Unified cross-module notification feed — _cols:_ id, workspace_id, user_id(nullable=workspace-wide), type, title, body, url, icon, is_read, created_at (idx on workspace_id,created_at)
- **auto_reply_rules** — Keyword-triggered WhatsApp auto-replies — _cols:_ id, user_id, name, keywords(JSON), reply_message, is_active, match_type(contains|exact)
- **whatsapp_groups** — Created WhatsApp groups mirror (lazily CREATE IF NOT EXISTS on first group create) — _cols:_ id, workspace_id, group_id, platform_account_id, name, description, invite_link, created_by, UNIQUE(workspace_id,group_id)
- **lead_channels** — Extra communication channels linked to a lead — _cols:_ id, lead_id, workspace_id, platform, identifier, platform_account_id, display_name, UNIQUE(lead_id,platform,identifier)
- **webhook_events** — Webhook idempotency ledger (declared) keyed by platform+event_id — _cols:_ id, platform, event_id, received_at, UNIQUE(platform,event_id) — NOTE: table exists but the IG/FB handlers do not currently insert/check it
- **outbound_message_queue** — Declared retry queue for outbound messages (schema present) — _cols:_ id, workspace_id, lead_id, platform, platform_account_id, message_type, payload, status, retry_count, max_retries, next_retry_at, sent_at — NOTE: defined but unused dead table
- **ai_usage** — AI metering ledger (created by Command Center on boot; written by recordAiUsage) — _cols:_ id, workspace_id, user_id, feature, provider, model, prompt_tokens, completion_tokens, latency_ms, est_cost, success
- **workspace_ai_profile** — Workspace AI config incl auto_analyze toggle, tone, language, dos/donts, signature, business_description — _cols:_ workspace_id(PK), business_description, tone, language, signature, dos, donts, auto_analyze
- **sseClients (in-memory Map)** — Runtime registry userId→[res] for SSE delivery; onlineUsers() = keys (presence source for Comms) — _cols:_ not persisted
- **processedMessages / syncCooldowns / _cooldownUntil (in-memory)** — Inbound dedupe Set (cap 1000), per-lead 5-min sync cooldown map, per-AI-provider rate-limit cooldown map — _cols:_ not persisted

### Rules, constraints & guarantees
- WhatsApp send path NEVER calls getNumberId() — _resolveChatId constructs <digits>@c.us directly because getNumberId queries WA servers and intermittently hangs, wedging the request (and breaking all sends).
- Voice notes are sent as plain audio attachments — sendAudioAsVoice:true (PTT) is deliberately avoided because it wedges the WA Web page and breaks every subsequent send on the account.
- Voice transcode uses async execFile (ffmpeg), never execSync, to avoid blocking the Node event loop in a request path.
- Multi-tenant correctness: inbound WhatsApp lead is attributed to the workspace owning the receiving account via _resolveOwner (account.workspace_id → oldest user of that workspace), NOT the global oldest user; legacy session falls back to first user.
- Inbound lead upsert is an atomic better-sqlite3 transaction to prevent duplicate leads when two messages from the same phone race.
- Inbound dedupe: in-memory processedMessages Set (cap 1000) by message id, plus DB dedupe by wa_message_id before insert.
- Phone matching tolerates formatting: exact digit-strip match, then last-10-digit LIKE suffix match (handles +92 vs 0 country-code swaps).
- Group chats (@g.us) and status@broadcast are ignored on inbound; empty non-media messages skipped.
- reconnect() is idempotent — no-op if a healthy QR session (<45s old) or an in-progress init (<20s) exists, unless force; prevents tearing down a working Chrome and trapping init forever.
- Auto-reconnect caps at 3 attempts (10s/30s/90s backoff); intentional disconnects (userLoggedOut or LOGOUT/NAVIGATION reason) skip auto-reconnect.
- Heartbeat triggers reconnect after 3 consecutive failed getState() checks; init watchdog forces status='error' after 60s stuck initializing.
- Sessions keyed by globally-unique account id (session-acct-<id>) to prevent cross-workspace slot-0 Chromium collisions.
- Per-lead history sync is rate-limited to once per 5 minutes (syncCooldowns) to avoid flooding Puppeteer.
- platform_accounts: max 5 per platform (hard 400); WhatsApp accounts additionally metered per plan (Creator 1 / Studio 2 / Studio+ 5) via pricing.canCreate → 402 on limit.
- Only WhatsApp has a real outbound send; Instagram/Facebook/Website are inbound-only — text to those platforms persists locally as a draft (delivered:false).
- Webhook verification requires hub.mode='subscribe' AND a webhook_verify_token matching a platform_accounts row, else 403; webhook_verify_token is a 24-char generated token per account.
- Web Push subscriptions auto-pruned on HTTP 410 (Gone).
- SSE frames are UNNAMED (data: {type,...}); clients must use onmessage + switch, not named addEventListener.
- notify()/notifications are best-effort and never block the triggering action.
- AI prompts are hard-capped at 12000 chars (middle-trimmed); per-provider 60s cooldown on rate-limit; failover across the configured provider chain.
- /api/whatsapp/disconnect has NO auth middleware (notable gap); webhook POST handlers do not verify Meta X-Hub-Signature (per known findings).

### Automations (crons / jobs / triggers / auto-behaviors)
- Staggered WhatsApp account startup on boot — each account's Chromium launches i*12000ms apart to avoid resource thrash and browser-already-running races.
- Auto-reconnect on unexpected disconnect with exponential backoff [10s,30s,90s], capped at 3 attempts.
- 60s heartbeat polling client.getState(); 3 fails → reconnect.
- 60s init watchdog → forces error state + teardown if stuck initializing.
- Auto missed-message sync 4s after every successful ready, and on every reconnect (imports missed leads + messages).
- Keyword auto-reply: matching inbound triggers a WhatsApp reply after 1500ms delay.
- Auto-analyze: 5s after a new inbound lead, if workspace auto_analyze is on, runs AI intelligence and pushes lead_updated.
- Auto-start WhatsApp session when a whatsapp platform_account slot is created; auto-stop session when deleted.
- SSE 25s heartbeat comment frames keep connections alive.
- Real-time SSE broadcasts on inbound (lead_created/new_lead/new_message), lead CRUD (lead_created/updated/deleted), missed_sync_complete, notifications, team-chat (chat_message/delete/reaction), reminders, email_received.
- Web Push fired off-channel via sendPushToUser; expired subs pruned automatically.
- AI usage auto-recorded to ai_usage ledger on every callLLM/callGemini (success and failure rows).

### AI behaviors
- Central AI text engine (ai-engine.js) with multi-provider failover chain: Cerebras → Groq → OpenRouter (configurable via AI_PROVIDERS), plus optional OpenAI and Anthropic; per-provider rate-limit cooldown + 2-pass exponential-backoff retry.
- Inline callGemini in server.js is actually Groq llama-3.1-8b-instant (legacy name) powering AI summary, reply-suggestions, command interpreter, industry detection, vertical-suggest.
- Lead intelligence: analyzeLeadIntelligence returns score(1-10)/sentiment/urgency/intent_category/temperature/next_action/key_entities; persisted onto the lead and surfaced via SSE.
- Reply suggestions: exactly 3 ready-to-send WhatsApp drafts biased by business context, presets, memories and detected intent — advisory drafts only, a human sends them (no auto-send from suggestions).
- Conversation tools: rewrite (tone), translate, shorten, single-message sentiment — pure text transforms returned to the UI, control-first.
- Auto-analyze is opt-in per workspace (auto_analyze flag, default off) and only annotates the lead; it never sends a message.
- AI command interpreter classifies NL into read-only actions (show/find/summarize leads, stats, reminders) — it queries data and answers, it does NOT send WhatsApp messages.
- Keyword auto-reply is rule-based (non-AI) and is the only path that auto-sends WhatsApp on inbound; AI suggestions and analysis are advisory.
- All AI calls metered (provider/model/tokens/latency/est_cost/success) into ai_usage for the AI Control Center; cost estimated from an AI_RATES table per model.
- Prompts capped at 12000 chars with middle-trim to fit smallest free-tier windows; JSON extracted leniently from messy LLM output with safe fallbacks.

### Integrations
- WhatsApp via whatsapp-web.js (unofficial, Puppeteer/headless Chromium, LocalAuth session persistence; QR pairing; ffmpeg for voice transcode)
- Meta Instagram Messaging webhooks (verify-token GET + inbound POST, hub.challenge)
- Meta Facebook Messenger / Page webhooks (verify-token GET + inbound POST)
- Website form capture (public tokenized POST endpoint, CORS-open, WappFlow widget + Formspree field compatibility)
- Web Push (W3C Push API via web-push library, VAPID keys)
- Server-Sent Events (native, single /api/events stream) for real-time browser delivery
- AI/LLM providers: Cerebras, Groq, OpenRouter, OpenAI, Anthropic (HTTP chat-completions / messages APIs with failover)
- Comms 2.0 module seam (commsApi.afterMessage) for internal team-chat real-time fan-out + LiveKit token minting (mounted separately)
- Nodemailer SMTP seam (per-workspace) reused by other modules — not the customer messaging path
- multer for inbound media/voice/file uploads served from /uploads

---

## 3. Media Studio core (ingest → library → cull)

Additive, self-contained module mounted from server.js with one line; owns the `ms_*` namespace and touches no existing CRM table or route (links to CRM only via `leads.id` on a project's `lead_id`). It is the photographer-facing pipeline for Projects → Folders → Ingest (multipart local-disk OR direct-to-R2 signed upload) → Library (search/filter/paginate) → Culling (human keep/maybe/reject + 1–5 stars + color + flag) → non-destructive Edits → Trash (30-day restore). Control-first by construction: the AI/CV lane can write ONLY the advisory `ms_asset_scores` ledger; only an authenticated human can write `ms_cull_decisions`, and there is no code path for AI to cull, publish, edit, or deliver. Storage is provider-agnostic behind a single STORAGE SEAM (local disk today, Cloudflare R2 when STORAGE_PROVIDER=r2) with a single publicUrl() URL builder; all heavy work (variants/EXIF/CV scoring/edit renders/video/exports) is offloaded to an async ms_jobs queue drained by media-worker.js, which degrades gracefully (and never crashes the host) when optional libs (jimp/exifr/adm-zip/pdfkit/ffmpeg) are absent.

### Features
- **Projects (shoots)** — Create/list/get/update/archive shoots. Fields: title (required), project_type (wedding|event|real_estate|commercial|portrait|product|general, default general), shoot_date, location, status (planning|shooting|culling|delivery|delivered|archived), cover_asset_id, settings JSON (holds watermark config), lead_id (optional CRM link, validated to belong to the workspace). List joins leads for client_name, computes asset_count (excludes trashed) and derives a cover_url thumbnail from the earliest photo (by capture_time then created_at). Get returns folders + asset_count + storage_bytes. Delete is non-destructive: sets status='archived' (manager+ only). Creating/uploading mirrors an event onto the CRM lead timeline (activity_timeline + addContactHistory).
- **Folders** — Per-project folders with parent_id (nesting), name, sort_order. List + create routes. Ordered by sort_order then name. Used as the destination for uploads (folder_id) and auto-folder clustering.
- **Multipart ingest (local disk)** — POST .../assets accepts up to 200 files in field 'files' via multer.diskStorage into uploads/media with sanitized NFKD filenames (timestamp+random prefix), 200MB/file cap. Storage quota gate runs BEFORE insert; on block it unlinks the temp files and returns 413. When STORAGE_PROVIDER=r2 each original is pushed to R2 (with local fallback on failure) then the temp freed. Inserts ms_assets rows (type auto-detected) in a transaction, enqueues an 'ingest' ms_job per asset (make: variants/exif/score), marks any AI reel drafts ai_stale, fires a storage-warning check, emits a lead-timeline event, audits, broadcasts ms_assets_added.
- **Signed-URL direct-to-R2 ingest** — Two-step: POST .../uploads/sign runs the storage gate (413 with used/limit/pct on block), builds a deterministic key media/projects/<pid>/<ts>-<rand>-<file>, returns { provider, key, upload_url (null on local), expires_in:900 }. Client PUTs bytes straight to the bucket. POST .../uploads/complete verifies storage.fileExists(key) (409 if not yet present), inserts the asset with storage_provider/storage_size/uploaded_at, enqueues 'ingest', fires storage warn. Server is never the byte bottleneck. A separate forward-compatible .../assets/sign returns the current multipart contract ({mode:'multipart', upload_url, field:'files', max_files:200}).
- **Asset model + shapeAsset** — ms_assets is the canonical media row. shapeAsset(a) parses variants JSON and augments with url (variants.original || publicUrl(storage_key)), thumb_url (variants.thumb || web || publicUrl), and watermarked boolean. Used everywhere assets are returned to the client.
- **Library listing (search/filter/paginate)** — GET .../assets: excludes trashed (deleted_at IS NULL), filters by folder_id, type, and cull decision (decision='undecided' → no decision; or keep/maybe/reject). Pagination via limit (default 100, cap 10000 for full-shoot culling) + offset; returns total count. Each row LEFT JOINs the human cull decision (decision/rating/color/flagged) and subselects advisory scores (sharpness, quality, exposure, high_clip, shadow_clip, dup_group). Ordered by capture_time (nulls last) then created_at.
- **Single asset detail** — GET /api/media/assets/:id returns shapeAsset + all advisory scores (score_type/value/group_key/model_version/source) + the human cull decision (or null).
- **Culling (human decision layer)** — PUT /api/media/assets/:id/cull upserts a per-asset decision (keep|reject|maybe|null), rating 0–5 (validated), color_label, flagged. Bulk keep/reject across a selection via POST .../cull/bulk (asset_ids[] + decision, transactional, validates each asset belongs to project). Summary endpoint .../cull/summary returns counts {total,keep,reject,maybe,undecided}. Every human signal is logged to ms_feedback (Learning System) for future AI. ms_cull_decisions.asset_id is UNIQUE; user_id always a real human; the AI lane has NO write path here.
- **Auto-folders by capture time** — POST .../auto-folders clusters photos into folders by capture-time gaps. gap_minutes (min 10, default 90). Robustly parses EXIF-style 'YYYY:MM:DD HH:MM:SS' and ISO timestamps; orders photos by capture_time then created_at, splits a new cluster whenever the gap exceeds the threshold. Creates one folder per cluster labeled with the first capture time + count (e.g. 'Jun 14, 3:20 PM · 42'), assigns assets, all transactional. Returns 0 folders with a friendly message when there is <2 clusters or no capture times.
- **Non-destructive edit pipeline** — Edits stored as JSON on ms_assets.edits; never mutate the original. PUT /api/media/assets/:id/edits (photos only) validates via sanitizeEdits and stamps a rev (increments), enqueues a 'render_edits' job (202 rendering). Batch: POST .../edits/batch applies one edit param-set across ≤500 photos. Reset: DELETE .../edits clears edits and re-renders plain variants. The worker's processRenderEdits re-renders thumb/web/full from the untouched original applying rotate→crop→tone→film-finish, writes rev-suffixed variant files (cache-bust), cleans stale revisions (local + R2), and broadcasts ms_asset_processed. Delivery (galleries/ZIP/PDF) automatically picks up variants.full_edit.
- **sanitizeEdits validator** — Shared validator for single/batch/auto-edit. Tone params exposure/contrast/temperature/tint/saturation clamped to -1..1 (rounded 2dp, 0s dropped); film params fade/vignette/grain clamped 0..1; bw→1; rotate -360..360 (1dp); crop relative {x,y,w,h} with x/y in 0..0.95, w/h in 0.05..1, x+w/y+h ≤1.001, and a near-full crop (whole frame) is dropped. Returns {edits} or {error}.
- **AI auto-edit to learned house style** — POST .../auto-edit grades each photo toward the workspace's learned style_profile (style_profiles, scope=workspace) via styleApply.styleAdjust using the asset's 'aesthetic' score reasons (exposure/contrast/colourfulness). Scope: explicit asset_ids (≤2000), keepers:true (only kept photos), or all photos. Skips assets already on-style or with no grade. Maps the grade to the edit pipeline (brightness/contrast/saturation) and queues real non-destructive render jobs. 400 if no house style learned yet. This is the 'AI' in editing but still produces ordinary reviewable edits via the same human pipeline.
- **Worker variant generation** — On ingest the worker (jimp) writes thumb (400px wide, q72) + web (min(2048,width), q82) JPEG variants to media/variants (or R2), sets variants.original/web/thumb, records width/height. RAW originals (cr2/cr3/nef/arw/raf/rw2/dng/orf/srw/pef) get an embedded-preview extraction (exiftool→dcraw→exifr thumbnail) and a raw_preview flag; video/audio/undecodable pass through with status ready and (for video/audio) enqueue video_probe.
- **EXIF extraction** — Worker readExif (exifr, best-effort): pulls DateTimeOriginal/CreateDate → capture_time (ISO), and camera_meta {make, model, lens, iso, f, exposure, focal}. Works on a Buffer so R2 originals need no local file. capture_time is COALESCEd (never overwrites an existing value).
- **Perceptual-hash dedup** — Worker computes an 8x8 grayscale average-hash (phash, 16 hex chars) per image. Near-duplicates within the SAME project are grouped when Hamming distance ≤6 bits: a shared duplicate_group group_key is created/reused and written as advisory 'duplicate_group' scores on both assets. Surfaced as dup_group in the library and counted in the Copilot context.
- **CV technical scoring** — Worker analyze() computes sharpness (raw Laplacian variance), blur (normalized inverse focus 0..1), exposure (0..1 mean luminance), shadow_clip/high_clip/clipping fractions, and a composite 'quality' keepability hint (focus*0.55 + tonal*0.30 + (1-clipping)*0.15). Written as advisory ms_asset_scores (source='ai', model_version from the technical analyzer registry), idempotently replacing prior AI scores for the asset. Optional server face/smile detector (./face-detect, absent by default) and a CPU vision fallback (./vision-cpu → composition/aesthetic/scene_class) feed the vision analyzer when available.
- **Trash + 30-day restore** — DELETE /api/media/assets/:id soft-deletes (sets deleted_at; manager+ only) → Trash. GET /api/media/trash lists workspace-wide trashed assets newest-first (≤1000) with project title and deleted_at. POST .../restore clears deleted_at. DELETE .../permanent hard-purges (manager+). purgeExpiredTrash sweeps anything older than 30 days (runs on boot and on every trash listing). purgeAsset removes the asset row + its scores + cull decisions + portfolio items and deletes the original + thumb/web variant files from local and/or R2.
- **Watermarking (non-destructive)** — POST .../watermark/logo uploads a logo file and returns its URL. POST .../watermark/apply persists a watermark config onto project.settings and background-processes ≤2000 photo assets with jimp: text or logo mark, configurable size (% of width), opacity (0.05–1), color (white/black font), position (corners/center/tiled). Source bytes from R2 or local; output downscaled to ≤2400px, q82, written as a separate variants.watermarked variant (originals untouched); broadcasts ms_watermark_done. POST .../watermark/remove deletes the watermarked variant (local + R2) and the variants key. The worker also has its own burned-in tiled watermarkBuffer used during ZIP export for the 'web' variant.
- **Workspace storage usage endpoint** — GET /api/media/storage returns the storageEnforce status (used/limit/pct/level/unlimited) plus by_type breakdown (files+bytes per asset type, trashed excluded), largest_projects (top 8 by bytes), and exports_bytes. Same numbers the Command Center founder dashboard sees, scoped to the caller's workspace.
- **Media Intelligence ingestion + composites** — POST /api/media/assets/:id/scores (single) and POST .../projects/:id/scores (batch) let an external desktop ONNX runtime / cloud worker push scores through intel.recordScores into the same ms_asset_scores ledger; computeComposites is recalculated; broadcasts ms_scored. POST .../analyze recomputes composites server-side from existing primitives. GET .../intelligence returns a per-asset score map + which client-tier analyzers are still pending per asset + the analyzer registry (for the cull UI's 'filter by AI score').
- **Workspace Brain** — GET/PUT /api/media/brain read/write the studio's learned preferences (workspace_brain via intel.brainGet/brainSet with confidence). POST .../brain/derive infers preferences from accumulated feedback.
- **Worker observability** — GET /api/media/jobs reports per-status and per-type job counts, last-hour throughput, oldest pending timestamp, and the 20 most recent failures. POST .../jobs/retry-failed requeues all failed jobs for the workspace (resets status/retry_count/error/next_retry_at).
- **Studio Copilot (advisory)** — POST /api/media/copilot answers questions from REAL grounded DB context (cull breakdown, sharp/avg-quality stats, duplicate groups, best/worst by AI quality, galleries/proofing/comments, edited count) and may return up to 3 SUGGESTED actions (navigate / create_gallery_from_keepers / preset_keepers from an allow-listed preset list) that the UI renders as buttons. The copilot itself changes nothing. 503 if no AI provider configured.
- **Album-from-favorites helper** — POST /api/media/galleries/:id/album-from-favorites creates a new gallery seeded from a gallery's distinct client-favorited assets (in favorite order); 400 if no favourites yet.

### API endpoints (41)
- `GET /api/media/overview` — Mount health + workspace counts (projects, assets, storage_bytes)
- `GET /api/media/projects` — List projects (filter lead_id/status) with client_name, asset_count, derived cover_url
- `POST /api/media/projects` — Create a shoot (validates lead_id in workspace)
- `GET /api/media/projects/:id` — Get a project + folders + asset_count + storage_bytes
- `PUT /api/media/projects/:id` — Update allowed project fields + settings JSON
- `DELETE /api/media/projects/:id` — Archive a project (non-destructive; manager+)
- `GET /api/media/projects/:id/folders` — List a project's folders
- `POST /api/media/projects/:id/folders` — Create a folder (name, parent_id, sort_order)
- `POST /api/media/projects/:id/assets/sign` — Forward-compatible upload-target contract (multipart today)
- `POST /api/media/projects/:id/uploads/sign` — Storage-gated signed direct-to-R2 PUT URL + key
- `POST /api/media/projects/:id/uploads/complete` — Register a direct-uploaded asset + enqueue ingest
- `GET /api/media/storage` — Workspace storage usage (status + by_type + largest projects + exports bytes)
- `POST /api/media/projects/:id/assets` — Multipart upload (≤200 files), storage-gated, enqueues ingest
- `POST /api/media/projects/:id/watermark/logo` — Upload a watermark logo, return its URL
- `POST /api/media/projects/:id/watermark/apply` — Persist watermark config + background-apply to ≤2000 photos
- `POST /api/media/projects/:id/watermark/remove` — Remove watermarked variant from selected assets
- `POST /api/media/projects/:id/auto-folders` — Cluster photos into folders by capture-time gaps
- `POST /api/media/galleries/:id/album-from-favorites` — New gallery from a gallery's client favourites
- `POST /api/media/assets/:id/scores` — External (desktop/cloud) per-asset advisory score ingestion
- `POST /api/media/projects/:id/scores` — Batch advisory score ingestion for a whole shoot
- `POST /api/media/projects/:id/analyze` — Recompute composite scores server-side
- `GET /api/media/projects/:id/intelligence` — Per-asset score map + pending analyzers + registry (cull UI)
- `GET /api/media/brain` — Read workspace learned preferences
- `PUT /api/media/brain` — Set a workspace brain key/value/confidence
- `POST /api/media/brain/derive` — Infer brain preferences from feedback
- `GET /api/media/jobs` — Job queue health (counts/throughput/failures)
- `POST /api/media/jobs/retry-failed` — Requeue all failed jobs for the workspace
- `GET /api/media/projects/:id/assets` — Library listing with folder/type/decision filters + pagination + scores
- `GET /api/media/assets/:id` — Single asset detail (asset + scores + cull decision)
- `DELETE /api/media/assets/:id` — Soft-delete to Trash (manager+)
- `GET /api/media/trash` — List trashed assets (workspace-wide) with days remaining
- `POST /api/media/assets/:id/restore` — Restore an asset from Trash
- `DELETE /api/media/assets/:id/permanent` — Hard-delete an asset + files + scores + decisions (manager+)
- `PUT /api/media/assets/:id/cull` — Upsert human cull decision (decision/rating/color/flag)
- `POST /api/media/projects/:id/cull/bulk` — Bulk keep/reject across a selection
- `GET /api/media/projects/:id/cull/summary` — Cull counts (total/keep/reject/maybe/undecided)
- `PUT /api/media/assets/:id/edits` — Set non-destructive edit params (photos), queue render
- `POST /api/media/projects/:id/edits/batch` — Apply one edit set across ≤500 photos
- `POST /api/media/projects/:id/auto-edit` — AI grade photos toward learned house style (queues real edits)
- `POST /api/media/copilot` — Grounded studio assistant; returns reply + advisory action buttons
- `DELETE /api/media/assets/:id/edits` — Clear edits + re-render plain variants

### Data model
- **ms_projects** — A shoot; optional CRM link via lead_id — _cols:_ id, workspace_id, lead_id, title, project_type, shoot_date, location, status, cover_asset_id, settings(JSON), created_by, created_at, updated_at
- **ms_folders** — Per-project (nestable) folders for organizing assets — _cols:_ id, workspace_id, project_id, parent_id, name, sort_order, created_at
- **ms_assets** — Canonical media row (photo/video/raw/audio/file) — _cols:_ id, workspace_id, project_id, folder_id, type, storage_key, filename, mime, size_bytes, width, height, duration_ms, capture_time, camera_meta(JSON), checksum, phash, variants(JSON), status, uploaded_by, created_at; +edits(JSON), deleted_at, v_duration_ms/v_width/v_height/v_fps/v_codec/v_has_audio, proxy_url, poster_url, storage_provider, storage_size, uploaded_at
- **ms_asset_scores** — ADVISORY AI/CV scores — the only table the AI lane may write — _cols:_ id, workspace_id, asset_id, score_type, value, group_key, model_version, source, reasons(JSON via analyzers), created_at
- **ms_cull_decisions** — HUMAN cull decisions (no AI write path); one per asset — _cols:_ id, workspace_id, asset_id(UNIQUE), project_id, user_id, decision(keep|reject|maybe), rating 0-5, color_label, flagged, decided_at
- **ms_jobs** — Async media work queue (ingest/transcode/score/exports/render/watermark/video) — _cols:_ id, workspace_id, type, asset_id, project_id, status, progress, payload(JSON), error_message, retry_count, created_at, next_retry_at, finished_at, lease_until
- **ms_asset_analysis** — 'Analyze once' ledger: one row per (asset, analyzer) recording model_version — _cols:_ asset_id, analyzer_id, model_version, source, status, analyzed_at (PK asset_id+analyzer_id)
- **ms_feedback** — Learning System: every human signal captured for future AI — _cols:_ id, workspace_id, user_id, entity, entity_id, action, before, after, meta, created_at
- **workspace_brain** — Studio's learned preferences (explicit + inferred) — _cols:_ workspace_id, key, value(JSON), confidence, ...
- **storage_warn_state** — Dedup state for 80/90/100% storage threshold notifications — _cols:_ workspace_id(PK), last_level, notified_at
- **ms_fav_collections** — Client-named favourite collections (gallery CX) — _cols:_ id, gallery_id, workspace_id, name, contact_identifier, asset_ids(JSON), created_at
- **ms_portfolios / ms_portfolio_items** — Per-user public showcase (purged-on-asset-delete via portfolio_items) — _cols:_ portfolio: id, workspace_id, user_id, handle(UNIQUE), token, theme, ...; items: id, portfolio_id, asset_id, storage_key, variants, kind, source, ...

### Rules, constraints & guarantees
- Module is fully additive — owns the ms_* namespace; touches no existing CRM table or route. Project↔client link is the single lead_id FK into leads, validated to the workspace on create.
- Control-first invariant: the AI/CV lane (worker + external runtimes) may write ONLY ms_asset_scores (advisory). ms_cull_decisions is human-only and writable solely via the cull routes; ms_cull_decisions.asset_id is UNIQUE and user_id is always a real human. No AI path can cull, publish, edit, or deliver.
- Cull validation: decision must be keep|reject|maybe|null; rating must be 0..5.
- Destructive ops (project archive, asset soft-delete, asset permanent delete) require manager+ role (super_admin/admin/manager) or manage_settings permission via canManage().
- Project delete is non-destructive (archive). Asset delete is soft (Trash) with 30-day restore; purgeExpiredTrash removes assets >30 days old (runs on boot and on each trash listing).
- Storage quota gate runs BEFORE issuing a signed URL and before persisting a multipart upload; over-limit returns 413 with used_gb/limit_gb/pct. Gate is fail-open and only blocks when enforcement is ON (pricing_config.enforcement != 'off') and the plan limit is finite (unlimited/Enterprise/founder overrides always allowed).
- Local multipart upload cap: 200MB/file, ≤200 files per request; signed direct-to-R2 removes the ceiling. Direct-upload complete refuses (409) until the file actually exists in storage.
- Edits are non-destructive: original is never mutated; variants re-rendered from the untouched original; edit JSON validated by sanitizeEdits (tone -1..1, film 0..1, rotate ±360, relative crop bounds). Only photos can be edited; batch capped at 500, auto-edit scope capped at 2000.
- Edits apply in fixed order rotate → crop → tone → film-finish; rev counter busts caches; stale revisions are cleaned (local + R2).
- All asset URLs go through a single provider-agnostic publicUrl()/storage seam — never hand-built; works identically on local disk or R2.
- Worker degrades gracefully: missing jimp/exifr/adm-zip/pdfkit/ffmpeg never crashes the host — variant/score/export steps are skipped and the job is marked done with a degraded note. RAW/video pass through when undecodable.
- 'Analyze once' idempotency: the ledger (asset_id, analyzer_id, model_version) prevents re-analysis unless the model version bumps or a force; worker idempotently DELETEs prior source='ai' scores before re-inserting.
- Dedup grouping is scoped to the same project; near-duplicate threshold is Hamming distance ≤6 bits on a 64-bit average hash.
- Watermarking and edits write SEPARATE variants — originals are always preserved; gallery downloads serve clean originals per download policy while clients see only protected images.
- Job queue is multi-worker safe: atomic claim via conditional UPDATE + 10-minute lease; a reaper returns orphaned (crashed-worker) jobs to pending; max 3 retries with linear backoff (retry*30s).
- Auto-folders requires ≥2 capture-time clusters and EXIF capture times; otherwise returns 0 folders with a friendly message.
- Copilot is advisory only — it returns suggested actions (allow-listed: navigate/create_gallery_from_keepers/preset_keepers) that the UI must click to apply; presets and navigate targets are re-validated server-side; max 3 actions.

### Automations (crons / jobs / triggers / auto-behaviors)
- Async ms_jobs worker (media-worker.js): setInterval every 5s (unref'd), drains up to 10 due jobs per tick; reaps stale leased jobs; retries failed jobs up to 3x with linear backoff; broadcasts ms_asset_processed on completion.
- 'ingest' job auto-enqueued on every upload (multipart + direct R2 complete): generates thumb/web variants, reads EXIF→capture_time/camera_meta, computes CV technical scores, computes phash and auto-groups duplicates, runs optional server vision/face fallback, marks analyzers in the ledger, computes composites.
- Video pipeline auto-chains: ingest of a video/audio asset enqueues video_probe → (if real video) video_poster + video_proxy (720p H.264).
- 'render_edits' job auto-enqueued whenever edits are set/batched/auto-edited or cleared; re-renders variants from the original.
- Storage threshold notifications: after each upload, storageEnforce.warn fires ONE notification per upward threshold crossing (80% warn → 90% critical → 100% reached), deduped via storage_warn_state.
- purgeExpiredTrash() runs on module boot and on every GET /api/media/trash, hard-purging assets soft-deleted >30 days ago (row + scores + decisions + portfolio items + files).
- On new uploads, existing AI reel drafts for the project are flagged ai_stale=1 (never auto-rebuilt).
- Media events auto-mirror onto the CRM lead timeline (activity_timeline + addContactHistory) on project create and on upload.
- Real-time broadcasts to the workspace (broadcastToWorkspace) for ms_project_created/updated, ms_assets_added, ms_asset_processed, ms_scored, ms_watermark_done, etc.
- Workspace Brain derivation (brain/derive) infers preferences from accumulated ms_feedback.

### AI behaviors
- All AI/CV output is advisory and confined to ms_asset_scores; there is no code path for AI to write cull decisions, edits-as-applied (the human/queue applies them), galleries, or delivery. Control-first by construction.
- Server CV scoring (worker): sharpness (Laplacian variance), blur, exposure, shadow/high clipping, and a composite 'quality' keepability hint; written with source='ai' and the technical analyzer's model_version, idempotent per asset.
- Perceptual-hash near-duplicate detection groups similar shots (advisory duplicate_group scores) within a project.
- Analyzer abstraction (analyzers/index.js): swappable execution tiers (server CPU now, desktop ONNX / cloud later) all funnel through recordScores + an 'analyze once' ledger; canonical score vocabulary across technical/dedup/vision/video/composite; scores may carry explainable 'reasons'.
- Optional server vision-cpu fallback + optional face/smile detector feed composition/aesthetic/scene_class/face_count/smile when available; absent by default with no impact on ranking.
- Composite scores (hero/portfolio/album/storytelling/hook/story/social) are DERIVED from primitives by a transparent server formula; recomputable on demand.
- AI auto-edit grades photos toward a learned house-style profile (style_profiles) but only produces ordinary non-destructive edits routed through the same human-reviewable render pipeline; refuses until a style is learned.
- Studio Copilot is a grounded, control-first assistant: answers from real DB stats and returns only allow-listed, server-re-validated SUGGESTED actions as buttons — it can change nothing itself; 503 when no AI provider configured.
- Learning System: every human cull/rate/flag/label signal is logged to ms_feedback and Workspace Brain so future AI can learn the studio's preferences.

### Integrations
- Cloudflare R2 object storage (via ./storage when STORAGE_PROVIDER=r2) — signed direct-to-bucket uploads, provider-aware variant/export read/write, presign-redirect public URLs; local disk fallback otherwise.
- Local /uploads static route (served by the host server) for local-disk media and variants.
- jimp (image decode/resize/variants/watermark/edit rendering) — optional, degrades.
- exifr (EXIF/capture-time/camera metadata + RAW thumbnail) — optional, degrades.
- exiftool / dcraw (RAW embedded-preview extraction, shelled out) — optional.
- ffmpeg / ffprobe (video probe/poster/720p proxy/timeline export) — optional, degrades.
- adm-zip (gallery ZIP export) + pdfkit (album PDF export) — optional, degrades.
- CRM core: leads (client link), activity_timeline + addContactHistory (lead timeline mirroring).
- Pricing/entitlements engine (entitlements.js + pricing_config) drives storage quota enforcement; Command Center storage dashboard shares the same usage definition (cc-storage).
- Text-AI provider chain (ai-engine via ai.callLLM/extractJSON) powering Studio Copilot.
- In-app notification system (notify) for storage threshold warnings.

---

## 4. Media Studio — Delivery + Client-Facing (backend/media-studio.js)

The delivery half of the Media Studio module: a single Express-mounted file (mountMediaStudio) owning the ms_* namespace, covering client galleries (creation/from-cull/from-favorites, themes via settings, password/visibility, share tokens, publish/unpublish, reorder, client favorites + named collections + comments), watermarking (jimp, non-destructive variants), proofing/selection sets (quota, revision rounds, request-changes/approve/submit), ZIP exports (web=watermarked, original=clean, worker-backed, dual local/R2 download), album builder → print-ready PDF export, video clips + timelines + MP4 exports + AI reel drafts, and a curated public Portfolio (10 themes, vanity handle/token, auto-feed from published galleries). Core guarantee is control-first: AI/CV may only write advisory ms_asset_scores; every publish/deliver/cull/export is an authenticated human action, and public client routes are gated solely by the unguessable share token (capability model) plus optional password. Delivery to clients rides the existing WhatsApp rail via an injected sendClientMessage seam (no-op by default); storage is provider-agnostic (local disk today, Cloudflare R2 seam).

### Features
- **Gallery creation (blank)** — POST /projects/:id/galleries — title required; visibility one of public|private|password|client_portal (defaults private); password hashed as sha256(galleryId::pw); settings JSON stored (download_policy, watermark, layout_theme). Inherits project.lead_id.
- **Gallery from cull decisions** — POST /projects/:id/galleries/from-cull — one-click delivery prep; picks photos by decision (keep default, also maybe/reject) in capture order, inserts into new gallery. 400 if none. Returns has_password, hides password_hash.
- **Gallery from client favourites** — POST /galleries/:id/album-from-favorites — builds a new '<title> — Favourites' gallery from DISTINCT ms_client_favorites asset_ids; 400 if no favourites yet; copies visibility.
- **Gallery list / detail / update** — GET /projects/:id/galleries (with asset_count, favorite_count, comment_count, latest proofing summary, share_url); GET /galleries/:id (assets shaped + comments + share_url); PUT /galleries/:id updates title/visibility/status/settings/password (re-hashes or nulls).
- **Gallery asset management** — POST /galleries/:id/assets (only assets in same project, INSERT OR IGNORE, appends sort_order); PUT /galleries/:id/assets/order (reorder by asset_ids); DELETE /galleries/:id/assets/:assetId.
- **Publish & deliver** — POST /galleries/:id/publish — human action; requires >=1 asset; generates 16-byte hex share_token (idempotent), sets status=published, version+1, published_at; builds link clientBaseUrl/g/:token; if notify!=false and lead has customer_phone, sends WhatsApp gallery-ready message; emits to lead timeline; auto-includes into creator portfolio if opted in. POST /galleries/:id/unpublish reverts to draft.
- **Themes / layout** — Gallery layout_theme lives in settings JSON (free-form, rendered client-side). Portfolio has a fixed enum of 10 themes: atelier, noir, editorial, gallery, film, brut, luxe, vivid, mono, frame.
- **Watermarking (non-destructive)** — POST /watermark/logo (upload logo file); POST /watermark/apply (jimp; config text|logo, opacity, position bottom-right/center/tiled/etc, size; persists project.settings.watermark; background batch up to 2000 assets; resizes >2400px; writes media/wm-<id>.jpg variant; provider-aware R2/local; broadcasts ms_watermark_done); POST /watermark/remove deletes watermarked variant.
- **Proofing / selection sets** — POST /galleries/:id/proofing (title, quota, instructions, due_at; status open); GET list + GET /proofing/:setId (selected_count, selected_asset_ids); POST /proofing/:setId/request-changes (status revision, revision_round+1, notifies client over WhatsApp); POST /proofing/:setId/approve (status approved, notifies client).
- **Client gallery delivery (public portal)** — GET /portal/:token — published gallery only; password gate; returns title, version, download_policy, watermark flag, proofing (active set + selections), store_enabled (if active print products exist), story 'sections' derived from folders, and public-shaped assets (thumb/web favor watermarked variant). Logs ms_gallery_access view row.
- **Client favourites + collections + comments** — POST /portal/:token/favorite (toggle per contact_identifier, returns count, broadcasts); POST /portal/:token/collection (saves named ms_fav_collections from explicit asset_ids or current favourites, notifies workspace + adds lead contact history); GET /galleries/:id/collections (photographer view); POST /portal/:token/comment (per-asset or gallery-level, broadcasts + notifies).
- **ZIP export (web watermarked / original clean)** — POST /galleries/:id/export (variant web|original; web burns watermark when settings.watermark set, original ships clean full-res); creates ms_exports pending + zip_export job; GET /exports/:id status; GET /exports/:id/file dual-read (local file or 302 to presigned R2). Client 'Download all' POST /portal/:token/export respects download_policy (none blocks, high-res→original, else web).
- **Album builder → PDF** — POST /projects/:id/albums (spec w_mm/h_mm/margin_mm); CRUD albums + pages (layout templates single/two-h/two-v/three/grid4 with 1/2/2/3/4 slots); pages reorder; autofill one keeper per page from cull; POST /albums/:id/export enqueues pdf_export job (status pending→ready), pdf_url exposed when ready.
- **Print store hook** — Portal exposes store_enabled boolean by counting active ms_print_products for the workspace; the print store products/orders themselves live in a separate file (print-store.js), not in media-studio.js.
- **Video clips (manual)** — GET /projects/:id/videos; PUT /assets/:id/meta (duration/width/height from browser); clips CRUD with in_ms/out_ms validation (out>in), label, sort_order, reorder.
- **Video timelines (EDL editor)** — CRUD ms_timelines (JSON EDL document, aspect/width/height/fps/duration); GET /video/presets (aspects, qualities, export presets, transitions, effects, text types/anims, fonts, LUTs, ffmpeg detect); LUTs list + custom .cube upload/delete (validates LUT_3D_SIZE); templates list + apply (builds timeline from media, keepers-first auto-pick).
- **AI reel drafts (control-first)** — GET /ai-drafts/styles (recommended by project_type); POST /ai-drafts (ranks scored media, selects for style, builds editable draft timeline, stores ai_style/ai_signature); POST /timelines/:id/refresh rebuilds stale AI draft from current media. New uploads flag existing ai_draft timelines ai_stale=1 (never auto-rebuilt).
- **Video MP4 export** — POST /timelines/:id/export (preset ig_reel default, quality, forced/own aspect, dims via videoEngine); creates ms_video_exports + video_export job (pending→rendering→done); GET exports list + single export status with url.
- **Public Portfolio (curated showcase)** — GET /portfolio (get-or-create, one per user, auto vanity handle from name); PUT /portfolio (title/tagline/bio/theme[enum]/cover/avatar/is_public/auto_include/settings/handle with uniqueness check); handle-available check; candidates from published galleries; add items (manual/from-gallery), direct upload (30 files), reorder, edit caption/title/featured, delete; share to CRM lead over WhatsApp; GET /public/portfolio/:handle (no auth, handle or token, is_public=1, increments view_count). Auto-feed on gallery publish if auto_include and never raw.
- **Studio Copilot (advisory)** — POST /copilot — grounded LLM assistant over real project DB context (cull, scores, galleries favs/comments, proofing, edits); returns reply + max 3 SUGGESTED actions (navigate/create_gallery_from_keepers/preset_keepers) that the UI renders as buttons; copilot itself changes nothing.

### API endpoints (115)
- `GET /api/media/overview` — Health/mount check + workspace project/asset/storage counts
- `GET /api/media/projects` — List projects (filter lead_id/status) with client_name + derived cover_url
- `POST /api/media/projects` — Create project (validates lead_id belongs to workspace)
- `GET /api/media/projects/:id` — Project detail with folders + asset/storage counts
- `PUT /api/media/projects/:id` — Update project fields/settings
- `DELETE /api/media/projects/:id` — Archive project (soft; manager+ only)
- `GET /api/media/projects/:id/folders` — List folders
- `POST /api/media/projects/:id/folders` — Create folder
- `POST /api/media/projects/:id/assets/sign` — Forward-compatible upload-target descriptor (multipart today)
- `POST /api/media/projects/:id/uploads/sign` — Direct-to-R2 signed PUT URL (storage quota gated)
- `POST /api/media/projects/:id/uploads/complete` — Register asset after client PUT + enqueue ingest
- `GET /api/media/storage` — Workspace storage usage (status, by_type, largest_projects, exports_bytes)
- `POST /api/media/projects/:id/assets` — Multipart upload up to 200 files (quota gated, R2 push, enqueues ingest)
- `POST /api/media/projects/:id/watermark/logo` — Upload watermark logo file
- `POST /api/media/projects/:id/watermark/apply` — Apply watermark to assets (background, non-destructive variant)
- `POST /api/media/projects/:id/watermark/remove` — Remove watermarked variant from assets
- `POST /api/media/projects/:id/auto-folders` — Cluster photos into folders by capture-time gaps
- `POST /api/media/galleries/:id/album-from-favorites` — Build new gallery from client favourites
- `POST /api/media/assets/:id/scores` — Ingest advisory CV scores for one asset (desktop/cloud)
- `POST /api/media/projects/:id/scores` — Batch ingest scores for a shoot
- `POST /api/media/projects/:id/analyze` — Recompute composite scores server-side
- `GET /api/media/projects/:id/intelligence` — Per-asset score map + pending analyzers for cull UI
- `GET /api/media/brain` — Workspace Brain learned preferences
- `PUT /api/media/brain` — Set a brain preference key/value/confidence
- `POST /api/media/brain/derive` — Derive brain from accumulated signals
- `GET /api/media/jobs` — Job queue health (byStatus/byType/throughput/failures)
- `POST /api/media/jobs/retry-failed` — Requeue all failed jobs
- `GET /api/media/projects/:id/assets` — Library listing (filter folder/type/decision; advisory scores joined)
- `GET /api/media/assets/:id` — Single asset detail + scores + cull decision
- `DELETE /api/media/assets/:id` — Soft-delete asset to Trash (manager+ only)
- `GET /api/media/trash` — List trashed assets (purges expired first)
- `POST /api/media/assets/:id/restore` — Restore asset from Trash
- `DELETE /api/media/assets/:id/permanent` — Hard-delete asset + files/scores/decisions (manager+ only)
- `PUT /api/media/assets/:id/cull` — Human cull decision (keep/reject/maybe, rating 0-5, color, flag)
- `POST /api/media/projects/:id/cull/bulk` — Bulk keep/reject across selection
- `GET /api/media/projects/:id/cull/summary` — Cull counts (total/keep/reject/maybe/undecided)
- `PUT /api/media/assets/:id/edits` — Non-destructive edit params (queues render)
- `POST /api/media/projects/:id/edits/batch` — Apply same edit to many photos (up to 500)
- `POST /api/media/projects/:id/auto-edit` — Grade photos toward learned house style (style_profiles)
- `DELETE /api/media/assets/:id/edits` — Reset edits (re-render originals)
- `POST /api/media/copilot` — Studio Copilot grounded answer + suggested actions
- `POST /api/media/projects/:id/galleries` — Create gallery
- `POST /api/media/projects/:id/galleries/from-cull` — Create gallery pre-filled from cull decisions
- `GET /api/media/projects/:id/galleries` — List galleries with counts + proofing summary
- `GET /api/media/galleries/:id` — Gallery detail (assets + comments + share_url)
- `PUT /api/media/galleries/:id` — Update gallery (title/visibility/status/settings/password)
- `POST /api/media/galleries/:id/assets` — Add assets to gallery (same-project only)
- `PUT /api/media/galleries/:id/assets/order` — Reorder gallery assets
- `DELETE /api/media/galleries/:id/assets/:assetId` — Remove asset from gallery
- `POST /api/media/galleries/:id/publish` — Publish gallery, mint share token, deliver via WhatsApp
- `POST /api/media/galleries/:id/unpublish` — Revert gallery to draft
- `GET /api/media/exports/:id/file` — Download ZIP export (local or 302 presigned R2) — no auth, id=capability
- `POST /api/media/galleries/:id/export` — Start ZIP export (web/original variant)
- `GET /api/media/exports/:id` — Export status (auth)
- `POST /api/media/galleries/:id/proofing` — Create proofing set (quota/instructions/due_at)
- `GET /api/media/galleries/:id/proofing` — List proofing sets with selected count
- `GET /api/media/proofing/:setId` — Proofing set detail + selected asset ids
- `POST /api/media/proofing/:setId/request-changes` — Open a revision round, notify client
- `POST /api/media/proofing/:setId/approve` — Approve selection, notify client
- `GET /api/media/galleries/:id/collections` — List client-saved favourite collections (photographer)
- `POST /api/media/projects/:id/albums` — Create album with print spec
- `GET /api/media/projects/:id/albums` — List albums with page_count
- `GET /api/media/albums/:id` — Album detail with pages + filled slots
- `PUT /api/media/albums/:id` — Update album title/status/cover/spec
- `DELETE /api/media/albums/:id` — Delete album + pages
- `POST /api/media/albums/:id/pages` — Add album page (layout template)
- `PUT /api/media/albums/:id/pages/order` — Reorder album pages
- `PUT /api/media/albums/:id/pages/:pageId` — Update page layout/slots/page_no
- `DELETE /api/media/albums/:id/pages/:pageId` — Delete album page
- `POST /api/media/albums/:id/autofill` — One keeper per page draft from cull
- `POST /api/media/albums/:id/export` — Enqueue print-ready PDF export
- `GET /api/media/projects/:id/videos` — List video assets with clip_count
- `PUT /api/media/assets/:id/meta` — Set video duration/width/height from browser
- `GET /api/media/assets/:id/clips` — List clips for a video asset
- `PUT /api/media/assets/:id/clips/order` — Reorder clips
- `POST /api/media/assets/:id/clips` — Create clip (in/out ms)
- `PUT /api/media/clips/:clipId` — Update clip label/in/out
- `DELETE /api/media/clips/:clipId` — Delete clip
- `GET /api/media/video/presets` — Editor presets/aspects/transitions/effects/fonts/LUTs/ffmpeg
- `GET /api/media/video/luts` — List built-in + custom LUTs
- `POST /api/media/video/luts` — Upload custom .cube LUT (validated)
- `DELETE /api/media/video/luts/:lutId` — Delete custom LUT
- `GET /api/media/video/templates` — List reel templates with CSS hint
- `POST /api/media/projects/:id/templates/:templateId/apply` — Apply template → editable timeline
- `GET /api/media/projects/:id/ai-drafts/styles` — List/recommend AI reel styles
- `POST /api/media/projects/:id/ai-drafts` — Generate AI reel draft timeline
- `POST /api/media/timelines/:id/refresh` — Rebuild stale AI draft from current media
- `GET /api/media/projects/:id/audio` — List audio assets for music picker
- `GET /api/media/projects/:id/timelines` — List timelines
- `POST /api/media/projects/:id/timelines` — Create manual timeline
- `GET /api/media/timelines/:id` — Timeline detail (EDL document)
- `PUT /api/media/timelines/:id` — Save timeline document
- `DELETE /api/media/timelines/:id` — Delete timeline + its exports
- `POST /api/media/timelines/:id/export` — Render MP4 (background job)
- `GET /api/media/timelines/:id/exports` — List timeline exports
- `GET /api/media/video/exports/:exportId` — Single video export status
- `GET /api/media/portfolio` — Get-or-create my portfolio with items
- `GET /api/media/portfolio/handle-available` — Check vanity handle availability
- `PUT /api/media/portfolio` — Update portfolio (title/theme/handle/public/etc)
- `GET /api/media/portfolio/candidates` — Candidate items from published galleries
- `POST /api/media/portfolio/items` — Add items by asset_ids or gallery
- `POST /api/media/portfolio/upload` — Direct upload portfolio-only items (30 files)
- `PUT /api/media/portfolio/items/order` — Reorder portfolio items
- `PUT /api/media/portfolio/items/:itemId` — Edit item caption/title/featured
- `DELETE /api/media/portfolio/items/:itemId` — Delete portfolio item
- `POST /api/media/portfolio/share` — Share portfolio to CRM lead over WhatsApp
- `GET /api/media/public/portfolio/:handle` — Public portfolio page data (no auth, handle/token, increments views)
- `GET /api/media/portal/:token` — Public client gallery (no auth, token=capability, password gate)
- `POST /api/media/portal/:token/favorite` — Client toggle favourite
- `POST /api/media/portal/:token/collection` — Client save named collection
- `POST /api/media/portal/:token/comment` — Client comment on gallery/asset
- `POST /api/media/portal/:token/export` — Client 'Download all' (respects download policy)
- `GET /api/media/portal/:token/export/:exportId` — Client export status
- `POST /api/media/portal/:token/proofing/:setId/select` — Client toggle a proofing selection
- `POST /api/media/portal/:token/proofing/:setId/submit` — Client submit selection, notify photographer

### Data model
- **ms_galleries** — Client-deliverable galleries — _cols:_ id, workspace_id, project_id, lead_id, title, visibility(public|private|password|client_portal), password_hash, share_token UNIQUE, status(draft|published|archived), version, settings JSON(watermark/download_policy/layout_theme), expires_at, published_at, created_by
- **ms_gallery_assets** — Gallery membership + ordering — _cols:_ gallery_id, asset_id, sort_order, is_hidden (PK gallery_id+asset_id)
- **ms_gallery_access** — Client view/access log — _cols:_ id, gallery_id, lead_id, email, access_token, last_viewed_at
- **ms_client_favorites** — Per-contact client favourites — _cols:_ id, gallery_id, asset_id, contact_identifier (UNIQUE gallery+asset+contact)
- **ms_client_comments** — Client comments (gallery or per-asset) — _cols:_ id, gallery_id, asset_id, contact_identifier, body, created_at
- **ms_fav_collections** — Client-named favourite collections — _cols:_ id, gallery_id, workspace_id, name, contact_identifier, asset_ids JSON
- **ms_exports** — Gallery ZIP export jobs/results — _cols:_ id, workspace_id, gallery_id, project_id, variant(web|original), status(pending|ready|failed), storage_key, size_bytes, file_count, watermark, error_message, finished_at
- **ms_proofing_sets** — ShootProof-style selection sets — _cols:_ id, workspace_id, gallery_id, project_id, lead_id, title, quota, instructions, status(open|submitted|revision|approved), revision_round, due_at, submitted_at
- **ms_proofing_selections** — Client picks within a set — _cols:_ id, set_id, asset_id, contact_identifier, round (UNIQUE set+asset)
- **ms_albums** — Print album layouts + PDF — _cols:_ id, workspace_id, project_id, title, spec JSON(w_mm/h_mm/margin_mm), status, cover_asset_id, pdf_status(none|pending|ready|failed), pdf_storage_key, pdf_size, pdf_pages, pdf_built_at
- **ms_album_pages** — Album page layouts — _cols:_ id, album_id, page_no, layout_template(single|two-h|two-v|three|grid4), slots JSON[{asset_id}]
- **ms_video_clips** — Manual video clip in/out marks — _cols:_ id, workspace_id, project_id, asset_id, label, in_ms, out_ms, sort_order
- **ms_timelines** — Video EDL documents (reels) — _cols:_ id, workspace_id, project_id, name, source(manual|template|ai_draft), template_id, aspect_ratio, width/height/fps, duration_ms, document JSON, status, ai_style, ai_signature, ai_stale, created_by
- **ms_video_exports** — MP4 render jobs/results — _cols:_ id, workspace_id, timeline_id, project_id, preset, width/height/fps/quality, status(pending|rendering|done|failed), progress, storage_key, size_bytes, error_message, finished_at
- **ms_audio_tracks** — Built-in/custom music library — _cols:_ id, workspace_id(NULL=builtin), category, title, artist, storage_key, duration_ms, license
- **ms_luts** — Custom .cube color LUTs — _cols:_ id, workspace_id, name, category, cube_path, thumbnail_url
- **ms_video_templates** — Reel templates — _cols:_ id, workspace_id, category, name, thumbnail_url, aspect_ratios JSON, document JSON
- **ms_portfolios** — Per-user public showcase — _cols:_ id, workspace_id, user_id, handle UNIQUE, token UNIQUE, title, tagline, bio, theme(10 enum), cover_url, avatar_url, is_public, auto_include, settings JSON, view_count
- **ms_portfolio_items** — Portfolio media items — _cols:_ id, workspace_id, portfolio_id, asset_id, storage_key, variants, kind(photo|video), source(manual|gallery|upload|reel), gallery_id, title, caption, featured, sort_order
- **ms_projects** — Shoot/project (owns assets, links lead) — _cols:_ id, workspace_id, lead_id, title, project_type, status(planning..delivered|archived), cover_asset_id, settings JSON(watermark)
- **ms_assets** — Source media + variants + edits — _cols:_ id, project_id, folder_id, type(photo|video|raw|audio|file), storage_key, variants JSON(thumb/web/original/watermarked), edits JSON, deleted_at(soft-delete), storage_provider, proxy_url, poster_url
- **ms_asset_scores** — AI/CV ADVISORY scores only (AI write-target) — _cols:_ id, workspace_id, asset_id, score_type, value, group_key, model_version, source
- **ms_cull_decisions** — HUMAN cull decisions (no AI write path) — _cols:_ id, asset_id UNIQUE, project_id, user_id, decision(keep|reject|maybe), rating 0-5, color_label, flagged
- **ms_jobs** — Async media work queue — _cols:_ id, type(ingest|transcode|score|zip_export|watermark|render_edits|pdf_export|video_export), asset_id, project_id, status, progress, payload, retry_count, lease_until, next_retry_at, finished_at

### Rules, constraints & guarantees
- Control-first invariant: AI/CV may write only ms_asset_scores (advisory); no route lets AI cull, publish, export, or deliver — those tables/routes only accept authenticated human writes.
- Public client routes (/portal/:token, /public/portfolio/:handle, /exports/:id/file) carry NO auth — the unguessable share_token / handle / export-id is the capability.
- Password-gated galleries: portalAllowed requires pw whose sha256(galleryId::pw) matches password_hash; visibility!=password always allowed.
- Only published galleries are loadable publicly (loadPublishedGallery requires status=published).
- Publish requires >=1 gallery asset; ZIP export and album PDF export require >=1 asset/page.
- Gallery assets must belong to the same project as the gallery (validated on add and reorder ignores non-members).
- Download policy gating: 'none' blocks downloads (portal export 403, download_url null); 'high-res' serves clean original; default 'web' serves watermarked/web variant.
- ZIP variant rule: web burns watermark when settings.watermark set; original always ships clean full-res.
- Public asset shaping never exposes the original unless download policy allows; watermarked variant replaces web/thumb so clients only see protected previews.
- Cull decisions: decision in keep|reject|maybe|null; rating 0..5; a real user_id always owns each decision.
- Proofing selections only toggle while set status is open|revision; asset must be in the gallery; submit requires >=1 selection.
- Watermarking, edits, and exports are non-destructive — originals preserved; clearing edits/removing watermark restores prior variants.
- Destructive ops (project archive, asset soft/hard delete) require manager+ role or manage_settings permission (canManage).
- Soft-deleted assets go to Trash; purged automatically after 30 days (on boot, on trash list, on permanent delete).
- Portfolio: one per user; handle min 3 chars, slugified, globally unique; auto-feed only pulls PUBLISHED gallery assets (is_hidden=0), never raw library.
- Edit params validated/clamped: tone -1..1, fade/vignette/grain 0..1, rotate -360..360, crop bounds checked; batch capped at 500, watermark batch at 2000.
- Upload limits: 200MB/file local cap, 200 files/multipart, 30 files/portfolio upload, 8MB/.cube LUT (must contain LUT_3D_SIZE).
- Storage quota gate (storage-enforce): rejects uploads (413) that would exceed plan limit; fail-open, gated by pricing_config.enforcement.
- Copilot suggested actions are whitelisted (navigate/create_gallery_from_keepers/preset_keepers), max 3, and re-validated server-side; copilot performs nothing.
- Module owns only the ms_* namespace and touches no existing core route; integrates with leads/activity_timeline/users/style_profiles read-only-ish via defensive try/catch.

### Automations (crons / jobs / triggers / auto-behaviors)
- Background media worker (media-worker.js) auto-starts on mount (unless startWorker:false) and drains ms_jobs: ingest→variants+EXIF+CV scores, render_edits, zip_export, pdf_export, video_export, watermark, transcode.
- purgeExpiredTrash() sweeps assets deleted >30 days on boot, on GET /trash, and on permanent delete.
- On gallery publish: auto WhatsApp delivery to the linked lead (if customer_phone and notify!=false), lead-timeline event, and opt-in auto-include of gallery assets into the creator's portfolio.
- New uploads mark existing ai_draft timelines for that project ai_stale=1 (flagged refreshable, never auto-rebuilt).
- Watermark apply runs as a fire-and-forget async batch and broadcasts ms_watermark_done on completion.
- Proofing request-changes/approve auto-notify the client over WhatsApp; client submit notifies the photographer (broadcast + lead timeline + in-app notify).
- Client favourite/collection/comment actions broadcast realtime workspace events (ms_client_favorited / ms_collection / ms_client_commented) and fire in-app notify + lead contact history.
- Storage threshold warnings (storageEnforce.warn at 80/90/100%) fired via notify after uploads.
- Realtime broadcasts on most mutations (ms_project_created/updated, ms_assets_added, ms_gallery_created/published, ms_scored, ms_proofing_submitted).
- Public portfolio page view auto-increments ms_portfolios.view_count; public gallery view logs an ms_gallery_access row.

### AI behaviors
- ms_asset_scores is the ONLY AI/CV write surface — advisory sharpness/exposure/blur/aesthetic/face/eyes_open/duplicate_group/quality/clip_quality scores; never mutates the asset row or cull decision.
- Score ingestion routes (/assets/:id/scores, /projects/:id/scores) accept scores from desktop ONNX runtime / cloud worker via the swappable analyzers abstraction; computeComposites is cheap server-side recompute.
- Cull UI consumes advisory scores for filtering/sorting only; humans make every keep/reject decision (control-first).
- AI reel drafts rank scored media (quality/sharpness/faces/smile + cull) and build a fully editable draft timeline — a suggestion, not an auto-publish; refresh is manual.
- Auto-edit grades photos toward a LEARNED house style (style_profiles) and applies it through the same non-destructive edit pipeline; requires a derived style first; skips on-style photos.
- Auto-folders clusters by EXIF capture-time gaps (deterministic heuristic, not ML).
- Studio Copilot (ai-engine LLM) answers from grounded real DB context and returns only whitelisted SUGGESTED action buttons; it changes nothing itself and is re-validated server-side.
- Workspace Brain stores explicit + inferred studio preferences (brainGet/Set/derive); every human cull/rating/flag signal is logged via intel.logFeedback for future learning.
- All AI/scoring is advisory and gated behind explicit human actions — no AI path can publish, deliver, cull, or export.

### Integrations
- WhatsApp delivery via injected sendClientMessage seam (whatsappService.sendMessage + saveOutgoingMessage) — gallery publish, proofing request-changes/approve, portfolio share; no-op default so module runs without messaging.
- Cloudflare R2 / local-disk storage abstraction (storage.js) — provider-agnostic publicUrl, signed PUT uploads, presigned GET, dual-read downloads; STORAGE_PROVIDER toggles.
- storage-enforce.js — plan storage quota gating + 80/90/100% threshold warnings tied to pricing_config.
- analyzers.js (Media Intelligence Track 0) — swappable score Analyzer abstraction (server worker now, desktop ONNX later), composites, Workspace Brain, feedback log.
- video-engine.js / video-luts.js / video-templates.js / video-ai-drafts.js / style-apply.js — timeline sanitation, presets, LUTs, reel templates, AI drafts, house-style grading.
- media-worker.js — async ms_jobs processor (ingest/variants/EXIF/CV, transcode, zip/pdf/video export, watermark, edit render); ffmpeg/ffprobe + jimp.
- jimp — non-destructive watermark + image edit rendering.
- ai-engine (ai.callLLM/extractJSON) — Studio Copilot grounded assistant.
- CRM core (read/seam): leads (validation, phone for delivery), activity_timeline + addContactHistory (lead timeline mirroring), users (portfolio identity), style_profiles (auto-edit), in-app notify, broadcastToWorkspace (realtime SSE), logAudit.
- print-store.js (separate file) — portal store_enabled flag counts active ms_print_products; print products/orders not defined in media-studio.js.

---

## 5. Media Intelligence (Track-0 + Brains + Style + Reel)

The Media Intelligence layer is WappFlow Media Studio's advisory scoring brain. Its core invariant is a strict separation between WHO produces scores (server CPU analyzers, the future desktop ONNX runtime, or an opt-in cloud worker) and WHO consumes them (selection/gallery/album/reel/style/copilot logic). All score producers funnel through one write path (recordScores) into one store (ms_asset_scores) plus an "analyze-once" idempotency ledger (ms_asset_analysis) keyed on (asset_id, analyzer_id) with model_version. Three guarantees hold everywhere: advisory-only (it writes scores/suggestions/draft galleries+albums+timelines but NEVER auto-edits originals, never auto-culls into ms_cull_decisions, never touches WhatsApp), analyze-once (re-run only when model_version bumps or the user forces it), and explainable (every score may carry a JSON reasons blob the UI cites). On top of this sit composites (hero/portfolio/album/storytelling), the Studio + Creator Brains, the Style Engine (deriveStyle → styleAdjust auto-grade), the deterministic Reel/Story planner+renderer, the Studio AI generation engine (selections/styles/auto-edit/albums/portfolio picks), and the control-first Studio Copilot.

### Features
- **Canonical score-type registry (SCORE_TYPES)** — backend/analyzers/index.js. A single object mapping every accepted score_type to a category. technical: sharpness, blur, exposure, contrast, noise. dedup: dup_cluster, similar_cluster. vision: composition, aesthetic, face_count, eyes_open, smile, subject, scene_class. video: shake, motion, quality, speech, emotion, scene_cut, action. composite: hero, portfolio, album, storytelling, hook, story, social. recordScores silently drops any score whose score_type is not in this map. Adding a type here is all that's needed to accept it.
- **Analyzer registry (ANALYZERS)** — Metadata-only registry of 5 analyzers, each with id, where (execution tier), modelVersion, scoreTypes. technical {where:server, tech-v1}; dedup {where:server, phash-v1}; vision {where:client, vision-v1}; video {where:client, video-v1}; composite {where:server, comp-v1}. The where field lets the desktop app advertise which analyzers it fulfils; client-tier analyzers (vision/video) are surfaced as 'pending' until a desktop/cloud worker posts them. COMPOSITE_VERSION = comp-v1. Bumping a modelVersion invalidates the ledger and triggers a single re-analysis.
- **recordScores — the single canonical write path** — recordScores(workspaceId, assetId, analyzerId, modelVersion, scores, source='server'). Used identically by the server worker AND external ingestion. In one transaction: deletes only THIS analyzer's owned score_types for the asset (others untouched), inserts each valid score into ms_asset_scores (id, workspace_id, asset_id, score_type, value, group_key, model_version, source, reasons-as-JSON), then upserts the ms_asset_analysis ledger row to status='done' with model_version + source + analyzed_at. Returns count of valid scores written. modelVersion defaults to the analyzer's registry version when omitted.
- **Analyze-once ledger + needsAnalysis gate** — ms_asset_analysis: one row per (asset_id, analyzer_id) storing model_version, source (server|desktop|cloud), status (done|failed), analyzed_at. needsAnalysis(assetId, analyzerId) returns true if no row, OR status!='done', OR the row's model_version != the analyzer's CURRENT registry modelVersion. markAnalyzed(assetId, analyzerId, modelVersion, source) upserts the ledger without writing scores (used by the worker for technical+dedup).
- **Source attribution** — source travels on both ms_asset_scores rows and ms_asset_analysis ledger rows: 'server' (worker CPU), 'desktop' (ONNX runtime, default for ingestion endpoints), 'cloud' (opt-in worker), and the legacy worker uses 'ai' for the raw technical/dedup score inserts. External ingestion endpoints default source to 'desktop' if the client omits it.
- **Composites — DERIVED, transparent, tunable (computeComposites)** — computeComposites(workspaceId, assetId) reads whatever primitives exist (primitivesOf) and derives hero/portfolio/album/storytelling via a v1 formula, writing them as analyzer 'composite' at comp-v1. Normalizes raw primitives to 0..1: sharpness/240, exposure as 1-|dev|, contrast, noise, aesthetic, composition, accepts legacy 'faces' as alias for face_count, accepts legacy 'duplicate_group' as a dup signal. hero = avg(sharp,expo,contrast,aesthetic,composition)*0.85 + peopleBonus(avg(eyes,smile)*0.25 when known) + 0.05 if faces>0, then *0.85 if duplicate. portfolio = avg(aesthetic,composition,sharp,contrast) scaled down by noise. album = hero * (0.7 if dup else 1) for spread variety. storytelling = avg(composition, faces?0.7:0.4, aesthetic). Each carries a reasons[] list. Quality auto-improves once a desktop contributes face/aesthetic/scene scores; returns 0 if asset has no primitives.
- **Server-CPU vision fallback** — backend/vision-cpu.js, model_version 'vision-cpu-v1', jimp-only (no native/ONNX). computeVisionCpu(jimpImage,{faceCount}) returns composition (rule-of-thirds via edge-energy centroid), aesthetic (0.40*sharpN + 0.25*expoQ + 0.20*contrastN + 0.15*colourN), and scene_class. cpuMetrics computes luminance variance-of-Laplacian sharpness, mean/std luminance, colourfulness (Hasler-Susstrunk style), thirds. sceneClass classifies portrait/group(>=3 faces)/landscape(aspect>=1.4)/scene plus indoor/outdoor from blue+green pixel ratio, with a confidence value and reasons {label, indoor_outdoor, aspect, faces, outdoor_signal, method:cpu-heuristic, engine:server}. Written under vision-cpu-v1 so the desktop's richer vision-v1 always supersedes it (analyze-once stays pending until a desktop runs). available() gates on jimp being installed.
- **Face / smile / emotion detection** — backend/face-detect.js, optional opt-in. Requires @vladmandic/face-api + @tensorflow/tfjs-node (model weights ship inside the package under <pkg>/model; override dir via MS_FACE_MODELS). Loads tinyFaceDetector + faceExpressionNet once (lazy init). detect(jimpImage) downscales to MAX_EDGE=640, converts RGBA->RGB tensor, runs detectAllFaces (TinyFaceDetectorOptions inputSize 416, scoreThreshold 0.5) withFaceExpressions, returns {faces: count, smile: max 'happy' expression across faces, 0..1}. Disposes the input tensor. If the package isn't installed, requiring the file throws and the worker seam silently no-ops (ingest unaffected, nothing faked). Cost ~100-500ms CPU/photo at ingest. In the worker, srvFaces/srvSmile are folded into the vision recordScores as face_count/smile with reasons {engine:server}.
- **Studio Brain (workspace_brain) + Learning System** — workspace_brain table (workspace_id, key, value-JSON, confidence, source explicit|inferred, updated_at). brainGet/brainSet read/upsert. deriveBrain infers cull_keep_rate (keep/total of ms_cull_decisions, requires total>=20, confidence min(1,total/500)) and avg_delivery_count (avg gallery asset count, confidence 0.6) — source 'inferred'. logFeedback writes ms_feedback rows (entity, entity_id, action keep|reject|maybe|rate|favorite|edit|reorder|remove|publish, before/after JSON, meta) capturing every human signal for future learning; wrapped to never block UX.
- **Creator Brain (per-user)** — backend/brains.js, creator_brain table (workspace_id, user_id, key, value, confidence, updated_at). deriveCreatorBrain(workspaceId,userId) infers from that user's own ms_cull_decisions: cull_keep_rate, decisiveness (1 - maybe/total), decisions_count, and avg_rating (over rating>0). Confidence scales with sample size (total/300, ratings/200). Upserts each key.
- **Style Engine (deriveStyle)** — backend/brains.js. style_profiles table (id, workspace_id, scope workspace|creator, scope_id, profile-JSON, confidence, sample_n, updated_at; UNIQUE on workspace+scope+scope_id). deriveStyle(workspaceId, scope, scopeId) computes a 'house style' from the aesthetic-score reasons (exposure, contrast, colourfulness) and composition values of work the studio KEPT (ms_cull_decisions.decision='keep'), optionally filtered by user for creator scope, LIMIT 5000. Profile = averaged {exposure, contrast, colourfulness, composition}; confidence = min(1, n/200). Upserts the profile.
- **Recommendations** — GET /api/media/recommendations. Combines deriveCreatorBrain + deriveStyle(workspace) into advisory hints with confidence: a cull hint ('you keep ~X% — auto-flag the bottom Y% by hero score'), and style hints once sample_n>=5 ('kept work averages exposure E — flag deliveries that drift', 'house contrast ~C; suggest matching'). Returns recommendations[], creator_brain, style profile, style_confidence.
- **Style auto-apply (styleAdjust)** — backend/style-apply.js, PURE. styleAdjust(measured,target) where both are {exposure,contrast,colourfulness} 0..1. Computes a bounded, SUBTLE colour grade in the video engine's -1..1 range: each axis = clamp((target-measured)*1.4, -0.5, 0.5) → brightness(from exposure), contrast, saturation(from colourfulness). Also returns style_match (1=already on-style) = clamp(1 - meanAbsDiff*1.5, 0,1) or null if nothing comparable. hasGrade(adjust) tells whether any non-zero component is worth applying. Never an extreme change; non-destructive (grades a render, never the original).
- **Style suggestions endpoint** — GET /api/media/projects/:id/style-suggestions. Derives the workspace style profile, pulls each non-deleted asset's aesthetic reasons, runs styleAdjust per asset, returns {style target, confidence, sample_n, suggestions:[{asset_id, style_match, adjust}]} filtered to assets with a computable style_match. The reel renderer applies these automatically; the cull/edit UI can surface them.
- **Reel/Story plan (buildPlan)** — backend/reel-engine.js, deterministic planner. buildPlan(assets,target) scores each asset {hero (composite or aesthetic fallback), aesthetic, faces, scene (from scene_class reasons.label or portrait/scene), energy = aesthetic*0.5 + composition*0.2 + min(1,faces/3)*0.3}. Picks a story arc: hook = grabbiest by energy; climax = best by hero; outro = a calm/wide closer (landscape or faces==0, else calmest by energy). Body = remaining sorted by hero, grouped by scene, interleaved round-robin across scenes, capped to target-3 (target default 12, clamped 3..40). Emits segments with roles hook/build/climax/outro and a structure summary (role + count). Reads scores only, writes nothing — advisory.
- **Reel render (planToTimeline)** — backend/reel-engine.js. planToTimeline(plan,opts) is PURE: builds a 9:16/30fps/1080 Media-Studio timeline EDL. Per-role durations hook 2800 / build 2200 / climax 3000 / outro 3400 ms, default 2400; OVERLAP 350ms crossfade. Each segment → a clip (photo|video) with crossDissolve transitions between cuts (fade in/out at the ends), photos get an alternating Ken Burns push (scale 1.0→1.12, x ±0.04, y -0.02→0.03). Bakes house-style colour grade per asset when opts.styleByAsset has a grade (via styleApply.hasGrade). Adds an optional title text track (heading, 64px, weight 800, fade) and an optional music audio track (volume 0.8, fadeIn 400/fadeOut 1200, duration = full timeline). Output: {version, aspect 9:16, fps 30, quality 1080, preset (default ig_reel), tracks}.
- **Studio AI — Selections (P2)** — backend/studio-ai.js. generateSelection(project, kind, opts) over composite scores. Kinds with base weights/count-ratio/min/max: best_of (hero:1, 8%, 8..40), highlights (hero .7 + storytelling .3, 15%, 12..60), portfolio (portfolio:1, 5%, 6..30), album (album:1, 20%, 20..80), delivery (hero .5 + portfolio .3, all assets above threshold 0.32). Niche nudges added by project_type: wedding (storytelling .25, hero .1), portrait (hero .2), commercial (portfolio .25), product (portfolio .3), real_estate (portfolio .2), event (storytelling .3). Falls back to sharpness/240 when no composites. Dedup-aware: within a dup cluster keeps only the highest-scoring asset. Writes ms_selections (asset_ids, rationale {score, reasons}, params). topReasons surfaces hero.reasons or technical fallbacks.
- **Studio AI — Gallery from selection (P5)** — POST /api/studio-ai/projects/:id/gallery-from-selection. Builds a private ms_galleries draft from an existing selection_id OR a freshly generated selection by kind; inserts ms_gallery_assets in sort order. Errors if no assets ('analyze the project first'). Broadcasts ms_gallery_created.
- **Studio AI — Album drafts (P6)** — POST /api/studio-ai/projects/:id/album. Generates an 'album' selection, orders assets by capture_time (then created_at), distributes across spreads (pages/2 spreads, 1-4 images each via grid-N layouts), writes ms_albums (title, page_count from {20,30,40,60} default 30, spec {pages, spreads, source_selection}, status draft). GET/PUT album + list-by-project endpoints; PUT updates title/status/spec (and page_count from spec.pages).
- **Studio AI — Style profiles (P3)** — backend/studio-ai.js, ms_style_profiles table (manual, distinct from brains.js auto-derived style_profiles). Full CRUD: GET/POST/PUT/DELETE /api/studio-ai/styles. Params default {exposure, contrast, warmth, saturation, shadows, highlights} all 0. is_default is mutually exclusive (setting one clears others in the workspace).
- **Studio AI — Auto-edit suggestion (P4)** — POST /api/studio-ai/assets/:id/auto-edit. Derives gentle, explainable, non-destructive correction params (-1..1) from technical scores + an optional style profile: exposure pulled toward neutral (-s.exposure, capped ±0.5) + style exposure; contrast lift +0.15 if measured contrast<0.3; shadows +0.2 if underexposed; highlights -0.2 if overexposed; denoise 0.4 if noise>0.5; warmth/saturation/straighten from style. Returns suggestion + human-readable reasons + a note that the original is never modified (apply via the asset edit endpoint).
- **Studio AI — Portfolio recommendations (P13)** — GET /api/studio-ai/portfolio-picks. Returns the top 60 portfolio-scored non-deleted assets across the whole workspace ({asset_id, value, project_id}), ordered by portfolio score desc.
- **Studio Copilot (control-first AI assistant)** — backend/media-studio.js POST /api/media/copilot. Answers questions grounded in REAL DB context (per-project cull breakdown, sharpness/quality stats, duplicate groups, best/worst by quality, galleries with favs/comments, proofing sets, recent client comments, edited count; or a workspace shoot list). Requires a configured text-AI provider (ai.callLLM) else 503. Sends a system prompt forcing JSON {reply (<=~120 words), actions (max 3)} and explicitly stating it never performs actions — the photographer clicks to apply. Suggested actions are whitelisted to navigate (cull|albums|video|project), create_gallery_from_keepers, preset_keepers (preset must be in the caller-provided list). The copilot itself can change nothing; output is sanitized/clamped server-side.

### API endpoints (29)
- `POST /api/media/assets/:id/scores` — External ingestion: desktop/cloud uploads one analyzer's scores for an asset → recordScores + computeComposites; broadcasts ms_scored
- `POST /api/media/projects/:id/scores` — Batch ingestion: a whole shoot's analyzer results (items[]) from the desktop app
- `POST /api/media/projects/:id/analyze` — Recompute composites server-side from whatever primitives exist for every non-deleted asset
- `GET /api/media/projects/:id/intelligence` — Scores-out: per-asset score map for the cull UI + the pending client-tier analyzers per asset + the analyzer registry
- `GET /api/media/brain` — Get the workspace (Studio) Brain
- `PUT /api/media/brain` — Set/override a workspace_brain key (explicit, optional confidence)
- `POST /api/media/brain/derive` — Re-derive inferred Studio Brain keys (cull_keep_rate, avg_delivery_count)
- `POST /api/media/copilot` — Studio Copilot: grounded Q&A over project/workspace data returning a reply + whitelisted suggested (never executed) actions
- `GET /api/media/creator-brain` — Get the per-user Creator Brain
- `POST /api/media/creator-brain/derive` — Re-derive Creator Brain habits from the user's own cull decisions/ratings
- `GET /api/media/style-profile` — Get the derived style profile for workspace or creator scope
- `POST /api/media/style-profile/derive` — Derive/persist the house-style profile from kept work (workspace|creator scope)
- `GET /api/media/recommendations` — Advisory hints (cull + style) from creator brain + style profile, with confidence
- `GET /api/media/projects/:id/style-suggestions` — Per-asset style_match + subtle grade (styleAdjust) toward the house style
- `POST /api/media/projects/:id/reel-plan` — Build an advisory story-arc reel shot list (hook/build/climax/outro) from scores; writes nothing
- `POST /api/media/projects/:id/reel-render` — Build plan → timeline → enqueue a real video export job (ms_timelines + ms_video_exports + ms_jobs); 202 with ids to poll
- `POST /api/studio-ai/projects/:id/selections` — Generate a named selection (best_of/highlights/portfolio/album/delivery)
- `GET /api/studio-ai/projects/:id/selections` — List a project's saved selections
- `POST /api/studio-ai/projects/:id/gallery-from-selection` — Build a draft private gallery from a selection or kind
- `POST /api/studio-ai/projects/:id/album` — Generate a story-ordered, dup-safe album draft (spreads)
- `GET /api/studio-ai/albums/:id` — Get an album draft with spec
- `PUT /api/studio-ai/albums/:id` — Update album title/status/spec (and page_count)
- `GET /api/studio-ai/projects/:id/albums` — List a project's album drafts
- `GET /api/studio-ai/portfolio-picks` — Top 60 portfolio-scored assets across the workspace
- `GET /api/studio-ai/styles` — List manual style profiles
- `POST /api/studio-ai/styles` — Create a manual style profile
- `PUT /api/studio-ai/styles/:id` — Update a manual style profile (default is mutually exclusive)
- `DELETE /api/studio-ai/styles/:id` — Delete a manual style profile
- `POST /api/studio-ai/assets/:id/auto-edit` — Suggest non-destructive edit params from technical scores + optional style

### Data model
- **ms_asset_scores** — The single advisory score store consumed by all business logic (extended here with a reasons JSON column for explainability) — _cols:_ id, workspace_id, asset_id, score_type, value, group_key, model_version, source, reasons
- **ms_asset_analysis** — Analyze-once idempotency ledger: one row per (asset, analyzer) recording the model_version that ran — _cols:_ asset_id, analyzer_id (PK), model_version, source (server|desktop|cloud), status (done|failed), analyzed_at
- **ms_feedback** — Learning System: captures every human signal (keep/reject/rate/edit/reorder/etc.) for future AI training — _cols:_ id, workspace_id, user_id, entity, entity_id, action, before, after, meta, created_at
- **workspace_brain** — Studio Brain: the studio's learned preferences, explicit + inferred — _cols:_ workspace_id, key (PK), value-JSON, confidence, source (explicit|inferred), updated_at
- **creator_brain** — Per-user habits inferred from that user's own cull/rating behavior — _cols:_ workspace_id, user_id, key (PK), value, confidence, updated_at
- **style_profiles** — Auto-derived house-style profile (avg exposure/contrast/colourfulness/composition of kept work) per workspace or creator scope — _cols:_ id, workspace_id, scope, scope_id (UNIQUE on ws+scope+scope_id), profile-JSON, confidence, sample_n, updated_at
- **ms_selections** — Saved AI selections (best_of/highlights/portfolio/album/delivery) with rationale — _cols:_ id, workspace_id, project_id, kind, asset_ids-JSON, rationale-JSON, params-JSON, created_by, created_at
- **ms_style_profiles** — Manual, user-managed style/grade presets (distinct from the auto-derived style_profiles) — _cols:_ id, workspace_id, name, params-JSON, is_default, created_at
- **ms_albums** — AI album drafts: page count + spread spec — _cols:_ id, workspace_id, project_id, title, page_count, spec-JSON, status (draft), created_at
- **ms_timelines** — Reel render output: the generated timeline EDL document (source 'ai_reel') — _cols:_ id, workspace_id, project_id, name, source, aspect_ratio, width, height, fps, duration_ms, document-JSON, status, created_by
- **ms_video_exports** — Reel render export record enqueued for the video engine — _cols:_ id, workspace_id, timeline_id, project_id, preset, width, height, fps, quality, created_by
- **ms_jobs** — Background job queue; reel-render enqueues a video_export job — _cols:_ id, workspace_id, type, project_id, status, payload-JSON

### Rules, constraints & guarantees
- Advisory-only invariant: this layer writes ms_asset_scores, brains, style profiles, selections, draft galleries/albums, and reel timelines/exports — but NEVER ms_cull_decisions or auto-applied edits to originals; a human approves every draft.
- Single store: business logic only ever reads ms_asset_scores; it never knows HOW a score was produced. All producers funnel through recordScores.
- Analyze-once: needsAnalysis returns true only when there is no ledger row, status!='done', or the stored model_version differs from the analyzer's CURRENT registry modelVersion; otherwise the analyzer is skipped.
- recordScores replaces ONLY the owning analyzer's score_types for an asset (others untouched) inside one transaction, and updates the ledger atomically.
- Score-type validation: recordScores silently drops any score whose score_type is not in SCORE_TYPES.
- Model versioning: server technical=tech-v1, dedup=phash-v1, composite=comp-v1; server vision fallback writes vision-cpu-v1 so the desktop's vision-v1 always supersedes it (keeping analyze-once 'pending' until a desktop runs).
- Composites are derived by a transparent, tunable v1 formula from whatever primitives exist; they return 0 / improve automatically as richer primitives (face/aesthetic/scene) arrive.
- Face/smile detection is opt-in: if @vladmandic/face-api is absent, the worker seam silently no-ops and ingest proceeds with no face scores — nothing is faked.
- All inference is over real captured behavior (ms_cull_decisions, ms_asset_scores); every brain/style value carries a confidence that scales with sample size.
- Style auto-grade is always SUBTLE and bounded: per-axis grade capped to ±0.5 in the -1..1 range; non-destructive (grades the render, never the original).
- Reel plan reads scores and writes nothing (advisory); reel-render is a deliberate human action that writes a timeline + export job and errors if there are no analyzed assets.
- Studio Copilot is control-first: it can change nothing; suggested actions are whitelisted server-side (navigate targets cull/albums/video/project; preset_keepers preset must be in the caller-provided list) and capped at 3.
- Selection generation is dedup-aware: within a duplicate cluster only the highest-scoring asset survives.
- Auto-edit corrections are non-destructive normalized params (-1..1) the renderer maps to ops; the original is never modified.
- reel target_count clamped 3..40 (default 12); album pages restricted to {20,30,40,60} (default 30); manual style is_default is mutually exclusive per workspace.
- Every helper is wrapped to never break ingest/UX: logFeedback, deriveBrain, deriveStyle, face detection, and the vision fallback all swallow errors.

### Automations (crons / jobs / triggers / auto-behaviors)
- At photo ingest, media-worker computes technical primitives (sharpness/blur/exposure/clipping/quality/high_clip/shadow_clip, source 'ai'), perceptual-hash duplicate grouping within the project, optional server face/smile, then writes the server-CPU vision fallback (composition/aesthetic/scene_class + folded face_count/smile), marks technical+dedup analyzed in the ledger, and computes composites — all best-effort and non-blocking.
- Both score-ingestion endpoints (single + batch) auto-run computeComposites after recording and broadcast ms_scored over the workspace socket.
- reel-render auto-enqueues a video_export job (ms_jobs type=video_export) after writing the timeline + export rows; the existing video engine renders it; an audit log 'reel_render' is written.
- reel-render auto-applies the learned house style by default (auto_style on unless auto_style:false): it loads the workspace style profile and grades each clip via styleAdjust; skipped silently if no profile exists.
- GET /api/media/recommendations re-derives Creator Brain + workspace style on each call; the recommendations endpoint and style-suggestions endpoint derive style on demand.
- brain/derive and creator-brain/derive endpoints recompute inferred preferences from accumulated cull/rating behavior on request.
- ms_selection / ms_gallery_created / ms_scored events are broadcast to the workspace to refresh UI.

### AI behaviors
- Whole module is advisory scoring/suggestion only — control-first: it produces scores, rationale, drafts, and suggested actions, but a human applies every consequential change.
- Composite scoring (hero/portfolio/album/storytelling) via a transparent, explainable, tunable formula with per-score reasons[] the UI can cite.
- Server-CPU heuristic vision (sharpness/aesthetic/composition/scene class) as a no-ONNX fallback so workspaces without the desktop engine still get vision primitives.
- Optional face/smile/emotion detection (TinyFaceDetector + faceExpressionNet) producing face_count + max-happy smile, opt-in and gracefully absent.
- Studio Brain + Creator Brain: inferred preferences (keep-rate, decisiveness, avg rating, delivery size) with confidence weighting, never auto-acted.
- Style Engine: learns a 'house style' (avg exposure/contrast/colourfulness/composition) from KEPT work and produces bounded, subtle auto-grade suggestions; reel renderer opts in to bake them onto the render only.
- Studio AI selection/album/gallery/portfolio generation ranks by composite scores with niche-aware weights, dedup-aware, writing only drafts.
- Auto-edit suggestion: gentle non-destructive correction params from technical scores + optional style profile, with human-readable reasons; original never touched.
- Reel/story planner: deterministic story-arc construction (hook/build/climax/outro) ranked by hero/aesthetic/energy and grouped by scene; advisory plan reviewed before render.
- Studio Copilot: LLM grounded strictly in real DB context, JSON-constrained, with a server-side whitelist of suggestible (never executed) actions — the copilot can change nothing.
- Source attribution + model versioning make every score traceable to its producer (server CPU now, desktop ONNX / opt-in cloud later) without changing any downstream consumer.

### Integrations
- jimp — server-side CPU image decoding/metrics for the vision fallback (optional; fallback disabled if absent)
- @vladmandic/face-api + @tensorflow/tfjs-node (optional tfjs-node speed-up) — opt-in server face/smile/expression detection; weights bundled in the package, dir overridable via MS_FACE_MODELS
- Text-AI provider chain (backend/ai-engine.js, ai.callLLM / ai.extractJSON) — powers Studio Copilot; returns 503 if no provider key is configured
- backend/video-engine.js — sanitizeTimeline, EXPORT_PRESETS (default ig_reel), QUALITIES, dimsFor; consumed by the reel renderer to produce a real export
- Desktop Local AI Engine (ONNX runtime) and opt-in cloud worker — external analyzers that POST scores to the ingestion endpoints (source 'desktop'/'cloud'); the analyzer registry's where:'client' tier advertises which they fulfil
- Workspace WebSocket broadcast (broadcastToWorkspace) — ms_scored / ms_selection / ms_gallery_created events
- Audit log (logAudit) — records reel_render and edit_reset actions

---

## 6. Video Studio (Media Studio — Video / Reel Editor)

A non-destructive, EDL-based video/reel editor inside Media Studio. A timeline is ONE JSON document (tracks → clips → keyframes); editing is just saving JSON. The same creative-recipe engine powers "Apply template" and "AI Reel Draft". Export compiles the EDL to an ffmpeg render graph (buildExportCommand is a PURE function, unit-testable without ffmpeg) run as a background worker job into an MP4. Core guarantees: control-first (nothing renders/publishes/delivers without an explicit user save/export/send; AI is advisory CV-only, never auto-exports), graceful degradation (missing ffmpeg/ffprobe binary, missing media files, and missing fonts all degrade — failed export with a clear message or gray placeholders — and NEVER crash the host), and full editability (templates and AI drafts produce normal editable timelines).

### Features
- **Timeline EDL document model** — A timeline = { version:1, aspect, width, height, fps, duration, safeArea, tracks[] }. Up to 12 tracks; track.type ∈ video|audio|text|overlay; up to 400 clips/track. A 'video' track holds clips whose own kind is video OR photo. Tracks sorted by clip.start. Overall duration = max clip.end. Stored as JSON in ms_timelines.document; everything passes through sanitizeTimeline on read of input and on save.
- **Clip kinds & properties (video/photo)** — Per-clip: id, kind, start, duration, end, assetId, in/out (source trim, 0..36e5ms), speed (0.25–4), reverse (bool), freeze (hold the in-point frame for whole clip), freezeAtMs, transform {x/y ∈ -1..1, scale 0.1–8, rotation -360..360, flipH, flipV, opacity 0..1, fit cover|contain|fill}, kenBurns, motionKeys, opacityKeys, transitionIn/Out, effects[], lut, color{}.
- **Ken Burns motion** — Per still/photo clip kenBurns {fromScale/toScale 1–3, fromX/toX/fromY/toY -1..1}. Defaults toScale 1.12. Pack presets via kenBurnsFor(motion,i): zoomIn (1→1.16), zoomOut (1.16→1), pan (1.12 fixed scale, x -0.05→0.05), alt (alternates per index), default (1→1.1). Rendered with ffmpeg scale 2x then zoompan.
- **Motion keyframes (scale+position)** — clip.motionKeys: up to 8 points {t 0..1, scale 1–3, x -1..1, y -1..1}, sorted by t, requires ≥2 to apply. Override Ken Burns when present. Rendered as piecewise-linear (pwl) zoompan z/x/y expressions over frame count.
- **Opacity keyframes** — clip.opacityKeys: up to 8 points {t 0..1, v 0..1}, ≥2 to apply. Composited via alpha at render using format=yuva420p + geq alpha = clip(255*pwl,0,255). Takes precedence over alpha-transition fades when present.
- **Transitions** — TRANSITIONS = none, fade, crossDissolve, slide, push, zoom, blur, dipToBlack, dipToWhite. Per-clip transitionIn/transitionOut = {type, duration 100–2000ms, default 400}. Render split: dipToBlack/dipToWhite are opaque fade=t=in/out colour fades (color=white for dipToWhite); fade & crossDissolve are ALPHA fades (fade alpha=1) so clips crossfade on timeline overlap. slide/push/zoom/blur are accepted/validated in the EDL but have no dedicated ffmpeg render branch (treated as non-alpha, non-dip).
- **Effects** — EFFECTS = filmGrain, letterbox, lightLeak, glow, pan, zoom, shake, blur, softFocus, vignette, kenBurns (max 6/clip). Render via fxFilter: vignette=PI/4, filmGrain=noise alls=16:allf=t+u, blur=gblur sigma=12, softFocus=gblur sigma=3, letterbox=two drawbox bars at top/bottom 11% black. glow = split + gblur sigma=18 + blend screen opacity 0.45 (post subgraph). lightLeak = gradients orange→black blended screen opacity 0.32 (post subgraph). pan/zoom/shake map to Ken Burns (no standalone filter).
- **LUTs (the look library)** — 8 built-in LUTs (wedding_warm, wedding_luxury, cinematic_film, travel_pop, real_estate_lux, restaurant_prem, corporate_clean, social_pop), each a small grade param set {temp,tint,sat,contrast,lift}. Generates a real 17³ .cube text file applied via ffmpeg lut3d. cssFor() gives a CSS-filter approximation for instant editor preview (contrast/saturate/brightness/sepia/hue-rotate). Plus per-workspace custom .cube upload.
- **Per-clip colour grade** — clip.color {brightness, contrast, saturation, temperature, tint all -1..1, default 0}. Rendered as eq=brightness(*0.4):contrast(1+*0.5):saturation(1+x) + colorbalance for temperature/tint. Grade order per clip: color → LUT (lut3d) → effects.
- **Text overlays + animations** — Text clips on text tracks: text {content ≤280 chars, type heading|subheading|caption|lowerThird|cta, font, size 8–240 (default 48), weight 100–900 (default 700), color #hex (default #fff), opacity, align left|center|right, letterSpacing -10..40, animation}. TEXT_ANIM = none, fade, slide, scale, typewriter, pop, zoom (default fade). transform {x,y default 0.35, scale 0.1–4, opacity}. Rendered via drawtext: positioned by align+transform, size scaled by H/1080, fade/slide animations via alpha expr (typewriter/pop/zoom/scale rendered as fade), caption/lowerThird/cta get a translucent black box behind text. drawtext only emitted if a usable font file is found.
- **Audio / music** — Audio clips: assetId or trackId (built-in music id), in (trim-in), audio {volume 0–2 default 1, mute, fadeIn 0–10000ms, fadeOut 0–10000ms default 600}. Render: only the FIRST audio clip of the FIRST audio track is mixed (volume + afade in/out + atrim to total), encoded AAC 192k with -shortest. Skipped if muted or file missing. Project audio assets exposed to a music picker via /audio.
- **Export presets** — EXPORT_PRESETS: ig_reel (9:16, safe reel), tiktok (9:16, safe tiktok), yt_shorts (9:16, reel), fb_reel (9:16, reel), ig_feed (4:5, feed), square (1:1, feed), yt_16x9 (16:9), website (16:9), cinematic (21:9), custom (keeps timeline aspect). Named presets force their aspect; custom keeps the timeline's. Default preset ig_reel.
- **Aspects & qualities** — ASPECTS: 16:9, 9:16, 1:1, 4:5, 21:9, 3:2 (default 9:16). QUALITIES (short-edge): 720, 1080 (default), 1440, 2160. dimsFor(aspect,quality) computes even WxH from short edge. fps ∈ 24/25/30/60 (default 30).
- **buildExportCommand (ffmpeg render graph)** — PURE function EDL→ffmpeg argv (no spawn/fs). First video track is the spine; clips normalized (trim→speed→scale-cover-crop→fps→grade→effects→transitions→alpha), shifted to absolute timeline position (setpts+start/TB), then overlaid onto a full-length black base canvas (overlay eof_action=pass enable=between(t,start,end)) honoring gaps & overlaps. Photos loop (-loop 1) with Ken Burns/motionKeys; missing files become a gray (color=0x111114) placeholder; freeze uses loop=-1+setpts; normal video uses -ss/-to + optional setpts speed + reverse. Text drawtext atoms layered on the composite. Output libx264, preset (default medium), crf (default 20), pix_fmt yuv420p, +faststart. Returns {args, segments, hasAudio, missing, note}.
- **Creative packs / templates (12)** — PACKS: wedding_luxury, wedding_emotional, wedding_cinematic, realestate_luxury, restaurant_premium, travel_story, corporate_brand, fitness_energy, fashion_campaign, education_showcase, agency_portfolio, social_premium. Each = {name, category, style, mood, aspect, lut, slotMs pacing, motion, transition+transitionMs, effects[], palette[2], titleText}. buildTimeline fills slots with media (cycling if too few) to hit an EXACT duration ∈ 15/30/45/60s (default 60), slotCount clamped 3–80, last clip absorbs rounding. Adds transitionIn from clip 2 on, applies LUT+effects, Ken Burns for photos, and an optional fading title card (heading, 18% of total ≤2800ms, starts at 200ms).
- **AI Reel Drafts** — Score-driven, pack-powered, control-first. rankMedia ranks project media by CV quality + cull (keep +0.6, rating*0.08, sharpness<120 -0.12, faces/smiles weighted by category), drops rejects, dedupes by duplicate_group; selectForStyle orders chronologically for story categories (Wedding/Travel/Real Estate/Education) else best-first; buildDraft pours it into the matching pack's buildTimeline. REC maps project_type→recommended packs (wedding/event/portrait/real_estate/commercial/product). FACE_WEIGHT_BY_CAT 0–0.45. signatureOf = sha1 of sorted media ids (16 chars) → ai_signature for staleness.
- **AI draft staleness & refresh** — New media in a project flags existing ai_draft timelines ai_stale=1 (UPDATE ms_timelines ... source='ai_draft'); never auto-rebuilt. POST .../refresh rebuilds the draft from current media at the same style/aspect/duration and clears ai_stale.
- **Manual clip selection (legacy in/out marks)** — Separate from the EDL timeline: ms_video_clips lets the editor mark named in/out segments on a source asset (in_ms/out_ms, label ≤200, sort_order). Per-asset CRUD + reorder. 'NO auto-reel — the editor sets in/out.'
- **Video probe / poster / proxy** — On ingest of a video asset, video_probe job runs ffprobe → parseFfprobe fills v_duration_ms/v_width/v_height/v_fps/v_codec/v_has_audio. If width>0 it enqueues video_poster (single frame at 25% of duration, scale 640) and video_proxy (720p H.264 crf28 + AAC 128k +faststart for smooth browser scrubbing). Client can also PUT /assets/:id/meta to set duration/width/height read from the browser <video>.
- **Custom LUT upload** — POST .../video/luts accepts a .cube file (≤8MB, multer disk storage), validated by checking the head contains LUT_3D_SIZE (else deletes file + 400). Stored under media/luts/custom, recorded in ms_luts (category Custom). Deletable; built-in + custom merged in allLuts().
- **Presets/capabilities endpoint** — GET /video/presets returns aspects, qualities, presets, transitions, effects, textTypes, textAnimations, fontFamilies (sans/serif/mono), detected fonts, all LUTs, and ffmpeg/ffprobe availability — drives the editor's aspect switcher, export dialog, and capability gating.
- **Font detection** — detectFonts() (cached) probes candidate paths for sans/serif/mono (DejaVu/Liberation on Linux, Arial/Times/Consolas on Windows, Arial/Times on macOS; overridable via MS_FONT_SANS/SERIF/MONO env). Text only renders if a usable font file exists.

### API endpoints (25)
- `GET /api/media/projects/:id/videos` — List a project's video assets (with clip_count)
- `PUT /api/media/assets/:id/meta` — Set client-read video meta (duration_ms/width/height)
- `GET /api/media/assets/:id/clips` — List manual in/out clip marks on a source video asset
- `PUT /api/media/assets/:id/clips/order` — Reorder an asset's manual clips (clip_ids[])
- `POST /api/media/assets/:id/clips` — Create a manual in/out clip mark (validates out>in)
- `PUT /api/media/clips/:clipId` — Update a manual clip (label / in_ms / out_ms)
- `DELETE /api/media/clips/:clipId` — Delete a manual clip mark
- `GET /api/media/video/presets` — Editor capabilities: aspects/qualities/presets/transitions/effects/text/fonts/luts/ffmpeg
- `GET /api/media/video/luts` — List built-in + custom LUTs
- `POST /api/media/video/luts` — Upload a custom .cube LUT (validated, ≤8MB)
- `DELETE /api/media/video/luts/:lutId` — Delete a custom LUT (removes .cube file)
- `GET /api/media/video/templates` — List creative-pack templates (with LUT css hint)
- `POST /api/media/projects/:id/templates/:templateId/apply` — Apply a pack → create an editable timeline filled with media
- `GET /api/media/projects/:id/ai-drafts/styles` — List AI draft styles + recommended for project type
- `POST /api/media/projects/:id/ai-drafts` — Generate a score-driven AI reel draft timeline
- `POST /api/media/timelines/:id/refresh` — Rebuild an AI draft from current media; clear stale flag
- `GET /api/media/projects/:id/audio` — List project audio assets for the music picker
- `GET /api/media/projects/:id/timelines` — List timelines for a project
- `POST /api/media/projects/:id/timelines` — Create a manual timeline (sanitized document)
- `GET /api/media/timelines/:id` — Get one timeline (parsed document)
- `PUT /api/media/timelines/:id` — Save/update a timeline (re-sanitizes document)
- `DELETE /api/media/timelines/:id` — Delete a timeline + its exports
- `POST /api/media/timelines/:id/export` — Enqueue an MP4 render job (preset/quality) → export row
- `GET /api/media/timelines/:id/exports` — List a timeline's exports (≤20, with urls)
- `GET /api/media/video/exports/:exportId` — Poll one video export status/url

### Data model
- **ms_timelines** — The EDL document per reel (single source of truth) — _cols:_ id, workspace_id, project_id, name, source(manual|template|ai_draft), template_id, aspect_ratio, width, height, fps, duration_ms, document(JSON EDL), status(draft|ready), ai_style, ai_signature, ai_stale, created_by, created_at, updated_at
- **ms_video_exports** — MP4 render jobs/results per timeline — _cols:_ id, workspace_id, timeline_id, project_id, preset, width, height, fps, quality, status(pending|rendering|done|failed), progress, storage_key, size_bytes, error_message, created_by, created_at, finished_at
- **ms_video_clips** — Manual in/out clip marks on a source video asset (legacy selection) — _cols:_ id, workspace_id, project_id, asset_id, label, in_ms, out_ms, sort_order, created_by, created_at (idx on asset_id)
- **ms_luts** — Custom uploaded .cube LUTs per workspace — _cols:_ id, workspace_id, name, category, cube_path, thumbnail_url, created_by, created_at
- **ms_audio_tracks** — Built-in (workspace_id NULL) + custom music library — _cols:_ id, workspace_id, category, title, artist, storage_key, duration_ms, license, created_by, created_at
- **ms_video_templates** — Per-workspace stored video templates (schema present; built-in packs are code-defined) — _cols:_ id, workspace_id, category, name, thumbnail_url, aspect_ratios(JSON), document(JSON), created_by, created_at
- **ms_assets (video columns)** — Video metadata + proxy/poster added to the shared asset table — _cols:_ v_duration_ms, v_width, v_height, v_fps(REAL), v_codec, v_has_audio, proxy_url, poster_url
- **ms_jobs (video job types)** — Background queue carrying video_probe/video_poster/video_proxy/video_export — _cols:_ id, workspace_id, type, asset_id, project_id, status, payload(JSON), lease_until

### Rules, constraints & guarantees
- sanitizeTimeline whitelists everything, clamps all numerics, drops malformed clips, recomputes per-track sort + overall duration; applied on create, save, template-apply, ai-draft and refresh.
- Limits: ≤12 tracks, ≤400 clips/track, ≤6 effects/clip, ≤8 motionKeys, ≤8 opacityKeys, text content ≤280 chars, clip duration clamped 10..600000ms (default 3000), start 0..36e5ms.
- Numeric clamps: speed 0.25–4, transform scale 0.1–8, rotation ±360, opacity 0–1, transform x/y ±1, kenBurns scale 1–3, motion scale 1–3, text size 8–240, weight 100–900, letterSpacing -10..40, color params ±1, audio volume 0–2, fades 0–10000ms, transition duration 100–2000ms.
- motionKeys/opacityKeys require ≥2 points to take effect; both sorted by t.
- Manual clip create/update require out_ms > in_ms (else 400).
- Export: preset must be a known EXPORT_PRESETS key (else falls back to ig_reel); quality must be a known QUALITIES key (else 1080). Named presets force their aspect; custom keeps the timeline aspect.
- Export fails with a clear message if FFmpeg is not installed, and 'Add at least one clip before exporting.' for an empty spine.
- AI drafts require ≥2 usable ranked media items (else 400); rejects excluded, duplicate groups deduped to one shot.
- refresh only works on source='ai_draft' timelines (else 400).
- Custom LUT must contain LUT_3D_SIZE in its head or it is rejected and the file deleted; ≤8MB.
- All timeline/clip/export/LUT routes are workspace-scoped (auth) and 404 on cross-workspace ids; delete timeline cascades its exports.
- Control-first invariant: nothing renders, publishes, or delivers without an explicit user action (save/export/send); AI never exports or delivers.
- Graceful degradation: missing ffmpeg/ffprobe → jobs skip/fail cleanly; missing media file → gray placeholder in render; missing font → text overlay omitted; LUT/asset path resolution failures are swallowed. A missing binary must never crash the host.
- buildExportCommand is a pure function (no spawn, no fs) so the render graph is unit-testable without ffmpeg.
- Render audio mixes only the first audio clip of the first audio track; only the first video track is the render spine.
- Drawtext user text escaped (backslash/colon/percent, smart-quote apostrophes, newlines→space, ≤200 chars); file paths ff-escaped for filtergraph (Windows drive colons).
- Apply-template media capped at 60 explicit asset_ids or auto-pick 40 (keepers first, then capture order); pack slotCount clamped 3–80; exact target duration via last-clip rounding absorption.

### Automations (crons / jobs / triggers / auto-behaviors)
- On new project media upload, existing AI draft timelines for that project are flagged ai_stale=1 (advisory 'refreshable' badge; never auto-rebuilt).
- Video ingest enqueues video_probe (ffprobe metadata); if it detects a real video stream it auto-enqueues video_poster and video_proxy.
- video_poster job: extracts a single frame at 25% of duration, scales to 640px, saves as <asset>-poster.jpg, updates poster_url, broadcasts ms_asset_processed.
- video_proxy job: renders a 720p H.264 (crf28) + AAC proxy for browser scrubbing, updates proxy_url, broadcasts ms_asset_processed.
- timeline export enqueues a video_export ms_jobs row; worker compiles the EDL via buildExportCommand, runs ffmpeg with -progress pipe, updates ms_video_exports status/progress (pending→rendering→done/failed) and broadcasts ms_video_export SSE events (status/progress/url) to the workspace.
- On R2/remote storage, the worker pre-localizes every referenced asset's render variant (photos→web, video→original) to temp files before rendering and pushes the finished MP4 to the bucket.
- Built-in LUT .cube files are auto-generated on disk on first export (ensureCubeFiles).
- Job queue has a 10-minute lease + reaper that returns orphaned (crashed-worker) running jobs to pending.
- Media events mirrored onto the CRM lead activity_timeline (integration seam).

### AI behaviors
- AI Reel Drafts are advisory CV-only: media ranked by on-device/server quality + sharpness + cull keep/reject/rating + faces/smile scores (read from ms_asset_scores), poured into a matching creative pack. No LLM key required.
- Control-first guarantee: AI drafts are normal editable timelines; the AI never exports, publishes, or delivers. Every AI output is editable before any render.
- Face/smile weighting is category-aware (FACE_WEIGHT_BY_CAT, e.g. Wedding 0.45 … Real Estate 0).
- Story categories (Wedding/Travel/Real Estate/Education) order media chronologically; others best-score-first.
- Duplicate groups collapsed to a single best shot; rejected media excluded.
- Project-type → recommended-pack mapping suggests the primary AI draft (first = primary).
- ai_signature (sha1 of sorted media ids) tracks the source media set so drafts can be flagged stale and refreshed on demand, never silently rebuilt.
- The Analyzer/score source is abstracted: business logic only reads ms_asset_scores, so server-CPU now vs desktop ONNX later is invisible.

### Integrations
- FFmpeg / FFprobe (system binaries, FFMPEG_PATH/FFPROBE_PATH env) — probe, poster, proxy, and the final MP4 render; presence detected & cached, all video work gated on it.
- Cloudflare R2 / remote object storage — render-variant localization to temp files for ffmpeg, and upload of finished MP4 exports + poster/proxy variants (publicUrl / presigned download).
- System fonts (DejaVu/Liberation/Arial/Times/Consolas; MS_FONT_SANS/SERIF/MONO env) for drawtext text overlays.
- SSE / workspace broadcast (broadcastToWorkspace) — ms_video_export render progress and ms_asset_processed poster/proxy ready events.
- CRM activity_timeline — media events mirrored onto the lead timeline.
- .cube LUT files — generated on disk from built-in grade params and applied via ffmpeg lut3d; custom .cube upload supported.

---

## 7. Contracts Studio

A first-class, client-centric document module for proposals, contracts, quotes, NDAs, SOWs, retainers and agreements — built on a block-based editor, interactive client-selectable pricing, multi-party e-signature with a full audit trail, and deep CRM integration. It owns only the cs_* tables and touches no existing table/route except reading leads/company_settings/workspace_members and writing invoices/ms_projects/leads via signing automations. Core guarantees: token is the only capability for the public portal; every meaningful action is recorded as an immutable cs_event; signing produces an SHA-256 integrity hash plus a generated PDF with a Certificate of Completion; automations are isolated so any single failure never aborts the signing flow; sends are gated by plan limits.

### Features
- **Block-based document model** — Documents store a JSON array of editor blocks. Block types referenced/rendered: heading (text, level 1|2), text, callout (emoji+text), divider, pricing_table (currency + rows of {name,desc,price}), package (currency, selectable flag, packages[] with name/price/features[]/featured), addons (currency, items[] with label/price/on), timeline (items[] title/desc), checklist (items[] text), faq (items[] q/a), testimonial (quote/author), custom_section (title+text, rendered in PDF/text but not AI-emittable), and signature (label). AI may only emit a whitelisted subset (AI_BLOCK_TYPES): heading, text, callout, divider, pricing_table, package, addons, timeline, checklist, faq, testimonial, signature.
- **Document types** — type field supports contract|proposal|quote|nda|sow|retainer|agreement|hybrid. Default is 'contract'. Type can be inherited from a chosen industry pack or template.
- **Themes** — Three themes only: monochrome (default), editorial, executive. Theme is validated on create and update — any other value is rejected/ignored and falls back to monochrome.
- **Industry packs (curated starting points)** — Four hard-coded PACKS so the studio is never blank: wedding-proposal (Photography proposal, with selectable packages Essential/Signature/Luxe, add-ons, timeline, faq, signature), portrait-agreement (Photography contract), commercial-sow (Commercial SOW), and nda (General mutual NDA). GET /api/cs/packs returns metadata only (id,type,industry,title,description,emoji). Packs can seed a new document or a bulk send and carry their own type.
- **Workspace templates** — Reusable per-workspace templates (cs_templates) with type/industry/title/blocks. Create/list/get/delete. New documents and bulk sends can be seeded from a template's blocks (and bulk send also inherits template type/title).
- **Clause library** — Per-workspace reusable clauses (cs_clauses) with title (max 160 chars) + body. Full CRUD: list (ordered by title), create, update (partial), delete.
- **E-signature flow** — Public signing requires consent checkbox, a typed full name (max 120 chars), and signature_data (drawn signature, expected data:image base64). Signs the next pending signer by sign_order. Captures IP, user-agent, and signed timestamp. Computes SHA-256 doc_hash over id::blocks::typed_name::signature_data::timestamp. Status becomes 'signed' if signers remain, 'completed' when all signed. On full completion runs automations, generates a signed PDF, notifies workspace, and sends a WhatsApp confirmation to the lead.
- **Multi-party / sequential signing** — Signers (cs_signers) have role client|company|witness|cosigner, sign_order, and mode sequential|parallel. Signing always targets the lowest-order pending signer. A client signer is auto-seeded from the linked lead on document creation, on send (if none exist), and on bulk send. Signers can be added (default role cosigner, auto-incremented sign_order), updated, and deleted via authed routes.
- **Decline flow** — Public decline route sets status to 'declined', records a 'declined' event with optional reason, IP and UA, and broadcasts. Blocked if already signed/completed.
- **Audit trail & events** — cs_events logs created, sent, viewed, block_viewed, signed, approved/rejected, approval_requested, reminded, version_restored, ai_assist, automation, automation_error, file_uploaded, client_question, time_on_page, and declined — with actor, IP, user-agent and JSON meta. Surfaced in the document detail view and embedded into the PDF audit trail.
- **Signed PDF + Certificate of Completion** — On full completion, pdfkit renders the document: optional workspace letterhead image, title, type+completion timestamp, an attached-upload note if present, all blocks, a Signatures page (per signed signer: typed name, role, signed-at, IP, embedded signature image), and a Certificate of Completion page (document ID, version, SHA-256 integrity hash, full chronological audit trail). Saved as signed-<id>.pdf under uploads/cs and its URL stored in settings.signed_pdf. Best-effort (failure does not block signing).
- **Client Vault** — GET /api/cs/vault groups every workspace document by linked lead (clients with name/phone/email), listing each client's documents, a signed_count, and total_value (sum of signed/completed totals). Unlinked docs grouped under 'No client linked'. Sorted by document count desc.
- **AI assist / draft** — POST /api/cs/ai/assist (requires ai-engine). Actions: draft (generate 8–14 content blocks as JSON for a given type+brief, must end with signature block; output filtered to whitelisted block types with valid data objects), improve (rewrite supplied text), explain (plain-language clause explanation), summarize (3–5 bullets for the owner), risks (flag missing/risky clauses, ends with literal line 'Not legal advice.'). System prompt enforces a not-a-lawyer caveat and forbids inventing legal guarantees. Records ai_assist event when tied to a document.
- **Client Q&A (public)** — POST /api/cs/public/:token/ask — grounded plain-language answers (1–3 sentences) drawn ONLY from the document text; instructed to defer to the sender if not answerable. Question capped at 500 chars. Records a client_question event. Requires ai-engine.
- **Sending (WhatsApp + email)** — Authed send generates/reuses a public token, flips draft→sent, sets sent_at, optionally sets/clears expiry, snapshots a version, advances working version, ensures a client signer, then delivers the signing link over chosen channels (default whatsapp). WhatsApp via sendClientMessage, email via sendEmail (styled HTML button + plaintext). Delivery status per channel reported as sent/failed/no_phone/no_email.
- **Bulk send** — POST /api/cs/bulk-send creates and immediately sends one template/pack to many leads in a loop: each gets its own document (status 'sent', fresh token, sent_at), an auto-seeded client signer, a 'sent' event (meta bulk:true), and delivery over whatsapp/email (default both). Skips leads not found. Returns sent count + per-lead results.
- **Manual & automatic reminders** — Manual remind route re-delivers the signing link to pending signers (or the first signer if none pending) over chosen channels (default whatsapp); blocked unless a token exists and the doc isn't signed/completed/declined/expired. Auto-reminder sweep (opt-in per document via settings.auto_remind) runs daily: respects every_days (min 1, default 3), max sends (min 1, default 2, counted from auto reminded events), channels (default both), and timing since last reminder or sent_at. Records 'reminded' events and adds contact history.
- **Expiry** — Documents have optional expires_at, set on send via expire_days (>0 sets, ==0 clears). Public viewer returns HTTP 410 for an expired link unless already signed/completed. A daily cron (08:00) flips sent/viewed docs past expires_at to 'expired'.
- **Public client signing experience** — Tokened, no-auth portal. GET /api/cs/public/:token returns title/type/theme/blocks/settings/totals/status/signers and an effective letterhead (workspace letterhead unless settings.letterhead===false). First view flips sent→viewed, stamps viewed_at, records a 'viewed' event and broadcasts. Returns 404 for voided/missing, 410 for expired. Supports sign, decline, ask, and a tracking beacon.
- **Totals / pricing engine** — selectionToInvoice flattens the client's actual selection into line items + total: pricing_table rows all included; package uses the client's chosen index, else the featured package, else index 0; addons use the client's selected set, else each item's default on flag. Currency derived from blocks. Selection is persisted into totals.selection at sign time. Overview/analytics/vault compute revenue from signed/completed document totals.
- **Version history** — cs_versions snapshots title/blocks/theme/settings with a label. A 'Sent · v{n}' snapshot is taken on send, then the working version increments. Routes: list versions (with author name), diff a version (returns flattened text of the version vs current), and restore a version (overwrites blocks/title/theme, records version_restored).
- **Letterhead** — Per-workspace letterhead image uploaded via multipart (cs_settings.letterhead_url, served at /uploads/cs). Used in the signed PDF and surfaced to the public viewer. Can be deleted. Per-document opt-out via settings.letterhead===false.
- **Internal approvals** — request-approval creates a pending cs_approval and sets the document to 'pending_approval'; decide-approval resolves the latest pending (or creates an already-decided record for solo approve) as approved/rejected and returns the doc to 'draft'. settings.require_approval gates send: send returns 409 unless the latest approval is 'approved'. Approvals shown in document detail with approver name.
- **File upload onto a document** — A PDF/image can be attached to a document (settings.upload = {url,filename,mime}) to send for signing; recorded as file_uploaded event. Removable. The attached filename is noted in the generated PDF. 50MB upload limit; filenames sanitized.
- **Dashboard overview** — GET /api/cs/overview returns total document count, counts by status, the 8 most recent documents (with client_name), the 12 most recent activity events, and revenue (sum of signed/completed totals).
- **Analytics** — GET /api/cs/analytics returns totalDocs, funnel (sent/viewed/completed), acceptanceRate (completed/sent %), revenue, totalViews, avgViewSeconds (from time_on_page events), avgSignHours (avg sent→completed), byStatus, and topViewed (top 5 documents by view events).
- **Document CRUD & filtering** — List documents filtered by status/type/lead_id (joined to lead customer_name). Create (from template_id, pack_id, or raw blocks; title required, max 200). Get full document (blocks, signers, events with parsed meta, approvals). Update partial (title/type/blocks/theme/totals/settings/expires_at). Delete cascades signers/events/approvals.

### API endpoints (40)
- `GET /api/cs/overview` — Dashboard: totals, counts by status, recent docs, recent activity, revenue
- `GET /api/cs/documents` — List documents (filter by status/type/lead_id) with client name
- `POST /api/cs/documents` — Create a document from template_id/pack_id/raw blocks; auto-seed client signer
- `GET /api/cs/documents/:id` — Full document with blocks, signers, events, approvals
- `PUT /api/cs/documents/:id` — Partial update (title/type/blocks/theme/settings/totals/expires_at)
- `DELETE /api/cs/documents/:id` — Delete document and cascade signers/events/approvals
- `POST /api/cs/documents/:id/request-approval` — Create pending approval and set status pending_approval
- `POST /api/cs/documents/:id/decide-approval` — Approve/reject; return document to draft
- `POST /api/cs/documents/:id/signers` — Add a signer (role/name/email/phone/order/mode)
- `PUT /api/cs/signers/:id` — Update a signer (role/name/email/phone/mode/order)
- `DELETE /api/cs/signers/:id` — Remove a signer
- `POST /api/cs/documents/:id/remind` — Manual reminder to pending signers over whatsapp/email
- `GET /api/cs/templates` — List workspace templates
- `GET /api/cs/templates/:id` — Get a template with blocks
- `POST /api/cs/templates` — Create a template
- `DELETE /api/cs/templates/:id` — Delete a template
- `GET /api/cs/documents/:id/versions` — List version snapshots with author + current version
- `GET /api/cs/documents/:id/versions/:vid` — Diff: version text vs current text
- `POST /api/cs/documents/:id/versions/:vid/restore` — Restore a version (blocks/title/theme)
- `GET /api/cs/clauses` — List clause library
- `POST /api/cs/clauses` — Create a clause
- `PUT /api/cs/clauses/:id` — Update a clause
- `DELETE /api/cs/clauses/:id` — Delete a clause
- `POST /api/cs/bulk-send` — Create+send one template/pack to many leads
- `GET /api/cs/packs` — List curated industry packs (metadata)
- `GET /api/cs/settings` — Get workspace letterhead + default settings
- `PUT /api/cs/settings` — Merge-update workspace default settings
- `POST /api/cs/settings/letterhead` — Upload workspace letterhead image
- `DELETE /api/cs/settings/letterhead` — Remove workspace letterhead
- `POST /api/cs/documents/:id/upload` — Attach a PDF/image file to a document
- `DELETE /api/cs/documents/:id/upload` — Remove the attached file
- `POST /api/cs/ai/assist` — AI draft/improve/explain/summarize/risks
- `GET /api/cs/analytics` — Workspace-wide funnel, acceptance rate, revenue, view/sign metrics
- `GET /api/cs/vault` — All documents grouped by client with totals + signed counts
- `POST /api/cs/documents/:id/send` — Generate token, version-snapshot, deliver signing link; plan-gated
- `GET /api/cs/public/:token` — Public viewer (flips sent→viewed); returns doc + letterhead
- `POST /api/cs/public/:token/sign` — Public sign: consent+typed name+signature; hash, PDF, automations
- `POST /api/cs/public/:token/decline` — Public decline with optional reason
- `POST /api/cs/public/:token/ask` — Public AI Q&A grounded in the document
- `POST /api/cs/public/:token/track` — Analytics beacon: time_on_page / block_viewed

### Data model
- **cs_documents** — Core document/proposal/quote record (block-based) — _cols:_ id, workspace_id, lead_id, type (contract|proposal|quote|nda|sow|retainer|agreement|hybrid), title, status (draft|pending_approval|sent|viewed|signed|completed|declined|expired; also voided checked), blocks(JSON), theme (monochrome|editorial|executive), settings(JSON), totals(JSON {currency,subtotal,total,selected}), token(unique public capability), version, doc_hash(SHA-256), created_by, sent_at, viewed_at, completed_at, expires_at, created_at, updated_at
- **cs_signers** — Signing parties per document with captured signature + identity proof — _cols:_ id, document_id, workspace_id, role (client|company|witness|cosigner), name, email, phone, sign_order, mode (sequential|parallel), status (pending|viewed|signed|declined), token, typed_name, signature_data, consent, ip, user_agent, signed_at, created_at
- **cs_events** — Immutable audit trail of every document action — _cols:_ id, document_id, workspace_id, type (created|sent|viewed|block_viewed|signed|approved|declined|reminded|automation|automation_error|file_uploaded|client_question|time_on_page|version_restored|ai_assist|approval_requested|rejected|...), actor, ip, user_agent, meta(JSON), created_at
- **cs_approvals** — Internal sign-off before a document may be sent — _cols:_ id, document_id, workspace_id, approver_user_id, role, sign_order, status (pending|approved|rejected), note, decided_at, created_at
- **cs_templates** — Reusable per-workspace document templates — _cols:_ id, workspace_id, type, industry, title, blocks(JSON), created_by, created_at
- **cs_versions** — Point-in-time snapshots of document content — _cols:_ id, document_id, workspace_id, version, title, blocks, theme, settings, label, created_by, created_at
- **cs_clauses** — Per-workspace reusable clause library — _cols:_ id, workspace_id, title, body, created_at
- **cs_settings** — Per-workspace letterhead + default settings (one row per workspace) — _cols:_ workspace_id (PK), letterhead_url, settings(JSON: default theme/expiry/sender/letterhead_on), updated_at

### Rules, constraints & guarantees
- Title is required on create (max 200 chars); empty/whitespace rejected with 400.
- Theme is validated against monochrome|editorial|executive on both create and update; invalid values ignored/defaulted to monochrome.
- Typed name capped at 120 chars; clause title 160; template/document title 200; AI client question 500 chars.
- Signing requires all three: consent truthy, non-empty typed_name, and signature_data — otherwise 400.
- Cannot sign a document already signed/completed (400) or voided/missing (404).
- Public viewer returns 404 for voided/missing docs and 410 for expired links (unless already signed/completed).
- Sending is plan-gated: only NEW sends (no prior sent_at) consume the 'contract_sends' metric; over-limit returns 402 with upgrade flag. Re-sends don't recount.
- If settings.require_approval is set, send is blocked (409) unless the latest approval status is 'approved'.
- Manual remind requires an existing token (400 if not yet sent) and is refused for signed/completed/declined/expired docs.
- Every document/signer/approval/clause/template operation is scoped by workspace_id; signer/clause/template ownership re-verified via workspace join before mutation.
- Signing always advances the lowest sign_order pending signer; completion only when zero pending remain.
- Document integrity is sealed at sign with SHA-256 over id::blocks::typed_name::signature_data::timestamp, stored as doc_hash and printed on the certificate.
- Automations are best-effort and isolated — each wrapped in try/catch recording automation_error; PDF generation and confirmation messages are also best-effort and never abort signing.
- Expiry sweep only affects docs in sent/viewed status; it never sends anything.
- AI draft output is filtered to whitelisted block types with valid data objects; AI is instructed never to invent legal guarantees and to add a not-a-lawyer caveat.
- Letterhead applies unless a document opts out via settings.letterhead===false.
- Upload limited to 50MB; uploaded filenames normalized/sanitized to [\w.\-].
- Token is the sole capability for all public portal actions (no auth).

### Automations (crons / jobs / triggers / auto-behaviors)
- On full completion (all signed) runAutomations fires opt-in actions from settings.automations: move_pipeline (updates lead status; 'Closed - Won' also sets actual_sale to the selection total and logs contact history), create_invoice (creates an invoices row from the client's selection line items, increments company_settings.invoice_counter, supports deposit mode fixed/percent with a balance-due note, status 'sent'), and create_project (creates an ms_projects row in 'planning').
- On full completion: generates a signed PDF with Certificate of Completion (best-effort), stores its URL in settings.signed_pdf.
- On signing: notify() fires a workspace notification (contract fully signed vs signed) and a WhatsApp confirmation message is sent to the linked lead.
- On sign/view/decline/remind/approval/version-restore/automation: broadcastToWorkspace emits cs_updated or cs_signed for live UI refresh.
- Daily cron at 08:00: expiry sweep flips overdue sent/viewed docs to 'expired', then runs autoReminderSweep.
- autoReminderSweep (daily): per-document opt-in via settings.auto_remind — sends reminders over chosen channels respecting every_days (default 3), max (default 2), and elapsed time since last reminder/sent_at; records reminded events + contact history.
- On creating/sending a document, a client signer is auto-seeded from the linked lead; on send a version snapshot ('Sent · v{n}') is taken and the working version incremented.
- Contact history (addContactHistory) entries are written on pipeline move, invoice creation, sends, bulk sends, reminders, and signing.
- logAudit entries recorded for create, approve/reject, send, remind, and automation runs.

### AI behaviors
- AI assist endpoint (POST /api/cs/ai/assist) gated on ai-engine availability (503 if unconfigured). Actions: draft (8–14 blocks, JSON, ends with signature), improve, explain, summarize (owner bullets), risks (flags missing/risky clauses, ends with literal 'Not legal advice.').
- System prompt positions the assistant as a proposal/contract helper that is explicitly 'not a lawyer', adds a caveat only when flagging legal risk, and is told to never invent legal guarantees.
- AI-generated draft blocks are restricted to a whitelist (AI_BLOCK_TYPES) and post-filtered for valid type + data object; non-conforming blocks dropped.
- Public client Q&A (ask) is strictly grounded — answers only from the document text, 1–3 sentences, defers to the sender when the answer isn't present (no guessing).
- All AI is advisory/draft-only: it produces editable block suggestions and text, never auto-sends, auto-signs, or alters document status; AI usage on a document is logged as ai_assist / client_question events.
- AI features degrade gracefully — the entire module functions without ai-engine; only the assist and ask endpoints are disabled.

### Integrations
- WhatsApp via injected sendClientMessage (signing links, reminders, bulk send, signed confirmation)
- Email via injected sendEmail (styled HTML + plaintext signing links and reminders)
- ai-engine (callLLM/extractJSON) for draft/improve/explain/summarize/risks and grounded client Q&A — optional dependency
- pricing module for plan-limit enforcement on contract_sends — optional dependency
- pdfkit for signed PDF + Certificate of Completion generation — optional (best-effort)
- node-cron for the daily 08:00 expiry + auto-reminder sweep — optional dependency
- multer disk storage for letterhead and document file uploads, served statically at /uploads/cs (50MB limit)
- CRM integration: reads leads, company_settings, workspace_members; writes invoices, ms_projects, and leads (pipeline/actual_sale) via signing automations
- Injected platform deps: auth, generateId, logAudit, broadcastToWorkspace (SSE/live updates), addContactHistory, notify (web/push notifications), clientBaseUrl for public /d/:token links

---

## 8. Booking

A public self-scheduling module that lets a client pick a service and time on a public page; the system creates or finds a CRM lead, logs the booking, sets a reminder, and notifies both client and studio. It owns the `booking_settings` and `bookings` tables and is strictly additive — it reads/writes only its own tables plus creates rows in `leads` and `reminders`. Mounted via `mountBooking(app, db, deps)` with injected dependencies (auth, generateId, broadcastToWorkspace, addContactHistory, notify, sendClientMessage, clientBaseUrl). Slots are computed in studio-local time; a manage token gives clients self-serve reschedule/cancel without login.

### Features
- **Booking settings (admin)** — GET/PUT /api/booking/settings manage a per-workspace config blob merged over DEFAULTS. Config fields: services[], availability map (weekday 0=Sun..6=Sat -> [startHour,endHour]), slot_min (default 30), days_ahead (default 21), buffer_min (default 0), blackout[] (YYYY-MM-DD days off), intake[] (questions), timezone (display label string only). PUT merges DEFAULTS + existing + incoming settings, generates/keeps a unique public slug, and returns slug + settings + public_url (clientBaseUrl/book/slug).
- **Services / session types** — cfg.services is an array of {name, duration(min), price}. DEFAULT is a single 'Consultation' 30min price 0. On public booking, the selected service is matched by exact name; falls back to first service, then to a synthetic {name: service||'Booking', duration: slot_min||30}. duration drives slot length and is stored as duration_min on the booking.
- **Public booking page data** — GET /api/booking/public/:slug returns brand (company_name of workspace super_admin owner, fallback 'WappFlow'), services list, computed available slots, intake questions, and the timezone display label. Returns 404 'Not available' if slug unknown.
- **Public booking submission** — POST /api/booking/public/:slug creates a booking. Requires start_at and name plus at least one of phone/email. Re-checks slot is still free (exact start_at match), validates required intake answers, resolves the service, finds-or-creates a lead, inserts the booking with a random manage token, writes a reminder, logs contact history, messages the client, broadcasts a realtime event, and fires a studio notification. Returns {ok, service, start_at, manage_url}.
- **Slot computation** — computeSlots(ws,cfg,serviceDuration) builds open times across days_ahead days. dur = max(10, serviceDuration||slot_min||30); step = max(10, slot_min||30); buffer = max(0,buffer_min). Skips blackout dates and weekdays with no availability hours. Within [startH,endH], steps by `step`, enforces >=1h lead time (slot must be >= now+60min), and skips slots overlapping existing non-cancelled future bookings (interval overlap test including buffer). Returns [{date, times[]}] with only days that have >=1 free time. Times are 'YYYY-MM-DD HH:MM:00' studio-local strings.
- **Booking list (admin)** — GET /api/booking/list returns up to 200 non-cancelled bookings for the workspace ordered by start_at DESC.
- **Admin cancel** — POST /api/booking/:id/cancel sets status='cancelled' for the booking scoped to the workspace.
- **Self-serve manage page** — GET /api/booking/manage/:token returns brand, the booking summary {service,start_at,name,status}, and freshly computed slots (using the booking's own duration_min) so the client can reschedule. No auth — token is the credential.
- **Self-serve reschedule** — POST /api/booking/manage/:token/reschedule sets a new start_at (required), rejects if another non-cancelled booking already holds that exact start_at, resets status to 'confirmed', logs history, messages the client the new time, and broadcasts.
- **Self-serve cancel** — POST /api/booking/manage/:token/cancel sets status='cancelled', logs history, messages the client confirming cancellation with a rebook invite, and broadcasts.
- **Intake forms** — cfg.intake is an array of {label, required}. Questions are surfaced on the public page and manage page payloads. On submission, every required question must have a non-empty trimmed answer in intake[label] or the request is rejected with 'Please answer: <label>'. Answers are stored as JSON in bookings.intake.
- **Slug management** — slugify lowercases, replaces non-alphanumerics with '-', trims dashes, caps at 40 chars, defaults to 'studio'. On PUT, keeps existing slug or derives from req.body.slug or brand name; on collision with another workspace, appends a 2-byte hex suffix to stay unique.

### API endpoints (9)
- `GET /api/booking/settings` — Return current workspace booking config, slug, and public URL (auth).
- `PUT /api/booking/settings` — Upsert booking settings, ensure a unique slug, return slug/settings/public_url (auth).
- `GET /api/booking/list` — List up to 200 non-cancelled bookings for the workspace, newest first (auth).
- `POST /api/booking/:id/cancel` — Admin-cancel a booking by id within the workspace (auth).
- `GET /api/booking/public/:slug` — Public: return brand, services, available slots, intake questions, timezone for a studio's booking page.
- `POST /api/booking/public/:slug` — Public: submit a booking — validate, find/create lead, insert booking, remind, notify.
- `GET /api/booking/manage/:token` — Public (token): return booking summary + fresh slots for self-serve management.
- `POST /api/booking/manage/:token/reschedule` — Public (token): move the booking to a new start_at and re-confirm.
- `POST /api/booking/manage/:token/cancel` — Public (token): cancel the booking self-serve.

### Data model
- **booking_settings** — Per-workspace booking config and public slug. — _cols:_ workspace_id (PK), slug (UNIQUE), settings (JSON text, default '{}'), updated_at
- **bookings** — Individual booking records. — _cols:_ id (PK), workspace_id, lead_id, service, start_at (text), duration_min, name, phone, email, notes, status (default 'confirmed'), created_at, token (added via ALTER), intake (JSON, added via ALTER); index idx_bookings_ws on workspace_id
- **leads** — Read/written cross-module: booking finds-or-creates a lead by phone then email; new lead status 'New', first_message 'Booked: <service>'. — _cols:_ id, user_id, workspace_id, customer_name, customer_phone, email, status, first_message
- **reminders** — Booking writes a reminder so the reminder cron fires; both due_date and reminder_date set to start_at. — _cols:_ id, lead_id, user_id, title, due_date, reminder_date
- **workspace_members** — Read-only to resolve the workspace super_admin as the booking owner/user_id. — _cols:_ workspace_id, user_id, role ('super_admin')
- **company_settings** — Read-only to resolve the brand/company name for the public page. — _cols:_ user_id, company_name

### Rules, constraints & guarantees
- Public submission requires start_at, plus name and at least one of phone or email.
- Slot must still be free at submit time: rejected with 409 if another non-cancelled booking has the exact same start_at.
- Reschedule rejects (409) if another non-cancelled booking (id != current) holds the requested start_at.
- Required intake questions must each have a non-empty trimmed answer, else 400 'Please answer: <label>'.
- Slots enforce a minimum 1-hour lead time (slot must be >= now + 60 minutes).
- Slot length dur = max(10, serviceDuration||slot_min||30); step = max(10, slot_min||30); buffer = max(0, buffer_min).
- Buffer minutes are added around each existing booking's end when testing overlaps.
- Blackout dates (YYYY-MM-DD) and weekdays without availability hours produce no slots.
- days_ahead bounds the horizon (default 21); availability keyed by JS getDay() 0=Sun..6=Sat.
- Slug is unique across workspaces; collisions get a 2-byte hex suffix; slugify caps length at 40 and defaults to 'studio'.
- Admin endpoints are workspace-scoped via auth/req.workspaceId; cancel/list only affect the caller's workspace.
- Manage endpoints are gated solely by the random 12-byte hex token (no login).
- Lead matching is find-or-create: by customer_phone first, then by email; otherwise a new 'New' lead is created owned by the workspace super_admin.
- status values: 'confirmed' (default) and 'cancelled'; list and free-slot queries exclude 'cancelled'.
- Owner/user_id for created leads, reminders, history, and messages is the workspace super_admin; if none, owner is null.
- start_at is stored as a 'YYYY-MM-DD HH:MM:SS' studio-local string; date parsing replaces space with 'T' for JS Date.

### Automations (crons / jobs / triggers / auto-behaviors)
- On public booking: inserts a row into `reminders` with both due_date and reminder_date = start_at so the external reminder cron fires (a due_date-only row would never notify).
- On public booking: appends contact history ('booking' type) to the lead via addContactHistory.
- On public booking: sends a WhatsApp/client confirmation message (with manage/reschedule URL) if the lead has a customer_phone, via sendClientMessage.
- On public booking: broadcasts 'booking_created' SSE/realtime event to the workspace.
- On public booking: fires an in-app studio notification (type 'booking', deep-links to /leads/<id>, icon 📅) via notify.
- On reschedule: logs contact history, sends client a 'rescheduled to <time>' message if phone present, broadcasts 'booking_created'.
- On self-serve cancel: logs contact history, sends client a cancellation-confirmation/rebook message if phone present, broadcasts 'booking_created'.
- Note: admin cancel (POST /:id/cancel) only updates status and does NOT notify the client or broadcast.
- Slot availability auto-recomputes on every public/manage GET by subtracting future non-cancelled bookings (with buffer) from configured availability.

### Integrations
- Client messaging via injected sendClientMessage (WhatsApp/client-message channel; no-op stub returning {skipped:true} if not provided) — used for booking confirmation, reschedule, and cancel notices.
- In-app/web-push notifications via injected notify dependency (studio 'New booking' alerts).
- Realtime updates via injected broadcastToWorkspace (SSE 'booking_created' events).
- CRM integration via leads table (find-or-create) and addContactHistory injected dependency.
- Reminder system via the reminders table consumed by an external reminder cron.
- clientBaseUrl (FRONTEND_URL env) used to build public /book/<slug> and /booking/manage/<token> URLs.
- No Google Calendar integration present in this file — there is no GCal seam, OAuth, or calendar push/pull in booking.js (timezone is a display-label string only; no tz-aware conversion or external calendar sync).

---

## 9. Communications 2.0

Team-collaboration layer mounted at /api/comms/* (backend/comms.js), additive on top of the base chat_* tables owned by server.js (chat_channels, chat_messages, chat_reactions). Adds DMs, threads, @mentions + @channel/@everyone/@here, pins, presence (online/away/dnd), unread + read-state + derived per-message receipts, search, message edit, typing, project rooms bound to business entities, and a lead-timeline mirror. Text/state ride the existing SSE broadcast (broadcastToWorkspace / broadcastToUser) with no polling; voice/video/screenshare ride self-hosted LiveKit via hand-rolled HS256 access-token minting (replacing the old public-Jitsi huddle). Call sessions get a full lifecycle (start/ring/join/screenshare/raise-hand/end/missed) with an event log, live roster reconstruction, call notifications, and timeline logging. Guarantee: DND suppresses push + the unified notification feed but the in-app mention/record is still written; rooms namespace LiveKit per workspace so two studios never collide.

### Features
- **Direct messages (1:1)** — POST /api/comms/dm/:userId find-or-creates a deterministic DM channel. Channel id = 'dm_' + first 24 hex chars of sha1(workspaceId + ':' + [me,other].sorted().join('_')) so the same pair always maps to one channel regardless of who opens it. Validates other != me and that other is a workspace_member; creates a private (is_private=1) channel with name='' description='dm' and inserts both users into chat_members. GET /api/comms/dms lists my DM channels (joined via chat_members on me), each with other_id (the counterpart member), last_message body and last_message_at, ordered by COALESCE(last_message_at, created_at) DESC.
- **Threads (reply_to)** — Replies reuse the existing reply_to column on chat_messages (set via the base POST .../messages route). GET /api/comms/messages/:id/thread returns the root message + all replies (WHERE reply_to = root_id ORDER BY created_at ASC), gated by canSee. A thread reply triggers a chat_thread_reply SSE to the root author + a push (unless DND), only if the root author is not self and not already in the mention set.
- **@mentions** — afterMessage persists each mentioned user into chat_mentions and fires a chat_mention SSE + push 'X mentioned you' (body sliced to 140 chars, unless target is DND). Mention ids come from req.body.mentions (client-supplied array) and are deduped, filtered to truthy, and never include the sender.
- **@channel / @everyone / @here** — If the message body matches /@(channel|everyone|here)\b/i, the whole channel membership (channelMemberIds) is concatenated into the mention set before dedup, so every member gets a chat_mention row + notification (minus the sender).
- **Mentions inbox** — GET /api/comms/mentions returns my 50 most recent mentions (chat_mentions joined to chat_messages + chat_channels) with channel_id, read_at, created_at, message body, sender_name, message_id, channel_name, ordered created_at DESC.
- **Pinned messages** — POST /api/comms/messages/:id/pin inserts into chat_pins (INSERT OR IGNORE; UNIQUE channel_id+message_id) and broadcasts chat_pin. DELETE /api/comms/messages/:id/pin removes the pin and broadcasts chat_unpin. GET /api/comms/channels/:id/pins returns pinned messages (message_id, pinned_at, body, sender_name, user_id, media_url, media_type) ordered by pin time DESC. Pins also cleaned up when a message is deleted via the base DELETE /api/chat/messages/:id route.
- **Presence (online/away/dnd)** — GET /api/comms/presence computes: online = workspace members who have a live SSE connection (onlineUsers/sseClients) AND whose self-set state is not 'away' or 'dnd'; states = map of every member's stored override state; connected = all members with a live SSE connection regardless of override. POST /api/comms/presence/state sets my state to one of online|away|dnd (anything else coerced to 'online'), upserts user_presence, and broadcasts chat_presence so rosters update live.
- **Unread + read-state** — POST /api/comms/channels/:id/read upserts chat_members.last_read_at = now and marks all my unread chat_mentions in that channel read. GET /api/comms/unread returns per-channel unread counts (messages newer than my last_read_at, excluding my own, only channels I can see) plus a total unread-mentions count. Channels visible = public (is_private=0) or where I'm a chat_members row.
- **Per-message read receipts** — GET /api/comms/messages/:id/receipts derives who has seen a message from members' last_read_at (no extra write tables): returns members (excluding the author) whose last_read_at >= the message created_at. Output: message_id, seen_by[], receipts[{user_id,last_read_at}].
- **Search** — GET /api/comms/search?q= searches chat_messages.body with a LIKE across only channels I can see (public OR member). Requires q length >= 2 (else empty). LIKE wildcards %,_,\ are escaped (ESCAPE '\\'). Returns up to 50 rows (id, channel_id, body, sender_name, created_at, channel_name, is_private) ordered created_at DESC.
- **Message edit** — PUT /api/comms/messages/:id edits a message — author-only (403 'not your message' otherwise). Rejects empty body (400). Sets body + is_edited=1 and broadcasts chat_edit with the updated message.
- **Typing indicator** — POST /api/comms/typing with {channel_id} broadcasts a transient chat_typing event {channel_id, user_id, name=req.senderName} to the workspace. No persistence.
- **LiveKit token minting** — POST /api/comms/livekit/token {room} mints a 6-hour HS256 JWT (LiveKit video grant: roomJoin, canPublish, canSubscribe, canPublishData all true). Room is namespaced per workspace: 'ws_'+workspaceId+'_'+raw, sanitized to [A-Za-z0-9_-] and truncated to 96 chars. identity = req.userId, name = req.senderName. Returns {token, url, room, identity}. 503 if LiveKit env unset or room missing(400). GET /api/comms/livekit/config is a capability probe returning {configured, url} for show/hide of call buttons.
- **Calls — start / ring** — POST /api/comms/calls/start {channel_id} (canSee-gated) reuses any live (ended_at IS NULL) call on the channel or creates a new call_sessions row (room = the channel id). Records a 'started' event (only on fresh) + a 'joined' event for the starter, broadcasts call_event (started|joined). On fresh start it rings every other channel member: a targeted call_invite SSE per user + (unless DND) a unified 'Incoming call' notification + a 'X is calling' push, and logs a 'Call started' timeline entry. Returns {call_id, channel_id, room, fresh}.
- **Calls — in-call events** — POST /api/comms/calls/:id/event {type} records and broadcasts joined|left|screenshare|screenshare_stop|raise_hand|lower_hand (anything else 400 'bad event type'). 'screenshare' also logs a 'Screen shared' timeline entry. Call must belong to the workspace (404 otherwise).
- **Calls — end + missed-call** — POST /api/comms/calls/:id/end ends a live call: computes duration_s from started_at (UTC-normalized), sets ended_at + duration_s, records 'ended' event, broadcasts call_event ended with duration, logs a 'Call ended / Duration Xm Ys' timeline entry. Idempotent (returns {already:true} if already ended). Missed call: any channel member who is not the starter and produced no 'joined' event gets a call_missed SSE + (unless DND) a 'Missed call' notification.
- **Calls — detail + live roster** — GET /api/comms/calls/:id replays call_events to reconstruct state: participants = users with a 'joined' not subsequently 'left'/'ended', raised_hands = users with 'raise_hand' not 'lower_hand'. Returns {call, events, participants[{user_id,name}], raised_hands[]}.
- **Active call probe** — GET /api/comms/channels/:id/active-call (canSee-gated) returns the most recent not-ended call on a channel so the UI can show a join affordance: {active, call}.
- **Project rooms** — POST /api/comms/rooms/:type/:id find-or-creates a private channel (id = 'room_<type>_<id>') bound to a business entity (lead/project/gallery/contract/booking), validates the entity exists in its table within the workspace, records it in project_rooms, and adds the caller to chat_members. Returns {channel_id, type, entity_id, livekit_room=channel_id}. GET /api/comms/rooms/:type/:id reads the room without creating it: {exists, channel_id, channel meta, last 50 messages chronological, livekit_room}. Discussion reuses the base chat message routes; voice/video reuses /livekit/token (room = channel id).
- **Lead-timeline mirror** — afterMessage mirrors any room_<type>_<id> message onto the linked lead's activity_timeline (activity_type 'room_message', body sliced to 200). Entity→lead resolution: lead=self; project/contract/booking carry lead_id; gallery→project→lead. Call lifecycle events (start/screenshare/end) also write activity_timeline rows (activity_type 'call') via logCallTimeline using the same resolution. Both mirrors are best-effort (wrapped in try/catch).
- **Real-time fan-out hook** — afterMessage(message, mentions) is invoked by the base chat send routes after insert. It broadcasts chat_message to the whole workspace (replacing the old per-sender echo + 3s client poll), then handles room mirror, mentions, @channel expansion, and thread-reply notification. Exported alongside mintLivekitToken from mountComms; assigned to commsApi in server.js.

### API endpoints (32)
- `POST /api/comms/dm/:userId` — Find-or-create a 1:1 DM channel (deterministic sha1 id) with another workspace member
- `GET /api/comms/dms` — List my DM channels with counterpart + last message, most-recent first
- `POST /api/comms/channels/:id/read` — Mark channel read (upsert last_read_at) and clear unread mentions in it
- `GET /api/comms/unread` — Per-channel unread message counts + total unread-mention count
- `GET /api/comms/mentions` — Mentions inbox — 50 most recent @mentions of me
- `POST /api/comms/messages/:id/pin` — Pin a message (broadcast chat_pin)
- `DELETE /api/comms/messages/:id/pin` — Unpin a message (broadcast chat_unpin)
- `GET /api/comms/channels/:id/pins` — List pinned messages of a channel
- `GET /api/comms/messages/:id/thread` — Get a root message + its replies (reply_to)
- `PUT /api/comms/messages/:id` — Edit a message (author-only, sets is_edited, broadcast chat_edit)
- `GET /api/comms/search` — Search message bodies across visible channels (LIKE, escaped, min 2 chars)
- `GET /api/comms/presence` — Online / away-dnd states / connected sets for the workspace roster
- `POST /api/comms/presence/state` — Set my presence state online|away|dnd (broadcast chat_presence)
- `GET /api/comms/messages/:id/receipts` — Per-message read receipts derived from members' last_read_at
- `POST /api/comms/typing` — Broadcast a transient typing indicator to a channel
- `POST /api/comms/livekit/token` — Mint a per-workspace LiveKit access token for voice/video/screenshare
- `GET /api/comms/livekit/config` — LiveKit capability probe (configured + url)
- `POST /api/comms/calls/start` — Start or rejoin a channel call; first start rings other members
- `POST /api/comms/calls/:id/event` — Record in-call event joined/left/screenshare/screenshare_stop/raise_hand/lower_hand
- `POST /api/comms/calls/:id/end` — End the call (duration, timeline, missed-call pings)
- `GET /api/comms/calls/:id` — Call detail + reconstructed live roster + raised hands
- `GET /api/comms/channels/:id/active-call` — Get the live (not-ended) call on a channel, if any
- `POST /api/comms/rooms/:type/:id` — Find-or-create a project room (channel + LiveKit room) bound to an entity
- `GET /api/comms/rooms/:type/:id` — Read a project room (meta + recent messages) without creating it
- `GET /api/chat/channels` — (base/server.js) List workspace channels with message_count + last message; auto-creates default channels
- `POST /api/chat/channels` — (base) Create a channel (name slugified, is_private optional)
- `DELETE /api/chat/channels/:id` — (base) Delete a channel + its messages (creator-only on the channel row)
- `GET /api/chat/channels/:channelId/messages` — (base) Paginated messages with reactions (limit, before cursor)
- `POST /api/chat/channels/:channelId/messages` — (base) Send a text message (reply_to, mentions) → invokes afterMessage
- `POST /api/chat/channels/:channelId/messages/media` — (base) Upload an image/file message → invokes afterMessage
- `DELETE /api/chat/messages/:id` — (base) Delete own message; cleans up pins; broadcast chat_delete
- `POST /api/chat/messages/:id/react` — (base) Toggle an emoji reaction; broadcast chat_reaction

### Data model
- **chat_members** — Channel membership + per-user read state (explicit members for private/DM/room; public channels resolve to all workspace_members) — _cols:_ channel_id, user_id (PK pair), last_read_at, muted (default 0), joined_at
- **chat_pins** — Pinned messages per channel — _cols:_ id PK, channel_id, message_id, pinned_by, created_at; UNIQUE(channel_id, message_id)
- **chat_mentions** — Persisted @mention records driving the inbox + unread-mention count — _cols:_ id PK, message_id, channel_id, user_id, author_id, read_at, created_at
- **project_rooms** — Binding of a business entity to its room channel — _cols:_ id PK, workspace_id, entity_type, entity_id, channel_id, created_at; UNIQUE(workspace_id, entity_type, entity_id)
- **user_presence** — Self-set presence override (online|away|dnd) per workspace member — _cols:_ workspace_id, user_id (PK pair), state (default 'online'), updated_at
- **call_sessions** — A voice/video call on a channel + its duration — _cols:_ id PK, workspace_id, channel_id, room, started_by, started_at, ended_at, duration_s
- **call_events** — Append-only call event log (lifecycle + roster + hands) — _cols:_ id PK, call_id, user_id, name, type (started|joined|left|screenshare|screenshare_stop|raise_hand|lower_hand|ended), at
- **chat_channels** — (base, server.js) Channels incl. DMs (dm_*) and rooms (room_*) — _cols:_ id PK, workspace_id, name, description, is_private (default 0), created_by, created_at
- **chat_messages** — (base, server.js) All messages (text/media), threads via reply_to, edit flag — _cols:_ id PK, channel_id FK, user_id, sender_name, body, media_url, media_type, reply_to, is_edited (default 0), created_at
- **chat_reactions** — (base, server.js) Emoji reactions on messages — _cols:_ id PK, message_id, user_id, emoji; UNIQUE(message_id, user_id, emoji)
- **activity_timeline** — (shared CRM table) receives mirrored room-message + call entries via afterMessage/logCallTimeline — _cols:_ id, lead_id, workspace_id, user_id, actor_name, activity_type ('room_message'|'call'), title, body

### Rules, constraints & guarantees
- Indexes created by the module: idx_chat_members_user(user_id), idx_chat_mentions_user(user_id, read_at), idx_chat_pins_channel(channel_id), idx_project_rooms_entity(entity_type, entity_id), idx_call_events_call(call_id).
- Visibility (canSee): a channel is visible if it belongs to the workspace AND (is_private=0 OR caller is a chat_members row). Cross-workspace access returns 404.
- channelMemberIds: public channels expand to all workspace_members with non-null user_id; private/DM/room channels use explicit chat_members rows.
- DM id is deterministic: sha1(workspaceId + ':' + sorted(me,other)).slice(0,24) prefixed 'dm_' — same pair → same channel either direction.
- DM open rejects self (400) and non-members (404); DM channels are created is_private=1 with name='' description='dm'.
- Message edit is author-only (403 otherwise) and rejects empty/whitespace body (400); sets is_edited=1.
- Pin insert is idempotent (INSERT OR IGNORE on UNIQUE channel_id+message_id); pin/unpin require canSee on the message's channel.
- Search requires q.length >= 2 (else empty array) and escapes LIKE special chars %,_,\ with ESCAPE '\\'; capped at 50 rows.
- Mentions inbox capped at 50; receipts exclude the message author; receipts are derived (last_read_at >= message created_at), never separately written.
- Unread count excludes the caller's own messages and uses '1970-01-01' as the floor when no last_read_at exists.
- Presence state coerced to one of online|away|dnd (any other value → 'online'). 'online' in the roster requires BOTH a live SSE connection AND state not in {away,dnd}.
- DND guarantee: DND suppresses push + the unified notification feed for mentions, thread replies, call invites, and missed calls, but the in-app mention row / SSE event is still written/sent.
- LiveKit token requires all three env vars (LIVEKIT_URL/API_KEY/API_SECRET) or returns 503 {configured:false}; room name required (400); 6-hour expiry; room sanitized to [A-Za-z0-9_-] and capped at 96 chars.
- Call start reuses any live (ended_at IS NULL) call on the channel; only a fresh start records a 'started' event, rings members, and logs the start timeline entry.
- Call event types whitelisted to joined|left|screenshare|screenshare_stop|raise_hand|lower_hand (else 400); calls scoped to the caller's workspace (else 404).
- Call end is idempotent (returns {already:true} if ended_at set); duration computed by UTC-normalizing started_at; live roster reconstructed by replaying events ('ended' also clears a participant).
- Missed-call ping goes only to invited members who are not the starter and have no 'joined' event.
- Room create validates entity existence in its mapped table within the workspace (404 'entity not found'); unknown entity type → 400.
- Room/timeline mirrors and all notifications are best-effort — wrapped in try/catch so a failed mirror/push never fails the request.
- All endpoints behind the shared auth middleware; deps default to no-ops if not injected (auth passthrough, empty broadcasts) so the module is standalone-safe.

### Automations (crons / jobs / triggers / auto-behaviors)
- afterMessage (invoked on every base chat send): broadcasts chat_message workspace-wide (real-time, replacing the old 3s client poll); mirrors room messages to the lead timeline; persists @mentions + expands @channel/@everyone/@here; notifies thread-reply root authors.
- On @mention: writes chat_mentions row + chat_mention SSE to each target + push 'X mentioned you' (unless DND).
- On thread reply: chat_thread_reply SSE + push to the root author (if not self/not already mentioned, unless DND).
- On call start (fresh): rings every other member with a call_invite SSE + unified 'Incoming call' notification + 'X is calling' push (unless DND); writes 'Call started' timeline entry.
- On screenshare event: writes 'Screen shared' timeline entry.
- On call end: writes ended_at + duration_s, 'Call ended / Duration' timeline entry, and a call_missed SSE + 'Missed call' notification to members who never joined (unless DND).
- Presence change broadcasts chat_presence; pin/unpin broadcast chat_pin/chat_unpin; edit broadcasts chat_edit; typing broadcasts chat_typing; (base routes) broadcast chat_delete and chat_reaction.
- ensureDefaultChannels (base): auto-creates general/leads/random channels on first GET /api/chat/channels for a workspace.
- SSE event types emitted: chat_message, chat_mention, chat_thread_reply, chat_pin, chat_unpin, chat_edit, chat_presence, chat_typing, chat_delete, chat_reaction, call_event, call_invite, call_missed.

### AI behaviors
- None. Communications 2.0 contains no AI/ML/scoring/auto-suggest logic — it is a deterministic messaging/presence/call module. No model calls, no auto-generated content, no suggestions.

### Integrations
- LiveKit (self-hosted) — real-time voice/video/screenshare; access tokens hand-minted as HS256 JWTs (jsonwebtoken) with a LiveKit video grant to avoid the livekit-server-sdk dependency; env LIVEKIT_URL / LIVEKIT_API_KEY / LIVEKIT_API_SECRET. Replaces the prior public-Jitsi huddle.
- Web push — via injected sendPushToUser(userId,title,body,data) for mentions, thread replies, and call invites/missed calls.
- Unified notification feed — via injected notify(workspaceId,{type,title,body,url,icon,userId}) for call invites and missed calls.
- SSE broadcast bus — injected broadcastToWorkspace / broadcastToUser (onlineUsers derived from sseClients) carry all text/state/call events with no polling.
- CRM activity_timeline — room messages and call lifecycle events mirrored onto the linked lead's timeline.
- Cross-module entity tables for project rooms: leads, ms_projects, ms_galleries, cs_documents (contracts), bookings (lead resolution chains through ms_projects for galleries).

---

## 10. Command Center (platform control plane)

A platform-scoped (cross-workspace) admin control plane mounted at /api/cc/*, intentionally reading across ALL workspaces rather than using the per-workspace tenant auth. It runs on its own identity tier (cc_admins) with a distinct JWT audience ("command-center"), an IP allowlist, step-up elevation for destructive actions, and a full append-only audit spine. Mounted last in server.js so every ms_*/cs_* table already exists. Phase 0 + first-slice surface: identity/login, audit + event spines with admin SSE, executive overview, customer list + workspace 360, plans editor, feature flags (incl. live toggle + rollout %), entitlement overrides + grace periods + module gating, impersonation (read-only default), DB explorer + read-only SQL console, support inbox, time machine, scheduled reports + CSV email, storage dashboard, desktop fleet + version policy, founder inbox, customer health/churn/expansion scoring, adoption. Core guarantees: read-only by default, every mutation audited with before/after, four-layer read-only SQL safety, advisory-only scoring, default-ON modules so no plan regression.

### Features
- **Platform identity (cc_admins)** — Separate admin identity tier distinct from workspace users. Admins have id, email (unique, lowercased), password_hash (bcrypt, 10 rounds), name, cc_role (default readonly), cc_permissions (JSON custom override), mfa_secret (column exists, unused), status (active/…), last_login_at. createOrUpdateAdmin helper upserts by email (also used by scripts/cc-create-admin.js). Founder auto-seeded from CC_FOUNDER_EMAIL + CC_FOUNDER_PASSWORD env on first boot when zero admins exist.
- **Roles → permissions matrix** — CC_PERMS = view, manage_plans, manage_flags, manage_overrides, manage_billing, impersonate, impersonate_write, run_sql, manage_support, bulk_actions, manage_admins. Roles: founder (all perms), ops (view, manage_flags, manage_overrides, manage_support, impersonate, bulk_actions), finance (view, manage_plans, manage_billing), support (view, manage_support, impersonate), cs (view, manage_support, manage_overrides), readonly (view). permsFor(role,custom) merges role base with parsed cc_permissions JSON override.
- **Login + session** — POST /api/cc/login validates IP allowlist, then email+active status + bcrypt compare; issues 12h JWT with aud='command-center' and adminId; stamps last_login_at; audits admin_login. Returns token + admin (id, email, name, role, permissions).
- **Step-up elevation** — POST /api/cc/step-up re-verifies the admin's password and mints a 5-minute elevated JWT (elevated:true). Required for the SQL console. Audited as admin_step_up. platformAuth reads decoded.elevated into req.elevated.
- **Audit center** — ccAudit() inserts into cc_audit (admin_id, action, target_type, target_id, workspace_id, before/after JSON, reason, ip from x-forwarded-for/socket, ua). GET /api/cc/audit lists with filters admin_id/action/target_type/workspace_id (limit≤500, default 100), joined to admin email. GET /api/cc/audit/:id returns one row with before/after parsed. Every mutating action across the module writes an audit row; rejected SQL attempts are also audited.
- **Event spine + admin SSE** — emit(ev) inserts into platform_events (workspace_id, actor_type default 'admin', actor_id, type, entity_type, entity_id, payload JSON, source default 'command-center') and broadcasts to all connected admin SSE clients. GET /api/cc/events lists platform_events with type/workspace_id filters (limit≤500) AND merges recent core audit_logs (mapped to event shape, source='audit_logs') sorted by ts. GET /api/cc/events/stream is an SSE endpoint (text/event-stream, 25s heartbeat, sends {type:'connected'} on open, cleans up on close).
- **Executive overview** — GET /api/cc/overview returns total workspaces, by_plan (LEFT JOIN workspace_plan, default 'free'), by_status (default 'active'), IMPLIED MRR/ARR computed from entitlements.PLAN_MONTHLY_PRICE × workspace count per plan (explicitly labelled implied; real billing not built), totals (workspaces, users, leads non-deleted, messages, contracts=cs_documents, galleries=ms_galleries, bookings, storage_bytes=SUM ms_assets.size_bytes), and ai block (calls, cost=SUM est_cost, metered flag).
- **Customer list** — GET /api/cc/workspaces with q (name/owner email/business_name LIKE), plan, status filters; sort by last_active/name/plan/users/leads/storage (dir asc/desc); limit≤200 default 50, offset. Each row: id, name, owner_id, status, owner_email, owner_name, plan, trial_ends_at, users (member count), leads (non-deleted), storage_bytes (SUM ms_assets), last_active (MAX leads.last_contacted_at). Returns rows + total + limit + offset.
- **Workspace 360** — GET /api/cc/workspaces/:id returns workspace (status defaulted active), owner (id/email/business_name/full_name/phone/created_at), members (user_id/role/full_name/invite_email/invite_status), plan {key, trial_ends_at}, live entitlements (getEntitlements fresh:true), counts (leads, clients=is_client, messages, projects, galleries, contracts, bookings, invoices, storage_bytes), active overrides (revoked_at IS NULL), active grace periods, notes (pinned first), workspace_scores, and last 50 platform_events activity.
- **Workspace write actions** — POST suspend (sets workspaces.status='suspended', audited workspace_suspend, emits workspace_suspended; note: login enforcement is a follow-up rewire). POST restore (status='active'). POST notes (cc_notes body+pinned, audited note_add). POST plan (change tier; validates plan exists in plans, upserts workspace_plan, invalidates entitlements cache, broadcasts plan_updated, emits workspace_plan_changed).
- **Plans editor (config-as-data)** — GET /api/cc/plans lists plans with prices (active plan_prices), limits (plan_limits key→value map), features (plan_features feature_key→parsed enabled). POST /api/cc/plans creates a plan (key required, default status active/visibility public/sort_order 99, 409 if key exists). PUT /api/cc/plans/:key updates name/status and optionally REPLACES limits (delete+reinsert, values truncated to int or -1=unlimited), features (JSON-stringified), prices (delete+reinsert with interval/currency/amount). All wrapped in a transaction; entitlements.invalidate() globally; enforced app-wide immediately via resolver.
- **Feature flags** — GET /api/cc/flags lists feature_flags with their assignments. POST /api/cc/flags create/replace (key, description, default_state, rollout_pct, status active). PUT /api/cc/flags/:key update description/default_state/rollout_pct/status. POST /api/cc/flags/:key/assign — THE LIVE TOGGLE: writes flag_assignments (scope global/workspace/user, scope_id, state, starts_at, ends_at, set_by); invalidates entitlements (scoped to workspace when scope=workspace); broadcasts plan_updated to the affected workspace. All audited + emitted.
- **Entitlement overrides** — GET /api/cc/workspaces/:id/overrides lists all (incl revoked). POST adds an override (kind, key, value JSON-stringified, reason, ends_at; admin_id stamped); invalidates resolver + broadcasts plan_updated. DELETE /api/cc/overrides/:id soft-revokes (sets revoked_at), invalidates + broadcasts.
- **Grace periods** — POST /api/cc/workspaces/:id/grace grants a grace window (days default 7, computes ends_at = now + days, reason, admin_id, status active) into cc_grace_periods; audited grace_grant; emits grace_granted. Auto-expiry sweep flips active→expired when ends_at < now (runs on boot + nightly cron 5 3 * * *).
- **Module control / gating** — POST /api/cc/workspaces/:id/modules/:module toggles one of MODULE_KEYS (media_studio, contracts_studio, booking, print_store, payments). Disable writes a kind='module' override with value=false (enforced by the moduleGate middleware in server.js); enable revokes the existing module override (back to default-on/plan value). Default ON — only explicit false disables. Invalidates resolver, broadcasts plan_updated, audited module_toggle, emits module_toggled.
- **Impersonation** — POST /api/cc/workspaces/:id/impersonate (requires impersonate perm). Finds a super_admin member or workspace owner. Read-only by default; write mode only if mode='write' AND admin has impersonate_write. Records a cc_impersonations row (admin_id, workspace_id, audit_id, mode, reason). Mints a 30-minute user JWT signed with the SAME JWT_SECRET as normal user tokens (so core auth accepts it) carrying an imp claim {admin_id, audit_id, imp_id, mode} for banner + tagging. Audited impersonate_start, emits impersonation_started.
- **Global search** — GET /api/cc/search?q= searches workspaces (name), users (email/business_name), leads (name/phone, non-deleted), contracts (cs_documents.title), projects (ms_projects.title) — each limited to 8 — returning typed results with label/sub/link to /control/customers/:wid.
- **Configuration center** — GET /api/cc/config/:namespace returns cc_config key→parsed value map for a namespace. PUT /api/cc/config/:namespace (requires manage_plans) upserts each body entry (JSON-stringified, updated_by/updated_at stamped); audited config_update.
- **AI control center / metering view** — GET /api/cc/ai reads the ai_usage ledger: metered flag, totals (calls, cost=SUM est_cost, tokens=SUM prompt+completion, avg_latency, ok=success count), byProvider (calls+cost), byFeature (calls+cost+avg_latency, '(unattributed)' fallback), and 60 most recent rows.
- **Usage rollups + scoring engine (cc-metering)** — runRollup() writes a per-workspace daily snapshot into workspace_usage_daily (leads, messages, ai_calls, ai_cost, storage_bytes, active_users=distinct from_me senders last 7d, contracts, bookings, galleries) for today (UTC), idempotent via ON CONFLICT upsert. computeScores() computes per-workspace health/churn/expansion/activity into workspace_scores. runAll() does both. start() schedules nightly cron 0 2 * * * + runs once ~8s after boot (unref'd). POST /api/cc/rollup/run triggers runAll on demand (audited rollup_run).
- **Customer health** — GET /api/cc/health lists every workspace LEFT JOINed to workspace_scores, sortable by churn/health/expansion/activity (NULLs last, DESC), risk_factors parsed to array, returns a 'computed' flag if any score exists.
- **Adoption** — GET /api/cc/adoption returns per-module distinct-workspace adoption counts + pct (Contracts Studio=cs_documents, Media Studio=ms_projects, Galleries=ms_galleries, Booking=bookings, AI=ai_usage) over total workspaces, plus top-10 power users by health score.
- **Founder inbox** — GET /api/cc/inbox merges COMPUTED signals (suspended workspaces=high; churn risk ≥70 from scores, high if ≥85; expansion opportunities ≥60=low; 7-day AI spend summary, medium if >$5) with PERSISTED manually-flagged cc_inbox items (status open), sorted by severity (high/medium/low/info), with per-severity counts + total. POST /api/cc/inbox/:id/dismiss sets cc_inbox status='dismissed' (audited inbox_dismiss).
- **Export engine** — GET /api/cc/export?dataset=&format= (auth accepts ?token= so a plain download link works). Datasets: customers (respects q/plan/status filters), health, audit, ai_usage — each capped LIMIT 10000. format json or csv (default csv) with Content-Disposition attachment filename dataset-YYYY-MM-DD. RFC-4180-ish toCSV. Audited 'export' with format+count.
- **Scheduled reports + email (cc-reports)** — Report definition JSON = {dataset, filters}. GET /api/cc/reports lists (parsed). POST /api/cc/reports creates (requires manage_support; validates dataset in customers/health/audit/ai_usage; schedule none/daily/weekly/monthly; recipients array). DELETE /api/cc/reports/:id. POST /api/cc/reports/:id/run runs now. runReport() loads datasetRows (mirrors export queries, capped 10000), stamps last_run_at, audits report_run + emits, and emails CSV (≤100000 chars) to recipients via sendEmail using any super_admin as platform from-identity (SMTP failure is non-fatal). runDue() (driven by daily cron 0 3 * * *) runs reports whose elapsed time exceeds slack thresholds (daily ~20h, weekly ~6.5d, monthly ~27d; NULL last_run_at = always due).
- **Database explorer (cc-explorer)** — Opens a SEPARATE SQLite read-only connection (roDb). GET /api/cc/db/tables lists user tables (excludes sqlite_%) with row counts. GET /api/cc/db/tables/:name validates table name against sqlite_master before interpolation (qid quoting), returns columns (PRAGMA table_info), indexes (PRAGMA index_list), rowCount, and paginated sample rows (limit 1-500 default 50, offset).
- **Read-only SQL console (cc-explorer)** — POST /api/cc/db/query — founder-tier (requires run_sql) AND a valid elevated/step-up token (else 403 need_step_up). Four independent read-only layers: (1) roDb opened readonly; (2) whitelist — query must START with select/with/explain/pragma/analyze; (3) denylist — reject any whole-word insert/update/delete/drop/alter/create/replace/attach/detach/vacuum/reindex/truncate; (4) better-sqlite3 .prepare rejects multi-statement + refuses any non-reader statement. Results capped at 1000 rows (truncated flag). Both successful (sql_query) and rejected (sql_query_rejected) attempts are audited.
- **Support inbox / ticketing (cc-support)** — Internal ticketing over cc_tickets + cc_ticket_comments. GET /api/cc/tickets list (filter status/kind, joined workspace name + admin email). POST create (requires manage_support; kinds bug/feature/escalation/question default question; priorities low/medium/high default medium; status open; source default command-center). GET /api/cc/tickets/:id ticket + comments. PUT update status (open/in_progress/resolved/closed; sets resolved_at when resolved/closed) + priority. POST /:id/comment add comment (internal default true). GET /api/cc/support/stats: counts by status + avg resolution hours (julianday diff). All mutations audited + emitted.
- **Time machine (cc-timemachine)** — GET /api/cc/timemachine?type=workspace&id=&as_of= reconstructs best-effort historical workspace state by replaying platform_events + cc_audit backwards from the current row (no point-in-time snapshots stored). Returns current {name,status,plan}, reconstructed {status,plan} (rolls back audit before-values for mutations after as_of, newest→oldest, for ROLLBACK_FIELDS: workspace_plan_change→plan, workspace_suspend/restore→status), merged timeline (events + audit, filtered ≤ as_of, sorted DESC), and best_effort:true. Only type=workspace supported. Audited timemachine_reconstruct.
- **Storage dashboard (cc-storage)** — GET /api/cc/storage/overview — global total bytes, by_provider (storage_provider default local, files+bytes, deleted_at NULL), R2 bytes/GB, est monthly cost (max(0,r2GB-10)×$0.015), 30d growth, linear forecast (growth rate GB/day, projected 30d bytes/R2 GB/cost). GET /api/cc/storage/workspaces — top-20 largest by bytes. GET /api/cc/storage/by-plan — bytes/files/distinct-workspaces grouped by plan (default creator). GET /api/cc/storage/fastest-growing — top-20 by trailing-30d uploaded bytes. GET /api/cc/storage/workspace/:id — used vs plan limit (storage_gb entitlement), pct, 30d growth, largest projects/galleries/videos (top-10 each).
- **Desktop fleet + version policy (cc-desktop)** — Desktop-facing (workspace auth): POST /api/desktop/report self-registers a device (device_id PK, workspace_id, user_id, version, platform, last_sync, last_seen) into cc_desktops via upsert; GET /api/desktop/update-policy returns action ok/block/update — block if version in blocked_versions, update if version below min_version (dotted cmpVer) — plus latest_version/min_version. Admin-facing (platform auth): GET /api/cc/desktop/fleet returns machine_count, by_version histogram, stale_7d count, policy, and up to 500 devices; POST /api/cc/desktop/policy (requires manage_flags) sets latest_version/min_version/blocked_versions (single-row cc_desktop_policy id=1), audited desktop_policy_update + emitted.

### API endpoints (60)
- `POST /api/cc/login` — Admin login (IP allowlist + bcrypt) → 12h command-center JWT
- `GET /api/cc/me` — Current admin identity + resolved permissions
- `POST /api/cc/step-up` — Re-verify password → 5m elevated token for destructive actions
- `GET /api/cc/overview` — Executive overview: workspaces by plan/status, implied MRR/ARR, totals, AI
- `GET /api/cc/workspaces` — Customer list with search/filter/sort/pagination
- `GET /api/cc/workspaces/:id` — Workspace 360 (owner, members, plan, entitlements, counts, overrides, grace, notes, scores, activity)
- `POST /api/cc/workspaces/:id/suspend` — Suspend a workspace (manage_overrides)
- `POST /api/cc/workspaces/:id/restore` — Restore a suspended workspace (manage_overrides)
- `POST /api/cc/workspaces/:id/notes` — Add an internal note to a workspace
- `POST /api/cc/workspaces/:id/plan` — Change workspace plan tier (manage_plans)
- `POST /api/cc/workspaces/:id/impersonate` — Mint 30m user token to impersonate workspace owner (impersonate)
- `GET /api/cc/plans` — List plans with prices/limits/features
- `POST /api/cc/plans` — Create a plan (manage_plans)
- `PUT /api/cc/plans/:key` — Update plan meta + replace limits/features/prices (manage_plans)
- `GET /api/cc/flags` — List feature flags with assignments
- `POST /api/cc/flags` — Create/replace a feature flag (manage_flags)
- `PUT /api/cc/flags/:key` — Update flag description/default_state/rollout_pct/status (manage_flags)
- `POST /api/cc/flags/:key/assign` — Live toggle: assign flag to global/workspace/user scope (manage_flags)
- `GET /api/cc/workspaces/:id/overrides` — List entitlement overrides for a workspace
- `POST /api/cc/workspaces/:id/overrides` — Add an entitlement override (manage_overrides)
- `DELETE /api/cc/overrides/:id` — Soft-revoke an override (manage_overrides)
- `POST /api/cc/workspaces/:id/grace` — Grant a grace period (manage_overrides)
- `POST /api/cc/workspaces/:id/modules/:module` — Enable/disable a module per workspace (manage_overrides)
- `GET /api/cc/events` — Event feed (platform_events merged with core audit_logs)
- `GET /api/cc/events/stream` — SSE live event stream to admins
- `GET /api/cc/audit` — Audit log feed with filters
- `GET /api/cc/audit/:id` — Single audit entry with parsed before/after
- `GET /api/cc/config/:namespace` — Read cc_config namespace
- `PUT /api/cc/config/:namespace` — Upsert cc_config namespace (manage_plans)
- `GET /api/cc/search` — Global search across workspaces/users/leads/contracts/projects
- `POST /api/cc/rollup/run` — Run usage rollup + scoring on demand
- `GET /api/cc/health` — Customer health/churn/expansion/activity scores
- `GET /api/cc/adoption` — Per-module adoption pct + top power users
- `GET /api/cc/inbox` — Founder inbox: computed signals + persisted flagged items
- `POST /api/cc/inbox/:id/dismiss` — Dismiss a persisted inbox item
- `GET /api/cc/ai` — AI control center: usage totals/by-provider/by-feature/recent
- `GET /api/cc/export` — Export dataset (customers/health/audit/ai_usage) as CSV/JSON; ?token= auth
- `GET /api/cc/db/tables` — List DB tables with row counts (read-only conn)
- `GET /api/cc/db/tables/:name` — Inspect table columns/indexes/sample rows
- `POST /api/cc/db/query` — Read-only SQL console (run_sql + step-up; 4-layer guards)
- `GET /api/cc/tickets` — List support tickets (filter status/kind)
- `POST /api/cc/tickets` — Create a support ticket (manage_support)
- `GET /api/cc/tickets/:id` — Ticket + comments
- `PUT /api/cc/tickets/:id` — Update ticket status/priority (manage_support)
- `POST /api/cc/tickets/:id/comment` — Add a comment to a ticket (manage_support)
- `GET /api/cc/support/stats` — Ticket counts by status + avg resolution hours
- `GET /api/cc/timemachine` — Best-effort historical reconstruction of a workspace
- `GET /api/cc/reports` — List saved reports
- `POST /api/cc/reports` — Create a saved report (manage_support)
- `DELETE /api/cc/reports/:id` — Delete a saved report (manage_support)
- `POST /api/cc/reports/:id/run` — Run a report now (CSV/email)
- `GET /api/cc/storage/overview` — Global storage: total, by-provider, R2 GB, cost, growth forecast
- `GET /api/cc/storage/workspaces` — Top-20 largest workspaces by storage
- `GET /api/cc/storage/by-plan` — Storage grouped by plan tier
- `GET /api/cc/storage/fastest-growing` — Top-20 fastest-growing workspaces (30d)
- `GET /api/cc/storage/workspace/:id` — Per-workspace storage drilldown vs plan limit + largest assets
- `GET /api/cc/desktop/fleet` — Desktop fleet: machine count, versions, stale, policy, devices
- `POST /api/cc/desktop/policy` — Set desktop version policy (manage_flags)
- `POST /api/desktop/report` — Desktop self-registers version/machine/last-sync (workspace auth)
- `GET /api/desktop/update-policy` — Desktop checks update policy: ok/block/update (workspace auth)

### Data model
- **cc_admins** — Platform admin identity tier — _cols:_ id PK, email UNIQUE, password_hash, name, cc_role, cc_permissions JSON, mfa_secret, status, last_login_at, created_at
- **cc_audit** — Append-only admin action audit log — _cols:_ id PK, admin_id, action, target_type, target_id, workspace_id, before JSON, after JSON, reason, ip, ua, created_at; idx on admin_id + (target_type,target_id)
- **cc_impersonations** — Record of impersonation sessions — _cols:_ id PK, admin_id, workspace_id, audit_id, mode (read/write), started_at, ended_at, reason
- **platform_events** — Cross-workspace event spine — _cols:_ id PK, ts, workspace_id, actor_type, actor_id, type, entity_type, entity_id, payload JSON, source; idx on ts + workspace_id
- **ai_usage** — AI metering ledger — _cols:_ id PK, ts, workspace_id, user_id, feature, provider, model, prompt_tokens, completion_tokens, latency_ms, est_cost, success; idx on workspace_id
- **workspace_usage_daily** — Per-workspace daily usage snapshot (rollup) — _cols:_ PK (workspace_id, date); leads, messages, ai_calls, ai_cost, storage_bytes, active_users, contracts, bookings, galleries
- **workspace_scores** — Per-workspace health/churn/expansion/activity scoring — _cols:_ workspace_id PK, health, churn, expansion, activity, risk_factors JSON, computed_at
- **cc_tickets** — Internal support tickets — _cols:_ id PK, workspace_id, admin_id, kind, priority, status, subject, body, source, created_at, resolved_at
- **cc_ticket_comments** — Comments on support tickets — _cols:_ id PK, ticket_id, admin_id, body, internal, created_at
- **cc_notes** — Per-workspace internal admin notes — _cols:_ id PK, workspace_id, admin_id, body, pinned, created_at
- **cc_inbox** — Persisted manually-flagged founder inbox items — _cols:_ id PK, kind, workspace_id, severity, title, body, status, link, created_at
- **cc_reports** — Saved/scheduled report definitions — _cols:_ id PK, name, definition JSON, schedule, recipients JSON, last_run_at, created_by, created_at
- **cc_saved_views** — Per-admin saved views per surface — _cols:_ id PK, admin_id, surface, name, query, created_at (table created; no routes observed)
- **cc_grace_periods** — Billing/limit grace windows — _cols:_ id PK, workspace_id, days, reason, admin_id, starts_at, ends_at, status (active/expired), notified
- **cc_desktops** — Desktop fleet device registry — _cols:_ device_id PK, workspace_id, user_id, version, platform, last_sync, last_seen, first_seen; idx on workspace_id
- **cc_desktop_policy** — Single-row desktop version governance policy — _cols:_ id=1 CHECK, latest_version, min_version, blocked_versions JSON, updated_at
- **workspaces.status** — Added column for suspend/restore (active/suspended) — _cols:_ ALTER ADD COLUMN status DEFAULT 'active' (guarded)
- **plans / plan_prices / plan_limits / plan_features** — Read+edited via plans editor; owned by entitlements schema — _cols:_ plans(key,name,status,visibility,sort_order); plan_prices(plan_key,interval,currency,amount,active); plan_limits(plan_key,key,value); plan_features(plan_key,feature_key,enabled)
- **feature_flags / flag_assignments** — Flags + scoped assignments (entitlements schema) — _cols:_ feature_flags(key,description,default_state,rollout_pct,status); flag_assignments(id,flag_key,scope,scope_id,state,starts_at,ends_at,set_by)
- **entitlement_overrides** — Per-workspace overrides incl module gating (entitlements schema) — _cols:_ id, workspace_id, kind, key, value JSON, reason, admin_id, ends_at, created_at, revoked_at
- **cc_config** — Configuration center key-value store (entitlements schema) — _cols:_ namespace, key, value JSON, updated_by, updated_at

### Rules, constraints & guarantees
- Platform-scoped: routes use platformAuth (cc_admins tier), NOT the workspace tenant auth; intentionally reads across all workspaces.
- JWT audience must equal 'command-center' and carry adminId; admin must exist and be status='active', else 401.
- IP allowlist (CC_IP_ALLOWLIST) enforced on login + every platformAuth call; empty allowlist = allow (dev mode); matches exact IP or endsWith suffix.
- Login tokens expire in 12h; step-up elevated tokens in 5m; impersonation tokens in 30m.
- Permission gating per route via requirePerm: suspend/restore/overrides/grace/modules=manage_overrides; plan change + plans editor + config=manage_plans; flags + desktop policy=manage_flags; SQL console=run_sql; impersonate=impersonate (write mode additionally needs impersonate_write); tickets/reports=manage_support.
- founder role has all permissions; readonly is the default fallback role; custom cc_permissions JSON merges over the role base.
- SQL console requires BOTH run_sql permission AND an elevated step-up token (else 403 need_step_up).
- SQL console four read-only layers: separate readonly SQLite connection, START-with-read-verb whitelist, write/DDL whole-word denylist, better-sqlite3 prepare rejecting multi-statement + non-reader statements; results capped at 1000 rows.
- DB explorer never writes; table names validated against sqlite_master before interpolation and quoted via qid; sample limit clamped 1-500.
- Plan change rejects unknown plan keys (must exist in plans table); module toggle rejects keys not in MODULE_KEYS.
- Modules are default-ON: only an explicit value=false (plan or kind='module' override) disables them, preventing regression.
- Plan limits stored as truncated ints; -1 denotes unlimited; plan edits invalidate the entitlements cache globally (affects every workspace on that plan).
- Override/flag/module/plan mutations invalidate the entitlements resolver (workspace-scoped where applicable) and broadcast plan_updated to the affected workspace tab.
- Overrides are soft-revoked (revoked_at) not deleted; active = revoked_at IS NULL.
- Implied MRR/ARR is explicitly labelled as derived from plan list price — real subscription billing is NOT built.
- Suspension sets workspaces.status but login enforcement for suspended workspaces is acknowledged as a follow-up rewire (not yet wired).
- Report creation validates dataset ∈ {customers,health,audit,ai_usage} and schedule ∈ {none,daily,weekly,monthly}.
- Export + report datasets capped at 10000 rows; emailed report CSV capped at 100000 chars.
- Ticket kind ∈ {bug,feature,escalation,question} (default question), priority ∈ {low,medium,high} (default medium), status ∈ {open,in_progress,resolved,closed}; resolved/closed stamps resolved_at.
- Time machine supports only type=workspace and is explicitly best-effort (best_effort:true) — fidelity limited to fields captured in audit before-snapshots.
- Desktop update-policy: block if version in blocked_versions, else update if version < min_version (dotted compare), else ok.
- Storage cost model: Cloudflare R2 at $0.015/GB-month with first 10 GB free; egress free; only deleted_at IS NULL assets counted.
- Every mutating action audits before/after via ccAudit; SQL console additionally audits rejected attempts.

### Automations (crons / jobs / triggers / auto-behaviors)
- Founder admin auto-seeded from CC_FOUNDER_EMAIL/CC_FOUNDER_PASSWORD env on first boot when zero cc_admins exist.
- Metering: nightly cron '0 2 * * *' runs runRollup + computeScores; also runs once ~8s after boot (unref'd timer) so dashboards aren't empty.
- Reports: daily cron '0 3 * * *' calls runDue() which runs+emails any scheduled report past its slack threshold (daily ~20h / weekly ~6.5d / monthly ~27d; NULL last_run_at always due).
- Grace-period expiry sweep: runs once on boot (catches missed schedules across restarts) + nightly cron '5 3 * * *', flipping active→expired when ends_at < now.
- Admin SSE broadcast: emit() pushes every platform event live to all connected /api/cc/events/stream clients; 25s SSE heartbeat.
- plan_updated workspace broadcast fired on plan change, flag workspace-assign, override add/revoke, and module toggle to nudge workspace tabs to refresh usePlan.
- Reports email CSV via the sendEmail/SMTP seam using any super_admin member as the platform sender; SMTP failure is swallowed (run still succeeds).
- Desktop devices self-register via POST /api/desktop/report (upsert last_seen) and poll GET /api/desktop/update-policy for force-update/block decisions.
- All node-cron usage is wrapped in try/catch and degrades gracefully if node-cron is not installed.

### AI behaviors
- Health/churn/expansion/activity scoring (cc-metering.computeScores) is transparent + ADVISORY only — no automated action is taken on scores.
- Scoring formula: activity=clamp(100 - daysSinceLastActivity*5); adoption = fraction of modules used (CRM always present + contracts/projects/bookings/galleries/AI) ×100; volume=clamp(log10(1+leads+messages)*33); health=0.4*activity+0.35*adoption+0.25*volume.
- Churn=clamp(0.6*(100-activity)+0.4*(100-adoption)), +10 if low plan (free/starter) and inactive >14d; expansion=clamp(volume*(lowPlan?1:0.4)*(adoption/100+0.3)).
- Risk factors derived: inactive_30d/inactive_14d, no_messages, no_contracts, no_projects, no_ai, low_adoption (adoption<34%).
- Founder inbox surfaces computed churn-risk (score≥70/≥85) and expansion (score≥60) signals as advisory cards; no auto-remediation.
- ai_usage is a metering/observability ledger (provider/model/tokens/latency/cost/success) consumed by the AI control center, overview, and inbox AI-spend signal — Command Center records/reports AI usage, it does not itself call any model.
- Storage growth uses a simple linear trailing-30d forecast for projected bytes/R2 GB/cost (transparent, not ML).

### Integrations
- JWT (jsonwebtoken) — separate 'command-center' audience for admin tokens; impersonation tokens signed with the SAME JWT_SECRET as core user auth so the app's tenant auth accepts them.
- bcryptjs — admin password hashing (10 rounds) for login + step-up.
- better-sqlite3 — primary DB plus a SEPARATE read-only connection (new Database(db.name,{readonly:true})) for the DB explorer + SQL console.
- node-cron — nightly metering, daily report runDue, nightly grace sweep (optional/guarded).
- SMTP via injected sendEmail dep — scheduled/on-demand report CSV delivery to recipients.
- entitlements module — schema bootstrap, getEntitlements resolver (live per-workspace), invalidate() cache busting, PLAN_MONTHLY_PRICE for implied MRR.
- broadcastToWorkspace (injected, SSE/websocket seam) — pushes plan_updated to workspace tabs.
- Cloudflare R2 — storage provider modeled in the storage dashboard cost estimation ($0.015/GB-month, 10 GB free).
- WappFlow Desktop (Electron) clients — report/update-policy endpoints for fleet + version governance.
- Server-Sent Events (SSE) — admin live event stream.
- Core platform tables read cross-tenant: workspaces, users, workspace_members, workspace_plan, leads, messages, invoices, bookings, ms_assets, ms_projects, ms_galleries, ms_gallery_assets, cs_documents, audit_logs.

---

## 11. Pricing, Entitlements & Storage

Data-driven plan/limit/feature engine plus a provider-agnostic storage abstraction. Three layers: (1) entitlements.js seeds a PKR plan catalog (Creator/Studio/Studio+/Enterprise) into plan_* tables and resolves per-workspace entitlements through plan base → workspace_plan JSON → feature flags → per-workspace overrides → sold-but-unbuilt guard, with a 30s in-memory cache; (2) pricing.js computes LIVE usage (no counter drift) for 5 metrics scoped to the calendar month for monthly ones, enforces soft levels (80 warn / 90 critical / 100 reached) behind a master switch, tracks the Founding-100 program, and grandfathers pre-pricing workspaces to Studio+; (3) a storage abstraction over Local disk and Cloudflare R2 (STORAGE_PROVIDER=local|r2) with a presign-redirect file route, a storage quota gate at upload time, and dedup'd threshold warnings. A workspace sync delta endpoint mirrors changed rows for offline-first clients. Core guarantees: all gating resolves through getEntitlements() so Command Center edits take effect with no code changes; usage is computed live from source tables; everything is additive and fail-open.

### Features
- **Plan catalog (4 tiers, inheritance)** — Creator → Studio → Studio+ → Enterprise. Feature sets built by spreading the tier below + additions: CREATOR_FEATURES base, STUDIO_ADD, STUDIO_PLUS_ADD, ENTERPRISE_ADD. Creator = core modules only (crm, contracts_studio, booking, media_studio, portfolio, client_portal, print_store) + CRM essentials (whatsapp, basic_inbox, basic_crm, shared_inbox, voice_notes, email + email_integration/templates/sending/receiving, basic_ai); growth/team/AI-depth/contract-depth/gallery-depth/automation/premium/enterprise features OFF. Studio adds instagram, facebook, website_capture, lead_source_tracking, team_collaboration, team_permissions, analytics, reports, advanced_reporting, multi_pipeline, knowledge_base, ai_reply_suggestions, ai_lead_intelligence, next_best_actions, studio_brain, ai_asset_scoring, ai_hero_shot, ai_culling, ai_project_intelligence, clause_library, version_history, redline_comparison, approval_workflows, bulk_send, gallery_collections, story_sections, advanced_proofing, portfolio_management, auto_reply, automations, workflows, advanced_automation, google_calendar, calendly, desktop_access (Desktop Beta). Studio+ adds white_label, priority_support, desktop_sync, local_ai, style_profiles, story_engine, reel_engine, ai_editing, flux. Enterprise adds api_access, byok, sso, audit_logs, dedicated_support, custom_integrations, custom_branding.
- **Plan limits** — Creator: users 1, leads 200, whatsapp_accounts 1, storage_gb 50, contract_sends 25, ig_accounts 0, facebook_accounts 0. Studio: users 5, leads 500, whatsapp_accounts 2, storage_gb 250, contract_sends 100, ig_accounts -1, facebook_accounts -1. Studio+: users 15, leads 5000, whatsapp_accounts 5, storage_gb 1024, contract_sends 500, ig -1, fb -1. Enterprise: ALL -1 (unlimited). Convention: -1 (or null) = unlimited. leads = NEW leads/calendar-month; contract_sends = contracts/proposals/quotes sent/month; storage_gb = GB.
- **Pricing (PKR, monthly + Founding-100)** — PLAN_CURRENCY='PKR'. Standard monthly: creator 7999, studio 14999, studio_plus 29999, enterprise null (custom). Founding-100 (50% off, locked permanently for first 100 paying customers): creator 3999, studio 7499, studio_plus 14999, enterprise null. Stored as plan_prices rows; founding rows carry is_founding=1. DEFAULT_PLAN='creator' (entry plan for new workspaces / unknown tiers).
- **Sold-but-unbuilt guard (UNBUILT_FEATURES)** — A Set forcing advertised-but-unimplemented features OFF at the resolver and hiding them from the advertised catalog, regardless of plan/flag/override. Currently UNBUILT_FEATURES = {'ai_editing'} only. Comments note reel_engine/story_engine (P8), style_profiles (P9), desktop_sync (P6) are now SHIPPED and removed from the set; ai_editing (P10 desktop native editing) still unbuilt. When forced off, sources[key]='unbuilt'.
- **Entitlements resolver** — getEntitlements(db, workspaceId, {fresh=false}) returns {plan, name, features, limits, sources}. Reads workspace_plan for plan key (lowercased, defaults to creator). Base features/limits from plan_features/plan_limits tables; if both empty, falls back to embedded PLAN_DEFINITIONS. Then layers: (a) workspace_plan.features / .limits JSON via Object.assign; (b) feature flags via applyFlags; (c) per-workspace overrides via applyOverrides; (d) unbuilt guard. sources map records provenance of each non-base value for the Command Center 'why' view. name resolved from PLAN_DEFINITIONS[planKey].name.
- **Feature flag resolution (applyFlags)** — Iterates active feature_flags. Precedence per flag: explicit workspace assignment (scope='workspace', scope_id=ws, most recent active by created_at) → explicit global assignment (scope='global') → flag default_state (true) → percentage rollout. Rollout uses deterministic bucket(workspaceId+':'+flagKey) < rollout_pct so a 25% rollout always hits the same workspaces (stable, never random). Assignments honor starts_at/ends_at time windows (activeNow). sources records flag:workspace / flag:global / flag:default / flag:rollout.
- **Per-workspace overrides (applyOverrides)** — Highest precedence. Reads entitlement_overrides where workspace_id matches AND revoked_at IS NULL, honoring starts_at/ends_at windows. kind='limit' sets limits[key] (source override:limit); kind='feature' or 'module' sets features[key] (source override:feature/override:module). kind='grace' is tracked in cc_grace_periods and consumed elsewhere (not applied here). Values parsed via safeJson.
- **Resolver cache** — 30-second in-memory Map (_cache) keyed by workspaceId storing {data, exp}. getEntitlements returns cached value unless expired or fresh:true. invalidate(workspaceId) deletes one entry; invalidate() with no arg clears the whole cache (called after grandfathering).
- **getAllPlans catalog** — Returns the all-plans catalog in the exact shape /api/workspace/plan-info expects (for the frontend plan-comparison UI). Reads active plans ordered by sort_order from the plans table with features (UNBUILT filtered out), limits, and priceFor() (cheapest standard + founding price + currency from plan_prices, falling back to PLAN_MONTHLY_PRICE/PLAN_FOUNDING_PRICE/PLAN_CURRENCY). Falls back entirely to embedded PLAN_DEFINITIONS if tables unseeded.
- **Live usage computation** — computeUsage(db, ws) returns {leads, users, whatsapp_accounts, contract_sends, storage_gb}. leads = COUNT leads where created_at >= month start; users = COUNT workspace_members; whatsapp_accounts = COUNT platform_accounts platform='whatsapp'; contract_sends = COUNT cs_documents with sent_at NOT NULL AND sent_at >= month start; storage = SUM(size_bytes) over ms_assets + ms_exports → GB rounded to 3 decimals. All computed live from source tables (no counter drift). Per-query fail-safe returns 0.
- **Rich usage block (buildUsage)** — Per metric in METRICS returns {used, limit, remaining, pct, level, monthly, reset_date}. remaining = -1 if unlimited else max(0, limit-used). monthly = !!MONTHLY[metric] (true for leads & contract_sends). reset_date = first instant of next calendar month for monthly metrics, else null.
- **Enforcement levels (levelFor)** — limit -1/null → {pct:0, level:'unlimited'}; limit 0 → {pct:100, level:'reached'}; else pct=min(100, round(used/limit*100)); level 'reached' if used>=limit, 'critical' if pct>=90, 'warn' if pct>=80, else 'ok'. Identical thresholds duplicated in storage-enforce.js levelFor.
- **Single-metric enforcement (checkLimit)** — checkLimit(db, ws, metric, limits): unlimited (lim -1) → allowed:true. If enforcement OFF → allowed:true (no count). Else computes live usage for that metric, allowed = used < lim, returns {allowed, level, pct, used, limit}. Wrapped in try/catch → fail-open allowed:true.
- **Convenience gate (canCreate)** — canCreate(db, ws, metric) resolves limits via entitlements.getEntitlements then delegates to checkLimit. Used by server.js event sites before creating leads/users/etc.
- **Master enforcement switch** — enforcementOn(db) reads pricing_config key='enforcement'; returns true unless value === 'off' (default 'on', fail-open true on error). Duplicated in both pricing.js and storage-enforce.js. Command Center can flip to 'off' to disable all enforcement platform-wide.
- **Grandfathering migration** — grandfatherExisting(db) runs once (guarded by pricing_config key='grandfathered'='1'). Every existing workspace_plan row on a legacy/unknown tier (not in creator/studio/studio_plus/enterprise) → studio_plus. Every existing workspace (DISTINCT users.workspace_id) with no plan row → INSERT studio_plus. Sets grandfathered=1, invalidates entitlements cache. New signups default to Creator (set at workspace_plan insert in server.js).
- **Founding-100 program status** — foundingStatus(db) returns {slots, taken, remaining, open}. slots from pricing_config founding_slots (default 100); taken = COUNT founding_program where active=1; remaining = max(0, slots-taken); open = taken < slots.
- **Storage quota gate** — gate(db, ws, incomingBytes=0) hard gate at upload time. Resolves storage_gb limit via entitlements → bytes. allowed:false only when enforcement ON, limit finite, and projected (used+incoming) strictly OVER limit (projected_bytes <= limit_bytes test). Unlimited plans / founder overrides / any error → allowed:true (fail-open). Returns full status spread.
- **Storage status** — status(db, ws, incomingBytes) returns {unlimited, limit_bytes, limit_gb, used_bytes, used_gb, projected_bytes, pct, level, projected_level, remaining_bytes}. used computed live; projected adds max(0, incomingBytes). Both current and projected levels computed via levelFor.
- **Storage threshold warnings (warn)** — warn(db, ws, notify) fires ONE notification per threshold crossing UP into a new band (80 warn 🟡 / 90 critical 🟠 / 100 reached 🔴). Dedup held in storage_warn_state.last_level using LEVEL_ORDER {ok/unlimited 0, warn 1, critical 2, reached 3}. Fires only when LEVEL_ORDER[new] > LEVEL_ORDER[prev] AND level != 'ok'. Records current level either way (drop-below then re-cross re-notifies). Copy includes used_gb/limit_gb/pct + tail; notify called with {type:'storage', title, body, url:'/settings/storage', icon}. Unlimited workspaces record 'ok' and return null. Fail-open (returns null on error).
- **Storage usedBytes / limitBytes** — usedBytes(db, ws) = SUM(COALESCE(storage_size, size_bytes)) over ms_assets WHERE deleted_at IS NULL + SUM(size_bytes) over ms_exports (mirrors cc-storage.js; prefers provider-tracked storage_size with legacy size_bytes fallback). limitBytes resolves entitlements storage_gb; null/-1 → -1 (unlimited) else gb*GB (GB=1024^3).
- **Storage abstraction (provider selection)** — createStorage({uploadsDir,path,fs}) picks provider from STORAGE_PROVIDER env (default 'local'). If 'r2' and provider initializes → R2; if r2 SDK/config missing → warns and falls back to local. Exposes provider name, isRemote, and methods uploadFile/deleteFile/getPublicUrl(+publicUrl alias)/fileExists/generateSignedUploadUrl/generateSignedDownloadUrl/getBuffer/localPath, plus back-compat aliases putBuffer→uploadFile, presignGet→generateSignedDownloadUrl, remove→deleteFile. Business logic only calls these + getPublicUrl, never touches /uploads or a provider directly.
- **Local provider** — Default + permanent fallback. Files under uploadsDir (default cwd/uploads). uploadFile mkdir -p + writeFileSync, returns {key,size,provider:'local',content_type}. getBuffer readFileSync. deleteFile unlinkSync (swallow missing). getPublicUrl → '/uploads/<key>' (collapsed slashes) served by static /uploads route. fileExists existsSync. generateSignedUploadUrl returns null (no presigned PUT; uploads via API multipart). generateSignedDownloadUrl returns getPublicUrl. localPath returns absolute path.
- **R2 provider** — Cloudflare R2 via AWS SDK v3 (S3-compatible). Returns null if SDK/config absent → index.js falls back to local. Config env: R2_ACCOUNT_ID, R2_BUCKET, R2_ENDPOINT (default https://<account>.r2.cloudflarestorage.com), R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_PUBLIC_BASE (optional public/CDN base). region 'auto'. uploadFile PutObjectCommand (ct default application/octet-stream). getBuffer GetObjectCommand → Buffer. deleteFile DeleteObjectCommand (swallow). getPublicUrl → publicBase/<key> if set else /api/storage/file/<encoded key> (presign redirect). fileExists HeadObjectCommand. generateSignedUploadUrl (default 900s exp) / generateSignedDownloadUrl (default 3600s) via signed-urls. localPath returns null.
- **Presigned URL helpers** — signed-urls.js makeSigners({S3,presigner,client,bucket}) returns uploadUrl(key,ct,exp=900)=presigner.getSignedUrl(PutObjectCommand) and downloadUrl(key,exp=3600)=presigner.getSignedUrl(GetObjectCommand). Lets bytes bypass the API server (direct PUT/GET to R2).
- **Storage file route (presign-redirect)** — mountRoutes(app, storage) adds GET /api/storage/file/:key. If storage.isRemote → generateSignedDownloadUrl + 302 redirect to short-lived presigned URL; else serves the local file via sendFile(localPath) if it exists, else 404. So a private R2 bucket needs no public CDN and the same URL works for any provider.
- **Workspace sync delta** — mountSync(app, db, deps) adds GET /api/workspace/sync?since=<ISO ts> (auth from deps, default pass-through). Returns rows changed since cursor across leads, ms_projects(projects), ms_assets(assets), ms_cull_decisions(cull), ms_albums(albums), ms_galleries(galleries), cs_documents(contracts), bookings, plus workspace_plan (plan) and workspace_brain (brain: key/value/confidence/source/updated_at). Delta signal = COALESCE(updated_at, created_at) per table (tries updated_at then created_at). Returns since, now (fresh cursor), schema_version 1, changes, plan, brain, counts, and more (list of collections that hit PAGE_CAP=2000 so client re-syncs from now, else false). Defensive: missing column/table yields [] not throw.

### API endpoints (2)
- `GET /api/storage/file/:key` — Provider-agnostic file fetch — 302-redirects to a presigned R2 download URL when remote, else serves the local file (404 if missing).
- `GET /api/workspace/sync` — Offline-first delta sync — returns all workspace rows (leads/projects/assets/cull/albums/galleries/contracts/bookings) changed since ?since cursor plus plan, brain, counts, and a fresh now cursor.

### Data model
- **plans** — Plan catalog (config-as-data); seeded from PLAN_DEFINITIONS, editable by Command Center. — _cols:_ id PK, key UNIQUE, name, description, status (active), visibility (public), sort_order, is_default, created_at, updated_at
- **plan_prices** — Per-plan prices incl. standard + Founding-100 rows. — _cols:_ id PK, plan_key, interval (month), region (default), currency (USD default, seeded PKR), amount, is_founding, active
- **plan_limits** — Per-plan numeric limits (users/leads/whatsapp_accounts/storage_gb/contract_sends/ig_accounts/facebook_accounts). — _cols:_ PK (plan_key, key), value INTEGER
- **plan_features** — Per-plan feature flags (JSON-encoded boolean enabled). — _cols:_ PK (plan_key, feature_key), enabled TEXT(JSON)
- **feature_flags** — Global feature flag definitions with default state + percentage rollout. — _cols:_ key PK, description, default_state, rollout_pct, status (active), created_at
- **flag_assignments** — Workspace- or global-scoped flag overrides, time-windowed. — _cols:_ id PK, flag_key, scope (workspace|global), scope_id, state, starts_at, ends_at, set_by, created_at; idx (flag_key,scope,scope_id)
- **entitlement_overrides** — Per-workspace limit/feature/module/grace overrides, time-windowed + revocable. — _cols:_ id PK, workspace_id, kind (limit|feature|module|grace), key, value, reason, admin_id, starts_at, ends_at, created_at, revoked_at; idx (workspace_id)
- **cc_config** — Generic Command Center key/value config namespace store. — _cols:_ PK (namespace, key), value, updated_by, updated_at
- **workspace_usage** — Per-workspace usage snapshot for current period. — _cols:_ workspace_id PK, period_start, reset_date, snapshot, updated_at
- **workspace_usage_history** — Historical per-metric usage rollups per period. — _cols:_ id PK, workspace_id, period_start, period_end, metric, used, lim, plan, created_at; idx (workspace_id)
- **founding_program** — Founding-100 membership (one slot per workspace). — _cols:_ workspace_id PK, slot, plan, joined_at, active
- **pricing_config** — Pricing flags: founding_slots (100), enforcement (on/off master switch), grandfathered (1). — _cols:_ key PK, value, updated_at
- **storage_warn_state** — Dedup state for storage threshold notifications (last band crossed). — _cols:_ workspace_id PK, last_level (ok/warn/critical/reached), notified_at
- **workspace_plan** — (Read by resolver/sync, owned elsewhere) per-workspace plan key + optional features/limits JSON overrides. — _cols:_ workspace_id, plan, features (JSON), limits (JSON), updated_at

### Rules, constraints & guarantees
- Limit convention: -1 or null = unlimited everywhere; limit 0 → immediately 'reached' (pct 100).
- Soft enforcement bands: pct>=80 warn, pct>=90 critical, used>=limit reached (hard stop). Duplicated identically in pricing.js and storage-enforce.js.
- Master switch pricing_config.enforcement: any value other than 'off' (incl. missing) = enforcement ON; 'off' disables all metric + storage enforcement platform-wide.
- All enforcement is fail-open: any error in checkLimit/gate/canCreate/warn yields allowed:true / null (never blocks the user on a bug).
- Storage gate blocks only when enforcement ON, limit finite, and projected bytes strictly exceed the limit (used+incoming > limit_bytes).
- Usage is always computed LIVE from source tables (leads, workspace_members, platform_accounts, cs_documents, ms_assets, ms_exports) — no stored counters, no drift.
- Monthly metrics (leads, contract_sends) scoped to the current calendar month (UTC) via monthBounds; reset_date = first instant of next month.
- leads counts NEW leads created this month; contract_sends counts cs_documents with sent_at this month; users counts workspace_members; whatsapp_accounts counts platform_accounts platform='whatsapp'.
- Resolver precedence (lowest→highest): plan_* base (or embedded fallback) → workspace_plan.features/.limits JSON → feature flags → entitlement_overrides → UNBUILT_FEATURES force-off.
- Flag precedence: explicit workspace assignment > explicit global assignment > flag default_state > deterministic percentage rollout.
- Override precedence: only revoked_at IS NULL and within starts_at/ends_at window apply; kind 'grace' is NOT applied here (handled in cc_grace_periods elsewhere).
- UNBUILT_FEATURES (currently {ai_editing}) are forced OFF regardless of plan/flag/override and hidden from getAllPlans catalog.
- Entitlements cached 30s per workspace; cache must be invalidated on plan/override/flag changes (and is auto-invalidated after grandfathering).
- Resolver degrades gracefully: usable without Command Center tables — falls back to embedded PLAN_DEFINITIONS when plan_* unseeded/missing.
- Grandfathering runs exactly once (guarded by pricing_config.grandfathered): pre-pricing workspaces / legacy tiers → studio_plus; new signups → creator (DEFAULT_PLAN).
- Plan re-seed is idempotent and surgical: only re-seeds plans/limits/features/prices when the current DEFAULT_PLAN key is absent; never touches per-workspace overrides/flags/usage.
- Storage usedBytes excludes soft-deleted assets (ms_assets.deleted_at IS NULL) and prefers provider-tracked storage_size over legacy size_bytes.
- Business logic must never touch /uploads or a provider directly — only the storage abstraction methods + getPublicUrl (single URL source of truth).
- Local provider has no presigned PUT (generateSignedUploadUrl returns null); uploads go through the API multipart route.
- R2 provider returns null (→ local fallback) unless SDK + bucket + endpoint + access key + secret are all present.
- Presigned URL expiries: upload 900s default, download 3600s default.
- Sync delta uses COALESCE(updated_at, created_at); hard-deletes are NOT captured (tombstones a tracked follow-up); leads soft-delete (is_deleted) does sync; per-table cap PAGE_CAP=2000, 'more' signals client to re-sync from now.
- Storage warning fires only when crossing UP into a higher band and never on 'ok'; current level is always recorded so dropping below then re-crossing re-notifies.

### Automations (crons / jobs / triggers / auto-behaviors)
- ensurePricing(db) on boot: ensures entitlements schema (+ seed), creates workspace_usage/workspace_usage_history/founding_program/pricing_config tables, seeds founding_slots=100 and enforcement='on' (INSERT OR IGNORE), then runs grandfatherExisting.
- entitlements.ensureSchema(db) on boot: creates plans/plan_prices/plan_limits/plan_features/feature_flags/flag_assignments/entitlement_overrides/cc_config + indexes, then seed() — re-seeds the full plan catalog (deleting prior plans/limits/features/prices) when DEFAULT_PLAN is missing.
- grandfatherExisting one-time migration: bulk-updates legacy/unknown plans to studio_plus, inserts studio_plus rows for plan-less workspaces, marks grandfathered=1, invalidates entitlements cache.
- Storage threshold notifications: warn() fires platform notifications (type 'storage', url /settings/storage) once per upward band crossing, deduped via storage_warn_state — triggered after an upload lands.
- Entitlements cache auto-expiry every 30s per workspace; explicit invalidate() clears all (e.g. post-grandfather).
- Percentage flag rollout is deterministic/stable per (workspace, flag) — same workspaces always included as rollout_pct grows, never random.

### AI behaviors
- No AI/ML/scoring logic in these files. They GATE AI features via boolean flags only: basic_ai, ai_reply_suggestions, ai_lead_intelligence, next_best_actions, studio_brain, ai_asset_scoring, ai_hero_shot, ai_culling, ai_project_intelligence, local_ai, style_profiles, story_engine, reel_engine, ai_editing.
- ai_editing is hard-disabled by the UNBUILT_FEATURES guard (sold-but-unbuilt) regardless of plan/flag/override — advisory catalog hides it and resolver forces it off.
- All enforcement is deterministic/rule-based (no scoring or AI suggestions); decisions are computed live from counts vs. plan limits.

### Integrations
- Cloudflare R2 (S3-compatible object storage) via AWS SDK v3 (@aws-sdk/client-s3 + @aws-sdk/s3-request-presigner), optional — selected by STORAGE_PROVIDER=r2; configured via R2_ACCOUNT_ID/R2_BUCKET/R2_ENDPOINT/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_PUBLIC_BASE.
- Local disk storage (default provider) served via the static /uploads route.
- Platform notification system (notify callback) used by storage threshold warnings (web-push/in-app feed channel).
- Desktop app / future web service-worker consume GET /api/workspace/sync for offline-first mirroring.
- Command Center control plane reads/writes plan_*/feature_flags/flag_assignments/entitlement_overrides/pricing_config to change pricing & enforcement without code changes.
- WhatsApp / Instagram / Facebook gated via plan limits (whatsapp_accounts, ig_accounts, facebook_accounts) and feature flags (whatsapp, instagram, facebook).

---

## 12. WappFlow Desktop (Electron shell)

An Electron desktop shell that wraps the WappFlow cloud product (CRM, Chat, WhatsApp, Media Studio, Contracts, Booking, Analytics, Command Center) in a single window and adds desktop-only superpowers. Core guarantees: (1) one-login — the workspace JWT obtained once in the native shell is injected into the cloud web app loaded in a <webview> so the user never signs in twice; (2) offline-first — a local JSON store caches server entities + entitlements and queues local mutations, replaying them on reconnect with a documented LWW/append-merge conflict policy; (3) native presence — system tray, close-to-tray, OS notifications, folder-watch ingestion, drag-drop and direct-to-R2 upload; (4) a desktop-first Local AI Engine that runs ONNX/CPU analyzers in an off-main utilityProcess to produce advisory Track-0 scores; (5) fleet self-registration + version policy enforcement against Command Center. The shell is workspace-scoped and points at an overridable WappFlow server (web URL for cloud modules, api URL for AI/sync/fleet).

### Features
- **Single-window module shell** — BrowserWindow 1440x920 (min 1024x680), bg #0b0c10, title 'WappFlow'. contextIsolation:true, nodeIntegration:false, sandbox:false (preload needs Node to bridge to main-process engine), webviewTag:true. Loads renderer/index.html. DevTools auto-open (detached) only in DEV.
- **One-login bridge / webview JWT inject** — On the <webview id=cloud> 'dom-ready' event the renderer checks if localStorage has a 'token'; if not it injects session.token, JSON-stringified user, and workspace into the webview's localStorage (keys token/user/workspace, matching what the cloud web app reads) and reloads the webview ONCE (guarded by authInjected flag) so it boots authenticated with no second sign-in.
- **Deep-link SSO token handoff** — Registers wappflow:// as default protocol client. handleDeepLink parses wappflow://auth?token=... ; if host==='auth' and a token param exists, auth.adoptToken(token) stores it as the session, calls /auth/me to backfill user+workspace, persists, then notifies renderer via 'auth:changed'. macOS handled via app 'open-url'; Windows/Linux via the second-instance argv scan.
- **Email/password login** — Login form (email, password, optional API URL override). auth.login POSTs to {api}/auth/login → {token,user,workspace}; on success persists encrypted session and renders the app. Enter key in password field submits. Errors surfaced from server error field or generic message.
- **Encrypted session persistence** — Session ({token,user,workspace,web,api}) persisted to userData/session.json encrypted via Electron safeStorage when available (falls back to plaintext UTF-8 buffer when encryption unavailable). Restored on launch; logout deletes the file. getSession returns null unless a token is present.
- **Server picker / override** — web+api URLs default to deployed product (DEV → localhost:3000/3001/api) and are overridable via env (WAPPFLOW_WEB_URL/WAPPFLOW_API_URL) or the in-app API field. setServer persists to userData/config.json, strips trailing slashes, and derives web from api when only api given (strips /api). app:setServer IPC writes it.
- **Auto-update seam** — Skipped in DEV. Uses electron-updater with autoDownload=false (Command Center governs / default to prompt). Emits 'update:available' and 'update:downloaded' to renderer; calls checkForUpdates() on launch. Wrapped in try/catch so it's optional in dev/unsigned builds.
- **Forced-update / blocked-version notice** — Renderer listens to 'update:policy'; on action!=='ok' it renders a full-screen modal overlay: 'block' → '⛔ This version is no longer supported'; 'update' → '⬆️ Update required', showing min_version when provided.
- **Module navigation (webview vs native split)** — Sidebar built from a MODULES list with sections Workspace/Communicate/Studio/Business/Platform. Cloud modules load a route in the <webview> (Dashboard /dashboard, Leads & Inbox /leads-list, Clients /clients, Team Chat /chat, WhatsApp /whatsapp, Media Studio /studio, Contracts /contracts, Booking /bookings, Analytics /reports, Command Center /control). Native module 'Local AI' (badge NEW, cloud:false) shows the in-shell Local AI view instead of the webview. openModule toggles webview vs local-ai panel and sets webview src to web URL + route.
- **Founder-gated Command Center** — The 'Platform' section and 'Command Center' nav entry (route /control) carry founderOnly:true and are rendered only when appInfo.founderEmail is set (WAPPFLOW_FOUNDER_EMAIL) and equals the logged-in user's email (lowercased). Command Center still enforces its own cc_admins login + IP allowlist server-side; this is a UI gate only.
- **System tray + close-to-tray** — Tray built from renderer/assets/tray.png (empty image fallback). Context menu: status line (WappFlow — Online OR Offline · N queued, disabled), Open WappFlow, Sync now, Quit(role:quit). Tray click + 'Open' restore/show/focus window. Tooltip mirrors status. Window 'close' on Windows/Linux (non-darwin) when a tray exists and not quitting → preventDefault + hide (keeps background sync + watch alive). window-all-closed quits only if non-darwin AND no tray.
- **OS notifications** — notifications.notify({title,body,silent,data}) shows a native Electron Notification (default title 'WappFlow'); guarded by Notification.isSupported(). Click handler set in main to focus/show the window. Exposed to renderer via notify:show. Used for mentions/calls/sync/ingest events.
- **Folder-watch ingestion** — watcher.start({folder,projectId}) uses fs.watch (recursive on win/mac; top-level only on linux). Filters to a media extension allowlist; debounces each file 1.5s (settle until it stops growing); de-dupes via a per-session 'seen' set + fs.existsSync check, then uploads via uploader.uploadFile. Emits events watching/ingesting/ingested/error to renderer (toasts). status() reports {watching,folder,project_id}. Stopped on before-quit.
- **Drag-drop ingestion** — Renderer captures window dragenter/dragover/dragleave/drop with a drop overlay (dragDepth counter). On drop it reads absolute .path from each Electron File, prompts to choose a target project (window.prompt list, remembers lastProjectId), and calls upload.files. Toasts progress/failure.
- **Direct-to-R2 upload** — uploader.uploadFile: asks API POST /media/projects/:id/uploads/sign {filename,content_type,size} (also enforces storage quota). If provider==='r2' with an upload_url → reads file, PUTs bytes straight to the bucket (Content-Type set, no API proxy, 10-min timeout), then POST .../uploads/complete {key,filename,content_type,size} to register+ingest. Otherwise falls back to a hand-built dependency-free multipart POST to /media/projects/:id/assets. guessType maps ~25 extensions incl RAW (cr2/cr3/nef/arw/raf/rw2/dng/orf/srw/pef) and video. uploadFiles loops per-file (never throws on one bad file) with per-file progress.
- **File/folder pickers** — dialog:pickFolder (openDirectory) and dialog:pickFiles (openFile, multiSelections) IPC handlers returning chosen path(s) or null/[] on cancel/error.
- **Offline store (local cache + queue)** — Dependency-free JSON store at userData/offline.json with atomic writes (tmp file + rename). Holds: cursor (last sync delta 'now'), cache (read-replica of server entities keyed by table→id), queue (ordered local mutations), entitlements (cached plan/flags/brain). Exposes getTable/getRecord, enqueue/pending/markDone/markFailed/purgeDone, applyDelta/reconcileQueue, cacheEntitlements/getEntitlements/can(feature), stats.
- **Conflict merge (LWW + append)** — mergeRecord: scalar fields → last-write-wins by updated_at (fallback created_at); array/list fields → append-merge via unionList (union deduped by .id or JSON value). reconcileQueue drops a pending write as 'superseded' when the cached record's timestamp >= the queued mutation's ts (and ts>0) — i.e. the server already caught up.
- **Offline sync driver** — sync.pull GETs /workspace/sync?since=cursor → applyDelta (merges changes, advances cursor, caches plan/brain). sync.flush replays pending mutations to the same REST routes: 4xx → drop (markFailed+markDone, unrecoverable); network/5xx → mark transient, set offline, stop+retry later. syncNow = pull then flush. Initial sync on login; periodic sync every 2 min; setOnline transitions emit state; enqueue stamps Date.now() and emits.
- **Offline banner + online detection** — Renderer reports navigator.onLine via sync.setOnline on load + window online/offline events (online also triggers backend sync + 'Back online — syncing…' toast). Banner: offline → '⚠ Offline — working locally · N changes queued. They'll sync when you reconnect.'; queued>0 while online → blue 'Syncing N queued changes…'; else hidden. Driven by sync:state events + initial sync.state().
- **Entitlement cache for offline gating** — store.can(feature) returns entitlements.features[feature] !== false; unknown/absent entitlements → allow (online check governs). plan + brain ride the sync delta and are cached into entitlements for offline feature gating.
- **Fleet self-registration** — reporter.report POSTs /desktop/report {device_id, version, platform, last_sync, machine} with the auth header. Sent on first sign-in pass and every 30 min. Skipped when no auth. Also exposed via fleet:report IPC.
- **Version policy enforcement** — reporter.checkPolicy GETs /desktop/update-policy?version with auth. interpretPolicy: uses server-provided {action} as-is; else derives — version in blocked_versions → 'block'; version < min_version (semver-ish cmpVer) → 'update' with min_version; else 'ok' with latest_version. Non-'ok' actions pushed to renderer as 'update:policy' on launch + every 30 min. Exposed via fleet:policy.
- **Stable device identity** — device.deviceId generates 'dev_'+12 random bytes hex once and persists to userData/device.json with created_at; reused across launches/updates. machineInfo reports non-identifying facts: hostname, platform, arch, os_release, cpu_count, total_mem_gb (no serials/MAC).
- **Local AI Engine (analyze project)** — engine.analyzeProject({projectId,force}): guards (signed in, projectId, not already running, jimp/CPU available). Reads server work queue via GET .../intelligence → pending map; pages all photo assets (limit 500); work list = assets where a CLIENT_TIER analyzer (vision/video) is pending (or all if force). For each: downloads asset bytes (prefers ≤2048px 'web' variant), runs vision analyzer in the utilityProcess, accumulates score items, batch-flushes every 50 items (UPLOAD_CHUNK). Then a video pass (limit 200) running the video analyzer. Honors analyze-once (skips already-scored). Emits progress/log events; cancelable; returns summary {total,analyzed,uploaded,skipped,errors,cancelled}.
- **Inference utilityProcess (off-main ONNX)** — inference-client.spawn forks ai/inference-host.js as an Electron utilityProcess (serviceName 'wappflow-ai'). run() sends {type:'run',id,analyzer,buffer(Uint8Array),meta} and awaits {type:'result',...}; warmup() pre-creates model sessions off the main thread on launch (called from initServices). Graceful degradation: no utilityProcess (not Electron / spawn fail) or child death → transparently falls back to in-process analyzers.runAnalyzer so analysis never breaks (just blocks). Child posts 'ready' on start, handles run/status/warmup.
- **Vision analyzer (CPU + ONNX)** — CPU pass via jimp computes composition (rule-of-thirds from gradient-energy centroid) + aesthetic (sharpness via Laplacian variance, exposure, contrast, Hasler–Süsstrunk colourfulness). ONNX pass (only if models present): UltraFace RFB-320 → face_count (threshold 0.7 + NMS 0.4); FER+ on each face crop → smile (max happiness) with full emotion distribution + dominant in reasons; heuristic eyes_open (low-confidence, eye-band Laplacian energy). Always emits scene_class (CPU heuristic: portrait/group/landscape/scene + indoor/outdoor from sky/foliage colour). model_version vision-v1.
- **Video analyzer (ffmpeg)** — Writes clip to a temp dir, samples frames at fps=1 (max 15) via ffmpeg, runs CPU vision metrics per frame, aggregates to clip-level Track-0 video scores via video-frames.aggregate. Returns [] without ffmpeg or on undecodable input → never blocks the run. model_version video-v1. Temp dir cleaned up.
- **GPU/CPU execution providers** — onnx.session creates InferenceSession with providers ['dml','cpu'] on Windows, ['cuda','cpu'] elsewhere (GPU first, CPU fallback). onnxruntime-node is an optional dependency, lazy-required; absent → CPU analyzers still run, vision ONNX models unavailable. Sessions cached per model file.
- **Score upload to Track-0** — scores-client batch POST /media/projects/:id/scores {items:[{asset_id,analyzer_id,model_version,scores,source:'desktop'}]}; retry path falls back to per-asset POST /media/assets/:id/scores. model_version sent equals the server registry version so the analyze-once ledger clears 'pending'.
- **AI runtime status + project list** — engine.status → {authed, running, runtime:{cpu(jimp present), onnx(available/provider/modelsDir), models:{face_detect,face_expression present}}}. listProjects via /media/projects. analyze + cancel exposed over IPC and the preload bridge with progress/log event subscriptions.
- **App menu** — Standard menu: appMenu(mac only), File, Edit, View (reload/forceReload/zoom/togglefullscreen; toggleDevTools only in DEV), Help (WappFlow Home → opens default web URL externally; About → sends nav{view:'about'} to renderer).
- **External link handling** — setWindowOpenHandler opens any http(s) URL in the user's system browser (deny in-app) and allows non-web (internal) targets.
- **Single-instance lock** — requestSingleInstanceLock; if not acquired the second launch quits. A second instance focuses the existing window and forwards any wappflow:// arg as a deep link.
- **Toast notifications (renderer)** — In-app toast stack (info/ok/error colored left-border) for upload progress, watch ingest events, and back-online; auto-fades after ~4.2s.

### API endpoints (43)
- `IPC app:info` — Return {version, web, api, env, platform, founderEmail}
- `IPC app:setServer` — Persist web/api server override
- `IPC auth:status` — Return current session (incl token for webview inject) or null
- `IPC auth:login` — Email/password login {email,password,api}
- `IPC auth:logout` — Clear + delete persisted session
- `IPC ai:status` — Local AI engine + runtime status
- `IPC ai:projects` — List Media Studio projects
- `IPC ai:analyze` — Analyze a project (vision+video, analyze-once unless force)
- `IPC ai:cancel` — Cancel the running analysis
- `IPC fleet:report` — Self-register device with Command Center
- `IPC fleet:policy` — Fetch version/update policy
- `IPC sync:now` — Pull delta + flush queue + push sync state
- `IPC sync:state` — Return {online, cursor, queued, ...stats}
- `IPC sync:enqueue` — Queue a local mutation for replay
- `IPC net:online` — Renderer reports navigator.onLine; triggers sync when online
- `IPC notify:show` — Show a native OS notification
- `IPC watch:start` — Start folder-watch ingestion {folder,projectId}
- `IPC watch:stop` — Stop folder watch
- `IPC watch:status` — Folder-watch status
- `IPC upload:files` — Upload local file paths to a project
- `IPC dialog:pickFolder` — Open native folder picker
- `IPC dialog:pickFiles` — Open native multi-file picker
- `IPC(EVENT) ai:progress / ai:log` — main→renderer engine progress + log lines
- `IPC(EVENT) auth:changed` — main→renderer after deep-link token adoption
- `IPC(EVENT) update:available / update:downloaded / update:policy` — main→renderer auto-update + forced-update notices
- `IPC(EVENT) sync:state` — main→renderer offline/queued state changes
- `IPC(EVENT) watch:event / upload:progress / nav` — main→renderer watch ingest, upload progress, menu nav
- `POST {api}/auth/login` — Workspace login → {token,user,workspace} (server)
- `GET {api}/auth/me` — Backfill user+workspace from a deep-link token (server)
- `POST {api}/desktop/report` — Fleet self-registration (server, cc-desktop.js)
- `GET {api}/desktop/update-policy?version` — Version policy {action,latest/min_version} (server)
- `GET {api}/workspace/sync?since=cursor` — Offline sync delta (changes, now, plan, brain) (server)
- `GET {api}/media/projects` — List projects for Local AI (server)
- `GET {api}/media/projects/:id/assets` — List assets (type/limit/offset) (server)
- `GET {api}/media/projects/:id/intelligence` — Work queue {scores,pending,analyzers} (server)
- `POST {api}/media/projects/:id/scores` — Batch upload Track-0 scores (server)
- `POST {api}/media/assets/:id/scores` — Single-asset score upload (retry path) (server)
- `POST {api}/media/projects/:id/uploads/sign` — Request presigned R2 PUT + quota gate (server)
- `PUT {r2 upload_url}` — Direct-to-bucket byte upload (no API proxy)
- `POST {api}/media/projects/:id/uploads/complete` — Register asset + enqueue ingest after R2 PUT (server)
- `POST {api}/media/projects/:id/assets` — Multipart upload fallback (local-storage workspaces) (server)
- `GET {web|host}/uploads/:storage_key` — Pull asset bytes for local analysis (public, CORS)
- `PROTOCOL wappflow://auth?token=...` — Deep-link SSO token handoff

### Data model
- **session.json (userData, encrypted)** — Persisted workspace session for one-login + webview inject — _cols:_ token, user, workspace, web, api (safeStorage-encrypted)
- **config.json (userData)** — Server override (web/api URLs) — _cols:_ web, api
- **device.json (userData)** — Stable per-install device identity for fleet reporting — _cols:_ id (dev_<hex>), created_at
- **offline.json (userData) — cursor** — Last server sync cursor (delta 'now') — _cols:_ cursor
- **offline.json — cache** — Read-replica of server entities for offline reads — _cols:_ table → { id → record } (merged via LWW/append)
- **offline.json — queue** — Ordered local mutations replayed on reconnect — _cols:_ seq, id, ts, method, path, body, entity, entity_id, status(pending/done/superseded), tries, last_error
- **offline.json — entitlements** — Cached plan/flags/brain for offline feature gating — _cols:_ plan, brain, features{}
- **ai-cache (userData dir)** — Cache dir for downloaded AI assets / analyze-once ledger mirror — _cols:_ (filesystem cache)
- **ai/models/*.onnx (in-app, not committed)** — Vision ONNX models (UltraFace face-detect, FER+ expression) — _cols:_ ultraface-rfb-320.onnx, emotion-ferplus.onnx

### Rules, constraints & guarantees
- Renderer can ONLY touch main via the preload contextBridge (window.wappflow); no Node, no raw ipcRenderer; generic 'on' channel allowlist = ['nav'] only.
- Session persisted encrypted via safeStorage when available; plaintext fallback only when encryption unavailable. getSession returns null unless a token exists.
- One-login webview inject only fires when localStorage 'token' is absent, and reloads the webview exactly once (authInjected guard).
- Command Center nav is shown only when WAPPFLOW_FOUNDER_EMAIL is set AND equals the logged-in email (lowercased); server still enforces cc_admins + IP allowlist independently (UI gate is advisory).
- Analyze-once: only assets whose pending list includes a client-tier analyzer (vision/video) are analyzed, unless force=true; model_version sent must equal the server registry version to clear pending.
- Only one analysis run at a time (engine.running guard); analysis blocked if jimp/CPU analyzer unavailable.
- Local AI is advisory-only / client-tier (vision, video); eyes_open + scene_class explicitly low-confidence/heuristic; control stays server-side.
- Upload sign step enforces the storage quota gate server-side before any bytes move; R2 uploads go direct-to-bucket (API never proxies bytes).
- Sync flush: 4xx → drop mutation (unrecoverable); network/5xx → transient, mark offline + stop + retry later. reconcileQueue drops writes the server has already superseded (cached ts >= queued ts).
- Conflict policy: scalar fields last-write-wins by updated_at; array fields append-merge (union deduped by id/value).
- Entitlement gating fails open: unknown feature/absent entitlements → allowed (online check governs).
- Close hides to tray (background sync/watch kept alive) only on Windows/Linux when a tray exists and the user didn't choose Quit; macOS keeps its lifecycle.
- Single-instance lock: second launch quits but focuses existing window and forwards any wappflow:// deep link.
- External http(s) links always open in the system browser, never in-app.
- Device machine facts are non-identifying (no serials/MAC) — hostname/platform/arch/os_release/cpu_count/total_mem_gb only.
- Auto-update autoDownload=false (Command Center governs); auto-update entirely skipped in DEV.
- Folder-watch + drag-drop only ingest files matching the media extension allowlist; watch debounces 1.5s and de-dupes per session.
- Asset download prefers the ≤2048px 'web' variant (falls back thumb/original/uploads) with short timeouts so one bad asset fails fast and the run continues.
- All AI/sync/fleet/upload JSON calls carry the workspace Bearer token; asset bytes pulled from the public /uploads path.

### Automations (crons / jobs / triggers / auto-behaviors)
- On launch (initServices): warm the inference utilityProcess + ONNX sessions off the main thread; build tray; set notification click handler; subscribe to sync state; first signed-in pass kicks fleet report + policy check + initial sync.
- setInterval every 2 min: sync.syncNow + push sync state (when signed in).
- setInterval every 30 min: re-report to fleet + re-check version policy; push non-ok policy to renderer (when signed in).
- On reconnect (net:online true): immediately sync.syncNow + push state.
- On launch: auto-update checkForUpdates (non-DEV); setAsDefaultProtocolClient('wappflow').
- Folder watch: debounced 1.5s auto-upload of new media files into the configured project; emits ingest events/toasts.
- Window close → hide-to-tray (keeps background sync + watch running) on Win/Linux with a tray.
- before-quit: stop watcher + clear all service timers.
- Periodic-equivalent: tray menu/tooltip refreshed on every sync state change (Online vs Offline·N queued).
- On dom-ready of cloud webview: auto-inject session into localStorage + one-time reload (one-login).
- Engine batch-flush: scores auto-uploaded every 50 analyzed items (and final partial batch) with per-asset retry fallback.

### AI behaviors
- Local AI Engine: desktop-first worker producing advisory Track-0 scores; fulfils only client-tier analyzers (vision, video); control/decisions remain server-side.
- Vision analyzer (model_version vision-v1): CPU primitives composition (rule-of-thirds) + aesthetic (sharpness/exposure/contrast/colourfulness) always; ONNX face_count (UltraFace RFB-320, thresh 0.7 + NMS 0.4), smile (FER+ happiness, full 8-emotion distribution + dominant in reasons), heuristic eyes_open (low-confidence) when models present; scene_class always (CPU heuristic portrait/group/landscape/scene + indoor/outdoor).
- Video analyzer (model_version video-v1): ffmpeg fps=1 frame sampling (max 15) → per-frame CPU metrics → aggregated clip-level quality/motion/scene_cut/shake scores; returns [] without ffmpeg (never blocks).
- Inference runs in an Electron utilityProcess (off main thread) with warmup on launch; transparent in-process fallback if the child is unavailable or dies.
- GPU acceleration when available (DirectML on Windows, CUDA elsewhere) with CPU fallback; onnxruntime-node optional — absent means CPU analyzers only.
- Analyze-once honored via server pending map; model_version aligned with server registry so scoring is idempotent; force re-analyze backfills new score types (e.g. v1 added eyes_open + scene_class).
- All scores tagged source:'desktop' and uploaded to Track-0; reasons objects carry explainability (detector/model names, distributions, confidence).
- Plan/brain entitlements cached from the sync delta drive offline feature gating (fail-open).

### Integrations
- Cloudflare R2 — direct-to-bucket presigned PUT uploads (sign → PUT → complete), bypassing the API as a byte proxy; multipart-to-API fallback for local-storage workspaces.
- WappFlow cloud web app — loaded in an Electron <webview> with localStorage JWT injection (one-login) for CRM/Chat/WhatsApp/Media Studio/Contracts/Booking/Analytics/Command Center.
- WappFlow API — auth, /workspace/sync, /desktop fleet+policy, /media intelligence+scores+uploads.
- Command Center (platform control plane) — fleet self-registration + version/force-update policy; founder-gated /control nav.
- ONNX Runtime (onnxruntime-node, optional dep) with DirectML (Windows) / CUDA (Linux) execution providers; UltraFace + FER+ ONNX models from the ONNX Model Zoo.
- ffmpeg (spawned CLI) — video frame sampling for the video analyzer.
- jimp — pure-JS CPU image decoding/metrics (no native build).
- electron-updater — auto-update (prompt-driven, Command Center governed).
- Electron safeStorage — encrypted session-at-rest.
- Electron native shell — Tray, Notification, dialog, utilityProcess, custom wappflow:// protocol, single-instance lock.
- axios — all HTTP to the WappFlow API + R2 + public /uploads.

---

## 13. Client Portal + Public/Token Surfaces + Web App Shape (wappflow-web, Next.js App Router)

The wappflow-web Next.js app (App Router, all pages 'use client') comprises three route families: (1) public token/slug surfaces that need no login — client portal, gallery, signable docs, print shop, payment, booking, booking-management, public portfolio, accept-invite, impersonate; (2) the authenticated in-app modules — dashboard/CRM, leads, clients, chat, contracts, studio (Media Studio), booking admin, invoices, reports, settings, team, knowledge, profile, trash, whatsapp; and (3) the platform-admin Command Center under /control/*. The app is a PWA (Next metadata manifest at /manifest.webmanifest, a no-cache passthrough service worker at /sw.js that handles Web Push, and a usePushNotifications hook for VAPID subscription). Public pages fetch JSON from the backend by token and degrade gracefully to not-found/expired/declined/password states; they store nothing but a guest name and gallery favorites in localStorage. Core guarantees: public surfaces are token-scoped and read-mostly, signing is ESIGN/UETA-consented with IP/timestamp/device capture, and impersonation preserves the admin's prior session for restore.

### Features
- **Client Portal (/client/[token])** — Single-page branded portal keyed by token. fetchClientPortal returns {brand, client_name, milestones, documents, galleries, albums, invoices, orders, projects}. Sets document.title to '<brand> · Your portal'. Sections rendered only when populated: Progress (milestones with done/in_progress/pending icons + due_date), Documents (links with DOC_STATUS pill: draft/sent/viewed/signed/completed/declined/expired/pending_approval), Galleries (open in new tab), Albums (page_count + status), Invoices (currency-symbol money + INV_STATUS pill draft/sent/paid/overdue + fmtDate robust to SQLite-naive vs ISO timestamps), Orders (item qty×name list, total, status), Projects (title + status). Loading spinner; 'Not available' on any fetch error. Footer 'Powered by <brand>'.
- **Client Gallery (/g/[token])** — Dark masonry photo gallery (column-based). Fetches GET /api/media/portal/:token directly via BASE_URL; handles 404 (not available), 401 (password gate showing a lock + password input, retried as ?pw=), and ok. Features: per-asset favorite (POST .../favorite returns favorites count + favorited bool, optimistic Set), favorites-only filter toggle, 'Save selection as a collection' (window.prompt name → POST .../collection with faved ids), per-asset comment modal (POST .../comment), download-all ZIP (POST .../export → poll GET .../export/:export_id every 2s up to 40 tries → window.location to download_url; hidden when download_policy==='none'), per-asset direct download link when download_url present, 'Order prints' link to /shop/:token when store_enabled. Story sections: groups assets by folder_id into named data.sections when >1, with a 'More photos' orphan safety-net. Lightbox + slideshow (auto-advance 3.5s, prev/next, index counter, fav/comment/download/play-pause controls reachable on touch). Guest name persisted to localStorage wf_gallery_contact. Proofing/selection mode: sticky banner with title/instructions/quota, selectable when proof.status in ['open','revision'], per-asset select toggle (POST .../proofing/:id/select), submit (POST .../proofing/:id/submit) flips to 'submitted'; quota over-count warns amber. Fraunces serif hero font.
- **Public Document / Sign (/d/[token])** — Renders a Contracts-Studio document by token via fetchPublicDoc (GET /api/cs/public/:token; 410→expired, else not_found). States: loading/ok/missing/expired/declined; if status signed/completed shows 'Signed' banner with optional signed-PDF download. Renders document blocks via shared BlockView/DocFrame with theme (default/executive/editorial outer bg) and letterhead/upload. Interactive pricing: package blocks (single-select, seeds featured/0), addons blocks (multi-select Set seeded from .on), pricing_table; computes live currency+total in a sticky bottom bar. 'Review & sign' opens SignSheet: typed full legal name (prefilled from first pending signer), draw-signature canvas (devicePixelRatio-scaled, clear), ESIGN/UETA consent checkbox (consents to IP/timestamp/device recording), validation, signPublicDoc with {typed_name, signature_data dataURL, consent, selection:{packages,addons,total,currency}}; Decline path (window.prompt reason → declinePublicDoc). Analytics: trackPublicDoc emits time_on_page {seconds, deepest_block, total_blocks} on visibility-hidden/pagehide via IntersectionObserver tracking deepest read block. AskWidget: floating AI Q&A chat (askPublicDoc → answer) grounded in the document.
- **Print Shop (/shop/[token])** — Public ordering page via fetchShop (GET /api/store/public/:token). Shows brand, optional gallery_title, products (name, kind, description, options [{label,price}]). Cart with add (de-dupes by product::option, increments qty), qty number input, remove, sticky bottom bar with item count + total. Checkout collects name + phone/email (one required) + note; createOrder POSTs {items:[{product_id,option,qty}], name, phone, email, note}. Success screen shows total. currency_symbol from data.
- **Payment (/pay/[token])** — Minimal pay page via fetchPayment (GET /api/payments/public/:token). Reads ?status query (success/cancelled). Shows amount due (currency_symbol + amount) + description; if checkout_url present renders 'Pay securely →' link, else a message that online payment isn't enabled (studio marks paid manually). Paid state (status==='paid' or ?status=success) shows 'Payment received'. Cancelled shows retry note. '🔒 Secure payment' footer.
- **Public Booking (/book/[slug])** — Self-serve booking by workspace slug via fetchBookingPublic (GET /api/booking/public/:slug). Shows brand, services (name, duration, price), available slots grouped by day with time grid, intake custom questions (label, required), client details (name + phone/email one required, notes). createBooking POSTs {service, start_at, name, phone, email, notes, intake}. Shows timezone note. Confirmation screen with service + formatted start time, 'A confirmation has been sent'.
- **Booking Self-Management (/booking/manage/[token])** — Client-facing manage page via fetchBookingManage (GET /api/booking/manage/:token). Shows the booking (service, full datetime, status pill cancelled/confirmed). Reschedule mode: day+time picker (rescheduleBookingPublic POST .../reschedule {start_at}) reloads. Cancel (window.confirm → cancelBookingPublic POST .../cancel). Hides actions when already cancelled. Status messages inline.
- **Public Portfolio (/folio/[handle])** — Public photographer portfolio by vanity handle via fetchPublicPortfolio (GET /api/media/public/portfolio/:handle; 404→missing). Renders shared PortfolioCanvas component with portfolio + items. States loading/ok/missing/error; 'Portfolio not found' for private/incorrect.
- **Accept Invite (/accept-invite?token=)** — Team-invite onboarding (Suspense-wrapped, reads ?token). inviteAPI.getInfo(token) returns {email, workspace_name, role}; shows workspace badge + role label (super_admin/admin/manager/user). Form: full_name, password (min 6), confirm (live mismatch border). inviteAPI.accept({token,password,full_name}) → stores token/user/workspace in localStorage → redirect /dashboard after 1.8s. Invalid/used link state with 'Go to Login'. Success 'Welcome aboard' state.
- **Impersonate (/impersonate?token=)** — Command Center impersonation handoff. Reads ?token, preserves admin's own session into cc_prev_token/cc_prev_user/cc_prev_workspace, sets new token, fetches /api/auth/me (Bearer) to hydrate user+workspace, sets cc_impersonating=1 + cc_imp_name, redirects /dashboard. Writes blocked server-side in read mode.
- **PWA + Web Push** — manifest.js generates /manifest.webmanifest (name WappFlow, start_url /dashboard, scope /, standalone, portrait, bg #0b0b0f, theme #6366f1, icon.svg any+maskable). Root layout registers /sw.js on load. sw.js: skipWaiting + clients.claim, no-cache network passthrough fetch (installability only), push handler (parses JSON or text → showNotification with title/body/icon /icon-192.png/badge /icon-72.png/vibrate/tag/renotify/actions Open+Dismiss), notificationclick focuses matching client url or opens data.url||/dashboard. usePushNotifications hook: detects support, requests permission, registers SW, fetches GET /api/push/vapid-key, pushManager.subscribe(userVisibleOnly), POST /api/push/subscribe (Bearer), unsubscribe DELETE /api/push/unsubscribe, sendTest POST /api/push/test.
- **Milestones (Progress)** — Surfaced read-only inside the Client Portal Progress section: each milestone {title, status (done/in_progress/pending), due_date} rendered with status icon and capitalized label. Authored/managed in the authenticated app (not editable from the public portal).
- **In-app shell + session behavior** — Root layout pre-hydration inline script: applies saved theme (light/dark) before paint; session-persistence logic (wf_persist==='session' clears token/user/workspace on genuinely-fresh visits, keyed off same-origin referrer + sessionStorage wf_alive); registers service worker. Providers wraps app in ConfirmProvider, SoundProvider, PlanProvider, PlanLockStyles, UsageWarnings. Studio layout sets data-ms-theme (monochrome/editorial/cinema, migrating legacy dark-pro/airy/bold) before paint + loads studio.css, title 'Media Studio'. Contracts layout title 'Contracts Studio'. Control layout wraps all /control routes (except /control/login) in ControlShell which enforces platform-admin auth guard.
- **In-app module pages** — Authenticated route inventory (route-level): /dashboard (CRM kanban: New/Contacted/Interested/Negotiating/Closed-Won/Closed-Lost, drag-drop, charts, NavBar, sounds), /leads-list, /leads/[id], /clients, /chat, /whatsapp, /bookings (admin), /invoices, /reports, /team, /knowledge, /profile, /trash, /help, /settings, /settings/storage (workspace storage usage meter with ok/warn/critical/reached/unlimited levels via storageAPI.usage). Marketing/auth: / (landing, plan-tier-aware CTAs, Flux FLUX_PARKED gating), /login, /signup, /privacy, /terms.
- **Studio (Media Studio) sub-pages** — /studio (shell), /studio/portfolio, /studio/settings, /studio/store, /studio/trash, /studio/help, /studio/[id] (project), /studio/[id]/albums, /studio/[id]/albums/[albumId], /studio/[id]/album/[albumId], /studio/[id]/cull, /studio/[id]/reel/[reelId], /studio/[id]/video, /studio/[id]/video/[timelineId]. Supporting modules: presets.js, video-constants.js, StudioThemeToggle.js, studio.css.
- **Contracts Studio sub-pages** — /contracts (list), /contracts/[id] (editor), /contracts/analytics, /contracts/settings, /contracts/vault, /contracts/help. Shared blocks.js (BlockView/DocFrame + block types package/addons/pricing_table) and contracts.css reused by the public /d/[token] signer.
- **Command Center (/control/*)** — Platform admin plane behind ControlShell auth guard: /control (home), /control/login (bare), /control/adoption, /control/ai, /control/audit, /control/customers, /control/customers/[id], /control/database, /control/desktop, /control/events, /control/flags, /control/health, /control/inbox, /control/plans, /control/reports, /control/storage, /control/support, /control/timemachine. Drives impersonation via /impersonate handoff.

### API endpoints (45)
- `PAGE /client/[token]` — Client portal hub (documents, galleries, albums, invoices, orders, projects, milestones)
- `PAGE /g/[token]` — Client photo gallery (favorites, collections, comments, download-all ZIP, proofing, slideshow)
- `PAGE /d/[token]` — Public document view + e-sign (pricing selection, sign canvas, decline, AI ask, analytics)
- `PAGE /shop/[token]` — Public print shop ordering + checkout
- `PAGE /pay/[token]` — Public payment page (Stripe checkout link or manual-pay notice)
- `PAGE /book/[slug]` — Public self-serve booking by workspace slug
- `PAGE /booking/manage/[token]` — Client booking self-management (reschedule/cancel)
- `PAGE /folio/[handle]` — Public portfolio by vanity handle
- `PAGE /accept-invite` — Team invite acceptance / account setup (?token)
- `PAGE /impersonate` — Command Center impersonation session handoff (?token)
- `PAGE /manifest.webmanifest` — PWA manifest (Next metadata route from manifest.js)
- `GET /sw.js` — Service worker: push notifications + no-cache passthrough fetch
- `GET /api/client-portal/public/:token` — Client portal data (fetchClientPortal)
- `GET /api/media/portal/:token` — Gallery data; ?pw for password; 401 gate / 404
- `POST /api/media/portal/:token/favorite` — Toggle gallery favorite (returns count + state)
- `POST /api/media/portal/:token/collection` — Save favorited assets as a named collection
- `POST /api/media/portal/:token/comment` — Leave a comment on a gallery asset
- `POST /api/media/portal/:token/export` — Start gallery download-all ZIP export
- `GET /api/media/portal/:token/export/:export_id` — Poll export status; returns download_url when ready
- `POST /api/media/portal/:token/proofing/:id/select` — Select/deselect an asset in a proofing set
- `POST /api/media/portal/:token/proofing/:id/submit` — Submit proofing selections
- `GET /api/media/public/portfolio/:handle` — Public portfolio by handle (fetchPublicPortfolio)
- `GET /api/cs/public/:token` — Public contracts-studio document (fetchPublicDoc; 410=expired)
- `POST /api/cs/public/:token/sign` — Submit e-signature (typed_name, signature_data, consent, selection)
- `POST /api/cs/public/:token/decline` — Decline a document with optional reason
- `POST /api/cs/public/:token/ask` — AI Q&A grounded in the document (returns answer)
- `POST /api/cs/public/:token/track` — Document analytics beacon (time_on_page, deepest_block)
- `GET /api/store/public/:token` — Public shop catalog (fetchShop)
- `POST /api/store/public/:token` — Place a print order (createOrder)
- `GET /api/payments/public/:token` — Public payment record (fetchPayment)
- `GET /api/booking/public/:slug` — Public booking availability (fetchBookingPublic)
- `POST /api/booking/public/:slug` — Create a booking (createBooking)
- `GET /api/booking/manage/:token` — Booking self-manage data (fetchBookingManage)
- `POST /api/booking/manage/:token/reschedule` — Reschedule a booking (start_at)
- `POST /api/booking/manage/:token/cancel` — Cancel a booking
- `GET /api/auth/me` — Resolve user+workspace for impersonation handoff (Bearer)
- `GET /api/push/vapid-key` — Fetch VAPID public key for push subscribe
- `POST /api/push/subscribe` — Register Web Push subscription (Bearer)
- `DELETE /api/push/unsubscribe` — Remove a Web Push subscription by endpoint
- `POST /api/push/test` — Send a test push notification
- `PAGE / (landing), /login, /signup, /privacy, /terms` — Marketing + auth surfaces (plan-aware CTAs, Flux gating)
- `PAGE /dashboard, /leads-list, /leads/[id], /clients, /chat, /whatsapp, /bookings, /invoices, /reports, /team, /knowledge, /profile, /trash, /help, /settings, /settings/storage` — Authenticated CRM/ops module pages
- `PAGE /studio[/...]` — Media Studio module (projects, albums, cull, reel, video, portfolio, store, settings, trash, help)
- `PAGE /contracts[/...]` — Contracts Studio (list, [id], analytics, settings, vault, help)
- `PAGE /control/*` — Command Center platform-admin pages (behind ControlShell guard)

### Data model
- **(none — frontend module)** — This module owns no DB tables; it is the Next.js web client. Backend agents cover persistence. Client-side state only. — _cols:_ n/a
- **localStorage (browser)** — Client-side session + UI state persisted in the browser — _cols:_ token, user, workspace, theme, wf_persist, wf_alive(session), ms-theme, wf_gallery_contact, cc_prev_token, cc_prev_user, cc_prev_workspace, cc_impersonating, cc_imp_name

### Rules, constraints & guarantees
- Public surfaces are token/slug-scoped and require no auth; all degrade to not_found and (where applicable) expired (HTTP 410) or declined states.
- Gallery may be password-gated: 401 → password prompt; password forwarded as ?pw / pw body field on every subsequent action.
- Gallery download-all hidden when download_policy === 'none'; per-asset download only when asset.download_url present.
- Proofing selection allowed only when proof.status in ['open','revision']; submitting flips to 'submitted'; quota over-count shows amber warning but is not hard-blocked client-side.
- E-signature requires all three: consent checkbox, non-empty typed legal name, and drawn ink on canvas; consent text invokes ESIGN/UETA and records IP/timestamp/device.
- Document link expiry surfaced as 'Link expired' (410); withdrawn/incorrect as 'Not available'.
- Shop order and public booking both require name + (phone OR email).
- Booking management actions hidden once booking status is 'cancelled'; cancel guarded by window.confirm.
- Accept-invite: password min 6 chars and must match confirm; invalid/used token shows dedicated error.
- Impersonation preserves the admin's prior session (cc_prev_*) for restore and flags cc_impersonating; server enforces read-only writes in impersonation mode.
- Session persistence: with wf_persist='session', a genuinely-fresh visit (no same-origin referrer + no sessionStorage wf_alive) clears token/user/workspace on load.
- Theme applied pre-hydration via inline script (html.light toggle, data-ms-theme) to avoid flash; <html suppressHydrationWarning>.
- Service worker intentionally does NOT cache (auth-heavy live app) — fetch is pure network passthrough; SW exists only for installability + push.
- Date rendering on portal is hardened against SQLite-naive timestamps (treated as UTC) so it never shows 'Invalid Date'.
- Story-section grouping in gallery never drops a photo: orphaned folder_ids fall back into a 'More photos' group.

### Automations (crons / jobs / triggers / auto-behaviors)
- Web Push delivery: service worker 'push' event renders a notification (title/body/icon/badge/vibrate/actions Open+Dismiss); 'notificationclick' focuses an existing client matching the url or opens data.url (default /dashboard).
- Document analytics beacon auto-fires on visibilitychange→hidden and pagehide (and on unmount), reporting time_on_page seconds + deepest read block via IntersectionObserver (threshold 0.4).
- Gallery lightbox slideshow auto-advances every 3.5s while playing (skips when ≤1 photo in current view).
- Download-all export auto-polls export status every 2s (max 40 tries) then auto-navigates to the ready ZIP URL.
- Accept-invite auto-redirects to /dashboard 1.8s after success.
- Service worker auto-registered on window load from root layout; skipWaiting + clients.claim on install/activate for immediate control.
- Storage usage 80/90/100% warnings fire into the in-app notification center from the backend (Settings→Storage is the at-a-glance mirror).
- Booking confirmations 'sent' on creation (backend-driven WhatsApp/email noted in UI copy).

### AI behaviors
- Public document AskWidget (/d/[token]): floating chat that answers buyer questions about pricing/timeline/terms, grounded strictly in the document content via POST /api/cs/public/:token/ask; advisory only — it does not alter the document or pricing and falls back to 'ask the sender' on error.
- Document AI answers are read-only and scoped to that single token's document; no write side-effects from the public surface.

### Integrations
- Web Push (VAPID) via browser PushManager + service worker; backend endpoints /api/push/vapid-key|subscribe|unsubscribe|test.
- Stripe (implied) via payment checkout_url on /pay/[token]; manual-pay fallback when no checkout_url.
- WhatsApp + email for booking/order confirmations (UI copy references WhatsApp confirmation; backend handles sending).
- Backend REST API (NEXT_PUBLIC_API_URL / BASE_URL) for all token data and actions.
- Media/uploads served from BASE_URL (imgUrl/mediaUrl prefix relative /uploads paths); next/image disabled for dynamic gallery photos.
- Flux (sibling AI Instagram content engine) linked from landing via NEXT_PUBLIC_FLUX_URL, gated by FLUX_PARKED.
- Google Fonts (Fraunces) loaded by the client gallery for its serif hero.
- lucide-react icons, recharts (dashboard charts), @hello-pangea/dnd (kanban drag-drop).

---

## 14. wappflow backend (full coverage sweep)

Single Express monolith (backend/server.js, 5,618 lines, ~177 routes) that boots one SQLite (better-sqlite3) DB and mounts ~18 feature sub-modules via `require('./x')(app, db, deps)`. Core CRM/WhatsApp/auth/AI live in server.js; everything else (Media Studio, Comms, Contracts, Command Center, payments, booking, store, reel/brains/style AI, storage/R2, entitlements/pricing) is a mounted module sharing the same app+db+helpers (auth, generateId, broadcastToWorkspace/User, notify, logAudit). Async media work is offloaded to an in-process ms_jobs queue drained by media-worker.js. Real-time is SSE-only (unnamed frames). This object lists every transitively-required local module, every /api/* prefix, every ms_jobs job type, every cron/interval, and every SSE event so nothing the per-module agents covered is missed.

### Features
- **BACKEND MODULES (transitively required from server.js) — 6-word purpose each** — server.js — core CRM/WhatsApp/auth/AI/notifications monolith host. ai-engine.js — Gemini AI helper + lead scoring. entitlements.js — data-driven plan/feature/limit resolver. pricing.js — usage tracking + soft-limit enforcement (requires entitlements). whatsapp-service.js — whatsapp-web.js+puppeteer session manager + heartbeat. media-studio.js — Media Studio: galleries/assets/jobs/proofing mount. media-worker.js — drains ms_jobs into variants/EXIF/scores. video-engine.js — ffmpeg-based video render/probe engine. video-luts.js — color LUT definitions for video. video-templates.js — video grid/layout template definitions. video-ai-drafts.js — auto-generated video reel drafts. style-apply.js — applies learned color/style to edits. analyzers/index.js — vision analyzer abstraction (advisory CV scores). vision-cpu.js — server CPU vision fallback (jimp-only). face-detect.js — optional face detection helper (try/catch). storage/index.js — storage provider factory (R2-or-local). storage/providers/r2.js — Cloudflare R2 (S3 SDK) provider. storage/providers/local.js — local-disk uploads storage provider. storage/signed-urls.js — signed URL generation for assets. storage-enforce.js — per-plan storage quota enforcement (requires entitlements). booking.js — appointment/booking scheduling module mount. print-store.js — print product store/orders module. studio-ai.js — studio AI scoring/suggestions routes. video-ai.js — video AI analysis/suggestion routes. studio-experience.js — client experience packs/media routes. payments.js — invoices/payment-link/paid-status module. contracts-studio.js — e-sign contracts (WhatsApp+email) module. comms.js — internal chat/calls/email-inbox module. sync.js — desktop sync workspace endpoint. reel-engine.js — server-side reel render engine (requires video-engine+style-apply). brains.js — Creator Brain style-learning module (requires style-apply). command-center.js — platform admin control plane (requires entitlements). cc-metering.js — Command Center AI usage metering+cron. cc-explorer.js — Command Center data explorer routes. cc-desktop.js — Command Center desktop fleet routes. cc-storage.js — Command Center storage admin routes. cc-support.js — Command Center support/impersonation routes. cc-timemachine.js — Command Center audit time-machine route. cc-reports.js — Command Center scheduled reports + runDue. NOTE: _audit_setup.js and test-*.js and scripts/* are NOT required by server.js (standalone setup/test scripts).
- **API ROUTE PREFIXES (top-level /api/*) grouped by module** — server.js (CRM core, ~177 routes): /api/auth, /api/sso, /api/profile, /api/team, /api/workspace, /api/settings, /api/leads, /api/lead-relations, /api/tags, /api/notes, /api/reminders, /api/memories, /api/knowledge, /api/presets, /api/whatsapp, /api/chat, /api/message-queue, /api/auto-reply, /api/email-templates, /api/email-workflows, /api/website-form, /api/integrations, /api/platform-accounts, /api/invoices, /api/plans, /api/reports, /api/analytics, /api/events, /api/notifications, /api/push, /api/ai, /api/audit-logs, /api/client-portal, /api/webhooks. media-studio.js: /api/media (incl. /api/media/public/* gallery+portfolio). studio-experience.js: /api/media, /api/packs. reel-engine.js + brains.js: /api/media (extend). comms.js: /api/comms. command-center.js + cc-explorer/desktop/storage/support/timemachine/reports: /api/cc (cc-desktop also /api/desktop). contracts-studio.js: /api/cs. studio-ai.js: /api/studio-ai. video-ai.js: /api/video-ai. payments.js: /api/payments. booking.js: /api/booking. print-store.js: /api/store. sync.js: /api/workspace (sync endpoint). Public/share routes use /g/:share_token (gallery share URL via clientBaseUrl) and /api/media/public/portfolio/:handle.
- **ms_jobs JOB TYPES (enqueued + worker-dispatched)** — Enqueued in media-studio.js / media-worker.js and dispatched by media-worker.js job.type switch: ingest (asset ingest → variants/EXIF/advisory CV scores), render_edits (apply non-destructive edits to a render), zip_export, pdf_export, video_probe, video_poster, video_proxy, video_export. (Worker fan-out: ingest of a video enqueues video_probe → video_poster + video_proxy.) Job lifecycle columns: status pending/running/done/failed, lease_until (10-min worker lease, stale-job reaper), retry_count + next_retry_at (exponential-ish retry).
- **CRON / setInterval / scheduled tasks** — server.js: cron '* * * * *' (every minute) → fire due reminders (push + SSE reminder_due + notification); cron '0 0 * * *' (midnight) → purge leads in trash older than 90 days; setInterval 2min → pollAll (email/integration polling); setInterval heartbeat (SSE keep-alive). media-worker.js: setInterval timer → drain ms_jobs loop. command-center.js: cron '0 3 * * *' → cc-reports runDue (scheduled reports); cron '5 3 * * *' → sweepExpiredGrace; setInterval 25s → SSE heartbeat. cc-metering.js: cron '0 2 * * *' → runAll (daily AI usage metering rollup). contracts-studio.js: cron '0 8 * * *' → daily contract reminder/expiry sweep. whatsapp-service.js: setInterval heartbeatTimer → WhatsApp session health/reconnect.
- **SSE EVENT TYPES broadcast (broadcastToWorkspace / broadcastToUser / notify)** — CRM: lead_created, lead_updated, lead_deleted, reminder_due, email_received, plan_updated, notification (generic toast via notify() with {type,title,body,url,icon,userId}). Comms: chat_message, chat_edit, chat_delete, chat_pin, chat_unpin, chat_reaction, chat_typing, chat_presence, chat_mention, chat_thread_reply, call_event, call_invite, call_missed. Media Studio: ms_project_created, ms_project_updated, ms_gallery_created, ms_gallery_published, ms_assets_added, ms_scored, ms_selection, ms_collection, ms_milestone, ms_watermark_done, ms_proofing_submitted, ms_client_commented, ms_client_favorited. Contracts: cs_signed, cs_updated. Booking: booking_created. Store: print_order_created. Payments: payment_paid. NOTE pattern: backend emits UNNAMED SSE frames; clients consume via es.onmessage + switch on data.type (per MEMORY sse-pattern).
- **LIKELY-MISSED modules / features for per-module agents** — (1) reel-engine.js, brains.js, studio-ai.js, video-ai.js, studio-experience.js all piggyback extra routes onto /api/media or /api/packs — easy to attribute solely to media-studio. (2) video sub-engine files (video-engine.js, video-luts.js, video-templates.js, video-ai-drafts.js, style-apply.js, vision-cpu.js, face-detect.js, analyzers/index.js) are libraries with NO routes but carry the actual render/CV logic. (3) Command Center is split across 8 files (command-center.js + cc-metering/explorer/desktop/storage/support/timemachine/reports) all under /api/cc plus /api/desktop — and per MEMORY desktop-final-vision it may be UNMOUNTED dead code, so routes can exist in source but not be live. (4) storage/ is a 4-file subsystem (factory + r2 + local + signed-urls) with quota enforcement in storage-enforce.js. (5) entitlements.js + pricing.js + storage-enforce.js form a cross-cutting plan/limit layer required by many modules, not a feature with its own UI. (6) sync.js adds a desktop-sync route under /api/workspace, easy to miss under server.js. (7) _audit_setup.js and scripts/* (cc-create-admin, seed-media-demo) are operational scripts NOT in the server require graph. (8) Public share surface (/g/:token, /api/media/public/portfolio/:handle) is unauthenticated and separate from the authed /api/media tree.

### API endpoints (17)
- `GROUP /api/auth, /api/sso, /api/profile, /api/team, /api/workspace, /api/settings` — server.js — auth, SSO, profile, team, workspace, settings
- `GROUP /api/leads, /api/lead-relations, /api/tags, /api/notes, /api/reminders, /api/memories, /api/knowledge, /api/presets` — server.js — CRM lead data + relations/tags/notes/reminders/knowledge
- `GROUP /api/whatsapp, /api/chat, /api/message-queue, /api/auto-reply` — server.js — WhatsApp session, chat, outbound queue, auto-reply
- `GROUP /api/email-templates, /api/email-workflows, /api/website-form, /api/integrations, /api/platform-accounts` — server.js — email automation, web form, integrations
- `GROUP /api/invoices, /api/plans, /api/reports, /api/analytics, /api/events` — server.js — billing/plans, reporting, analytics, events
- `GROUP /api/notifications, /api/push, /api/audit-logs, /api/client-portal, /api/webhooks, /api/ai` — server.js — notifications/web-push, audit, client portal, webhooks, AI assistant
- `GROUP /api/media (+ /api/media/public/*, /g/:token)` — media-studio.js (+ studio-experience/reel-engine/brains extend) — galleries, assets, jobs, proofing, public share
- `GROUP /api/packs` — studio-experience.js — client experience packs
- `GROUP /api/comms` — comms.js — internal chat, calls (LiveKit), email inbox (IMAP)
- `GROUP /api/cc, /api/desktop` — command-center.js + 7 cc-* files — platform admin control plane, desktop fleet
- `GROUP /api/cs` — contracts-studio.js — e-sign contracts via WhatsApp/email
- `GROUP /api/studio-ai` — studio-ai.js — studio AI scoring/suggestions
- `GROUP /api/video-ai` — video-ai.js — video AI analysis
- `GROUP /api/payments` — payments.js — invoices, payment links, paid status
- `GROUP /api/booking` — booking.js — appointment scheduling
- `GROUP /api/store` — print-store.js — print product store + orders
- `GROUP /api/workspace (sync)` — sync.js — desktop sync endpoint

### Data model
- **ms_jobs** — Media Studio async job queue (in-process worker) — _cols:_ id, workspace_id, type, asset_id, project_id, status(pending/running/done/failed), payload, progress, lease_until, retry_count, next_retry_at, error_message, finished_at, created_at
- **ms_galleries** — Client-facing media galleries with public share — _cols:_ id, workspace_id, status(published), share_token UNIQUE (→ /g/:token), version
- **ms_gallery_access** — Tracks gallery share views — _cols:_ id, gallery_id, access_token, last_viewed_at
- **leads** — Core CRM lead records (soft-delete + 90d purge) — _cols:_ id, workspace_id, customer_name, customer_phone, is_deleted, deleted_at, lead_score
- **reminders** — Per-lead reminders fired by minute cron — _cols:_ id, user_id, lead_id, title/message, reminder_date, is_completed
- **(many others)** — Per-module tables (ms_*, cs_*, comms chat/calls/email, cc_* admin, booking, store orders, invoices, audit) declared inside each module's CREATE TABLE blocks — not enumerated here, owned by their respective mounted module — _cols:_ see each module file

### Rules, constraints & guarantees
- Single SQLite DB (better-sqlite3) shared by server.js and every mounted module; modules self-migrate via CREATE TABLE IF NOT EXISTS + safeAlter ADD COLUMN.
- ms_jobs worker uses a 10-minute lease (lease_until) so a separate stale-job reaper re-queues running jobs whose lease expired — multi-worker safe.
- Failed ms_jobs get retry_count + next_retry_at backoff; an admin endpoint can bulk-reset all failed jobs to pending.
- Reminder cron only fires reminders due within the last 2 minutes (reminder_date BETWEEN now-2min AND now) to avoid replaying old ones.
- Trash auto-cleanup hard-deletes leads soft-deleted >90 days.
- entitlements.js is the single source of plan→feature→limit truth; pricing.js (usage/soft-limit) and storage-enforce.js (quota) both depend on it; existing workspaces grandfathered to studio_plus.
- SSE frames are emitted UNNAMED — consumers must switch on data.type, never addEventListener(named).
- cc-* modules are mounted in try/catch so a Command Center load failure never crashes the core server (and per MEMORY the CC plane may be unmounted/dead in some builds).
- Storage provider is chosen at boot: R2 when configured else local disk; signed-urls.js gates asset access.
- Optional deps (face-detect, node-cron, ai-engine in contracts, pricing in contracts) are require()'d in try/catch so absence degrades gracefully.

### Automations (crons / jobs / triggers / auto-behaviors)
- server.js cron '* * * * *': fire due reminders → web-push + SSE reminder_due + notify() toast
- server.js cron '0 0 * * *': purge leads in trash older than 90 days
- server.js setInterval 2min: pollAll() — poll email/integrations
- server.js setInterval: SSE heartbeat keep-alive
- media-worker.js setInterval: drain ms_jobs (ingest/render/exports/video) + stale-lease reaper
- ingest job auto-fans-out: video ingest → video_probe → video_poster + video_proxy
- command-center.js cron '0 3 * * *': cc-reports runDue (scheduled report generation)
- command-center.js cron '5 3 * * *': sweepExpiredGrace (plan grace-period expiry)
- command-center.js setInterval 25s: SSE heartbeat
- cc-metering.js cron '0 2 * * *': runAll — daily AI usage metering rollup
- contracts-studio.js cron '0 8 * * *': daily contract reminder/expiry sweep
- whatsapp-service.js setInterval heartbeatTimer: WhatsApp session health/reconnect

### AI behaviors
- ai-engine.js: Google Gemini (GoogleGenerativeAI) helper powering /api/ai assistant and lead_score generation in server.js (advisory).
- analyzers/index.js + vision-cpu.js + face-detect.js: advisory computer-vision scoring during ms_jobs ingest — produces face_count (UltraFace-style) and smile (FER+-style) scores with a model_version tag; explicitly advisory, never auto-acts on media.
- studio-ai.js (/api/studio-ai) and video-ai.js (/api/video-ai): AI scoring/suggestions for photo and video selection — suggestion-only, photographer keeps control.
- brains.js (Creator Brain) + style-apply.js: learn a creator's color/style and apply to edits — applied only on explicit render_edits jobs, control-first.
- reel-engine.js + video-ai-drafts.js: auto-generate reel/video drafts (drafts, not auto-published).
- cc-metering.js: meters AI usage for billing/limits (control plane, not user-facing AI).
- Guarantee per MEMORY/media-intelligence: AI layer is advisory/control-first — scores and suggestions surface to the user, the user commits selections/edits/publishes.

### Integrations
- WhatsApp via whatsapp-web.js + puppeteer (whatsapp-service.js)
- Google Gemini (GoogleGenerativeAI / generativelanguage) for AI assistant + scoring
- Cloudflare R2 via @aws-sdk/client-s3 + @aws-sdk/s3-request-presigner (storage/providers/r2.js, signed URLs)
- Email: nodemailer (SMTP send) + imap + mailparser (inbox polling in comms.js)
- Web push notifications via web-push (VAPID) — /api/push
- LiveKit for comms calls (comms.js call_event/call_invite/call_missed)
- Google auth via google-auth-library (SSO /api/sso)
- ffmpeg via video-engine.js (video probe/poster/proxy/export, LUTs)
- Image processing via jimp (variants, CPU vision fallback)
- Document parsing: pdf-parse + mammoth (contracts/knowledge ingest)
- QR codes via qrcode (WhatsApp pairing / share)
- Security middleware: helmet, cors, express-rate-limit; auth via jsonwebtoken + bcryptjs; scheduling via node-cron

---
