import logging
from django.core.cache import cache
from rest_framework.throttling import UserRateThrottle

logger = logging.getLogger(__name__)


class GenerativeRateThrottle(UserRateThrottle):
    scope = 'generative'


# ---------------------------------------------------------------------------
# OTP security constants (shared across throttle helpers and views)
# ---------------------------------------------------------------------------

OTP_BLOCK_DURATION  = 3600   # 1 hour — how long an IP stays blocked
OTP_SEND_WINDOW     = 900    # 15 minutes — sliding window for OTP send rate
OTP_SEND_MAX        = 5      # max OTP dispatches per IP per OTP_SEND_WINDOW
OTP_FAIL_MAX        = 5      # max wrong OTP submissions before IP block

# Generic message rendered to the user when they are IP-blocked.
# Deliberately vague — does not confirm whether the block is for OTP or login.
OTP_BLOCKED_MSG = (
    "Access temporarily blocked due to too many failed attempts. "
    "Please try again in 1 hour."
)


def get_client_ip(request) -> str:
    """
    Extract the real client IP, honouring X-Forwarded-For when behind a proxy
    (Nginx passes this header). Falls back to REMOTE_ADDR.
    """
    xff = request.META.get('HTTP_X_FORWARDED_FOR', '')
    if xff:
        return xff.split(',')[0].strip()
    return request.META.get('REMOTE_ADDR', '127.0.0.1')


def is_otp_blocked(ip: str) -> bool:
    """Return True if this IP is currently serving an OTP block."""
    return bool(cache.get(f"otp_block_{ip}"))


def set_otp_block(ip: str) -> None:
    """Impose a 1-hour block on this IP."""
    cache.set(f"otp_block_{ip}", 1, timeout=OTP_BLOCK_DURATION)
    logger.warning('[OTP_GUARD] IP %s blocked for %ds.', ip, OTP_BLOCK_DURATION)


def check_otp_send_rate(ip: str) -> bool:
    """
    Increment and check the OTP-send counter for this IP.
    Returns True (allowed) or False (rate-limited).
    OTP_SEND_MAX sends per OTP_SEND_WINDOW seconds.
    """
    key   = f"otp_send_{ip}"
    count = cache.get(key, 0)
    if count >= OTP_SEND_MAX:
        logger.warning('[OTP_GUARD] Send rate exceeded for IP %s (%d attempts).', ip, count)
        return False
    # Use add to be atomic on first write, then increment
    if count == 0:
        cache.set(key, 1, timeout=OTP_SEND_WINDOW)
    else:
        cache.incr(key)
    return True


def record_otp_failure(email: str, ip: str) -> bool:
    """
    Record a failed OTP submission.
    Returns True if the IP is now blocked (threshold crossed), False otherwise.
    """
    key   = f"otp_fail_{email}"
    fails = cache.get(key, 0) + 1
    logger.info('[OTP_GUARD] Failed OTP #%d for email=%s ip=%s.', fails, email, ip)
    if fails >= OTP_FAIL_MAX:
        set_otp_block(ip)
        cache.delete(key)   # clean up — block is now the authoritative signal
        return True
    cache.set(key, fails, timeout=OTP_BLOCK_DURATION)
    return False


def clear_otp_failures(email: str) -> None:
    """Clear the failure counter on successful OTP verify."""
    cache.delete(f"otp_fail_{email}")
