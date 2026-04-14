"""
Custom Token Authentication with expiry.

Replaces DRF's default TokenAuthentication.  Every token has a hard
24-hour lifetime measured from the moment it was created (i.e. when
the user last logged in via OTP).

Flow:
  - Token too old → delete it → raise 401
  - Frontend AuthContext 401 interceptor clears sessionStorage + redirects to /auth
  - On next successful OTP verify, a fresh token is created (clock resets)
"""

import logging
from datetime import timedelta

from django.utils import timezone
from rest_framework.authentication import TokenAuthentication
from rest_framework.exceptions import AuthenticationFailed

logger = logging.getLogger(__name__)

TOKEN_EXPIRE_HOURS = 24  # Hard lifetime; adjust via settings if needed


class ExpiringTokenAuthentication(TokenAuthentication):
    """
    Token authentication that enforces a hard expiry window.

    Inherits all behaviour of DRF's TokenAuthentication (Bearer header
    parsing, model look-ups) and adds a single age check.
    """

    def authenticate_credentials(self, key: str):
        model = self.get_model()

        try:
            token = model.objects.select_related('user').get(key=key)
        except model.DoesNotExist:
            raise AuthenticationFailed('Invalid token.')

        if not token.user.is_active:
            raise AuthenticationFailed('User account is inactive or has been disabled.')

        expiry_time = token.created + timedelta(hours=TOKEN_EXPIRE_HOURS)
        if timezone.now() > expiry_time:
            logger.info(
                '[AUTH] Token expired for user_id=%s (created=%s, expiry=%s).',
                token.user_id, token.created, expiry_time,
            )
            token.delete()
            raise AuthenticationFailed(
                'Your session has expired. Please log in again to continue.'
            )

        return (token.user, token)
