const { Test } = require('@nestjs/testing');
const { AppModule } = require('../dist/app.module');
const request = require('supertest');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

async function runStage2Demo() {
  console.log('===========================================================');
  console.log('STAGE 2 CHECKPOINT: Review-and-Save Flow Demo');
  console.log('===========================================================');

  // 1. Initialize NestJS
  console.log('[1/5] Initializing application...');
  const moduleFixture = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();
  await app.init();
  const server = app.getHttpServer();

  // 2. Step 1: Upload & Extract Draft
  console.log('\n[2/5] Uploading CTR sheet to /container-lists/extract...');
  const testImagePath = path.join(__dirname, 'demo-sheet.png');
  fs.writeFileSync(testImagePath, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64'));

  const extractRes = await request(server)
    .post('/container-lists/extract')
    .attach('file', testImagePath)
    .field('site', 'Gant')
    .expect(201);

  const draft = extractRes.body;
  console.log(` -> Draft extracted successfully for site "${draft.site}". Rows: ${draft.rows.length}`);
  console.log(` -> Row 2 initial state: Personal=${draft.rows[1].personal ?? 'FEHLT (Missing)'}, WartezeitStd="${draft.rows[1].wartezeitStd}"`);
  console.log(` -> Row 2 warnings: ${JSON.stringify(draft.rows[1].warnings.map(w => w.message))}`);

  // 3. Step 2: User Reviews & Edits in UI
  console.log('\n[3/5] Simulating user review & edits in the UI...');
  const reviewedRows = draft.rows.map((r, idx) => {
    const copy = { ...r };
    if (idx === 1) {
      // User resolves missing worker count: sets personal to 2
      copy.personal = 2;
      // Wartezeit recalculates: 12:30 - 13:00 (30 min) * 2 = 60 min = 1:00
      copy.wartezeitStd = '1:00';
      copy.warnings = [];
      copy.uncertainFields = [];
      console.log('    ✓ Row 2 edited: Set Personal = 2, recalculated Wartezeit Std = 1:00');
    }
    if (idx === 2) {
      // User corrects handwriting typo: CMAU731?458 -> CMAU7315458
      copy.containerNumber = 'CMAU7315458';
      copy.warnings = [];
      copy.uncertainFields = [];
      console.log('    ✓ Row 3 edited: Corrected container number to "CMAU7315458"');
    }
    return copy;
  });

  // 4. Step 3: Save to Database
  console.log('\n[4/5] Saving confirmed list to /container-lists (POST)...');
  const jwt = require('jsonwebtoken');
  const token = jwt.sign(
    { sub: '891a81cb-93b7-4281-a1e8-19c046b07090', id: '891a81cb-93b7-4281-a1e8-19c046b07090', username: 'akdeniz_akif', role: 'ADMIN' },
    process.env.JWT_SECRET || 'super-secret-logiflow-jwt-key-2026'
  );

  const savePayload = {
    site: draft.site,
    title: `Gant Entladeliste KW 43 - 25.10.2026`,
    date: '2026-10-25T00:00:00.000Z',
    rawFileName: 'Gant_CTR_20261025.jpg',
    status: 'SAVED',
    notes: 'Erfolgreich von Vorlage erfasst und manuell geprüft.',
    rows: reviewedRows,
  };

  const saveRes = await request(server)
    .post('/container-lists')
    .set('Authorization', `Bearer ${token}`)
    .send(savePayload)
    .expect(201);

  const savedList = saveRes.body;
  console.log(` -> List saved to database with ID: ${savedList.id}`);
  console.log(` -> Total rows saved: ${savedList.rows.length}`);

  // 5. Step 4: Verify Retrieval from Saved Lists
  console.log('\n[5/5] Verifying retrieval via GET /container-lists and GET /container-lists/:id...');
  const listAllRes = await request(server)
    .get('/container-lists?site=Gant')
    .expect(200);

  console.log(` -> Total saved lists for site "Gant": ${listAllRes.body.meta.total}`);

  const getOneRes = await request(server)
    .get(`/container-lists/${savedList.id}`)
    .expect(200);

  const retrieved = getOneRes.body;
  console.log(` -> Retrieved List "${retrieved.title}":`);
  retrieved.rows.forEach((r, idx) => {
    console.log(`    Row ${idx + 1}: ${r.containerNumber} (${r.fuss} Fuß) | Artikel: ${r.artikel} | Kartons: ${r.kartons} | Personal: ${r.personal} | Wartezeit: ${r.wartezeitStd || '—'}`);
  });

  // Clean up
  if (fs.existsSync(testImagePath)) fs.unlinkSync(testImagePath);
  await app.close();

  console.log('\n===========================================================');
  console.log('STAGE 2 DEMO VERIFIED: Review-and-Save Flow Succeeded! ✅');
  console.log('===========================================================');
  process.exit(0);
}

runStage2Demo().catch((err) => {
  console.error('Stage 2 demo failed:', err);
  process.exit(1);
});
