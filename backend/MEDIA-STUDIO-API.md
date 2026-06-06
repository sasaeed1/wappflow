# Media Studio API — vertical slice (Projects → Ingest → Library)

Module: `backend/media-studio.js` · mounted from `server.js` with one `require('./media-studio')(app, db, {...})` line.
All routes are under `/api/media` and require the standard `auth` bearer token (same as the rest of WappFlow).
Everything is scoped to the caller's `workspace_id` automatically.

## Endpoints

| Method | Path | Purpose |
|---|---|---|
| GET | `/api/media/overview` | Mount check + workspace counts (`{ ok, projects, assets, storage_bytes }`) |
| GET | `/api/media/projects` | List projects. Filters: `?lead_id=`, `?status=`. Includes `client_name` + `asset_count`. |
| POST | `/api/media/projects` | Create. Body: `{ title*, project_type, lead_id, shoot_date, location, settings }`. Validates `lead_id` belongs to the workspace. |
| GET | `/api/media/projects/:id` | Project + its folders + asset/storage counts. |
| PUT | `/api/media/projects/:id` | Update `title, project_type, shoot_date, location, status, cover_asset_id, settings`. |
| DELETE | `/api/media/projects/:id` | **Archive** (reversible, `status='archived'`). Manager+ only. |
| GET | `/api/media/projects/:id/folders` | List folders. |
| POST | `/api/media/projects/:id/folders` | Create folder `{ name*, parent_id, sort_order }`. |
| POST | `/api/media/projects/:id/assets/sign` | Ingest contract. Today: `{ mode:'multipart', upload_url, field:'files' }`. Later (R2): `{ mode:'presigned', put_url, storage_key }`. |
| POST | `/api/media/projects/:id/assets` | Upload. `multipart/form-data`, field **`files`** (≤200), optional `folder_id`. Creates assets + enqueues `ingest` jobs. |
| GET | `/api/media/projects/:id/assets` | Library. Paginated (`?limit`, `?offset`), filters `?folder_id`, `?type`. Each asset has `url`, `thumb_url`, and any human `cull_*`. |
| GET | `/api/media/assets/:id` | Asset detail + **advisory** `scores[]` + human `cull`. |
| DELETE | `/api/media/assets/:id` | Delete asset (+ file + scores + cull). Manager+ only. |

## Example (curl)

```bash
TOKEN=...   # a normal WappFlow login token
API=http://localhost:3001

# create a shoot off an existing CRM lead
curl -s -X POST $API/api/media/projects -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{"title":"Ayesha & Bilal — Wedding","project_type":"wedding","lead_id":"<LEAD_ID>"}'

# upload photos
curl -s -X POST $API/api/media/projects/<PID>/assets -H "Authorization: Bearer $TOKEN" \
  -F files=@IMG_001.jpg -F files=@IMG_002.jpg

# browse the library
curl -s $API/api/media/projects/<PID>/assets -H "Authorization: Bearer $TOKEN"
```

## Control-first wall (enforced by structure, not policy)

- AI/CV writes go **only** to `ms_asset_scores` (advisory). There is no endpoint that lets AI write a cull decision, publish a gallery, or deliver.
- Human cull decisions live in `ms_cull_decisions` (one row per asset, always owns a `user_id`).
- `GET /api/media/assets/:id` returns both side by side so the UI can *show* the AI suggestion next to the human's call — never substitute it.

## What's stubbed (and where it plugs in)

- **Storage** = local disk under `/uploads/media`, served by the existing static route. Swap at the `STORAGE SEAM` block in `media-studio.js` for Cloudflare R2 presigned uploads — the `/assets/sign` contract already anticipates it.
- **Variants/EXIF/CV scoring** = `ingest` rows are written to `ms_jobs` but no worker runs yet. Add a worker that drains `ms_jobs` to generate thumb/web variants, read EXIF, and write advisory `ms_asset_scores`.

## Test

```bash
cd backend && node scripts/test-media-studio.js
```
Mounts the module on a throwaway Express app + in-memory DB and drives the whole slice over HTTP (no WhatsApp/puppeteer).
