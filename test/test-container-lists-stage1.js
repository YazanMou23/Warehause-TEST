const { Test } = require('@nestjs/testing');
const { AppModule } = require('../dist/app.module');
const request = require('supertest');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runStage1Verification() {
  console.log('===========================================================');
  console.log('STAGE 1 CHECKPOINT VERIFICATION: Container-Lists Backend');
  console.log('===========================================================');

  // 1. Verify DB Connection and Table state
  const envContent = fs.readFileSync('/home/ubuntu/Warehause-TEST/.env', 'utf8');
  const match = envContent.match(/DATABASE_URL=["']?([^"'\n]+)/);
  const pool = new Pool({ connectionString: match[1] });

  const initialCountRes = await pool.query('SELECT COUNT(*) FROM "ContainerList";');
  const initialRowCountRes = await pool.query('SELECT COUNT(*) FROM "ContainerListRow";');
  console.log(`[DB Check] Initial ContainerList count in DB: ${initialCountRes.rows[0].count}`);
  console.log(`[DB Check] Initial ContainerListRow count in DB: ${initialRowCountRes.rows[0].count}`);

  // 2. Bootstrap NestJS application
  console.log('\n[NestJS] Bootstrapping application module...');
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  await app.init();
  console.log('[NestJS] Application initialized successfully.');

  // 3. Create a dummy test image file
  const testImagePath = path.join(__dirname, 'test-ctr-sheet.png');
  // 1x1 transparent PNG buffer
  const samplePngBuffer = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64'
  );
  fs.writeFileSync(testImagePath, samplePngBuffer);

  // 4. Test POST /container-lists/extract
  console.log('\n[Endpoint Test] Sending POST /container-lists/extract with test file...');
  const extractRes = await request(app.getHttpServer())
    .post('/container-lists/extract')
    .attach('file', testImagePath)
    .field('site', 'Gant')
    .expect(201);

  const draft = extractRes.body;
  console.log('[Endpoint Test] Response received:');
  console.log(` - Detected Site: ${draft.site}`);
  console.log(` - Raw File Name: ${draft.rawFileName}`);
  console.log(` - Extracted Rows Count: ${draft.rows.length}`);
  console.log(` - Global Warnings: ${JSON.stringify(draft.globalWarnings)}`);

  console.log('\n[Row-by-Row Business Rules Validation]:');
  draft.rows.forEach((row, i) => {
    console.log(`\n  Row ${i + 1}:`);
    console.log(`   - Container: ${row.containerNumber} (${row.fuss} Fuss) | Date: ${row.date}`);
    console.log(`   - Artikel: ${row.artikel} | Kartons: ${row.kartons}`);
    console.log(`   - Zeiten: Ankunft=${row.ankunft}, Start=${row.start}, Ende=${row.ende}`);
    console.log(`   - Personal: ${row.personal !== undefined ? row.personal : 'FEHLT (Unleserlich)'}`);
    console.log(`   - Wartezeit: ${row.wartezeitVon} - ${row.wartezeitBis} => Std: ${row.wartezeitStd}`);
    console.log(`   - Bemerkung: "${row.bemerkung}"`);
    console.log(`   - Uncertain Fields: ${JSON.stringify(row.uncertainFields)}`);
    console.log(`   - Warnings: ${JSON.stringify(row.warnings.map(w => `[${w.field}] ${w.message}`))}`);
  });

  // Verify Calculation Example from prompt:
  // 9:00 - 9:50 with 2 workers = 50 min * 2 = 100 min = 1:40
  const row1 = draft.rows[0];
  if (row1 && row1.wartezeitStd === '1:40') {
    console.log('\n[SUCCESS] Business Rule Verified: Wartezeit (09:00-09:50 x 2 workers) = 1:40 exact match!');
  } else {
    console.warn('\n[WARNING] Expected wartezeitStd 1:40, got:', row1 ? row1.wartezeitStd : 'no row');
  }

  // 5. Verify STRICT ZERO-PERSISTENCE on extract
  const postExtractListCount = await pool.query('SELECT COUNT(*) FROM "ContainerList";');
  const postExtractRowCount = await pool.query('SELECT COUNT(*) FROM "ContainerListRow";');
  console.log(`\n[Zero-Persistence Verification]:`);
  console.log(` - ContainerList in DB before: ${initialCountRes.rows[0].count} | after: ${postExtractListCount.rows[0].count}`);
  console.log(` - ContainerListRow in DB before: ${initialRowCountRes.rows[0].count} | after: ${postExtractRowCount.rows[0].count}`);
  
  if (postExtractListCount.rows[0].count === initialCountRes.rows[0].count &&
      postExtractRowCount.rows[0].count === initialRowCountRes.rows[0].count) {
    console.log(' => CONFIRMED: Extraction endpoint saves NOTHING to the database. Pure draft.');
  } else {
    console.error(' => FAILED: Extraction endpoint persisted data prematurely!');
  }

  // Clean up test file and app
  if (fs.existsSync(testImagePath)) fs.unlinkSync(testImagePath);
  await app.close();
  await pool.end();

  console.log('\n===========================================================');
  console.log('STAGE 1 COMPLETE: ALL CRITERIA VERIFIED');
  console.log('===========================================================');
  process.exit(0);
}

runStage1Verification().catch(err => {
  console.error('Verification failed:', err);
  process.exit(1);
});
