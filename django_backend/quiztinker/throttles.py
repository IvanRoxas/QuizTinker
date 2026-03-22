from rest_framework.throttling import UserRateThrottle

class GenerativeRateThrottle(UserRateThrottle):
    scope = 'generative'
