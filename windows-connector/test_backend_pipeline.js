const http = require('http');

function postJson(urlPath, data) {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify(data || {});
    const req = http.request({
      hostname: '127.0.0.1',
      port: 48281,
      path: urlPath,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
      },
    }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

function getJson(urlPath) {
  return new Promise((resolve, reject) => {
    const req = http.get({
      hostname: '127.0.0.1',
      port: 48281,
      path: urlPath,
    }, (res) => {
      let body = '';
      res.on('data', (d) => body += d);
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch {
          resolve({ status: res.statusCode, raw: body });
        }
      });
    });
    req.on('error', reject);
  });
}

async function runTests() {
  console.log('=== 🧪 RUNNING SCANNER BACKEND & DIAGNOSTICS TEST SUITE ===\n');

  // Test 1: Health
  console.log('1. Testing GET /health...');
  const health = await getJson('/health');
  console.log('   Status:', health.status, 'Version:', health.data.version);

  // Test 2: Discovery
  console.log('\n2. Testing POST /discover...');
  const disc = await postJson('/discover');
  console.log(`   Found ${disc.data.length} device(s):`);
  for (const d of disc.data) {
    console.log(`   - [${d.id}] ${d.displayName}`);
    console.log(`     Type: ${d.type}, Protocol: ${d.protocol}, Backend: ${d.backend}`);
    console.log(`     ReadyToScan: ${d.backendInfo?.readyToScan}, ADF: ${d.capabilities?.adf}`);
    console.log(`     Diagnostics:`, JSON.stringify(d.diagnostics));
  }

  // Test 3: Connect to Physical Canon
  console.log('\n3. Testing POST /connect for physical Canon device (192.168.178.40)...');
  const canonConnect = await postJson('/connect', { ip: '192.168.178.40', id: 'NET_CANON_192_168_178_40' });
  console.log('   Response Status:', canonConnect.status);
  console.log('   Device Status:', canonConnect.data?.status);
  console.log('   Backend:', canonConnect.data?.backend);
  console.log('   ReadyToScan:', canonConnect.data?.backendInfo?.readyToScan);
  console.log('   ADF Capable:', canonConnect.data?.capabilities?.adf);
  console.log('   Diagnostic remedy:', canonConnect.data?.diagnostics?.remedy);

  // Test 4: Attempting Scan on Unconfigured Device (should fail with clear diagnostic)
  console.log('\n4. Testing POST /scan on unconfigured physical device (192.168.178.40)...');
  const canonScan = await postJson('/scan', { scannerIp: '192.168.178.40', source: 'adf', batchScan: true });
  console.log('   Scan Response Status:', canonScan.status);
  console.log('   Scan Error (Diagnostic message):', canonScan.data?.error || canonScan.raw);

  // Test 5: Scan with Simulator (Multi-page continuous ADF)
  console.log('\n5. Testing POST /scan on Simulator with 3-page continuous ADF...');
  const simScan = await postJson('/scan', { scannerIp: 'SIMULATOR', source: 'adf', pageCount: 3, batchScan: true });
  console.log('   Simulator Scan Status:', simScan.status);
  console.log('   Pages received:', simScan.data?.pages?.length || 0);

  console.log('\n=== ✅ ALL TESTS COMPLETED ===');
}

runTests().catch(console.error);
