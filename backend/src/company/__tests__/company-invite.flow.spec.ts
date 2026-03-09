// src/company/__tests__/company-invite.flow.spec.ts
//
// End-to-end integration test for the company workspace + invite flow.
// Uses a real test database (set DATABASE_URL in .env.test).
// Run with: jest --testPathPattern=company-invite

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';

describe('Company + Invite Flow (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  // Tokens set during test run
  let adminToken: string;
  let directorToken: string;
  let companyId: string;
  let inviteToken: string;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();

    prisma = module.get<PrismaService>(PrismaService);
    await prisma.cleanTestDb(); // Utility to wipe test data between runs
  });

  afterAll(async () => {
    await app.close();
  });

  // ── 1. Register admin ───────────────────────────────────────────────────────
  it('registers the company admin', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Ananya Sharma', email: 'ananya@acme.com', password: 'Password123' })
      .expect(201);

    expect(res.body.token).toBeDefined();
    adminToken = res.body.token;
  });

  // ── 2. Create company ───────────────────────────────────────────────────────
  it('creates a company workspace', async () => {
    const res = await request(app.getHttpServer())
      .post('/companies')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Acme Ventures Pvt. Ltd.', cin: 'U12345MH2020PTC123456' })
      .expect(201);

    expect(res.body.name).toBe('Acme Ventures Pvt. Ltd.');
    companyId = res.body.id;
  });

  // ── 3. Admin sees themselves as member + chairman ────────────────────────────
  it('admin is automatically ADMIN + chairman', async () => {
    const res = await request(app.getHttpServer())
      .get(`/companies/${companyId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const admin = res.body[0];
    expect(admin.role).toBe('ADMIN');
    expect(admin.isChairman).toBe(true);
    expect(admin.user.email).toBe('ananya@acme.com');
  });

  // ── 4. Invite a director ────────────────────────────────────────────────────
  it('admin sends an invite to a new director', async () => {
    const res = await request(app.getHttpServer())
      .post(`/companies/${companyId}/invitations`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ email: 'rohan@example.com', role: 'DIRECTOR' })
      .expect(201);

    // Response should NOT contain the token (security)
    expect(res.body.token).toBeUndefined();
    expect(res.body.email).toBe('rohan@example.com');
  });

  // ── 5. Director registers ───────────────────────────────────────────────────
  it('director registers an account', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Rohan Mehta', email: 'rohan@example.com', password: 'Password123' })
      .expect(201);

    directorToken = res.body.token;
  });

  // ── 6. Fetch invite token from DB (simulate clicking email link) ─────────────
  it('retrieves invite token from DB for test', async () => {
    const invite = await prisma.invitation.findFirst({
      where: { email: 'rohan@example.com', companyId },
    });
    expect(invite).toBeDefined();
    inviteToken = invite!.token;
  });

  // ── 7. Director accepts invite ──────────────────────────────────────────────
  it('director accepts the invite and joins the company', async () => {
    const res = await request(app.getHttpServer())
      .post(`/companies/invitations/${inviteToken}/accept`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(200);

    expect(res.body.role).toBe('DIRECTOR');
    expect(res.body.company.id).toBe(companyId);
  });

  // ── 8. Director is now visible in the member list ───────────────────────────
  it('director appears in the company member list', async () => {
    const res = await request(app.getHttpServer())
      .get(`/companies/${companyId}/members`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const emails = res.body.map((m: any) => m.user.email);
    expect(emails).toContain('rohan@example.com');
  });

  // ── 9. Admin promotes director to chairman ───────────────────────────────────
  it('admin can make the director the chairman', async () => {
    // Get director's userId
    const members = await request(app.getHttpServer())
      .get(`/companies/${companyId}/members`)
      .set('Authorization', `Bearer ${adminToken}`);

    const director = members.body.find((m: any) => m.user.email === 'rohan@example.com');

    const res = await request(app.getHttpServer())
      .patch(`/companies/${companyId}/members/${director.userId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ isChairman: true })
      .expect(200);

    const updated = res.body.find((m: any) => m.user.email === 'rohan@example.com');
    expect(updated.isChairman).toBe(true);

    // Previous chairman (admin) should no longer be chairman
    const adminMember = res.body.find((m: any) => m.user.email === 'ananya@acme.com');
    expect(adminMember.isChairman).toBe(false);
  });

  // ── 10. Director cannot access a different company ───────────────────────────
  it('director cannot access another company (tenant isolation)', async () => {
    // Create a second company as a different user
    const otherRes = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ name: 'Other User', email: 'other@beta.com', password: 'Password123' });

    const otherToken = otherRes.body.token;

    const otherCo = await request(app.getHttpServer())
      .post('/companies')
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ name: 'Beta Corp' });

    // Director from Acme should get 403 on Beta Corp
    await request(app.getHttpServer())
      .get(`/companies/${otherCo.body.id}/members`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(403);
  });

  // ── 11. Token re-use is blocked ──────────────────────────────────────────────
  it('the same invite token cannot be used twice', async () => {
    await request(app.getHttpServer())
      .post(`/companies/invitations/${inviteToken}/accept`)
      .set('Authorization', `Bearer ${directorToken}`)
      .expect(409); // ConflictException
  });

  // ── 12. Audit log records all key actions ────────────────────────────────────
  it('audit log captures all company actions', async () => {
    const res = await request(app.getHttpServer())
      .get(`/companies/${companyId}/audit`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);

    const actions = res.body.map((l: any) => l.action);
    expect(actions).toContain('COMPANY_CREATED');
    expect(actions).toContain('DIRECTOR_INVITED');
    expect(actions).toContain('INVITE_ACCEPTED');
    expect(actions).toContain('MEMBER_ROLE_UPDATED');
  });
});
