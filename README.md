<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/bd65e405-08e6-480c-9ff5-402e95599e10

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Omni safety / persistence notes

- `node_modules/` is intentionally not included in the ZIP. It is generated locally by `npm install` from `package.json` and `bun.lock`.
- Translation completion is gated by a server-side quality validator. Empty, mostly-untranslated Chinese, suspiciously short/large, paragraph-loss, malformed, or missing chapter-marker results are not accepted as completed.
- Multi-chapter translation batches use internal `<<<OMNI_CHAPTER_START ...>>>` / `<<<OMNI_CHAPTER_END ...>>>` markers so chapter reassembly does not guess boundaries.
- Final completion requires every expected source chunk to exist and be successfully validated. A missing chunk cannot make the job appear 100% complete.
- Never-Skip exports stop at the first missing/incomplete/invalid chapter and never include later chapters around a gap.
- Partial EPUB/TXT downloads are available as soon as at least one validated contiguous chapter is ready. There is no 30,000-word unlock threshold. Final exports are available after full completion.
- Browser status polling is lightweight and uses ETags. Unchanged status responses return HTTP 304 with no response body, so reopening/polling does not repeatedly download the novel or translated text.
- Large TXT uploads are gzip-compressed in browsers that support `CompressionStream`, with a normal multipart fallback. TXT downloads prefer Brotli (`br`) when the client supports it and fall back to gzip; EPUB is already ZIP/DEFLATE-compressed, so applying another compression layer would not meaningfully save data.
- Telegram progress messages report chunk progress, chapter progress, English translated-word count, and contiguous export readiness. Pause/resume, errors/blocks, free-capacity waiting, start, progress, and completion can be independently notified.
- Explicit Gemini content blocks are not blindly retried. A 429 is treated as provider capacity, not a failed translation: the affected key cools down, the chunk immediately rotates to another Gemini key, and 429s do not consume the chunk's finite retry budget. Temporary 5xx/timeouts remain bounded retries, and no paid fallback is introduced.

## Gemini safety fallback
Normal novel translation is pinned to `gemini-3.8-flash`. If Gemini explicitly blocks a chunk for a content-policy/safety reason, OmniVicente permanently switches that chunk to the same no-key Google Translate web-service approach used by MegaTXT-Translator. Normal chunks are never sent to Google Translate, and a safety-blocked chunk is never retried against Gemini.

The Google fallback does not require `GOOGLE_TRANSLATE_API_KEY` or a paid Google Cloud Translation account. It uses Google's public web translation endpoints and is therefore less stable than the official Cloud Translation API.
