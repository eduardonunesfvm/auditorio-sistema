import hashlib
import ipaddress
import logging
import os
from dataclasses import dataclass

from fastapi import HTTPException, Request, status
from redis import Redis
from redis.exceptions import RedisError

from app.observability import domain_metrics


logger = logging.getLogger(__name__)


_CHECK_LIMITS_SCRIPT = """
local limits = {tonumber(ARGV[1]), tonumber(ARGV[3])}
local windows = {tonumber(ARGV[2]), tonumber(ARGV[4])}

for index, key in ipairs(KEYS) do
    local current = tonumber(redis.call('GET', key) or '0')
    if current >= limits[index] then
        local ttl = redis.call('TTL', key)
        if ttl < 1 then ttl = windows[index] end
        return {0, ttl}
    end
end

for index, key in ipairs(KEYS) do
    local current = redis.call('INCR', key)
    if current == 1 then redis.call('EXPIRE', key, windows[index]) end
end

return {1, 0}
"""


@dataclass(frozen=True)
class RateLimit:
    maximum: int
    window_seconds: int


class LoginRateLimiter:
    def __init__(self, redis_client: Redis | None = None) -> None:
        redis_url = os.getenv("REDIS_URL")
        self.redis = redis_client
        if self.redis is None and redis_url:
            self.redis = Redis.from_url(
                redis_url,
                decode_responses=True,
                socket_connect_timeout=1,
                socket_timeout=1,
            )
        self.ip_limit = RateLimit(
            maximum=int(os.getenv("LOGIN_RATE_LIMIT_IP_MAX", "10")),
            window_seconds=int(os.getenv("LOGIN_RATE_LIMIT_IP_WINDOW_SECONDS", "60")),
        )
        self.login_limit = RateLimit(
            maximum=int(os.getenv("LOGIN_RATE_LIMIT_LOGIN_MAX", "5")),
            window_seconds=int(
                os.getenv("LOGIN_RATE_LIMIT_LOGIN_WINDOW_SECONDS", "900")
            ),
        )

    def check(self, request: Request, login: str) -> None:
        if self.redis is None:
            logger.warning(
                "Rate limit do login desativado: REDIS_URL nao configurada."
            )
            return

        client_ip = self._client_ip(request)
        login_digest = hashlib.sha256(login.strip().casefold().encode("utf-8")).hexdigest()
        keys = [
            f"login-rate-limit:ip:{client_ip}",
            f"login-rate-limit:login:{login_digest}",
        ]

        try:
            allowed, retry_after = self.redis.eval(
                _CHECK_LIMITS_SCRIPT,
                len(keys),
                *keys,
                self.ip_limit.maximum,
                self.ip_limit.window_seconds,
                self.login_limit.maximum,
                self.login_limit.window_seconds,
            )
        except RedisError:
            domain_metrics.auth_rate_limiter_fail_open()
            logger.exception(
                "Redis indisponivel; permitindo tentativa de login sem rate limit."
            )
            return

        if not allowed:
            domain_metrics.auth_rate_limited()
            retry_after = max(1, int(retry_after))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Muitas tentativas de login. Tente novamente mais tarde.",
                headers={"Retry-After": str(retry_after)},
            )

    @staticmethod
    def _client_ip(request: Request) -> str:
        peer = request.client.host if request.client else "unknown"
        try:
            peer_is_proxy = ipaddress.ip_address(peer).is_private or ipaddress.ip_address(
                peer
            ).is_loopback
        except ValueError:
            peer_is_proxy = False

        forwarded_for = request.headers.get("x-forwarded-for")
        if peer_is_proxy and forwarded_for:
            candidate = forwarded_for.split(",", 1)[0].strip()
            try:
                return str(ipaddress.ip_address(candidate))
            except ValueError:
                logger.warning("X-Forwarded-For invalido recebido do proxy.")
        return peer


login_rate_limiter = LoginRateLimiter()
