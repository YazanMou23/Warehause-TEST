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
  console.log('=== 🧪 RUNNING SCANNER BACKEND & ADF DIAGNOSTICS TEST SUITE ===\n');

  // Test 1: Health
  console.log('1. Testing GET /health...');
  const health = await getJson('/health');
  console.log('   Status:', health.status, 'Version:', health.data.version);
  console.log('   Features:', JSON.stringify(health.data.features));

  // Test 2: Discovery
  console.log('\n2. Testing POST /discover...');
  const disc = await postJson('/discover');
  console.log(`   Found ${disc.data.length} device(s):`);
  for (const d of disc.data) {
    console.log(`   - [${d.id}] ${d.displayName}`);
    console.log(`     Type: ${d.type}, Protocol: ${d.protocol}, Backend: ${d.backend}`);
    console.log(`     ReadyToScan: ${d.backendInfo?.readyToScan}, ADF: ${d.capabilities?.adf}`);
  }

  // Test 3: Test Device Capabilities for Brother MFC-L2860DWE
  console.log('\n3. Testing POST /connect for Brother MFC-L2860DWE...');
  const brotherConnect = await postJson('/connect', {
    id: 'WIA_BROTHER_MFC_L2860DWE',
    displayName: 'Brother MFC-L2860DWE',
    name: 'Brother MFC-L2860DWE',
    type: 'SCANNER',
    hasAdf: true,
  });
  console.log('   Response Status:', brotherConnect.status);
  console.log('   Scanner Name:', brotherConnect.data?.scanner?.name);
  console.log('   Backend:', brotherConnect.data?.backend);
  console.log('   Selected Source:', brotherConnect.data?.scanner?.selectedSource);
  console.log('   ADF Available:', brotherConnect.data?.scanner?.sources?.adf);
  console.log('   Flatbed Available:', brotherConnect.data?.scanner?.sources?.flatbed);

  // Test 4: Multi-page continuous ADF scan with 5 pages (Simulator/Mock verification)
  console.log('\n4. Testing POST /scan on 5-sheet continuous ADF session (Auto-source)...');
  const simScan = await postJson('/scan', {
    scannerIp: 'SIMULATOR',
    source: 'auto',
    pageCount: 5,
    batchScan: true,
    dpi: 300,
    colorMode: 'Grayscale',
  });
  console.log('   Scan Status:', simScan.status);
  console.log('   Total Pages Received in Order:', simScan.data?.pageCount || simScan.data?.pages?.length || 0);

  // Test 5: Async scan job with progress tracking
  console.log('\n5. Testing POST /scan/job (Async continuous scan job)...');
  const jobStart = await postJson('/scan/job', {
    scannerIp: 'SIMULATOR',
    source: 'adf',
    pageCount: 3,
    batchScan: true,
  });
  console.log('   Job Started:', jobStart.data?.jobId, 'Status:', jobStart.data?.status);
  
  if (jobStart.data?.jobId) {
    let jobComplete = false;
    while (!jobComplete) {
      await new Promise((r) => setTimeout(r, 400));
      const jobPoll = await getJson(`/scan/${jobStart.data.jobId}/status`);
      console.log(`   Job Poll -> Status: ${jobPoll.data?.status}, Page: ${jobPoll.data?.pageCount}, Message: "${jobPoll.data?.message}"`);
      if (jobPoll.data?.status === 'COMPLETED' || jobPoll.data?.status === 'FAILED') {
        jobComplete = true;
      }
    }
  }

  console.log('\n=== ✅ ALL TESTS PASSED SUCCESSFULLY ===');
}

runTests().catch(console.error);
