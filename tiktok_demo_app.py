#!/usr/bin/env python3
import os, secrets, math, json, urllib.parse
import requests
from flask import Flask, redirect, request, session, render_template_string, url_for, flash
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "tiktok_demo.env"))

app = Flask(__name__)
app.secret_key = secrets.token_hex(16)

CLIENT_KEY    = os.getenv("TIKTOK_CLIENT_KEY")
CLIENT_SECRET = os.getenv("TIKTOK_CLIENT_SECRET")
REDIRECT_URI  = "https://photographic-adjustments-tagged-calculate.trycloudflare.com/callback"
SCOPE         = "video.publish,user.info.basic"

AUTH_URL   = "https://www.tiktok.com/v2/auth/authorize/"
TOKEN_URL  = "https://open.tiktokapis.com/v2/oauth/token/"
INIT_URL   = "https://open.tiktokapis.com/v2/post/publish/video/init/"
STATUS_URL = "https://open.tiktokapis.com/v2/post/publish/status/fetch/"

TEMPLATE = """<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>TikTok OAuth Demo</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #010101; color: #fff;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      min-height: 100vh; display: flex; flex-direction: column;
      align-items: center; padding: 48px 16px;
    }
    .wordmark { font-size: 2rem; font-weight: 800; letter-spacing: -1px; margin-bottom: 6px; }
    .wordmark em { color: #fe2c55; font-style: normal; }
    .badge {
      font-size: .7rem; background: #111; border: 1px solid #2a2a2a;
      color: #666; border-radius: 99px; padding: 2px 12px; margin-bottom: 48px;
    }
    .card {
      background: #111; border: 1px solid #1e1e1e; border-radius: 16px;
      padding: 40px; width: 100%; max-width: 460px;
    }
    h2 { font-size: 1.3rem; margin-bottom: 6px; }
    .sub { color: #666; font-size: .875rem; margin-bottom: 28px; line-height: 1.5; }
    .btn {
      display: block; width: 100%; padding: 13px; border-radius: 8px;
      border: none; font-size: .95rem; font-weight: 600; cursor: pointer;
      text-align: center; text-decoration: none; transition: opacity .15s;
    }
    .btn + .btn { margin-top: 10px; }
    .btn:hover { opacity: .8; }
    .btn-red  { background: #fe2c55; color: #fff; }
    .btn-teal { background: #25f4ee; color: #000; }
    .btn-ghost { background: #1a1a1a; color: #ccc; border: 1px solid #2a2a2a; }
    label {
      display: block; color: #888; font-size: .75rem; margin-bottom: 5px;
      letter-spacing: .05em; text-transform: uppercase;
    }
    input[type=text], input[type=file] {
      width: 100%; background: #0a0a0a; border: 1px solid #222; border-radius: 8px;
      color: #fff; padding: 11px 13px; font-size: .9rem; margin-bottom: 18px; outline: none;
      font-family: inherit;
    }
    input[type=text]:focus { border-color: #fe2c55; }
    .flash {
      border-radius: 8px; padding: 11px 14px; margin-bottom: 20px;
      font-size: .875rem; width: 100%; max-width: 460px;
    }
    .flash-error   { background: #1a0508; border: 1px solid #4a1525; color: #f87171; }
    .flash-success { background: #041a0f; border: 1px solid #14532d; color: #4ade80; }
    hr { border: none; border-top: 1px solid #1e1e1e; margin: 24px 0; }
    .kv { display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 10px; font-size: .875rem; }
    .kv span { color: #666; flex-shrink: 0; margin-right: 12px; }
    .kv code { color: #25f4ee; font-family: monospace; font-size: .78rem; word-break: break-all; }
    .box {
      background: #0a0a0a; border: 1px solid #1e1e1e; border-radius: 8px;
      padding: 14px; font-family: 'Courier New', monospace; font-size: .75rem; color: #4ade80;
      white-space: pre-wrap; word-break: break-all; max-height: 240px; overflow-y: auto;
      margin-bottom: 20px;
    }
    .step { color: #888; font-size: .8rem; margin-bottom: 16px; }
    .step strong { color: #fe2c55; }
  </style>
</head>
<body>
  <div class="wordmark">Tik<em>Tok</em></div>
  <div class="badge">Sandbox OAuth Demo</div>

  {% for cat, msg in messages %}
  <div class="flash flash-{{ cat }}">{{ msg }}</div>
  {% endfor %}

  {# ── INDEX ── #}
  {% if page == 'index' %}
  <div class="card">
    {% if token %}
    <h2>Connected ✓</h2>
    <p class="sub">Sandbox account authorized. Ready to post.</p>
    <div class="kv"><span>Access Token</span><code>{{ token[:40] }}…</code></div>
    <div class="kv"><span>Open ID</span><code>{{ open_id or '—' }}</code></div>
    <div class="kv"><span>Scopes</span><code>{{ granted_scope or '—' }}</code></div>
    <hr>
    <a href="/upload" class="btn btn-teal">Upload a Video →</a>
    <a href="/logout" class="btn btn-ghost">Disconnect</a>
    {% else %}
    <h2>OAuth + Video Upload</h2>
    <p class="sub">Connect your TikTok sandbox account to test the Content Posting API end-to-end.</p>
    <div class="step">Scope: <strong>{{ scope }}</strong></div>
    <a href="/login" class="btn btn-red">Connect with TikTok</a>
    {% endif %}
  </div>

  {# ── UPLOAD ── #}
  {% elif page == 'upload' %}
  <div class="card">
    <h2>Upload Video</h2>
    <p class="sub">Posts as <strong>Self Only</strong> in sandbox — not publicly visible.</p>
    {% if result %}
    <div class="box">{{ result }}</div>
    {% endif %}
    <form method="POST" enctype="multipart/form-data">
      <label>Title</label>
      <input type="text" name="title" placeholder="My sandbox test" maxlength="150" required>
      <label>Video file (mp4)</label>
      <input type="file" name="video" accept="video/*" required>
      <button type="submit" class="btn btn-red">Upload →</button>
    </form>
    <a href="/" class="btn btn-ghost" style="margin-top:10px;">← Back</a>
  </div>
  {% endif %}

</body>
</html>"""


