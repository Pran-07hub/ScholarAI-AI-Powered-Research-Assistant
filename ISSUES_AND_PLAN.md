# ScholarAI - Issues, Impractical Features & Implementation Plan

## Product Summary

ScholarAI is an AI-powered academic research platform (FastAPI + Next.js + MongoDB + ChromaDB) that helps researchers with literature review, paper management, AI-assisted writing, collaboration, and discovery. It has ~20 workspace features and 40+ API endpoints.

---

## PART 1: IMPRACTICAL / HOLLOW FEATURES

These features exist in the codebase but are either fake, broken, or too shallow to be useful.

### 1. Writing Router - Completely Fake (CRITICAL)
- **File:** `backend/routers/writing.py`
- **Problem:** All 4 endpoints (`/draft`, `/rewrite`, `/academic-tone`, `/notes-to-section`) return hardcoded placeholder strings like `"[AI Generated Content Placeholder]"`. Zero AI integration.
- **Impact:** Any frontend calling these gets garbage. The real writing logic lives in `writing_tools.py` and `academic_workflow.py`, making this router dead weight that could confuse developers.
- **Plan:** Delete `writing.py` entirely. It's superseded by `writing_tools.py` and `academic_workflow.py`. Remove its mount from `main.py`.

### 2. Citation Generation - Template Strings, Not Real Citations (CRITICAL)
- **File:** `backend/routers/citations.py:20-39`
- **Problem:** Citations are built with naive f-strings. No "et al." for 3+ authors, no italics, no proper punctuation rules, no DOI formatting. `paper.venue` can be `None` producing `"None."` in output. The bibliography endpoint (`/project/{id}/bibliography`) ignores the `style` parameter entirely and always outputs a default format.
- **Impact:** Researchers cannot use these citations in actual papers. This is a core feature that's unusable.
- **Plan:** 
  - Install `citeproc-py` or build a proper citation formatter with APA 7th, MLA 9th, IEEE, Chicago, and BibTeX support.
  - Handle edge cases: 1 author, 2 authors, 3+ authors (et al.), missing venue, missing date, DOI formatting.
  - Make bibliography endpoint actually respect the `style` parameter.

### 3. Two Citation Endpoints - Not Implemented (501)
- **File:** `backend/routers/citations.py:62-68`
- **Problem:** `/citations/check-missing` and `/citations/consistency-check` return HTTP 501. These are listed in the API but do nothing.
- **Plan:**
  - **check-missing:** Accept a text blob + project_id. Use Gemini to identify claims without citations and match them against project papers.
  - **consistency-check:** Compare citation keys/styles across a document for inconsistencies (e.g., mixing APA and MLA).

### 4. PaperDetailPanel - Uses Mock Data, Not Real Papers
- **File:** `frontend/components/papers/PaperDetailPanel.tsx`
- **Problem:** Imports `Paper` type from `@/data/mockPapers.ts` which has fields (`relevanceScore`, `journal`, `doi`, `aiSummary`, `keyVariables`) that don't exist on real backend Paper objects. The panel would crash or show undefined for real papers.
- **Impact:** The paper detail side panel in the papers library is effectively non-functional with real data.
- **Plan:** Rewrite to use the actual backend Paper schema. Replace `relevanceScore` with actual data, add AI summary generation on-demand, show extracted_data fields.

### 5. Mock Data Files Still Present
- **Files:** `frontend/data/mockPapers.ts`, `frontend/data/sampleData.ts`
- **Problem:** Mock data exists for development but the `Paper` interface in mockPapers.ts defines a schema that diverges from the real backend model. This causes confusion and type mismatches.
- **Plan:** Delete mock data files. Ensure all components use the real API types.

### 6. News Feed - Shallow and Unactionable
- **File:** `frontend/app/workspace/news/page.tsx`, `backend/routers/news.py`
- **Problem:** Shows news articles as a flat grid with no filtering, no source selection, no save/bookmark, and no way to connect news to papers. It's essentially a read-only RSS viewer.
- **Plan:**
  - Add source filtering (arXiv, PubMed, Google Scholar alerts).
  - Add "Save to Notes" action on news items.
  - Add relevance scoring against project papers.
  - Allow custom keyword subscriptions beyond project context.

