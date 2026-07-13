'use strict';

// Thin, defensive wrapper around @sentry/node.
//
// Design goals (identical to the sma.modbus app so the two behave the same):
//  - Never break the app. Sentry is initialised lazily inside try/catch, and
//    every exported function is a no-op when Sentry is unavailable or the DSN
//    is not configured. A telemetry failure must never affect device operation
//    or, more importantly, the OAuth2 sign-in / token-refresh flow.
//  - No global process handlers. We use `defaultIntegrations: false` so Sentry
//    does NOT install uncaughtException/unhandledRejection handlers (those can
//    exit the process) - Homey has its own crash reporting. We only send
//    explicit captures.
//  - Anonymous. No PII is sent: `sendDefaultPii` is false and `beforeSend`
//    strips the hostname and any user object down to the pseudonymous Homey id.
//    Tokens, refresh tokens, VINs, coordinates and the VCC API key are never
//    passed to this module.
//
// The DSN is read from env.json as `SENTRY_DSN` via the static `Homey.env`
// (the same accessor this app uses for CLIENT_ID / CLIENT_SECRET). If it is
// empty/missing, telemetry stays disabled and every function is a no-op.

const { formatError } = require('./util');

let Sentry = null;
let enabled = false;
let initialized = false;

// Per-key timestamp of the last sent event, for simple in-memory rate limiting.
const rateLimits = new Map();

/**
 * Initialise Sentry from the app's env.json DSN. Safe to call once from the
 * app's onInit. Returns true when telemetry is active.
 * @param {import('homey').Homey} homey
 * @returns {boolean}
 */
function init(homey) {
    if (initialized) {
        return enabled;
    }
    initialized = true;

    try {
        // Read the DSN from env.json. Prefer the instance accessor, but fall
        // back to the static `Homey.env` - which is what the rest of this app
        // uses (Homey.env.CLIENT_ID) and the reliable way to read env.json in
        // SDK v3. `homey.env` is often undefined, which would otherwise leave
        // the DSN unread and silently disable telemetry.
        let dsn = (homey && homey.env && homey.env.SENTRY_DSN) || '';
        if (!dsn) {
            try {
                const Homey = require('homey');
                dsn = (Homey && Homey.env && Homey.env.SENTRY_DSN) || '';
            } catch (_) {
                // Not running under the Homey runtime (e.g. a local unit test).
            }
        }
        if (!dsn || typeof dsn !== 'string' || dsn.trim() === '') {
            return false; // Not configured -> disabled.
        }

        // Lazy require so a load/compat failure disables telemetry instead of
        // crashing the app.
        Sentry = require('@sentry/node');

        const appVersion = (homey.manifest && homey.manifest.version) || 'unknown';
        let homeyVersion = 'unknown';
        try {
            homeyVersion = homey.version || 'unknown';
        } catch (_) { /* ignore */ }

        Sentry.init({
            dsn: dsn.trim(),
            release: appVersion,
            // NOTE: intentionally not setting `environment` to the Homey firmware
            // version - that lands every event under an environment like "12.9.0",
            // which Sentry's default (environment-filtered) view can hide. Firmware
            // is a tag below instead, so events show up and stay filterable.
            // Explicit captures only; keep the footprint minimal and never touch
            // global process handlers.
            defaultIntegrations: false,
            tracesSampleRate: 0,
            sendDefaultPii: false,
            beforeSend(event) {
                try {
                    delete event.server_name; // don't leak the hostname
                    // Keep only the (pseudonymous) Homey id for counting distinct
                    // affected Homeys, and force ip_address to null so Sentry does
                    // not geolocate from the request IP.
                    const id = event.user && event.user.id;
                    event.user = { id: id || undefined, ip_address: null };
                } catch (_) { /* ignore */ }
                return event;
            }
        });

        try {
            Sentry.setTags({ appVersion, homeyVersion, nodeVersion: process.version });
        } catch (_) { /* ignore */ }

        // Identify events by the unique Homey id so Sentry's "Users" count reflects
        // how many distinct Homeys are affected. Fetched in the background (async);
        // the first telemetry event is typically minutes away, so it is set in time.
        try {
            if (homey && homey.cloud && typeof homey.cloud.getHomeyId === 'function') {
                Promise.resolve(homey.cloud.getHomeyId())
                    .then((id) => {
                        if (id) {
                            Sentry.setUser({ id: String(id), ip_address: null });
                        }
                    })
                    .catch(() => { /* ignore - user id is best effort */ });
            }
        } catch (_) { /* ignore */ }

        enabled = true;
        return true;
    } catch (_) {
        // Any failure (missing package, incompatible Node, bad DSN) -> disabled.
        Sentry = null;
        enabled = false;
        return false;
    }
}