def render(page, **ctx):
    ctx["page"] = page
    ctx.setdefault("token", session.get("access_token"))
    ctx.setdefault("open_id", session.get("open_id"))
    ctx.setdefault("granted_scope", session.get("scope"))
    ctx["messages"] = flash.__func__.__globals__["get_flashed_messages"](with_categories=True) \
        if hasattr(flash, "__func__") else []
    from flask import get_flashed_messages
    ctx["messages"] = get_flashed_messages(with_categories=True)
    ctx["scope"] = SCOPE
    return render_template_string(TEMPLATE, **ctx)


@app.route("/")
def index():
    return render("index")


@app.route("/login")
def login():
    state = secrets.token_urlsafe(16)
    session["oauth_state"] = state
    params = {
        "client_key": CLIENT_KEY,
        "scope": SCOPE,
        "response_type": "code",
        "redirect_uri": REDIRECT_URI,
        "state": state,
    }
    return redirect(AUTH_URL + "?" + urllib.parse.urlencode(params))


@app.route("/callback")
def callback():
    error = request.args.get("error")
    if error:
        flash(request.args.get("error_description", error), "error")
        return redirect(url_for("index"))

    if request.args.get("state") != session.pop("oauth_state", None):
        flash("State mismatch — possible CSRF.", "error")
        return redirect(url_for("index"))

    resp = requests.post(
        TOKEN_URL,
        data={
            "client_key": CLIENT_KEY,
            "client_secret": CLIENT_SECRET,
            "code": request.args.get("code"),
            "grant_type": "authorization_code",
            "redirect_uri": REDIRECT_URI,
        },
        headers={"Content-Type": "application/x-www-form-urlencoded"},
    )
    data = resp.json()
    with open("tiktok_token_debug.json", "w") as f:
        json.dump({"token_response": data, "http_status": resp.status_code}, f, indent=2)

    if "access_token" not in data:
        flash(f"Token exchange failed: {json.dumps(data)}", "error")
        return redirect(url_for("index"))

    granted = data.get("scope", "")
    session["access_token"] = data["access_token"]
    session["open_id"] = data.get("open_id", "")
    session["scope"] = granted
    flash(f"Connected! Granted scopes: {granted or 'NONE'}", "success")
    return redirect(url_for("index"))