### 7. Alerts System - Subscribe Only, No Delivery
- **File:** `backend/routers/news.py` (alerts endpoints)
- **Problem:** Users can subscribe to keyword alerts and set frequency (daily/weekly), but there's no background job or cron that actually sends alert emails. The subscription is stored but never acted upon.
- **Plan:** Implement a background scheduler (APScheduler or Celery Beat) that:
  - Runs daily/weekly based on user preferences.
  - Queries arXiv/Semantic Scholar for new papers matching keywords.
  - Sends digest emails via the existing email service.

### 8. Collaboration Annotations - No PDF Integration
- **File:** `frontend/app/workspace/annotations/page.tsx`
- **Problem:** Annotations are just text notes with a color tag attached to a paper. There's no actual PDF viewer integration - you can't highlight text in a PDF and annotate it. The `quote` field exists but is manually typed, not selected from a document.
- **Impact:** This is essentially just "comments on papers" not real annotations. Researchers expect to highlight and annotate directly on PDFs.
- **Plan (phased):**
  - **Phase 1:** Keep current text-based annotations but improve UX with paper context.
  - **Phase 2:** Integrate a PDF viewer (pdf.js) with highlight-to-annotate functionality.

### 9. Draft Model - Exists in DB, No Frontend
- **File:** `backend/models.py` (Draft model), `backend/database.py`
- **Problem:** The `Draft` model (title, content, version, status) is defined and initialized in the database but has zero API endpoints and zero frontend pages. It's dead schema.
- **Plan:** Either implement a proper drafting system (versioned documents with AI assistance) or remove the model to reduce confusion.

---

## PART 2: BUGS & TECHNICAL ISSUES

### 10. App Metadata - Still "Create Next App"
- **File:** `frontend/app/layout.tsx:15-17`
- **Problem:** Page title is `"Create Next App"` and description is `"Generated by create next app"`. This shows in browser tabs and SEO.
- **Fix:** Change to `"ScholarAI - AI Research Assistant"` with proper description.

### 11. Chat Messages - No Pagination, Unbounded Growth
- **Files:** `backend/routers/chats.py`, `backend/models.py`
- **Problem:** All chat messages are stored as a single `List[dict]` inside the Chat document. No pagination on fetch. A chat with 1000+ messages loads everything at once.
- **Fix:** 
  - Add pagination params to `GET /chats/{id}` (offset, limit).
  - Or separate messages into their own collection with a chat_id foreign key.

### 12. JSON Parsing Fragility Across AI Services
- **Files:** `backend/services/synthesis.py:110-115`, `backend/services/data_extraction.py:69-80`, `backend/services/discovery_service.py`
- **Problem:** All Gemini responses are parsed with `json.loads()` after stripping markdown fences. If Gemini returns malformed JSON (which happens), the entire operation silently fails and returns empty results.
- **Fix:** 
  - Use Gemini's structured output mode (JSON mode) where available.
  - Implement a retry-with-prompt-refinement strategy (ask Gemini to fix its JSON).
  - Add `json_repair` library as fallback parser.

### 13. ChromaDB Not Cloud-Backed
- **File:** `backend/services/vector_store.py`
- **Problem:** ChromaDB persists to local `/app/chromadb`. If the container is recreated (deploy, scaling), all vector indexes are lost and must be rebuilt.
- **Fix:** 
  - Option A: Back up ChromaDB directory to GCS on a schedule and restore on startup.
  - Option B: Migrate to a managed vector DB (Pinecone, Weaviate Cloud, or MongoDB Atlas Vector Search since you already use MongoDB).

### 14. No Rate Limiting on Expensive AI Endpoints
- **Problem:** Endpoints like `/synthesize`, `/analyze-gaps`, `/academic-workflow/*`, `/writing-tools/*` all trigger Gemini API calls that cost money. No rate limiting exists.
- **Fix:** Add rate limiting middleware (slowapi or custom) with per-user quotas on AI-heavy endpoints.

### 15. Authorization Inconsistencies
- **Problem:** Some project endpoints check ownership only (forbid members), while collaboration endpoints allow members. There's no consistent RBAC. For example, `analyze-gaps` and `bibliography` are owner-only, but members should probably have access too.
- **Fix:** Implement a `check_project_access(project, user)` helper that returns the user's role (owner/member/none) and use it consistently across all project-scoped endpoints.