function isEnabled() {
    return enabled;
}

/**
 * Record a breadcrumb - contextual trail attached to the next captured event.
 * Cheap and NOT rate-limited (breadcrumbs are only transmitted when an actual
 * event is captured), so use it to leave a trail of transient conditions
 * (e.g. network blips during token refresh) that explain a later failure.
 * No-op when disabled.
 * @param {object} args
 * @param {string} [args.category]
 * @param {string} args.message
 * @param {string} [args.level]
 * @param {object} [args.data]
 */
function addBreadcrumb({ category = 'app', message, level = 'info', data = {} } = {}) {
    if (!enabled || !Sentry || !message) {
        return;
    }
    try {
        Sentry.addBreadcrumb({ category, message, level, data });
    } catch (_) {
        // never throw
    }
}

/**
 * Report a message, rate-limited per `key`. No-op when disabled.
 * @param {string} key                     Unique key for rate limiting (e.g. per session/command).
 * @param {string} message                 Human-readable message / issue title.
 * @param {object} [options]
 * @param {string} [options.level]         Sentry level (default 'warning').
 * @param {object} [options.tags]          Indexed tags (errorType, status, ...).
 * @param {object} [options.extra]         Additional non-indexed context.
 * @param {number} [options.minIntervalMs] Minimum ms between events for this key.
 */
function report(key, message, options = {}) {
    if (!enabled || !Sentry) {
        return;
    }
    const {
        level = 'warning',
        tags = {},
        extra = {},
        minIntervalMs = 6 * 60 * 60 * 1000 // once per 6h per key
    } = options;

    try {
        const now = Date.now();
        const last = rateLimits.get(key) || 0;
        if (now - last < minIntervalMs) {
            return;
        }
        rateLimits.set(key, now);
        Sentry.captureMessage(message, { level, tags, extra });
    } catch (_) {
        // never throw
    }
}

/**
 * Capture an exception. No-op when disabled.
 * @param {Error} error
 * @param {object} [options]
 * @param {object} [options.tags]
 * @param {object} [options.extra]
 */
function captureException(error, options = {}) {
    if (!enabled || !Sentry) {
        return;
    }
    const { tags = {}, extra = {} } = options;
    try {
        Sentry.captureException(error, { tags, extra });
    } catch (_) {
        // never throw
    }
}

/*
 * ------------------------------------------------------------------------
 * Volvo-specific helpers
 *
 * These encode the rate-limit policy and tagging for each class of event so
 * the call sites stay one-liners and every event of a kind is shaped the same.
 * ------------------------------------------------------------------------
 */

// Map our internal error classes to scrub-safe values. Sentry's server-side
// data scrubbing redacts values containing the standalone words "auth" and
// "token", so the raw class name 'auth' would arrive as [Filtered]. 'rejected'
// carries the same meaning and survives. Numbers (status, ages) are never
// scrubbed, and OAuth error codes like 'invalid_grant' contain no trigger word.
const FAILURE_CLASS = {
    network: 'network',
    server: 'server',
    auth: 'rejected',
    client: 'client',
    unknown: 'unknown',
};

const msToSec = (ms) => (typeof ms === 'number' ? Math.round(ms / 1000) : null);