@app.route("/upload", methods=["GET", "POST"])
def upload():
    if not session.get("access_token"):
        return redirect(url_for("login"))

    granted = session.get("scope", "")
    if "video.publish" not in granted:
        flash(f"Token missing video.publish scope. Disconnect and re-authorize. Granted: '{granted}'", "error")
        return render("upload")

    result = None
    if request.method == "POST":
        title = request.form.get("title", "Sandbox video")
        video = request.files.get("video")
        if not video:
            flash("No file selected.", "error")
            return render("upload")

        video_bytes = video.read()
        size = len(video_bytes)

        MIN_CHUNK = 5 * 1024 * 1024   # 5 MB
        MAX_CHUNK = 64 * 1024 * 1024  # 64 MB
        chunk_size = size if size < MIN_CHUNK else min(MAX_CHUNK, max(MIN_CHUNK, size))
        total_chunks = max(1, math.ceil(size / chunk_size))

        auth_headers = {
            "Authorization": f"Bearer {session['access_token']}",
            "Content-Type": "application/json; charset=UTF-8",
        }

        # Step 1 — init
        init_resp = requests.post(INIT_URL, json={
            "post_info": {
                "title": title,
                "privacy_level": "SELF_ONLY",
                "disable_duet": False,
                "disable_comment": False,
                "disable_stitch": False,
                "video_cover_timestamp_ms": 1000,
            },
            "source_info": {
                "source": "FILE_UPLOAD",
                "video_size": size,
                "chunk_size": chunk_size,
                "total_chunk_count": total_chunks,
            },
        }, headers=auth_headers)

        lines = [
            f"── STEP 1: Init upload ──",
            f"POST {INIT_URL}",
            f"HTTP {init_resp.status_code}",
            json.dumps(init_resp.json(), indent=2),
        ]

        init_data = init_resp.json().get("data", {})
        if init_resp.status_code == 200 and init_data.get("upload_url"):
            upload_url = init_data["upload_url"]
            publish_id = init_data["publish_id"]

            # Step 2 — PUT chunks
            lines.append(f"\n── STEP 2: Upload {total_chunks} chunk(s) ({size:,} bytes) ──")
            for i in range(total_chunks):
                start = i * chunk_size
                end = min(start + chunk_size, size)
                chunk = video_bytes[start:end]
                put_resp = requests.put(upload_url, data=chunk, headers={
                    "Content-Type": "video/mp4",
                    "Content-Range": f"bytes {start}-{end - 1}/{size}",
                })
                lines.append(f"Chunk {i+1}/{total_chunks} bytes {start}-{end-1} → HTTP {put_resp.status_code}")

            # Step 3 — status
            status_resp = requests.post(STATUS_URL,
                json={"publish_id": publish_id}, headers=auth_headers)
            lines += [
                f"\n── STEP 3: Status check ──",
                f"POST {STATUS_URL}",
                f"HTTP {status_resp.status_code}",
                json.dumps(status_resp.json(), indent=2),
            ]
            flash("Upload flow complete — check the box below.", "success")
        else:
            flash("Init failed — check response below.", "error")

        result = "\n".join(lines)

    return render("upload", result=result)


@app.route("/logout")
def logout():
    session.clear()
    flash("Disconnected.", "success")
    return redirect(url_for("index"))


if __name__ == "__main__":
    print()
    print("  TikTok OAuth Demo")
    print(f"  http://localhost:8080")
    print(f"  Redirect URI (register in TikTok dev portal): {REDIRECT_URI}")
    print()
    app.run(host="0.0.0.0", port=8080, debug=True)
