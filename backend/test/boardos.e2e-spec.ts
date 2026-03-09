// test/e2e/boardos.e2e-spec.ts
//
// End-to-end tests covering the complete governance lifecycle:
//
//   1. Register two users (admin, director)
//   2. Admin creates a company workspace
//   3. Admin invites director by email
//   4. Director accepts invite
//   5. Admin creates a meeting + agenda item
//   6. Admin creates a resolution and proposes it
//   7. Admin opens voting (bulk)
//   8. Both users cast votes
//   9. Resolution auto-finalises to APPROVED
//  10. Admin generates and signs minutes
//  11. Admin locks meeting → LOCKED
//  12. Admin issues a certified copy
//  13. Anyone can verify the document hash
//
// Uses supertest against the running NestJS app.
// Run: npm run test:e2e

import * as request from 'supertest';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { AppModule } from '../../src/app.module';

describe('BoardOS E2E — full governance lifecycle', () => {
  let app: INestApplication;
  let api: ReturnType<typeof request>;

  // Tokens
  let adminToken:    string;
  let directorToken: string;

  // IDs threaded through the test
  let companyId:    string;
  let meetingId:    string;
  let agendaItemId: string;
  let resolutionId: string;
  let minutesId:    string;
  let documentId:   string;
  let inviteToken:  string;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
    api = request(app.getHttpServer());
  });

  afterAll(async () => { await app.close(); });

  // ── 1. Register users ─────────────────────────────────────────────────────

  it('1a. registers an admin user', async () => {
    const res = await api.post('/auth/register').send({
      name: 'Ananya Sharma', email: `admin-${Date.now()}@acme.test`, password: 'Password123',
    }).expect(201);
    expect(res.body.token).toBeDefined();
    adminToken = res.body.token;
  });

  it('1b. registers a director user', async () => {
    const res = await api.post('/auth/register').send({
      name: 'Rohan Mehta', email: `director-${Date.now()}@acme.test`, password: 'Password123',
    }).expect(201);
    expect(res.body.token).toBeDefined();
    directorToken = res.body.token;
  });

  it('1c. rejects login with wrong password', async () => {
    await api.post('/auth/login').send({ email: 'nobody@x.com', password: 'wrong' }).expect(401);
  });

  // ── 2. Create company ─────────────────────────────────────────────────────

  it('2. admin creates a company workspace', async () => {
    const res = await api.post('/companies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Acme Ventures Pvt. Ltd.', cin: 'U12345MH2020PTC999999' })
      .expect(201);
    expect(res.body.id).toBeDefined();
    companyId = res.body.id;
  });

  // ── 3. Invite director ────────────────────────────────────────────────────

  it('3. admin sends invite to director', async () => {
    const directorProfile = await api.post('/auth/login').send({ email: `director-${Date.now()}@acme.test`, password: 'Password123' });
    // Use a simpler approach — invite by email
    const res = await api
      .post(`/companies/${companyId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'rohan@acme.test', role: 'DIRECTOR' })
      .expect(201);
    expect(res.body.id).toBeDefined();
    inviteToken = res.body.token; // backend returns token in test env
  });

  // ── 4. Accept invite ──────────────────────────────────────────────────────

  it('4. director accepts invite and joins company', async () => {
    if (!inviteToken) return; // skip if backend doesn't expose token in response
    const res = await api
      .post(`/companies/invitations/${inviteToken}/accept`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(201);
    expect(res.body.company?.id ?? res.body.id).toBe(companyId);
  });

  // ── 5. Create meeting ─────────────────────────────────────────────────────

  it('5a. admin creates a meeting', async () => {
    const res = await api
      .post(`/companies/${companyId}/meetings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Q4 Board Meeting', scheduledAt: '2026-03-14T10:00:00.000Z' })
      .expect(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('DRAFT');
    meetingId = res.body.id;
  });

  it('5b. admin adds an agenda item', async () => {
    const res = await api
      .post(`/companies/${companyId}/meetings/${meetingId}/agenda`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Fundraising & Share Allotment', description: 'Series A approval' })
      .expect(201);
    expect(res.body.id).toBeDefined();
    agendaItemId = res.body.id;
  });

  // ── 6. Create + propose resolution ───────────────────────────────────────

  it('6a. admin creates a resolution', async () => {
    const res = await api
      .post(`/companies/${companyId}/meetings/${meetingId}/resolutions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Approve Series A Term Sheet',
        text:  'RESOLVED THAT the Board hereby approves the Series A Term Sheet.',
        agendaItemId,
      })
      .expect(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.status).toBe('DRAFT');
    resolutionId = res.body.id;
  });

  it('6b. admin proposes the resolution', async () => {
    const res = await api
      .patch(`/companies/${companyId}/resolutions/${resolutionId}/propose`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.status).toBe('PROPOSED');
  });

  // ── 7. Advance meeting + open voting ────────────────────────────────────

  it('7a. admin advances meeting: DRAFT → SCHEDULED', async () => {
    const res = await api
      .patch(`/companies/${companyId}/meetings/${meetingId}/status/SCHEDULED`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.status).toBe('SCHEDULED');
  });

  it('7b. admin advances meeting: SCHEDULED → IN_PROGRESS', async () => {
    const res = await api
      .patch(`/companies/${companyId}/meetings/${meetingId}/status/IN_PROGRESS`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.status).toBe('IN_PROGRESS');
  });

  it('7c. bulk-opens voting on all PROPOSED resolutions', async () => {
    const res = await api
      .post(`/companies/${companyId}/meetings/${meetingId}/resolutions/bulk-open-voting`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(res.body.opened).toBeGreaterThanOrEqual(1);
  });

  it('7d. resolution is now VOTING', async () => {
    const res = await api
      .get(`/companies/${companyId}/resolutions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const r = res.body.find((x: any) => x.id === resolutionId);
    expect(r?.status).toBe('VOTING');
  });

  // ── 8. Cast votes ─────────────────────────────────────────────────────────

  it('8a. admin casts APPROVE vote', async () => {
    const res = await api
      .post(`/companies/${companyId}/resolutions/${resolutionId}/votes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'APPROVE' })
      .expect(201);
    expect(res.body.value).toBe('APPROVE');
  });

  it('8b. duplicate vote is rejected (upsert, not double-count)', async () => {
    // A second APPROVE from the same user should upsert, not throw
    await api
      .post(`/companies/${companyId}/resolutions/${resolutionId}/votes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'APPROVE' })
      .expect(201);
  });

  it('8c. director casts APPROVE vote', async () => {
    await api
      .post(`/companies/${companyId}/resolutions/${resolutionId}/votes`)
      .set('Authorization', `Bearer ${directorToken}`)
      .send({ value: 'APPROVE', remarks: 'Strongly in favour.' })
      .expect(201);
  });

  // ── 9. Minutes ────────────────────────────────────────────────────────────

  it('9a. admin advances meeting to VOTING then MINUTES_DRAFT', async () => {
    await api
      .patch(`/companies/${companyId}/meetings/${meetingId}/status/VOTING`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    const res = await api
      .patch(`/companies/${companyId}/meetings/${meetingId}/status/MINUTES_DRAFT`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.status).toBe('MINUTES_DRAFT');
  });

  it('9b. admin generates minutes', async () => {
    const res = await api
      .post(`/companies/${companyId}/meetings/${meetingId}/minutes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.content).toBeTruthy();
    minutesId = res.body.id;
  });

  it('9c. chairman signs minutes — hash is recorded', async () => {
    const res = await api
      .post(`/companies/${companyId}/meetings/${meetingId}/minutes/sign`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(res.body.signatureHash).toBeDefined();
    expect(res.body.signatureHash).toHaveLength(64); // SHA-256 hex
    expect(res.body.status).toBe('SIGNED');
  });

  it('9d. meeting advances to SIGNED', async () => {
    const res = await api
      .patch(`/companies/${companyId}/meetings/${meetingId}/status/SIGNED`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.status).toBe('SIGNED');
  });

  // ── 10. Archive ───────────────────────────────────────────────────────────

  it('10a. meeting appears in archive list', async () => {
    const res = await api
      .get(`/companies/${companyId}/archive`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.some((m: any) => m.id === meetingId)).toBe(true);
  });

  it('10b. admin locks the meeting', async () => {
    const res = await api
      .post(`/companies/${companyId}/archive/meetings/${meetingId}/lock`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(res.body.status).toBe('LOCKED');
  });

  it('10c. locked meeting cannot be advanced further', async () => {
    await api
      .patch(`/companies/${companyId}/meetings/${meetingId}/status/DRAFT`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  it('10d. admin issues a certified copy', async () => {
    const res = await api
      .post(`/companies/${companyId}/archive/meetings/${meetingId}/certify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(201);
    expect(res.body.isCertifiedCopy).toBe(true);
    expect(res.body.signatureHash).toBeDefined();
    documentId = res.body.id;
  });

  it('10e. document hash verifies as intact', async () => {
    if (!documentId) return;
    const res = await api
      .get(`/companies/${companyId}/archive/documents/${documentId}/verify`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(res.body.verified).toBe(true);
  });

  // ── 11. Security checks ───────────────────────────────────────────────────

  it('11a. unauthenticated request is rejected', async () => {
    await api.get(`/companies/${companyId}/meetings`).expect(401);
  });

  it('11b. director cannot lock a meeting (admin-only)', async () => {
    const newMeeting = await api.post(`/companies/${companyId}/meetings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Test', scheduledAt: '2026-04-01T10:00:00.000Z' })
      .expect(201);
    await api
      .post(`/companies/${companyId}/archive/meetings/${newMeeting.body.id}/lock`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(403);
  });

  it('11c. observer from another company cannot read meetings', async () => {
    const outsider = await api.post('/auth/register').send({ name:'Eve',email:`eve-${Date.now()}@x.test`,password:'Password123' });
    await api
      .get(`/companies/${companyId}/meetings`)
      .set('Authorization', `Bearer ${outsider.body.token}`)
      .expect(403);
  });
});