// Coarse, low-cardinality age bucket suitable for a Sentry tag. Exact ages go
// in `extra` (high cardinality); the bucket lets you group rejections by token
// age and see whether they cluster at a consistent lifetime (time-based death)
// or scatter across all ages (lost-rotation / network-correlated death).
const ageBucket = (ms) => {
    if (typeof ms !== 'number') return 'unknown';
    const hours = ms / (60 * 60 * 1000);
    if (hours < 1) return '<1h';
    if (hours < 6) return '1-6h';
    if (hours < 24) return '6-24h';
    const days = hours / 24;
    if (days < 7) return '1-7d';
    if (days < 30) return '7-30d';
    if (days < 90) return '30-90d';
    return '>90d';
};

/**
 * A token refresh attempt failed. Called (via OAuth2App) from OAuth2Client's
 * error classifier. This is the primary answer to "why does the refresh token
 * stop working over time?".
 *
 * Every failure leaves a breadcrumb (cheap, gives context to a later expiry),
 * but only rejections - where the identity provider refused the refresh token
 * and the user must re-authorize - are raised as their own Sentry issue. That
 * keeps transient network/server blips out of the issue stream. Issues are
 * grouped by the OAuth error code (invalid_grant, invalid_client, ...) so you
 * can see which cause dominates and how it trends.
 *
 * Field naming avoids the words Sentry scrubs ("auth"/"token") so the data is
 * readable even with default scrubbing on. The only field that may still be
 * redacted is `description` (Volvo's text often contains the word "token") -
 * add it to the project's Safe Fields in Sentry to see it verbatim.
 *
 * @param {object} args
 * @param {string} args.errorType             'network'|'server'|'auth'|'client'|'unknown'
 * @param {number} [args.status]              HTTP status of the token endpoint response
 * @param {string} [args.oauthError]          OAuth2 error code, e.g. 'invalid_grant'
 * @param {string} [args.oauthErrorDescription] Human description from the provider
 * @param {string} [args.message]             Short fallback error message
 * @param {number} [args.accessTokenAgeMs]    Age of the access token when it failed
 * @param {number} [args.msToExpiry]          Time to expiry (negative if already expired)
 * @param {boolean} [args.refreshable]        Whether the token was considered refreshable
 * @param {number} [args.msSinceLastSuccess]  Time since the last successful refresh (this run)
 * @param {number} [args.consecutiveFailures] Consecutive failed refreshes
 * @param {string} [args.sessionId]           Pseudonymous session id (rate-limit key)
 */
function reportRefreshTokenError({
    errorType = 'unknown',
    status,
    oauthError = null,
    oauthErrorDescription = null,
    message,
    accessTokenAgeMs = null,
    refreshTokenAgeMs = null,
    sessionAgeMs = null,
    msToExpiry = null,
    refreshable = null,
    msSinceLastSuccess = null,
    consecutiveFailures = null,
    sessionId = 'default',
} = {}) {
    const failureClass = FAILURE_CLASS[errorType] || 'unknown';
    const errorCode = oauthError || 'none';
    const refreshAgeBucket = ageBucket(refreshTokenAgeMs);

    addBreadcrumb({
        category: 'session',
        level: errorType === 'auth' ? 'error' : 'warning',
        message: `Refresh failed (${failureClass}${oauthError ? `: ${oauthError}` : ''})`,
        data: {
            failureClass,
            httpStatus: status || null,
            errorCode: oauthError || null,
            refreshTokenAgeSec: msToSec(refreshTokenAgeMs),
            refreshAgeBucket,
        }
    });

    if (errorType !== 'auth') {
        // Transient (network/server) or config (client) issues: breadcrumb only.
        return;
    }

    report(
        // Include the error code in the key so distinct causes are tracked
        // separately rather than collapsing into one rate-limited bucket.
        `refresh-rejected:${sessionId}:${errorCode}`,
        `Refresh rejected (${oauthError || (status ? `HTTP ${status}` : 'unknown')})`,
        {
            level: 'error',
            tags: {
                sessionEvent: 'refresh-rejected',
                failureClass,
                errorCode,
                httpStatus: status ? String(status) : 'none',
                refreshable: refreshable === null ? 'unknown' : String(refreshable),
                // Coarse token-age bucket, so you can group rejections by age.
                refreshAgeBucket,
            },
            extra: {
                // May be [Filtered] by Sentry if it contains the word "token";
                // allowlist it in the project's Safe Fields to read it.
                description: oauthErrorDescription || message || 'unknown',
                accessTokenAgeSec: msToSec(accessTokenAgeMs),
                refreshTokenAgeSec: msToSec(refreshTokenAgeMs),
                sessionAgeSec: msToSec(sessionAgeMs),
                secToExpiry: msToSec(msToExpiry),
                secSinceLastSuccess: msToSec(msSinceLastSuccess),
                consecutiveFailures,
            },
            minIntervalMs: 60 * 60 * 1000 // once per hour per session+cause
        }
    );
}

