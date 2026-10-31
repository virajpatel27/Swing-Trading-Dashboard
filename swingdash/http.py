"""Polite HTTP: a browser-like User-Agent, a pause between calls to the same site, retries with exponential backoff.

NSE's www.nseindia.com/api/* needs the cookies the home page sets, so `warm_up` visits the home page once per session.
"""
from __future__ import annotations

import time
from urllib.parse import urlparse

import requests

BROWSER_UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) "
              "Chrome/130.0 Safari/537.36")
RETRY_STATUS = {429, 500, 502, 503, 504}


class PoliteSession:
    def __init__(self, min_gap: float = 0.5, retries: int = 4, backoff: float = 2.0, timeout: int = 30,
                 session=None, sleep=time.sleep, clock=time.monotonic):
        self.s = session or requests.Session()
        self.s.headers.update({"User-Agent": BROWSER_UA, "Accept": "*/*", "Accept-Language": "en-US,en;q=0.9"})
        self.min_gap, self.retries, self.backoff, self.timeout = min_gap, retries, backoff, timeout
        self.sleep, self.clock = sleep, clock
        self._last: dict[str, float] = {}
        self._warmed: set[str] = set()

    def _pace(self, host: str) -> None:
        last = self._last.get(host)
        if last is not None:
            wait = self.min_gap - (self.clock() - last)
            if wait > 0:
                self.sleep(wait)
        self._last[host] = self.clock()

    def warm_up(self, home: str) -> None:
        """Visit a site's home page once (sets the cookies its API wants). Failures are ignored."""
        if home in self._warmed:
            return
        self._warmed.add(home)
        try:
            self.request("GET", home, retries=1)
        except Exception:  # noqa: BLE001
            pass

    def request(self, method: str, url: str, retries: int | None = None, **kw):
        """The response (any status that is not worth retrying). Raises the last error after all retries."""
        host = urlparse(url).netloc
        kw.setdefault("timeout", self.timeout)
        tries = self.retries if retries is None else retries
        last_exc: Exception | None = None
        resp = None
        for attempt in range(tries):
            self._pace(host)
            try:
                resp = self.s.request(method, url, **kw)
            except requests.RequestException as exc:
                last_exc, resp = exc, None
            else:
                if resp.status_code not in RETRY_STATUS:
                    return resp
            if attempt < tries - 1:
                self.sleep(self.backoff * (2 ** attempt))
        if resp is not None:
            return resp
        raise last_exc or RuntimeError(f"no answer from {host}")

    def get(self, url: str, **kw):
        return self.request("GET", url, **kw)

    def post(self, url: str, **kw):
        return self.request("POST", url, **kw)