### 16. PDF Upload - No OCR, Weak Fallback
- **File:** `backend/routers/projects.py:311-420`
- **Problem:** PDFs are read with pypdf which only handles text-based PDFs. Scanned/image PDFs return empty text, and the fallback is just cleaning the filename as the title. No OCR support at all.
- **Fix:** Add Tesseract OCR (pytesseract) or use Gemini's multimodal capability to process scanned PDFs.

### 17. Semantic Scholar API - No Rate Limit Handling
- **File:** `backend/services/citation_graph_service.py:75-127`
- **Problem:** Citation graph fetches Semantic Scholar API without backoff or retry. Rate limits will cause silent failures. Capped at 20 papers as a workaround.
- **Fix:** Add exponential backoff with `tenacity` library. Increase paper cap when rate limits allow.

### 18. Email Service - Blocks Event Loop
- **File:** `backend/services/email_service.py`
- **Problem:** SMTP calls are synchronous and can block the async event loop. No timeout on SMTP connection. No delivery verification.
- **Fix:** Run email sending in a thread pool executor with a timeout, or switch to an async email library.

### 19. Conference Service - Brittle HTML Parsing
- **File:** `backend/services/conference_service.py`
- **Problem:** Parses WikiCFP HTML tables with hardcoded structure assumptions. If WikiCFP changes their HTML layout, the service breaks silently.
- **Fix:** Add try/except around parsing with meaningful fallbacks. Consider using a more stable data source or caching the parsed results longer.

### 20. Frontend - No Loading/Error Boundaries
- **Problem:** Most pages handle errors with inline state (`error && <p>Failed</p>`) but there are no React Error Boundaries. An unhandled error in one component crashes the entire page.
- **Fix:** Add Error Boundaries at the workspace layout level and per-page level.

### 21. Security - No Input Sanitization
- **Problem:** Project names, note content, and annotation text are stored and served without sanitization. Potential XSS if rendered with `dangerouslySetInnerHTML` anywhere.
- **Fix:** Sanitize user input server-side (bleach for Python) and ensure frontend uses safe rendering (react-markdown is safe, but verify all raw HTML rendering points).

---

## PART 3: FEATURES THAT WOULD MAKE THE PRODUCT ACTUALLY USEFUL

### 22. Full-Text PDF Reader with Annotations
- **Current state:** No PDF viewer. Papers are just metadata entries.
- **Why it matters:** Researchers need to READ papers within the tool, not just manage metadata. Without this, they constantly switch between ScholarAI and their PDF reader.
- **Plan:**
  - Embed pdf.js viewer in a new `/workspace/reader/[paperId]` page.
  - Support highlight-to-annotate (select text -> create annotation).
  - Sync annotations with the existing annotation system.
  - Show AI-generated summaries alongside the PDF.

### 23. Proper Search Across All Content
- **Current state:** Search only works within chat (via the AI agent). No way to search across all your papers, notes, annotations, or chats.
- **Plan:**
  - Add a global search endpoint that queries papers (by title/abstract), notes (by content), chats (by messages), and annotations (by text).
  - Use ChromaDB semantic search for relevance ranking.
  - Add a search results page or command palette (Cmd+K).

### 24. Paper Import from DOI/URL
- **Current state:** Papers are added via chat discovery or PDF upload. No way to paste a DOI or URL and auto-import.
- **Plan:**
  - Add "Import Paper" modal that accepts DOI, arXiv ID, Semantic Scholar URL, or direct URL.
  - Auto-fetch metadata from Crossref (DOI), arXiv API, or Semantic Scholar.
  - Much faster than uploading PDFs for papers you already know about.

### 25. Export/Download Research Outputs
- **Current state:** Only BibTeX and LaTeX bibliography export exists. No way to export gap analysis, synthesis, timeline, or related work as a document.
- **Plan:**
  - Add "Export as PDF/Word/Markdown" button to: gap analysis, synthesis, timeline, related work, thesis outline, grant review.
  - Use a Markdown-to-PDF pipeline (puppeteer or WeasyPrint).

### 26. User Preferences - Actually Use Them
- **Current state:** Users can set `research_domains`, `citation_style`, `alert_frequency`, `ai_strictness` in preferences. But these are NEVER read by any other endpoint. The AI doesn't check `ai_strictness`, citations don't default to the user's preferred style, etc.
- **Plan:**
  - Citation endpoints should default to user's preferred `citation_style`.
  - AI endpoints should adjust prompt temperature/strictness based on `ai_strictness`.
  - Discovery should use `research_domains` to personalize recommendations even without a project.

