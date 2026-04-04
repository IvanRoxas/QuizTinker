from rest_framework.views import exception_handler
from rest_framework.exceptions import NotAuthenticated
import logging

logger = logging.getLogger(__name__)


def custom_exception_handler(exc, context):
    """
    Wrap DRF validation errors in an ``errors`` key to match the format
    the React frontend expects (same as Laravel's validation response).

    Laravel returns:  { "message": "...", "errors": { "field": ["msg"] } }
    DRF returns:      { "field": ["msg"] }

    This handler converts DRF's flat format into the Laravel-style nested
    format so the frontend's ``error.response.data.errors`` access works.
    It also forces NotAuthenticated to return 401 instead of SessionAuth's default 403.
    """
    try:
        response = exception_handler(exc, context)

        if response is not None:
            if response.status_code == 400:
                # DRF uses 400 for validation; the frontend checks for 422.
                response.status_code = 422
                response.data = {'errors': response.data}
            elif response.status_code == 403 and isinstance(exc, NotAuthenticated):
                # SessionAuthentication returns 401
                response.status_code = 401
            elif response.status_code == 429:
                # Explicitly log Rate Limits
                req = context.get('request')
                actor = f"User {req.user.id}" if req and getattr(req, 'user', None) and req.user.is_authenticated else f"IP {req.META.get('REMOTE_ADDR')}"
                logger.warning(f"[SECURITY] Rate Limit Extra Triggered! {actor} on {req.path}")

        return response
    except Exception as e:
        logger.error(f"Error in custom_exception_handler: {e}", exc_info=True)
        raise e

