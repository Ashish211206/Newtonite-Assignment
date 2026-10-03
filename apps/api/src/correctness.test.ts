import { beforeAll, describe, expect, it } from "vitest";
import request from "supertest";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { createApp } from "./src/app";
import { processEvent } from "./src/workers/outboxWorker";

const prisma = new PrismaClient();
const app = createApp();

async function login(email: string, password = "Password123!") {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  expect(res.status).toBe(200);
  return res.body.data.token as string;
}

describe("OpsFlow correctness", () => {
  let adminToken: string;
  let priyaToken: string;
  let isolatedToken: string;
  let engineeringItemId: string;
  let unassignedId: string;
  let restrictedId: string;
  let waitingId: string;

  beforeAll(async () => {
    await prisma.$connect();
    const hash = await bcrypt.hash("Password123!", 8);

    await prisma.notification.deleteMany();
    await prisma.outboxEvent.deleteMany();
    await prisma.idempotencyRecord.deleteMany();
    await prisma.auditLog.deleteMany();
    await prisma.comment.deleteMany();
    await prisma.workItem.deleteMany();
    await prisma.teamMembership.deleteMany();
    await prisma.team.deleteMany();
    await prisma.user.deleteMany();

    const admin = await prisma.user.create({
      data: {
        name: "Ashish Kumar",
        email: "admin@opsflow.local",
        passwordHash: hash,
        globalRole: "ADMIN",
      },
    });
    const priya = await prisma.user.create({
      data: { name: "Priya Nair", email: "priya@opsflow.local", passwordHash: hash },
    });
    const isolated = await prisma.user.create({
      data: { name: "Dev Isolated", email: "isolated@opsflow.local", passwordHash: hash },
    });
    const rahul = await prisma.user.create({
      data: { name: "Rahul Mehta", email: "rahul@opsflow.local", passwordHash: hash },
    });

    const eng = await prisma.team.create({ data: { name: "Engineering" } });
    const secret = await prisma.team.create({ data: { name: "Secret Cell" } });

    await prisma.teamMembership.createMany({
      data: [
        { userId: admin.id, teamId: eng.id, role: "ADMIN" },
        { userId: rahul.id, teamId: eng.id, role: "TEAM_LEAD" },
        { userId: priya.id, teamId: eng.id, role: "MEMBER" },
        { userId: isolated.id, teamId: secret.id, role: "MEMBER" },
      ],
    });

    const shared = await prisma.workItem.create({
      data: {
        title: "Shared concurrent item",
        description: "Used for OCC tests",
        teamId: eng.id,
        reporterId: rahul.id,
        assigneeId: priya.id,
        status: "IN_PROGRESS",
        priority: "MEDIUM",
        type: "ENGINEERING",
        version: 7,
      },
    });
    engineeringItemId = shared.id;

    const open = await prisma.workItem.create({
      data: {
        title: "Unassigned claim race",
        teamId: eng.id,
        reporterId: rahul.id,
        assigneeId: null,
        status: "OPEN",
        version: 1,
      },
    });
    unassignedId = open.id;

    const waiting = await prisma.workItem.create({
      data: {
        title: "Needs approval",
        teamId: eng.id,
        reporterId: priya.id,
        assigneeId: priya.id,
        status: "OPEN",
        version: 1,
      },
    });
    waitingId = waiting.id;

    const hidden = await prisma.workItem.create({
      data: {
        title: "Restricted investigation",
        teamId: secret.id,
        reporterId: isolated.id,
        assigneeId: isolated.id,
        status: "OPEN",
      },
    });
    restrictedId = hidden.id;

    adminToken = await login("admin@opsflow.local");
    priyaToken = await login("priya@opsflow.local");
    isolatedToken = await login("isolated@opsflow.local");
  });

  it("authenticates valid credentials, sets auth cookie, and retrieves current user session", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@opsflow.local", password: "Password123!" });
    expect(res.status).toBe(200);
    expect(res.body.data.user.email).toBe("admin@opsflow.local");
    expect(res.body.data.token).toBeDefined();
    const cookies = res.get("Set-Cookie");
    expect(cookies).toBeDefined();
    expect(cookies[0]).toMatch(/opsflow_token=/);

    const meRes = await request(app)
      .get("/api/auth/me")
      .set("Cookie", cookies);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe("admin@opsflow.local");
  });

  it("rejects login with incorrect password", async () => {
    const res = await request(app)
      .post("/api/auth/login")
      .send({ email: "admin@opsflow.local", password: "WrongPassword!" });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("rejects a stale concurrent update with VERSION_CONFLICT", async () => {
    const [a, b] = await Promise.all([
      request(app)
        .patch(`/api/work-items/${engineeringItemId}`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({ expectedVersion: 7, title: "Updated by A" }),
      request(app)
        .patch(`/api/work-items/${engineeringItemId}`)
        .set("Authorization", `Bearer ${priyaToken}`)
        .send({ expectedVersion: 7, title: "Updated by B" }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const conflict = a.status === 409 ? a : b;
    expect(conflict.body.error.code).toBe("VERSION_CONFLICT");
  });

  it("returns the original result for a duplicate idempotency key", async () => {
    const item = await prisma.workItem.create({
      data: {
        title: "Idempotent assign",
        teamId: (await prisma.team.findFirst({ where: { name: "Engineering" } }))!.id,
        reporterId: (await prisma.user.findUnique({ where: { email: "rahul@opsflow.local" } }))!.id,
        status: "OPEN",
        version: 1,
      },
    });
    const priya = await prisma.user.findUnique({ where: { email: "priya@opsflow.local" } });
    const body = { expectedVersion: 1, assigneeId: priya!.id };
    const key = "idem-assign-1";
    const first = await request(app)
      .post(`/api/work-items/${item.id}/assign`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", key)
      .send(body);
    const second = await request(app)
      .post(`/api/work-items/${item.id}/assign`)
      .set("Authorization", `Bearer ${adminToken}`)
      .set("Idempotency-Key", key)
      .send(body);
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.data.version).toBe(first.body.data.version);
    const audits = await prisma.auditLog.count({ where: { workItemId: item.id, action: "ASSIGNED" } });
    expect(audits).toBe(1);
  });

  it("forbids a member from accessing another team's work item", async () => {
    const res = await request(app)
      .get(`/api/work-items/${restrictedId}`)
      .set("Authorization", `Bearer ${priyaToken}`);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("FORBIDDEN");

    const ok = await request(app)
      .get(`/api/work-items/${restrictedId}`)
      .set("Authorization", `Bearer ${isolatedToken}`);
    expect(ok.status).toBe(200);
  });

  it("rejects an invalid workflow transition", async () => {
    const res = await request(app)
      .post(`/api/work-items/${waitingId}/status`)
      .set("Authorization", `Bearer ${priyaToken}`)
      .send({ expectedVersion: 1, status: "CLOSED" });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_WORKFLOW");
  });

  it("allows only one concurrent self-assignment to succeed", async () => {
    const [a, b] = await Promise.all([
      request(app)
        .post(`/api/work-items/${unassignedId}/assign`)
        .set("Authorization", `Bearer ${adminToken}`)
        .send({
          expectedVersion: 1,
          assigneeId: (await prisma.user.findUnique({ where: { email: "admin@opsflow.local" } }))!.id,
        }),
      request(app)
        .post(`/api/work-items/${unassignedId}/assign`)
        .set("Authorization", `Bearer ${priyaToken}`)
        .send({
          expectedVersion: 1,
          assigneeId: (await prisma.user.findUnique({ where: { email: "priya@opsflow.local" } }))!.id,
        }),
    ]);
    const statuses = [a.status, b.status].sort();
    expect(statuses).toEqual([200, 409]);
    const conflict = a.status === 409 ? a : b;
    expect(["ASSIGNMENT_CONFLICT", "VERSION_CONFLICT"]).toContain(conflict.body.error.code);
    const item = await prisma.workItem.findUnique({ where: { id: unassignedId } });
    expect(item?.assigneeId).toBeTruthy();
  });

  it("writes an audit event for important mutations", async () => {
    const current = await prisma.workItem.findUnique({ where: { id: waitingId } });
    const res = await request(app)
      .post(`/api/work-items/${waitingId}/status`)
      .set("Authorization", `Bearer ${priyaToken}`)
      .send({ expectedVersion: current!.version, status: "IN_PROGRESS" });
    expect(res.status).toBe(200);
    const log = await prisma.auditLog.findFirst({
      where: { workItemId: waitingId, action: "STATUS_CHANGED" },
      orderBy: { createdAt: "desc" },
    });
    expect(log).toBeTruthy();
    expect(log?.metadata).toMatchObject({ field: "status", oldValue: "OPEN", newValue: "IN_PROGRESS" });
  });

  it("does not create duplicate notifications when an outbox event is processed twice", async () => {
    const priya = await prisma.user.findUnique({ where: { email: "priya@opsflow.local" } });
    const event = await prisma.outboxEvent.create({
      data: {
        type: "WORK_ITEM_ASSIGNED",
        payload: {
          workItemId: engineeringItemId,
          actorId: (await prisma.user.findUnique({ where: { email: "admin@opsflow.local" } }))!.id,
          assigneeId: priya!.id,
          previousAssigneeId: null,
        },
      },
    });
    await processEvent(event);
    await processEvent(event);
    const count = await prisma.notification.count({
      where: { sourceEventId: `${event.id}:assignee` },
    });
    expect(count).toBe(1);
  });
});
