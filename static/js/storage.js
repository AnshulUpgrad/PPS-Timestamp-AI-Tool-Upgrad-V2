/* ==========================================================================
   SHARED LOCALSTORAGE HELPERS

   localStorage is ~5MB per origin (counted in UTF-16, so ~2.5M characters in
   Chromium). A single 90-minute word-level transcript is ~750K characters, so
   a handful of sessions fills the quota permanently — nothing here expired
   before. Worse, an unguarded setItem() throws, which used to abort the
   transcription pipeline *after* the transcript had already been produced.

   safeSetItem() never throws. On a quota error it evicts other files' cached
   artifacts (largest first) and retries; if it still cannot fit, it reports
   failure and lets the caller carry on. Everything it evicts is re-fetchable
   from the server via /api/transcript, /api/chunks and /api/sentences.
   ========================================================================== */
(function (global) {
    'use strict';

    // Caches that may be dropped to make room. Ordered by how cheap they are
    // to rebuild. API keys, Modal tokens and the file registry are never here.
    const EVICTABLE_PREFIXES = ['chunk_progress_', 'transcript_', 'chunks_', 'deleted_'];

    function isQuotaError(err) {
        if (!err) return false;
        return err.name === 'QuotaExceededError'
            || err.name === 'NS_ERROR_DOM_QUOTA_REACHED'
            || err.code === 22
            || err.code === 1014;
    }

    /** Index into EVICTABLE_PREFIXES, or -1 if the key must never be evicted. */
    function evictionRank(key) {
        return EVICTABLE_PREFIXES.findIndex(prefix => key.startsWith(prefix));
    }

    function isEvictable(key) {
        return evictionRank(key) !== -1;
    }

    /**
     * The media filename a cache key belongs to, e.g.
     * 'chunks_lecture.mp3' -> 'lecture.mp3'. Returns null for non-cache keys.
     */
    function fileOfKey(key) {
        const prefix = EVICTABLE_PREFIXES.find(p => key.startsWith(p));
        return prefix ? key.slice(prefix.length) : null;
    }

    /** Approximate characters currently held in localStorage. */
    function storageUsage() {
        let total = 0;
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            total += key.length + (localStorage.getItem(key) || '').length;
        }
        return total;
    }

    /**
     * Evictable entries in the order they should be dropped:
     *   1. everything belonging to *other* files, before anything belonging to
     *      the file currently being worked on;
     *   2. within that, cheapest-to-rebuild first (EVICTABLE_PREFIXES order) —
     *      scratch resume-state, then a re-fetchable transcript, then the
     *      user's own chunk edits;
     *   3. within that, biggest first, so each removal frees the most room.
     *
     * The active file's own caches are last-resort only, and the key being
     * written is never a candidate.
     */
    function evictionCandidates(protectKey) {
        const activeFile = fileOfKey(protectKey);
        const items = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key === protectKey || !isEvictable(key)) continue;
            items.push({
                key: key,
                isActiveFile: activeFile !== null && fileOfKey(key) === activeFile,
                rank: evictionRank(key),
                size: (localStorage.getItem(key) || '').length
            });
        }
        items.sort((a, b) =>
            (a.isActiveFile - b.isActiveFile) || (a.rank - b.rank) || (b.size - a.size));
        return items;
    }

    /**
     * Write to localStorage without ever throwing.
     * Returns { ok, evicted: [keys], error }.
     */
    function safeSetItem(key, value) {
        try {
            localStorage.setItem(key, value);
            return { ok: true, evicted: [] };
        } catch (err) {
            if (!isQuotaError(err)) return { ok: false, evicted: [], error: err };
        }

        const evicted = [];
        for (const candidate of evictionCandidates(key)) {
            try {
                localStorage.removeItem(candidate.key);
            } catch (e) {
                continue;
            }
            evicted.push(candidate.key);

            try {
                localStorage.setItem(key, value);
                return { ok: true, evicted: evicted };
            } catch (err) {
                if (!isQuotaError(err)) return { ok: false, evicted: evicted, error: err };
            }
        }

        return {
            ok: false,
            evicted: evicted,
            error: new Error('Browser storage is full even after clearing every cached transcript.')
        };
    }

    /**
     * safeSetItem plus a human-readable log line. `log` is optional and is
     * called with a message when anything was evicted or the write failed.
     */
    function cacheLocally(key, value, log) {
        const result = safeSetItem(key, value);
        if (result.evicted.length && typeof log === 'function') {
            log(`Browser storage was full — cleared ${result.evicted.length} cached item(s) to make room. `
                + `They will reload from the server when needed.`);
        }
        if (!result.ok && typeof log === 'function') {
            log(`Could not cache "${key}" in this browser (${result.error.message}). `
                + `Your work is saved on the server; this only affects offline reuse.`);
        }
        return result;
    }

    /** Drop every evictable cache entry. Returns the number removed. */
    function clearCachedArtifacts() {
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (isEvictable(key)) keys.push(key);
        }
        keys.forEach(k => localStorage.removeItem(k));
        return keys.length;
    }

    global.safeSetItem = safeSetItem;
    global.cacheLocally = cacheLocally;
    global.storageUsage = storageUsage;
    global.clearCachedArtifacts = clearCachedArtifacts;
})(window);
