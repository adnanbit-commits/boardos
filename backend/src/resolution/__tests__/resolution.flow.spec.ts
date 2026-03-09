// src/resolution/__tests__/resolution.flow.spec.ts
//
// Integration tests for the complete resolution lifecycle:
//   Create → Propose → Open Voting → Vote → Auto-Finalize → Generate Certified Copy
//
// Depends on: Auth, Company, Meeting modules being functional.
// Run with: jest --testPathPattern=resolution.flow

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { MeetingStatus } from '@prisma/client';

describe('Resolution Lifecycle (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Shared state across tests
  let adminToken: string;
  let director1Token: string;
  let director2Token: string;
  let director1Id: string;
  let director2Id: string;
  let companyId: string;
  let meetingId: string;
  let agendaItemId: string;
  let resolutionId: string;
  let resolution2Id: string; // second resolution for bulk tests

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    prisma = module.get<PrismaService>(PrismaService);
    await prisma.cleanTestDb();
  });

  afterAll(() => app.close());

  // ── Setup: users, company, meeting ─────────────────────────────────────────

  it('registers admin + 2 directors', async () => {
    const [a, d1, d2] = await Promise.all([
      request(app.getHttpServer()).post('/auth/register')
        .send({ name: 'Admin', email: 'admin@acme.com', password: 'Password123' }),
      request(app.getHttpServer()).post('/auth/register')
        .send({ name: 'Director One', email: 'dir1@acme.com', password: 'Password123' }),
      request(app.getHttpServer()).post('/auth/register')
        .send({ name: 'Director Two', email: 'dir2@acme.com', password: 'Password123' }),
    ]);

    adminToken     = a.body.token;
    director1Token = d1.body.token;
    director2Token = d2.body.token;
    director1Id    = d1.body.user.id;
    director2Id    = d2.body.user.id;
  });

  it('creates company and adds directors', async () => {
    const co = await request(app.getHttpServer())
      .post('/companies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Test Corp' })
      .expect(201);

    companyId = co.body.id;

    // Add directors directly via Prisma for test speed
    await prisma.companyUser.createMany({
      data: [
        { companyId, userId: director1Id, role: 'DIRECTOR', acceptedAt: new Date() },
        { companyId, userId: director2Id, role: 'DIRECTOR', acceptedAt: new Date() },
      ],
    });
  });

  it('creates a meeting and advances it to VOTING status', async () => {
    const m = await request(app.getHttpServer())
      .post(`/companies/${companyId}/meetings`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Q1 Board Meeting',
        scheduledAt: new Date(Date.now() + 86400000).toISOString(),
      })
      .expect(201);

    meetingId = m.body.id;

    const agenda = await request(app.getHttpServer())
      .post(`/companies/${companyId}/meetings/${meetingId}/agenda`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Fundraising' })
      .expect(201);

    agendaItemId = agenda.body.id;

    // Drive meeting through state machine to VOTING
    for (const status of ['SCHEDULED', 'IN_PROGRESS', 'VOTING']) {
      await request(app.getHttpServer())
        .patch(`/companies/${companyId}/meetings/${meetingId}/status/${status}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);
    }
  });

  // ── 1. Create resolution ────────────────────────────────────────────────────

  it('creates a resolution under a meeting agenda item', async () => {
    const res = await request(app.getHttpServer())
      .post(`/companies/${companyId}/meetings/${meetingId}/resolutions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Approve Series A Investment',
        text: 'RESOLVED THAT the Board of Directors of Test Corp hereby approves the Series A investment round of ₹10 crore from XYZ Capital at a pre-money valuation of ₹50 crore.',
        agendaItemId,
      })
      .expect(201);

    expect(res.body.status).toBe('DRAFT');
    expect(res.body.agendaItemId).toBe(agendaItemId);
    resolutionId = res.body.id;
  });

  it('creates a second resolution for bulk voting tests', async () => {
    const res = await request(app.getHttpServer())
      .post(`/companies/${companyId}/meetings/${meetingId}/resolutions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Appoint Statutory Auditor',
        text: 'RESOLVED THAT M/s. Sharma & Associates, Chartered Accountants, be and are hereby appointed as the Statutory Auditors of Test Corp for the financial year 2025-26.',
      })
      .expect(201);

    resolution2Id = res.body.id;
  });

  // ── 2. Validation guards ────────────────────────────────────────────────────

  it('rejects resolution text shorter than 50 chars', async () => {
    await request(app.getHttpServer())
      .post(`/companies/${companyId}/meetings/${meetingId}/resolutions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Short', text: 'Too short' })
      .expect(400);
  });

  it('rejects assigning a resolution to an agenda item from another meeting', async () => {
    const otherMeeting = await prisma.meeting.create({
      data: {
        companyId,
        title: 'Other Meeting',
        scheduledAt: new Date(),
        status: 'DRAFT',
      },
    });
    const otherAgenda = await prisma.agendaItem.create({
      data: { meetingId: otherMeeting.id, title: 'Other Agenda' },
    });

    await request(app.getHttpServer())
      .post(`/companies/${companyId}/meetings/${meetingId}/resolutions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Cross-meeting agenda test',
        text: 'RESOLVED THAT this is a test resolution for cross-meeting agenda validation purposes only.',
        agendaItemId: otherAgenda.id, // Wrong meeting's agenda item
      })
      .expect(400);
  });

  // ── 3. Propose ──────────────────────────────────────────────────────────────

  it('director can propose a resolution (DRAFT → PROPOSED)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/companies/${companyId}/resolutions/${resolutionId}/propose`)
      .set('Authorization', `Bearer ${director1Token}`)
      .expect(200);

    expect(res.body.status).toBe('PROPOSED');
  });

  it('also proposes the second resolution', async () => {
    await request(app.getHttpServer())
      .patch(`/companies/${companyId}/resolutions/${resolution2Id}/propose`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
  });

  it('can still edit a PROPOSED resolution', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/companies/${companyId}/resolutions/${resolutionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Approve Series A Investment (Amended)' })
      .expect(200);

    expect(res.body.title).toBe('Approve Series A Investment (Amended)');
  });

  // ── 4. Withdraw ─────────────────────────────────────────────────────────────

  it('can withdraw a proposed resolution back to DRAFT', async () => {
    // Create a separate resolution to test withdraw without disrupting main flow
    const temp = await request(app.getHttpServer())
      .post(`/companies/${companyId}/meetings/${meetingId}/resolutions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({
        title: 'Temp Resolution',
        text: 'RESOLVED THAT this is a temporary resolution created solely for testing the withdraw flow.',
      });

    await request(app.getHttpServer())
      .patch(`/companies/${companyId}/resolutions/${temp.body.id}/propose`)
      .set('Authorization', `Bearer ${adminToken}`);

    const withdrawn = await request(app.getHttpServer())
      .patch(`/companies/${companyId}/resolutions/${temp.body.id}/withdraw`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(withdrawn.body.status).toBe('DRAFT');

    // Clean up
    await request(app.getHttpServer())
      .delete(`/companies/${companyId}/resolutions/${temp.body.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
  });

  // ── 5. Cannot open voting without meeting in VOTING status ──────────────────
  // (Already tested implicitly — meeting IS in VOTING, so this is a separate case)
  it('blocks opening voting if meeting is not in VOTING status', async () => {
    // Create resolution in a DRAFT meeting
    const draftMeeting = await prisma.meeting.create({
      data: { companyId, title: 'Draft Meeting', scheduledAt: new Date(), status: 'DRAFT' },
    });
    const draftRes = await prisma.resolution.create({
      data: {
        companyId,
        meetingId: draftMeeting.id,
        title: 'Draft Meeting Resolution',
        text: 'RESOLVED THAT this resolution tests the meeting status guard before opening voting.',
        status: 'PROPOSED',
      },
    });

    await request(app.getHttpServer())
      .patch(`/companies/${companyId}/resolutions/${draftRes.id}/open-voting`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  // ── 6. Bulk open voting ─────────────────────────────────────────────────────

  it('opens ALL proposed resolutions for voting in one call', async () => {
    const res = await request(app.getHttpServer())
      .post(`/companies/${companyId}/meetings/${meetingId}/resolutions/bulk-open-voting`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({}) // no resolutionIds = open all
      .expect(201);

    expect(res.body.opened).toBe(2);
    expect(res.body.resolutions).toHaveLength(2);
  });

  it('both resolutions are now in VOTING status', async () => {
    const res = await request(app.getHttpServer())
      .get(`/companies/${companyId}/meetings/${meetingId}/resolutions`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const votingResolutions = res.body.filter((r: any) => r.status === 'VOTING');
    expect(votingResolutions).toHaveLength(2);
  });

  // ── 7. Cannot edit once VOTING ──────────────────────────────────────────────

  it('blocks editing a resolution once voting is open', async () => {
    await request(app.getHttpServer())
      .patch(`/companies/${companyId}/resolutions/${resolutionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ title: 'Sneaky edit attempt' })
      .expect(400);
  });

  // ── 8. Directors vote ───────────────────────────────────────────────────────

  it('director 1 votes APPROVE', async () => {
    await request(app.getHttpServer())
      .post(`/companies/${companyId}/resolutions/${resolutionId}/votes`)
      .set('Authorization', `Bearer ${director1Token}`)
      .send({ value: 'APPROVE' })
      .expect(201);
  });

  it('director 2 votes APPROVE', async () => {
    await request(app.getHttpServer())
      .post(`/companies/${companyId}/resolutions/${resolutionId}/votes`)
      .set('Authorization', `Bearer ${director2Token}`)
      .send({ value: 'APPROVE' })
      .expect(201);
  });

  it('admin votes APPROVE — triggers auto-finalization', async () => {
    await request(app.getHttpServer())
      .post(`/companies/${companyId}/resolutions/${resolutionId}/votes`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'APPROVE' })
      .expect(201);
  });

  // ── 9. Resolution auto-finalizes to APPROVED ─────────────────────────────────

  it('resolution is automatically APPROVED once all directors vote', async () => {
    const res = await request(app.getHttpServer())
      .get(`/companies/${companyId}/resolutions/${resolutionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    expect(res.body.status).toBe('APPROVED');
    expect(res.body.tally.APPROVE).toBe(3);
    expect(res.body.tally.REJECT).toBe(0);
  });

  // ── 10. Tally is returned with director count ──────────────────────────────

  it('resolution detail includes directorCount for frontend progress display', async () => {
    const res = await request(app.getHttpServer())
      .get(`/companies/${companyId}/resolutions/${resolutionId}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.body.directorCount).toBe(3); // admin + 2 directors
    expect(res.body.tally).toEqual({ APPROVE: 3, REJECT: 0, ABSTAIN: 0 });
  });

  // ── 11. Approved resolution is immutable ───────────────────────────────────

  it('cannot delete an APPROVED resolution', async () => {
    await request(app.getHttpServer())
      .delete(`/companies/${companyId}/resolutions/${resolutionId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(400);
  });

  // ── 12. Tenant isolation ───────────────────────────────────────────────────

  it('cannot access resolutions from another company', async () => {
    const otherUser = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Outsider', email: 'outsider@other.com', password: 'Password123' });

    const otherCo = await request(app.getHttpServer())
      .post('/companies')
      .set('Authorization', `Bearer ${otherUser.body.token}`)
      .send({ name: 'Other Corp' });

    await request(app.getHttpServer())
      .get(`/companies/${otherCo.body.id}/resolutions/${resolutionId}`)
      .set('Authorization', `Bearer ${otherUser.body.token}`)
      .expect(404); // Not found (not 403 — don't leak that the ID exists)
  });

  // ── 13. Audit trail ────────────────────────────────────────────────────────

  it('audit log captures all resolution events', async () => {
    const res = await request(app.getHttpServer())
      .get(`/companies/${companyId}/audit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const actions = res.body.map((l: any) => l.action);
    expect(actions).toContain('RESOLUTION_CREATED');
    expect(actions).toContain('RESOLUTION_PROPOSED');
    expect(actions).toContain('RESOLUTIONS_BULK_VOTING_OPENED');
    expect(actions).toContain('VOTE_CAST');
    expect(actions).toContain('RESOLUTION_APPROVED');
  });
});