/**
 * An OAuth2 session expired and a device was set unavailable. This is the
 * user-visible impact of an auth failure. Rate-limited per session. When the
 * device can read the last refresh error, `reason`/`httpStatus` carry the cause
 * onto this event too (the enriched refresh-rejected issue has the full story).
 * @param {object} [args]
 * @param {string} [args.sessionId]
 * @param {string} [args.reason]      OAuth error code, e.g. 'invalid_grant'
 * @param {number} [args.httpStatus]
 * @param {object} [args.tags]        e.g. { vehicleType }
 */
function reportSessionExpired({ sessionId = 'default', reason = null, httpStatus = null, tags = {} } = {}) {
    report(
        `session-expired:${sessionId}`,
        'OAuth2 session expired - device set unavailable',
        {
            level: 'warning',
            tags: {
                ...tags,
                sessionEvent: 'expired',
                errorCode: reason || 'unknown',
                httpStatus: httpStatus ? String(httpStatus) : 'none',
            },
            minIntervalMs: 60 * 60 * 1000 // once per hour per session
        }
    );
}

/**
 * A sign-in flow (pairing) or re-authorization flow (repair) failed. Captured
 * as an exception so the stack/type is preserved. `phase` distinguishes the
 * first-time login from a re-auth, which behave differently in practice.
 * (Note: the exception *message* may be scrubbed by Sentry if it contains the
 * word "token"; the tags below always survive.)
 * @param {'pair'|'repair'} phase
 * @param {Error|*} error
 */
function reportAuthFlowError(phase, error) {
    captureException(error instanceof Error ? error : new Error(formatError(error)), {
        tags: { sessionEvent: 'signin-flow', flowPhase: phase }
    });
}

/**
 * A user-initiated vehicle command (lock/unlock/engine start, ...) failed.
 * Rate-limited per command so a repeatedly-failing command does not spam.
 * @param {string} command
 * @param {Error|*} error
 */
function reportCommandFailure(command, error) {
    report(
        `command-failure:${command}`,
        `Vehicle command failed: ${command}`,
        {
            level: 'warning',
            tags: { command },
            extra: { message: formatError(error) },
            minIntervalMs: 30 * 60 * 1000 // once per 30 min per command
        }
    );
}

/**
 * The VCC API key is missing from app settings, so every Volvo API call will
 * fail. A configuration problem, reported rarely (once/day) as info.
 */
function reportMissingApiKey() {
    report(
        'missing-vcc-api-key',
        'VCC API key missing from app settings',
        {
            level: 'info',
            minIntervalMs: 24 * 60 * 60 * 1000 // once per day
        }
    );
}

/**
 * Flush pending events (call on app shutdown).
 * @param {number} [timeout]
 */
async function flush(timeout = 2000) {
    if (!enabled || !Sentry) {
        return;
    }
    try {
        await Sentry.flush(timeout);
    } catch (_) {
        // never throw
    }
}

module.exports = {
    init,
    isEnabled,
    addBreadcrumb,
    report,
    captureException,
    reportRefreshTokenError,
    reportSessionExpired,
    reportAuthFlowError,
    reportCommandFailure,
    reportMissingApiKey,
    flush,
};
