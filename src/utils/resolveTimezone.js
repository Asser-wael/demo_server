import geoip from "geoip-lite";

const FALLBACK_TIMEZONE = "UTC";

// Best-effort IP -> IANA timezone lookup for a subscription, used to
// deliver a scheduled broadcast at each subscriber's own local time.
// geoip-lite is an offline (bundled) database — no network call, no
// external API key — but it can't resolve private/local IPs or unknown
// ranges, so callers must treat the fallback as "send in server time"
// rather than a real match.
export function resolveTimezone(ip) {
    if (!ip) return FALLBACK_TIMEZONE;

    // Strip an IPv4-mapped IPv6 prefix (e.g. "::ffff:203.0.113.4") since
    // geoip-lite expects a plain IPv4/IPv6 address.
    const normalized = ip.startsWith("::ffff:") ? ip.slice(7) : ip;

    try {
        const result = geoip.lookup(normalized);
        return result?.timezone || FALLBACK_TIMEZONE;
    } catch {
        return FALLBACK_TIMEZONE;
    }
}

// "HH:mm" for the given IANA timezone, right now.
export function currentLocalTime(timezone) {
    try {
        return new Intl.DateTimeFormat("en-GB", {
            timeZone: timezone,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        }).format(new Date());
    } catch {
        return new Intl.DateTimeFormat("en-GB", {
            timeZone: FALLBACK_TIMEZONE,
            hour: "2-digit",
            minute: "2-digit",
            hourCycle: "h23",
        }).format(new Date());
    }
}
