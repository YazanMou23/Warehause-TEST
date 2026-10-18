const fs = require('fs');
const path = require('path');

const prismaClientDir = path.join(__dirname, '..', 'node_modules', '.prisma', 'client');

// 1. Patch index.js, edge.js, index-browser.js
const jsFiles = ['index.js', 'edge.js', 'index-browser.js'];

for (const fileName of jsFiles) {
  const filePath = path.join(prismaClientDir, fileName);
  if (!fs.existsSync(filePath)) continue;

  let content = fs.readFileSync(filePath, 'utf8');

  // Patch PlanEmployeeScalarFieldEnum
  if (!content.includes("confirmationStatus: 'confirmationStatus'")) {
    content = content.replace(
      "exports.Prisma.PlanEmployeeScalarFieldEnum = {\n  planId: 'planId',\n  employeeId: 'employeeId',\n  startTime: 'startTime',\n  endTime: 'endTime'\n};",
      "exports.Prisma.PlanEmployeeScalarFieldEnum = {\n  planId: 'planId',\n  employeeId: 'employeeId',\n  startTime: 'startTime',\n  endTime: 'endTime',\n  confirmationStatus: 'confirmationStatus',\n  responseNote: 'responseNote',\n  respondedAt: 'respondedAt',\n  responseChannel: 'responseChannel'\n};"
    );
  }

  // Patch runtimeDataModel inside index.js / edge.js
  const oldPlanEmployeeModel = '\"PlanEmployee\":{\"fields\":[{\"name\":\"planId\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"plan\",\"kind\":\"object\",\"type\":\"Plan\",\"relationName\":\"PlanToPlanEmployee\"},{\"name\":\"employeeId\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"employee\",\"kind\":\"object\",\"type\":\"User\",\"relationName\":\"PlanEmployeeToUser\"},{\"name\":\"startTime\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"endTime\",\"kind\":\"scalar\",\"type\":\"DateTime\"}]';
  const newPlanEmployeeModel = '\"PlanEmployee\":{\"fields\":[{\"name\":\"planId\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"plan\",\"kind\":\"object\",\"type\":\"Plan\",\"relationName\":\"PlanToPlanEmployee\"},{\"name\":\"employeeId\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"employee\",\"kind\":\"object\",\"type\":\"User\",\"relationName\":\"PlanEmployeeToUser\"},{\"name\":\"startTime\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"endTime\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"confirmationStatus\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"responseNote\",\"kind\":\"scalar\",\"type\":\"String\"},{\"name\":\"respondedAt\",\"kind\":\"scalar\",\"type\":\"DateTime\"},{\"name\":\"responseChannel\",\"kind\":\"scalar\",\"type\":\"String\"}]';

  if (content.includes(oldPlanEmployeeModel)) {
    content = content.replace(oldPlanEmployeeModel, newPlanEmployeeModel);
  }

  // Patch inlineSchema
  const oldInline = 'model PlanEmployee {\\n  planId     String\\n  plan       Plan     @relation(fields: [planId], references: [id], onDelete: Cascade)\\n  employeeId String\\n  employee   User     @relation(fields: [employeeId], references: [id], onDelete: Cascade)\\n  startTime  DateTime @default(now())\\n  endTime    DateTime @default(now())\\n\\n  @@id([planId, employeeId])\\n  @@index([employeeId, startTime, endTime])\\n  @@index([planId])\\n}';
  const newInline = 'model PlanEmployee {\\n  planId             String\\n  plan               Plan      @relation(fields: [planId], references: [id], onDelete: Cascade)\\n  employeeId         String\\n  employee           User      @relation(fields: [employeeId], references: [id], onDelete: Cascade)\\n  startTime          DateTime  @default(now())\\n  endTime            DateTime  @default(now())\\n  confirmationStatus String    @default(\\\"PENDING\\\")\\n  responseNote       String?\\n  respondedAt        DateTime?\\n  responseChannel    String?\\n\\n  @@id([planId, employeeId])\\n  @@index([employeeId, startTime, endTime])\\n  @@index([planId])\\n  @@index([confirmationStatus])\\n}';

  if (content.includes(oldInline)) {
    content = content.replace(oldInline, newInline);
  }

  fs.writeFileSync(filePath, content, 'utf8');
  console.log(`Patched ${fileName}`);
}

// 2. Patch index.d.ts
const dtsPath = path.join(prismaClientDir, 'index.d.ts');
if (fs.existsSync(dtsPath)) {
  let dtsContent = fs.readFileSync(dtsPath, 'utf8');

  // Payload scalars
  if (!dtsContent.includes('confirmationStatus: string')) {
    dtsContent = dtsContent.replace(
      /export type \$PlanEmployeePayload<ExtArgs extends \$Extensions\.InternalArgs = \$Extensions\.DefaultArgs> = \{\n\s*name: "PlanEmployee"\n\s*objects: \{\n\s*plan: Prisma\.\$PlanPayload<ExtArgs>\n\s*employee: Prisma\.\$UserPayload<ExtArgs>\n\s*\}\n\s*scalars: \$Extensions\.GetPayloadResult<\{\n\s*planId: string\n\s*employeeId: string\n\s*startTime: Date\n\s*endTime: Date\n/,
      (match) => match + '    confirmationStatus: string\n    responseNote: string | null\n    respondedAt: Date | null\n    responseChannel: string | null\n'
    );

    // Add to PlanEmployeeScalarFieldEnum
    dtsContent = dtsContent.replace(
      /PlanEmployeeScalarFieldEnum: \{\n\s*planId: 'planId',\n\s*employeeId: 'employeeId',\n\s*startTime: 'startTime',\n\s*endTime: 'endTime'\n\s*\}/,
      "PlanEmployeeScalarFieldEnum: {\n    planId: 'planId',\n    employeeId: 'employeeId',\n    startTime: 'startTime',\n    endTime: 'endTime',\n    confirmationStatus: 'confirmationStatus',\n    responseNote: 'responseNote',\n    respondedAt: 'respondedAt',\n    responseChannel: 'responseChannel'\n  }"
    );
  }

  const extraInputFields = 
`    confirmationStatus?: string
    responseNote?: string | null
    respondedAt?: Date | string | null
    responseChannel?: string | null
`;

  // Update input types
  const typesToPatch = [
    'export type PlanEmployeeCreateInput = {',
    'export type PlanEmployeeUncheckedCreateInput = {',
    'export type PlanEmployeeUpdateInput = {',
    'export type PlanEmployeeUncheckedUpdateInput = {',
    'export type PlanEmployeeCreateManyInput = {',
    'export type PlanEmployeeUpdateManyMutationInput = {',
    'export type PlanEmployeeUncheckedUpdateManyInput = {'
  ];

  for (const t of typesToPatch) {
    if (dtsContent.includes(t) && !dtsContent.includes(t + '\n' + extraInputFields)) {
      dtsContent = dtsContent.replace(t, t + '\n' + extraInputFields);
    }
  }

  fs.writeFileSync(dtsPath, dtsContent, 'utf8');
  console.log('Patched index.d.ts with PlanEmployee input types');
}
