#!/usr/bin/env python
"""Get a real Supabase session access_token by actually signing in with
Google — no frontend needed, works against ANY deployment (prod, dev,
whatever SUPABASE_URL points at).

This talks to Supabase directly, not through the backend at all, so it
doesn't depend on ENV or on the backend being reachable — unlike the
backend's `/dev/google/*` shim (routers/dev_oauth.py), which exists only
to let Swagger's generic-OAuth2 Authorize button drive Supabase's Google
sign-in and is deliberately dead outside LOCAL/DEV. This script never
goes through the backend, so that restriction doesn't apply here.

How it works: spins up a one-shot local HTTP server, opens the browser
at Supabase's /authorize?provider=google&flow_type=pkce endpoint, and
waits for Supabase to redirect the browser back to
http://localhost:<port>/callback?code=... once Google sign-in finishes.
PKCE puts the code in the query string (not the URL fragment like the
older implicit flow), so a plain local server can read it directly —
no in-page JS needed to dig it out of location.hash.

One-time setup: add http://localhost:53682/callback to Supabase's
allowed Redirect URLs (Dashboard -> Authentication -> URL Configuration)
if it isn't there yet — Supabase refuses to redirect anywhere off that
list, PKCE or not.

Usage:
    python scripts/google_login.py
    python scripts/google_login.py --verify https://movie-log-backend.onrender.com
"""

import argparse
import base64
import hashlib
import http.server
import os
import secrets
import sys
import threading
import urllib.parse
import webbrowser

import requests

PORT = 53682
CALLBACK_PATH = '/callback'
_TIMEOUT_SECONDS = 180


def _load_env() -> dict:
    env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
    values: dict = {}
    if os.path.exists(env_path):
        with open(env_path, encoding='utf-8') as f:
            for line in f:
                line = line.strip()
                if not line or line.startswith('#') or '=' not in line:
                    continue
                k, _, v = line.partition('=')
                values[k.strip()] = v.strip()
    return values


def _pkce_pair() -> tuple[str, str]:
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(40)).rstrip(b'=').decode()
    challenge = base64.urlsafe_b64encode(hashlib.sha256(verifier.encode()).digest()).rstrip(b'=').decode()
    return verifier, challenge


def _await_callback_code(redirect_to: str) -> str:
    result: dict = {}
    done = threading.Event()

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_args) -> None:
            pass

        def do_GET(self) -> None:  # noqa: N802 (stdlib method name)
            parsed = urllib.parse.urlparse(self.path)
            if parsed.path != CALLBACK_PATH:
                self.send_response(404)
                self.end_headers()
                return
            qs = urllib.parse.parse_qs(parsed.query)
            code = qs.get('code', [None])[0]
            error = qs.get('error_description', [None])[0]
            self.send_response(200)
            self.send_header('Content-Type', 'text/html')
            self.end_headers()
            if code:
                self.wfile.write(b'<html><body>Signed in with Google. You can close this tab.</body></html>')
                result['code'] = code
            else:
                self.wfile.write(f'<html><body>Sign-in failed: {error}</body></html>'.encode())
                result['error'] = error or 'unknown error'
            done.set()

    server = http.server.HTTPServer(('localhost', PORT), Handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()

    if not done.wait(timeout=_TIMEOUT_SECONDS):
        server.shutdown()
        print('Timed out waiting for Google sign-in.', file=sys.stderr)
        sys.exit(1)
    server.shutdown()

    if 'error' in result:
        print(f"Sign-in failed: {result['error']}", file=sys.stderr)
        sys.exit(1)
    return result['code']


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        '--verify',
        metavar='BASE_URL',
        help='After getting a token, call GET {BASE_URL}/api/v1/auth/me with it '
        'and print the identity Supabase/the backend resolved — the quickest way '
        'to confirm a deployed backend (e.g. your Render prod URL) accepts a real '
        'Google-authenticated session.',
    )
    args = parser.parse_args()

    env = _load_env()
    supabase_url = os.environ.get('SUPABASE_URL') or env.get('SUPABASE_URL')
    apikey = os.environ.get('SUPABASE_PUBLISHABLE_KEY') or env.get('SUPABASE_PUBLISHABLE_KEY')
    if not supabase_url or not apikey:
        print('Set SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (or have them in backend/.env).', file=sys.stderr)
        sys.exit(1)

    verifier, challenge = _pkce_pair()
    redirect_to = f'http://localhost:{PORT}{CALLBACK_PATH}'
    params = {
        'provider': 'google',
        'redirect_to': redirect_to,
        'flow_type': 'pkce',
        'code_challenge': challenge,
        'code_challenge_method': 'S256',
    }
    authorize_url = f"{supabase_url.rstrip('/')}/auth/v1/authorize?{urllib.parse.urlencode(params)}"

    print(f'Opening browser for Google sign-in:\n{authorize_url}\n', file=sys.stderr)
    print(
        f'(First time only: add {redirect_to} to Supabase Dashboard -> '
        'Authentication -> URL Configuration -> Redirect URLs)\n',
        file=sys.stderr,
    )
    webbrowser.open(authorize_url)

    code = _await_callback_code(redirect_to)

    response = requests.post(
        f"{supabase_url.rstrip('/')}/auth/v1/token?grant_type=pkce",
        headers={'apikey': apikey, 'Content-Type': 'application/json'},
        json={'auth_code': code, 'code_verifier': verifier},
        timeout=15,
    )
    if response.status_code >= 400:
        print(f'Token exchange with Supabase failed: {response.text}', file=sys.stderr)
        sys.exit(1)

    session = response.json()
    access_token = session.get('access_token')
    if not access_token:
        print(f'Unexpected token response: {session}', file=sys.stderr)
        sys.exit(1)

    print(access_token)

    if args.verify:
        me_url = f"{args.verify.rstrip('/')}/api/v1/auth/me"
        me_response = requests.get(me_url, headers={'Authorization': f'Bearer {access_token}'}, timeout=15)
        print(f'\nGET {me_url} -> {me_response.status_code}', file=sys.stderr)
        print(me_response.text, file=sys.stderr)


if __name__ == '__main__':
    main()