### 27. Project Dashboard / Overview Page
- **Current state:** Selecting a project takes you to the workspace landing (search bar). No overview of what's in the project.
- **Plan:**
  - Create a project dashboard showing: paper count, recent activity, gap analysis summary, team members, upcoming conference deadlines, unread annotations.
  - This gives researchers a quick pulse on their project status.

### 28. Comparative Analysis Table
- **Current state:** Data extraction gives you a spreadsheet of individual papers. No way to compare papers side-by-side on specific dimensions.
- **Plan:**
  - Add a comparison view where users select 2-5 papers and see a matrix comparing: methodology, sample size, findings, limitations.
  - AI-generated comparison summary.

### 29. Research Question Tracker
- **Current state:** No way to formally track research questions and map papers to them.
- **Plan:**
  - Allow users to define research questions per project.
  - Tag papers as "supports", "contradicts", or "partially addresses" each question.
  - Generate an evidence map showing coverage per question.

### 30. Mobile Responsive Design
- **Current state:** Desktop-focused layout. Tables and sidebars break on mobile.
- **Plan:** Add responsive breakpoints, collapsible panels, and touch-friendly interactions. At minimum, the chat interface and paper library should work on tablets.

---

## PART 4: IMPLEMENTATION PRIORITY

### Phase 1 - Fix What's Broken (1-2 weeks)
| # | Task | Impact | Effort |
|---|------|--------|--------|
| 10 | Fix app metadata ("Create Next App") | Quick win | 5 min |
| 1 | Delete dead `writing.py` router | Removes confusion | 10 min |
| 5 | Delete mock data files, fix PaperDetailPanel types | Removes confusion | 1 hr |
| 15 | Add `check_project_access()` helper, standardize auth | Security | 3 hrs |
| 2 | Fix citation generation (proper formatting) | Core feature | 4 hrs |
| 12 | Add JSON repair/retry for AI responses | Reliability | 3 hrs |
| 21 | Add input sanitization | Security | 2 hrs |
| 11 | Add chat message pagination | Performance | 3 hrs |
| 26 | Wire up user preferences to relevant endpoints | Consistency | 3 hrs |

### Phase 2 - Make Features Useful (2-4 weeks)
| # | Task | Impact | Effort |
|---|------|--------|--------|
| 4 | Rewrite PaperDetailPanel for real data | UX | 4 hrs |
| 3 | Implement missing citation endpoints | Feature complete | 6 hrs |
| 24 | Paper import from DOI/URL | Huge UX improvement | 8 hrs |
| 6 | Improve news feed with filtering/actions | Engagement | 6 hrs |
| 7 | Implement alert delivery system | Feature complete | 8 hrs |
| 14 | Add rate limiting on AI endpoints | Cost/security | 4 hrs |
| 25 | Export research outputs as PDF/Markdown | Practical value | 8 hrs |
| 16 | Add OCR support for scanned PDFs | Broader PDF support | 4 hrs |
| 27 | Build project dashboard/overview | Navigation | 8 hrs |

### Phase 3 - Differentiate the Product (4-8 weeks)
| # | Task | Impact | Effort |
|---|------|--------|--------|
| 22 | Full-text PDF reader with annotations | Game-changer | 2 weeks |
| 23 | Global search across all content | Core UX | 1 week |
| 28 | Comparative analysis table | Research value | 1 week |
| 29 | Research question tracker + evidence map | Academic rigor | 1 week |
| 8 | PDF-integrated annotations (Phase 2) | Premium feature | 1 week |
| 9 | Drafting system (if keeping Draft model) | Writing workflow | 1 week |
| 13 | Migrate ChromaDB to managed vector DB | Infra reliability | 3 days |
| 30 | Mobile responsive design | Accessibility | 1 week |

---

## PART 5: QUICK WINS (Can Do Right Now)

1. **Fix metadata** in `layout.tsx` - literal 5 minute fix
2. **Delete `writing.py`** - dead code removal
3. **Delete mock data** - `mockPapers.ts`, `sampleData.ts`
4. **Fix bibliography** to respect the `style` parameter (it's ignored)
5. **Add `None` checks** in citation generation for `paper.venue`
6. **Add React Error Boundaries** at layout level
7. **Fix the `Draft` model situation** - either use it or remove it

---

*Generated from full codebase analysis on 2026-04-01*
