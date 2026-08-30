import { Controller, Get, Res } from '@nestjs/common';
import type { Response } from 'express';

@Controller()
export class AppController {
  @Get()
  root(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>LogiFlow API</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body {
      font-family: 'Segoe UI', system-ui, sans-serif;
      background: #0f1117;
      color: #e2e8f0;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 16px;
      padding: 40px 48px;
      max-width: 560px;
      width: 100%;
      text-align: center;
    }
    .badge {
      display: inline-block;
      background: #14532d;
      color: #4ade80;
      font-size: 12px;
      font-weight: 700;
      padding: 4px 12px;
      border-radius: 20px;
      margin-bottom: 20px;
      text-transform: uppercase;
      letter-spacing: 0.1em;
    }
    h1 {
      font-size: 32px;
      font-weight: 800;
      background: linear-gradient(135deg, #60a5fa, #a78bfa);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    .sub {
      color: #64748b;
      font-size: 14px;
      margin-bottom: 32px;
    }
    .routes {
      background: #0f1117;
      border: 1px solid #1e293b;
      border-radius: 10px;
      padding: 16px;
      text-align: left;
      margin-bottom: 24px;
    }
    .routes h3 {
      font-size: 11px;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.1em;
      margin-bottom: 12px;
    }
    .route {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 6px 0;
      border-bottom: 1px solid #1e293b;
      font-size: 13px;
    }
    .route:last-child { border-bottom: none; }
    .m { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 3px; min-width: 40px; text-align: center; }
    .post { background:#14532d; color:#4ade80; }
    .get  { background:#1e3a5f; color:#60a5fa; }
    .path { color: #cbd5e1; font-family: monospace; }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #3b82f6, #8b5cf6);
      color: white;
      text-decoration: none;
      padding: 12px 28px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      margin: 6px;
      transition: opacity 0.2s;
    }
    .btn:hover { opacity: 0.85; }
    .btn-outline {
      background: transparent;
      border: 1px solid #334155;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="badge">🟢 Online</div>
    <h1>LogiFlow API</h1>
    <p class="sub">Warehouse Management Backend · NestJS + PostgreSQL</p>

    <div class="routes">
      <h3>Available Endpoints</h3>
      <div class="route"><span class="m post">POST</span><span class="path">/auth/login</span></div>
      <div class="route"><span class="m get">GET</span><span class="path">/auth/profile</span></div>
      <div class="route"><span class="m get">GET</span><span class="path">/warehouses</span></div>
      <div class="route"><span class="m get">GET</span><span class="path">/halls</span></div>
      <div class="route"><span class="m get">GET</span><span class="path">/containers</span></div>
      <div class="route"><span class="m get">GET</span><span class="path">/users</span></div>
      <div class="route"><span class="m get">GET</span><span class="path">/attendance/daily</span></div>
      <div class="route"><span class="m post">POST</span><span class="path">/planning</span></div>
      <div class="route"><span class="m post">POST</span><span class="path">/employees/import-excel</span></div>
    </div>

    <a href="/api-test" class="btn">🚀 Open API Tester</a>
  </div>
</body>
</html>`);
  }

  @Get('api-test')
  apiTest(@Res() res: Response) {
    res.setHeader('Content-Type', 'text/html');
    res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>LogiFlow API Tester</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', system-ui, sans-serif; background: #0f1117; color: #e2e8f0; min-height: 100vh; padding: 24px; }
    h1 { text-align: center; font-size: 28px; font-weight: 700; background: linear-gradient(135deg, #60a5fa, #a78bfa); -webkit-background-clip: text; -webkit-text-fill-color: transparent; margin-bottom: 8px; }
    .subtitle { text-align: center; color: #64748b; font-size: 14px; margin-bottom: 32px; }
    .token-bar { background: #1e293b; border: 1px solid #334155; border-radius: 12px; padding: 16px 20px; margin-bottom: 24px; display: flex; align-items: center; gap: 12px; }
    .token-label { font-size: 12px; color: #64748b; white-space: nowrap; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; }
    #tokenDisplay { flex: 1; font-size: 12px; color: #34d399; word-break: break-all; font-family: monospace; }
    .no-token { color: #ef4444 !important; }
    .clear-btn { background: #374151; border: none; color: #9ca3af; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; white-space: nowrap; }
    .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(380px, 1fr)); gap: 20px; }
    .card { background: #1e293b; border: 1px solid #334155; border-radius: 12px; overflow: hidden; }
    .card-header { padding: 14px 20px; display: flex; align-items: center; gap: 10px; border-bottom: 1px solid #334155; }
    .method { font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 4px; text-transform: uppercase; letter-spacing: 0.05em; }
    .method-post { background: #14532d; color: #4ade80; }
    .method-get { background: #1e3a5f; color: #60a5fa; }
    .endpoint { font-family: monospace; font-size: 13px; color: #cbd5e1; }
    .card-body { padding: 16px 20px; }
    textarea { width: 100%; min-height: 90px; background: #0f1117; border: 1px solid #334155; border-radius: 8px; padding: 10px 12px; color: #e2e8f0; font-family: monospace; font-size: 12px; resize: vertical; outline: none; }
    textarea:focus { border-color: #60a5fa; }
    .btn { margin-top: 12px; width: 100%; padding: 10px; border: none; border-radius: 8px; font-size: 14px; font-weight: 600; cursor: pointer; transition: opacity 0.2s; }
    .btn:hover { opacity: 0.85; }
    .btn-primary { background: linear-gradient(135deg, #3b82f6, #8b5cf6); color: white; }
    .btn-success { background: linear-gradient(135deg, #059669, #10b981); color: white; }
    .response { margin-top: 12px; background: #0f1117; border: 1px solid #334155; border-radius: 8px; padding: 12px; font-family: monospace; font-size: 12px; max-height: 200px; overflow-y: auto; display: none; white-space: pre-wrap; }
    .response.show { display: block; }
    .response.ok { border-color: #059669; color: #6ee7b7; }
    .response.err { border-color: #dc2626; color: #fca5a5; }
    .desc { font-size: 12px; color: #64748b; margin-bottom: 10px; }
    .cred-list { background: #0f1117; border: 1px solid #1e3a5f; border-radius: 8px; padding: 14px; margin-bottom: 24px; }
    .cred-list h3 { font-size: 13px; color: #60a5fa; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; color: #64748b; font-weight: 600; padding-bottom: 6px; }
    td { padding: 4px 0; color: #cbd5e1; }
    code { background: #1e293b; padding: 2px 6px; border-radius: 4px; font-size: 12px; color: #f472b6; }
  </style>
</head>
<body>
<h1>🚀 LogiFlow API Tester</h1>
<p class="subtitle">Test your NestJS backend · http://localhost:3000</p>
<div class="cred-list">
  <h3>🔑 Login Credentials</h3>
  <table>
    <tr><th>Role</th><th>Phone</th><th>Password</th></tr>
    <tr><td>Admin</td><td><code>+491701111111</code></td><td><code>adminpassword</code></td></tr>
    <tr><td>Team Leader 1</td><td><code>+491702222222</code></td><td><code>leaderpassword</code></td></tr>
    <tr><td>Team Leader 2</td><td><code>+491703333333</code></td><td><code>leaderpassword</code></td></tr>
    <tr><td>Employee 1</td><td><code>+491704444444</code></td><td><code>employeepassword</code></td></tr>
  </table>
</div>
<div class="token-bar">
  <span class="token-label">JWT Token</span>
  <span id="tokenDisplay" class="no-token">⚠️ Not logged in — click Login first</span>
  <button class="clear-btn" onclick="clearToken()">Clear</button>
</div>
<div class="grid">
  <div class="card">
    <div class="card-header"><span class="method method-post">POST</span><span class="endpoint">/auth/login</span></div>
    <div class="card-body">
      <p class="desc">Login and get JWT token. Token saved automatically.</p>
      <textarea id="body-login">{"phone":"+491701111111","password":"adminpassword"}</textarea>
      <button class="btn btn-primary" onclick="callApi('POST','/auth/login','body-login','resp-login',true)">🔐 Login</button>
      <div class="response" id="resp-login"></div>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><span class="method method-get">GET</span><span class="endpoint">/auth/profile</span></div>
    <div class="card-body">
      <p class="desc">Get your own profile (requires login).</p>
      <button class="btn btn-success" onclick="callApi('GET','/auth/profile',null,'resp-profile',false)">👤 Get Profile</button>
      <div class="response" id="resp-profile"></div>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><span class="method method-get">GET</span><span class="endpoint">/warehouses</span></div>
    <div class="card-body">
      <p class="desc">List all 6 warehouses.</p>
      <button class="btn btn-success" onclick="callApi('GET','/warehouses',null,'resp-wh',false)">🏭 Get Warehouses</button>
      <div class="response" id="resp-wh"></div>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><span class="method method-get">GET</span><span class="endpoint">/halls</span></div>
    <div class="card-body">
      <p class="desc">List all 12 halls.</p>
      <button class="btn btn-success" onclick="callApi('GET','/halls',null,'resp-halls',false)">🏛️ Get Halls</button>
      <div class="response" id="resp-halls"></div>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><span class="method method-get">GET</span><span class="endpoint">/containers</span></div>
    <div class="card-body">
      <p class="desc">List all containers (full & empty).</p>
      <button class="btn btn-success" onclick="callApi('GET','/containers',null,'resp-ct',false)">📦 Get Containers</button>
      <div class="response" id="resp-ct"></div>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><span class="method method-get">GET</span><span class="endpoint">/users</span></div>
    <div class="card-body">
      <p class="desc">List all employees (Admin only).</p>
      <button class="btn btn-success" onclick="callApi('GET','/users',null,'resp-users',false)">👥 Get Users</button>
      <div class="response" id="resp-users"></div>
    </div>
  </div>
  <div class="card">
    <div class="card-header"><span class="method method-post">POST</span><span class="endpoint">/attendance/clock-in</span></div>
    <div class="card-body">
      <p class="desc">Clock in an employee. Get userId from /users first.</p>
      <textarea id="body-ci">{"userId":"PASTE_USER_ID_HERE"}</textarea>
      <button class="btn btn-primary" onclick="callApi('POST','/attendance/clock-in','body-ci','resp-ci',false)">⏰ Clock In</button>
      <div class="response" id="resp-ci"></div>
    </div>
  </div>
</div>
<script>
  let token = '';
  function clearToken() {
    token = '';
    const el = document.getElementById('tokenDisplay');
    el.textContent = '⚠️ Not logged in — click Login first';
    el.className = 'no-token';
  }
  async function callApi(method, path, bodyId, respId, saveToken) {
    const respEl = document.getElementById(respId);
    respEl.className = 'response show';
    respEl.textContent = '⏳ Loading...';
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = 'Bearer ' + token;
    let body;
    if (bodyId) {
      try { body = document.getElementById(bodyId).value; JSON.parse(body); }
      catch { respEl.className = 'response show err'; respEl.textContent = '❌ Invalid JSON'; return; }
    }
    try {
      const res = await fetch('http://localhost:3000' + path, { method, headers, body: body || undefined });
      const data = await res.json();
      respEl.textContent = 'HTTP ' + res.status + '\\n\\n' + JSON.stringify(data, null, 2);
      respEl.className = 'response show ' + (res.ok ? 'ok' : 'err');
      if (saveToken && data.accessToken) {
        token = data.accessToken;
        const el = document.getElementById('tokenDisplay');
        el.textContent = '✅ ' + token.substring(0, 60) + '...';
        el.className = '';
      }
    } catch(e) {
      respEl.className = 'response show err';
      respEl.textContent = '❌ Connection failed\\n' + e.message;
    }
  }
</script>
</body>
</html>`);
  }
}
