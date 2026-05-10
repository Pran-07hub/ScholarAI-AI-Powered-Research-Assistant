# ScholarAI — Complete Feature & Architecture Reference

> Generated 2026-04-02 from full codebase analysis. All items from `ISSUES_AND_PLAN.md` are
> implemented except PDF highlight-to-annotate (Phase 3 / react-pdf migration, pending).

---

## Table of Contents

1. [Product Overview](#1-product-overview)
2. [Tech Stack](#2-tech-stack)
3. [Architecture](#3-architecture)
4. [Data Models](#4-data-models)
5. [Backend — All API Endpoints](#5-backend--all-api-endpoints)
6. [Frontend — All Pages](#6-frontend--all-pages)
7. [AI / ML Pipeline](#7-ai--ml-pipeline)
8. [Security & Infrastructure](#8-security--infrastructure)
9. [Feature Deep-Dives](#9-feature-deep-dives)

---

## 1. Product Overview

ScholarAI is an AI-powered academic research platform built for researchers. It centralises every stage of the research workflow:

- **Collect** papers via PDF upload, DOI/arXiv import, or AI-powered chat discovery
- **Organise** papers into projects, tag them, annotate them, track authors and conferences
- **Analyse** gaps in the literature, synthesise findings, extract structured data, compare papers side-by-side
- **Write** using AI writing tools, maintain versioned drafts, export to Markdown/DOCX
- **Collaborate** by inviting team members, sharing annotations, and co-editing notes
- **Stay current** via research news feeds, keyword alerts delivered by email, and conference deadline tracking

---

## 2. Tech Stack

| Layer | Technology |
|---|---|
| **Backend framework** | FastAPI 0.128 (Python 3.x) |
| **Async ORM** | Beanie 2.0 + Motor 3.7 (MongoDB driver) |
| **Primary database** | MongoDB (documents, users, projects, papers, notes, chats, …) |
| **Vector store** | ChromaDB 1.4 (local persistence, GCS-backed on deploy) |
| **Embeddings** | Sentence-Transformers (`all-MiniLM-L6-v2`) via `langchain-huggingface` |
| **AI model** | Google Gemini 2.5 Flash via `langchain-google-genai` + `google-genai` |
| **Agent framework** | LangGraph 1.0 + LangChain 1.2 |
| **Scheduler** | APScheduler 3.10 (alert email delivery) |
| **PDF parsing** | pypdf 6.6 (text PDFs) + Gemini multimodal fallback (scanned PDFs) |
| **HTML scraping** | BeautifulSoup4 (WikiCFP conference data) |
| **HTTP client** | aiohttp (async external API calls) |
| **Retry logic** | tenacity 9.1 (Semantic Scholar backoff) |
| **Input sanitisation** | bleach 6.2 |
| **Cloud storage** | Google Cloud Storage (`google-cloud-storage` 2.19) |
| **Email** | SMTP via stdlib `smtplib`, run in thread-pool executor |
| **Auth** | JWT (python-jose 3.5), OAuth2 bearer tokens |
| **Export** | python-docx 1.1 (Word), Markdown (built client-side) |
| **Frontend framework** | Next.js 16 (App Router) + React 19 |
| **Styling** | TailwindCSS + Radix UI components |
| **HTTP client (FE)** | Native `fetch` / Axios |
| **Deployment** | Docker + Nginx (reverse proxy) |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                          Browser (Next.js)                          │
│  App Router pages under /workspace/*  ←→  REST + Streaming JSON     │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ HTTPS
                         ┌─────▼──────┐
                         │   Nginx    │  (reverse proxy, TLS termination)
                         └─────┬──────┘
                               │
                    ┌──────────▼──────────┐
                    │   FastAPI (uvicorn)  │
                    │   backend/main.py   │
                    │                     │
                    │  Middleware:         │
                    │  • CORSMiddleware    │
                    │  • AI rate limiter  │
                    │    (20 RPM/user)    │
                    │                     │
                    │  Lifespan hooks:    │
                    │  • ChromaDB restore │
                    │  • init_db()        │
                    │  • APScheduler start│
                    └──────────┬──────────┘
                               │
          ┌────────────────────┼────────────────────┐
          │                    │                    │
    ┌─────▼──────┐      ┌──────▼──────┐     ┌──────▼──────┐
    │  MongoDB   │      │  ChromaDB   │     │  Gemini API │
    │ (Beanie /  │      │  (vectors)  │     │  (LangChain)│
    │  Motor)    │      │  GCS-backed │     │             │
    └────────────┘      └─────────────┘     └─────────────┘
          │
    ┌─────▼──────────────────────────────────────────┐
    │  Collections                                   │
    │  users, projects, papers, notes, drafts,        │
    │  chats, alerts, paper_annotations,              │
    │  project_invites, tracked_authors,              │
    │  tracked_conferences, research_questions        │
    └─────────────────────────────────────────────────┘
```

### Request lifecycle

1. Next.js frontend sends a REST request (with `Authorization: Bearer <JWT>`).
2. Nginx terminates TLS, proxies to FastAPI on the internal port.
3. FastAPI middleware checks rate limit for AI-heavy paths; returns 429 if exceeded.
4. The relevant router dependency calls `get_current_user()` — decodes the JWT and loads the `User` document from MongoDB.
5. Access to project-scoped resources is gated by `require_project_access(project, user, min_role=...)` which enforces owner / member / none RBAC.
6. AI operations call Gemini through LangChain; JSON responses go through `utils/json_repair.py` for resilience.
7. Vector operations (semantic search, embeddings) hit ChromaDB via `services/vector_store.py`.
8. Streaming AI responses use `StreamingResponse` with `application/x-ndjson`.

---

## 4. Data Models

All models are Beanie `Document` subclasses stored in MongoDB.

### User
```
email (unique), oauth_provider, oauth_id, username,
profile_picture, college,
preferences: {
  research_domains: [str],
  citation_style: APA|MLA|IEEE|BibTeX,
  alert_frequency: daily|weekly,
  ai_strictness: strict|balanced|creative
}
```

### Project
```
name, description,
user_id → User (owner),
members: [→ User]   (collaborators)
```

### Paper
```
project_id → Project,
title, authors: [str], abstract,
publication_date, venue, pdf_url,
source: manual|upload|doi|arxiv|chat,
embeddings: [float],     ← sentence-transformer vector
extracted_data: dict     ← structured extraction output
```

### Note
```
project_id → Project, paper_id → Paper (optional),
title, content, tags: [str]
```

### Draft
```
project_id → Project,
title, content (Markdown),
version: int, status: outline|draft|final
```

### Chat
```
user_id → User, project_id → Project (optional),
title,
messages: [{role, content, created_at}]   ← paginated on fetch
```

### PaperAnnotation
```
paper_id → Paper, project_id → Project, user_id → User,
content (annotation text), quote (highlighted text),
color: yellow|green|blue|pink|purple
```

### Alert
```
user_id → User, keywords: [str], frequency: daily|weekly
```

### ResearchQuestion
```
project_id → Project,
question, description,
paper_tags: [{paper_id, stance: supports|contradicts|partial, note}]
```

### TrackedAuthor
```
user_id → User, author_name,
semantic_scholar_id, affiliation, h_index, paper_count
```

### TrackedConference
```
user_id → User, conference_name, conference_website, topics: [str]
```

### ProjectInvite
```
project_id → Project, inviter_id → User,
invitee_email, status: pending|accepted|declined
```

---

## 5. Backend — All API Endpoints

### Auth  (`/`)
| Method | Path | Description |
|---|---|---|
| POST | `/auth/google` | Exchange Google OAuth code for JWT |
| GET | `/auth/me` | Get current user profile |

### Users  (`/users`)
| Method | Path | Description |
|---|---|---|
| GET | `/users/me` | Get current user |
| PUT | `/users/me` | Update profile / preferences |
| GET | `/users/me/preferences` | Get user preferences |
| PUT | `/users/me/preferences` | Update citation_style, ai_strictness, etc. |

### Projects  (`/projects`)
| Method | Path | Description |
|---|---|---|
| POST | `/projects/` | Create project |
| GET | `/projects/` | List all projects (owned + member) |
| GET | `/projects/{id}` | Get project |
| PUT | `/projects/{id}` | Update (owner only) |
| DELETE | `/projects/{id}` | Delete project + ChromaDB collection |
| GET | `/projects/{id}/papers` | List papers in project |
| POST | `/projects/{id}/papers` | Add paper manually |
| POST | `/projects/{id}/papers/import` | Import paper by DOI or arXiv ID (auto-fetches metadata) |
| POST | `/projects/{id}/papers/bulk` | Bulk add papers |
| DELETE | `/projects/{id}/papers/{paper_id}` | Remove paper |
| POST | `/projects/{id}/upload-pdf` | Upload PDF → extract text → embed; Gemini multimodal fallback for scanned PDFs |
| POST | `/projects/{id}/analyze-gaps` | AI gap analysis (Gemini) → Markdown |
| POST | `/projects/{id}/synthesize` | AI synthesis of all papers → Markdown |
| POST | `/projects/{id}/extract-all` | Bulk structured data extraction from all papers |
| POST | `/projects/{id}/timeline` | Generate research timeline → Markdown |
| GET | `/projects/{id}/dashboard` | Project overview: paper count, recent activity, team, gaps summary |
| POST | `/projects/{id}/compare-papers` | AI comparison matrix for selected papers |
| POST | `/projects/export/convert-docx` | Convert Markdown string to .docx binary download |

### Papers  (`/papers`)
| Method | Path | Description |
|---|---|---|
| GET | `/papers/{id}` | Get single paper by ID (checks project access) |

### Notes  (`/notes`)
| Method | Path | Description |
|---|---|---|
| POST | `/notes/` | Create note |
| GET | `/notes/project/{project_id}` | List notes for project |
| GET | `/notes/{id}` | Get note |
| PUT | `/notes/{id}` | Update note |
| DELETE | `/notes/{id}` | Delete note |

### Drafts  (`/drafts`)
| Method | Path | Description |
|---|---|---|
| POST | `/drafts/` | Create draft |
| GET | `/drafts/project/{project_id}` | List drafts for project |
| GET | `/drafts/{id}` | Get draft |
| PUT | `/drafts/{id}` | Update draft (content, status, version) |
| DELETE | `/drafts/{id}` | Delete draft |

### Citations  (`/citations`)
| Method | Path | Description |
|---|---|---|
| POST | `/citations/generate` | Format citation for a paper (APA/MLA/IEEE/Chicago/BibTeX) |
| GET | `/citations/project/{id}/bibliography` | Full bibliography for project, respects `style` param; defaults to user's preferred style |
| POST | `/citations/check-missing` | Gemini scans a text blob and identifies claims without citations; matches against project papers |
| POST | `/citations/consistency-check` | Gemini detects mixed/inconsistent citation styles in a document |

### Chats  (`/chats`)
| Method | Path | Description |
|---|---|---|
| POST | `/chats/` | Create new chat session |
| GET | `/chats/` | List user's chats |
| GET | `/chats/{id}` | Get chat with messages (supports `offset` + `limit` for pagination) |
| DELETE | `/chats/{id}` | Delete chat |

### Agent / Summarize
| Method | Path | Description |
|---|---|---|
| POST | `/summarize` | Streaming AI agent — answers research questions, discovers papers, queries project context via ChromaDB |

### News  (`/news`)
| Method | Path | Description |
|---|---|---|
| GET | `/news/research` | Fetch recent research news for a topic |
| GET | `/news/project/{project_id}` | News tailored to project's paper topics |
| GET | `/news/search` | Search news by custom keywords |
| POST | `/news/save-to-notes` | Save a news article as a note in a project |

### Alerts  (`/alerts`)
| Method | Path | Description |
|---|---|---|
| POST | `/alerts/subscribe` | Subscribe to keyword alerts (daily/weekly) |
| GET | `/alerts/` | List user's alert subscriptions |
| DELETE | `/alerts/{id}` | Unsubscribe |

> The APScheduler runs daily at 08:00 UTC, queries arXiv for each subscription's keywords, and sends a digest email via SMTP.

### Search  (`/search`)
| Method | Path | Description |
|---|---|---|
| GET | `/search` | Global full-text search across papers (title/abstract), notes (content/title), and annotations (content/quote). Supports `q`, `project_id`, and `limit` params. |

### Research Questions  (`/projects/{id}/research-questions`)
| Method | Path | Description |
|---|---|---|
| POST | `/projects/{id}/research-questions` | Create a research question |
| GET | `/projects/{id}/research-questions` | List all research questions |
| PUT | `/projects/{id}/research-questions/{qid}` | Update question |
| DELETE | `/projects/{id}/research-questions/{qid}` | Delete question |
| POST | `/projects/{id}/research-questions/{qid}/tag-paper` | Tag a paper as `supports`, `contradicts`, or `partial` evidence |

### Discovery  (`/discovery`)
| Method | Path | Description |
|---|---|---|
| GET | `/discovery/recommendations` | AI-personalised paper recommendations based on project + user research_domains preference |

### Writing Tools  (`/writing-tools`)
| Method | Path | Description |
|---|---|---|
| POST | `/writing-tools/improve` | Improve clarity / grammar of selected text |
| POST | `/writing-tools/expand` | Expand a bullet point or outline into prose |
| POST | `/writing-tools/academic-tone` | Rewrite text in formal academic tone |
| POST | `/writing-tools/summarize` | Summarise a section |
| POST | `/writing-tools/check-plagiarism` | Heuristic originality check |

### Academic Workflow  (`/academic-workflow`)
| Method | Path | Description |
|---|---|---|
| POST | `/academic-workflow/thesis-outline` | Generate thesis outline from project papers |
| POST | `/academic-workflow/related-work` | Draft a related work section |
| POST | `/academic-workflow/grant-review` | Review a grant proposal for gaps |
| POST | `/academic-workflow/notes-to-section` | Convert notes into a structured section draft |

### Collaboration  (`/projects` + `/annotations`)
| Method | Path | Description |
|---|---|---|
| POST | `/projects/{id}/invite` | Invite a collaborator by email |
| GET | `/projects/{id}/invites` | List pending invites |
| POST | `/invites/{id}/respond` | Accept or decline an invite |
| GET | `/annotations/paper/{paper_id}` | List annotations on a paper |
| POST | `/annotations/` | Create annotation |
| PUT | `/annotations/{id}` | Update annotation |
| DELETE | `/annotations/{id}` | Delete annotation |

### Authors  (`/authors`)
| Method | Path | Description |
|---|---|---|
| POST | `/authors/track` | Start tracking an author |
| GET | `/authors/` | List tracked authors |
| DELETE | `/authors/{id}` | Stop tracking |
| GET | `/authors/{id}/papers` | Fetch latest papers by this author from Semantic Scholar |

### Conferences  (`/conferences`)
| Method | Path | Description |
|---|---|---|
| POST | `/conferences/track` | Track a conference |
| GET | `/conferences/` | List tracked conferences |
| GET | `/conferences/upcoming` | Fetch upcoming deadlines from WikiCFP (with per-entry error handling) |
| DELETE | `/conferences/{id}` | Stop tracking |

### Citation Graph  (`/projects`)
| Method | Path | Description |
|---|---|---|
| GET | `/projects/{id}/citation-graph` | Build citation graph via Semantic Scholar API (tenacity retry + exponential backoff) |

### Uploads
| Method | Path | Description |
|---|---|---|
| GET | `/uploads/{filename}` | Privately stream a GCS-stored image after auth check (note images, etc.) |

---

## 6. Frontend — All Pages

All pages live under `/workspace/` in the Next.js App Router.

| Page | Route | What it does |
|---|---|---|
| **Dashboard** | `/workspace/dashboard` | Project overview: paper count, team members, recent activity, conference deadlines, gap summary |
| **Search** | `/workspace/search` | Global search across papers, notes, and annotations (full-text) |
| **Papers** | `/workspace/papers` | Paper library: list, filter, open detail panel, delete. PaperDetailPanel shows real backend schema fields + AI summary on demand |
| **Paper Reader** | `/workspace/reader` | PDF viewer (pdf.js CDN iframe) + metadata sidebar for an individual paper |
| **Research Questions** | `/workspace/research-questions` | Define formal research questions; tag papers as supports/contradicts/partial; evidence map |
| **Extraction** | `/workspace/extraction` | Bulk AI data extraction from all project papers into a structured table; horizontal scroll on mobile |
| **Compare** | `/workspace/compare` | Select 2–5 papers; Gemini generates a comparison matrix (methodology, findings, limitations) |
| **Gap Analysis** | `/workspace/gap-analysis` | AI identifies gaps in the literature; export as `.md` or `.docx` |
| **Synthesis** | `/workspace/synthesis` | AI synthesises all project papers into a coherent narrative; export as `.md` or `.docx` |
| **Timeline** | `/workspace/timeline` | AI-generated chronological research timeline; export as `.md` or `.docx` |
| **Drafts** | `/workspace/drafts` | Versioned draft documents (title, content, status: outline/draft/final); CRUD |
| **Notes** | `/workspace/notes` | Free-form notes linked to papers or project; tagged |
| **Annotations** | `/workspace/annotations` | Paper annotations (colour-coded, with optional quote); team-visible |
| **Chat** | `/chat/[id]` | Streaming AI research assistant; aware of project papers via ChromaDB semantic search |
| **History** | `/workspace/history` | Previous chat sessions; resume any chat |
| **News** | `/workspace/news` | Research news feed; filter by source (dynamic pill filters); "Save to Notes" per article |
| **Writing Tools** | `/workspace/writing-tools` | Paste text → select action (improve / expand / academic tone / summarise) → get AI result |
| **Academic Workflow** | `/workspace/academic-workflow` | Higher-level writing: thesis outline, related work, grant review, notes-to-section |
| **Authors** | `/workspace/authors` | Track researchers; view their latest publications from Semantic Scholar |
| **Conferences** | `/workspace/conferences` | Track conferences; see upcoming submission deadlines from WikiCFP |
| **Citation Graph** | `/workspace/citation-graph` | Interactive citation network built from Semantic Scholar data |
| **Discovery** | `/workspace/discovery` | AI-personalised paper recommendations; uses project context + user research_domains |

### Layout
- `WorkspaceSidebar` — collapsible on desktop; hamburger drawer on mobile (responsive)
- `ErrorBoundary` — wraps workspace layout; catches unhandled component errors gracefully
- Metadata: title `"ScholarAI - AI Research Assistant"`, proper SEO description

---

## 7. AI / ML Pipeline

### Embedding & Semantic Search

1. When a paper is added (upload / import / bulk), `services/vector_store.py` generates a sentence-transformer embedding (`all-MiniLM-L6-v2`, 384-dim) and upserts it into a per-project ChromaDB collection.
2. The chat agent queries ChromaDB with the user's message to retrieve the top-k most semantically relevant papers as context.
3. Global search (`/search`) also queries ChromaDB for semantic ranking on top of MongoDB text matches.

### AI Model

All AI features use **Google Gemini 2.5 Flash** via `langchain-google-genai`. The model is selected dynamically:
- User's `ai_strictness` preference maps to LLM temperature: `strict → 0.1`, `balanced → 0.4`, `creative → 0.8`.
- User's `citation_style` preference is the default when no style is explicitly passed to citation endpoints.
- User's `research_domains` seed discovery recommendations even without an active project.

### JSON Resilience (`utils/json_repair.py`)

All Gemini responses that return structured JSON go through a 3-step repair pipeline:
1. Strip markdown code fences (` ```json ... ``` `).
2. Attempt `json.loads()`.
3. If that fails, apply heuristic repair (trailing commas, unquoted keys, truncated arrays) before re-parsing.

### Streaming Agent

`POST /summarize` streams NDJSON chunks back using `StreamingResponse`. The LangGraph agent has access to tools: ChromaDB retrieval, arXiv search, Semantic Scholar lookup, and web search. Each chunk is one JSON object with `{"type": "token"|"tool_call"|"final", "content": ...}`.

---

## 8. Security & Infrastructure

### Authentication & Authorization

- **Auth**: Google OAuth2. The backend exchanges the OAuth code for user info, upserts a `User` document, and returns a signed JWT (python-jose, HS256, 30-day expiry).
- **Every protected endpoint** uses `Depends(get_current_user)` — decodes and validates the JWT, loads the User from MongoDB.
- **Project RBAC**: `utils/project_access.py` provides `require_project_access(project, user, min_role)`. Roles: `OWNER` (can delete/modify project), `MEMBER` (read + contribute), `NONE` → 403. Used consistently across all project-scoped routers.

### Rate Limiting

- Custom ASGI middleware in `main.py` intercepts all AI-heavy endpoints.
- Rolling 1-minute window per user (identified via JWT `sub` or IP fallback).
- Default: **20 AI requests per minute**; configurable via `AI_RATE_LIMIT_RPM` env var.
- Returns `429 Too Many Requests` with `Retry-After: 60` header.

### Input Sanitisation

- `utils/sanitize.py` wraps `bleach.clean()` — strips all HTML tags from user-supplied strings.
- Applied to: project name, project description, note content, annotation content, research question text.
- Frontend uses `react-markdown` (safe renderer) for any AI-generated Markdown output; no `dangerouslySetInnerHTML`.

### Private File Storage

- Note images and uploaded PDFs are stored in **Google Cloud Storage** under private ACLs.
- `GET /uploads/{filename}` streams the file through the authenticated backend — GCS URLs are never exposed to the browser.

### ChromaDB Persistence

- `services/chromadb_backup.py` runs on startup (`restore_on_startup`) and shutdown (`backup_on_shutdown`).
- If `CHROMADB_BACKUP_BUCKET` env var is set, the entire ChromaDB directory is synced to/from GCS, surviving container restarts and redeployments.

### Email Service

- `services/email_service.py` wraps synchronous `smtplib.SMTP` in `asyncio.get_running_loop().run_in_executor()` with `asyncio.wait_for()` timeout — prevents blocking the uvicorn event loop.

### Semantic Scholar Backoff

- `services/citation_graph_service.py` uses `@tenacity.retry(wait=wait_exponential(multiplier=1, min=2, max=30), stop=stop_after_attempt(4))` on all Semantic Scholar API calls to handle rate-limit responses gracefully.

---

## 9. Feature Deep-Dives

### Paper Import (DOI / arXiv)

`POST /projects/{id}/papers/import` accepts a free-form `identifier` string:
- **DOI** (e.g., `10.1145/3290605.3300830`): queries Crossref API → extracts title, authors, year, venue.
- **arXiv ID** (e.g., `2301.12345` or `arxiv:2301.12345`): queries the arXiv API → extracts metadata and abstract.
- The paper is saved with `source = "doi"` or `"arxiv"` and immediately embedded into ChromaDB.

### PDF Upload & OCR

`POST /projects/{id}/upload-pdf`:
1. `pypdf` extracts text from text-based PDFs.
2. If extracted text is empty (scanned/image PDF), the file is sent to **Gemini's multimodal API** which reads the visual content and returns extracted text + inferred title/authors.
3. The paper is created, embedded in ChromaDB, and optionally auto-extracted (structured data).

### Citation Formatting

`format_citation(paper, style)` in `routers/citations.py` implements:
- **APA 7th**: `Last, F. M. (year). Title. *Venue*.` — et al. after 20 authors.
- **MLA 9th**: `Last, First, et al. "Title." *Venue*, year.` — et al. after 3 authors.
- **IEEE**: `F. Last et al., "Title," *Venue*, year.` — et al. after 6 authors.
- **Chicago 17th**: Same as MLA first-author style with period formatting.
- **BibTeX**: Generates `@article{key, author = {...}, title = {...}, ...}`.
- `None` venue is always suppressed (no `"None."` in output).

### Check-Missing Citations

`POST /citations/check-missing` sends up to 4000 characters of the user's text to Gemini along with a list of all papers in the project. Gemini returns a JSON array of `{claim, suggestion, reason}` — each claim that makes a factual assertion without a citation, with the best-matching paper ID as a suggestion.

### Alerts Delivery

APScheduler fires at 08:00 UTC daily. For each `Alert` document with `frequency = "daily"` (or weekly on Mondays), it:
1. Queries arXiv for each keyword in the subscription.
2. Collects up to 5 new papers per keyword.
3. Formats an HTML digest email.
4. Sends via SMTP through the async email service.

### Export (Markdown / DOCX)

- **Markdown**: Built entirely client-side from the already-fetched AI output (no extra API call). A `<a download>` link is programmatically clicked.
- **DOCX**: The frontend POSTs the Markdown string to `POST /projects/export/convert-docx`. The backend uses `python-docx` to convert headings, paragraphs, bold, and italic text into a proper `.docx` binary, which is returned as `application/vnd.openxmlformats-officedocument.wordprocessingml.document`.

### Research Question Tracker

Each `ResearchQuestion` stores a `paper_tags` array. Each tag has:
- `paper_id`: which paper
- `stance`: `supports | contradicts | partial`
- `note`: free-text explanation

The frontend renders an evidence map showing coverage per question — how many papers support, contradict, or partially address each question.

### Global Search

`GET /search?q=<query>&project_id=<optional>` runs three parallel MongoDB queries:
1. Papers — regex match on `title` and `abstract`.
2. Notes — regex match on `content` and `title`.
3. Annotations — regex match on `content` and `quote`.

Results are merged and returned as `{papers: [...], notes: [...], annotations: [...]}`. If `project_id` is omitted, it searches across all projects the user has access to.

### Comparative Analysis

`POST /projects/{id}/compare-papers` accepts a list of `paper_ids`. It fetches each paper's title, authors, abstract, and `extracted_data`, then constructs a Gemini prompt asking for a structured comparison across: methodology, sample size, key findings, limitations, and relevance. Returns a JSON matrix rendered as a table in the `/workspace/compare` page.

---

## Remaining Known Gap

| Item | Status | Notes |
|---|---|---|
| PDF highlight-to-annotate | **Not implemented** | `/workspace/reader` shows a pdf.js CDN iframe (read-only). Full highlight-to-annotate requires replacing the iframe with `react-pdf` library + text-selection event listeners — a non-trivial library migration deferred to Phase 3. |
