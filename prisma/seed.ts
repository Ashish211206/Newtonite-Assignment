import { PrismaClient, type WorkItemPriority, type WorkItemStatus, type WorkItemType } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();
const PASSWORD = "Password123!";

async function main() {
  await prisma.notification.deleteMany();
  await prisma.outboxEvent.deleteMany();
  await prisma.idempotencyRecord.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.workItem.deleteMany();
  await prisma.teamMembership.deleteMany();
  await prisma.team.deleteMany();
  await prisma.user.deleteMany();

  const hash = await bcrypt.hash(PASSWORD, 10);
  const avatar = (name: string) =>
    `https://api.dicebear.com/9.x/initials/svg?seed=${encodeURIComponent(name)}`;

  const users = await prisma.$transaction([
    prisma.user.create({
      data: {
        name: "Ashish Kumar",
        email: "admin@opsflow.local",
        passwordHash: hash,
        globalRole: "ADMIN",
        avatar: avatar("Ashish Kumar"),
      },
    }),
    prisma.user.create({
      data: { name: "Ananya Sharma", email: "ananya@opsflow.local", passwordHash: hash, avatar: avatar("Ananya Sharma") },
    }),
    prisma.user.create({
      data: { name: "Rahul Mehta", email: "rahul@opsflow.local", passwordHash: hash, avatar: avatar("Rahul Mehta") },
    }),
    prisma.user.create({
      data: { name: "Priya Nair", email: "priya@opsflow.local", passwordHash: hash, avatar: avatar("Priya Nair") },
    }),
    prisma.user.create({
      data: { name: "Vikram Joshi", email: "vikram@opsflow.local", passwordHash: hash, avatar: avatar("Vikram Joshi") },
    }),
    prisma.user.create({
      data: { name: "Sana Iqbal", email: "sana@opsflow.local", passwordHash: hash, avatar: avatar("Sana Iqbal") },
    }),
    prisma.user.create({
      data: { name: "Arjun Patel", email: "arjun@opsflow.local", passwordHash: hash, avatar: avatar("Arjun Patel") },
    }),
    prisma.user.create({
      data: { name: "Meera Kapoor", email: "meera@opsflow.local", passwordHash: hash, avatar: avatar("Meera Kapoor") },
    }),
    prisma.user.create({
      data: { name: "Karan Singh", email: "karan@opsflow.local", passwordHash: hash, avatar: avatar("Karan Singh") },
    }),
    prisma.user.create({
      data: { name: "Nisha Reddy", email: "nisha@opsflow.local", passwordHash: hash, avatar: avatar("Nisha Reddy") },
    }),
    prisma.user.create({
      data: { name: "Dev Isolated", email: "isolated@opsflow.local", passwordHash: hash, avatar: avatar("Dev Isolated") },
    }),
  ]);

  const [
    ashish,
    ananya,
    rahul,
    priya,
    vikram,
    sana,
    arjun,
    meera,
    karan,
    nisha,
    isolated,
  ] = users;

  const [support, engineering, payments, compliance, ops] = await prisma.$transaction([
    prisma.team.create({
      data: { name: "Customer Support", description: "Customer-facing issues and escalations" },
    }),
    prisma.team.create({
      data: { name: "Platform Engineering", description: "Reliability, incidents, and product defects" },
    }),
    prisma.team.create({
      data: { name: "Payments", description: "Billing, settlements, and payment failures" },
    }),
    prisma.team.create({
      data: { name: "Compliance", description: "Policy, KYC, and regulatory follow-ups" },
    }),
    prisma.team.create({
      data: { name: "Internal Operations", description: "Day-to-day operational tasks" },
    }),
  ]);

  const isolatedTeam = await prisma.team.create({
    data: { name: "Restricted Audit Cell", description: "Confidential compliance investigations" },
  });

  await prisma.teamMembership.createMany({
    data: [
      { userId: ashish.id, teamId: support.id, role: "ADMIN" },
      { userId: ashish.id, teamId: engineering.id, role: "ADMIN" },
      { userId: ashish.id, teamId: payments.id, role: "ADMIN" },
      { userId: ashish.id, teamId: compliance.id, role: "ADMIN" },
      { userId: ashish.id, teamId: ops.id, role: "ADMIN" },
      { userId: ananya.id, teamId: support.id, role: "TEAM_LEAD" },
      { userId: priya.id, teamId: support.id, role: "MEMBER" },
      { userId: karan.id, teamId: support.id, role: "MEMBER" },
      { userId: rahul.id, teamId: engineering.id, role: "TEAM_LEAD" },
      { userId: vikram.id, teamId: engineering.id, role: "MEMBER" },
      { userId: arjun.id, teamId: engineering.id, role: "MEMBER" },
      { userId: sana.id, teamId: payments.id, role: "TEAM_LEAD" },
      { userId: meera.id, teamId: payments.id, role: "MEMBER" },
      { userId: nisha.id, teamId: compliance.id, role: "TEAM_LEAD" },
      { userId: meera.id, teamId: compliance.id, role: "MEMBER" },
      { userId: ananya.id, teamId: ops.id, role: "TEAM_LEAD" },
      { userId: priya.id, teamId: ops.id, role: "MEMBER" },
      { userId: isolated.id, teamId: isolatedTeam.id, role: "MEMBER" },
      { userId: nisha.id, teamId: isolatedTeam.id, role: "TEAM_LEAD" },
    ],
  });

  const statuses: WorkItemStatus[] = [
    "OPEN",
    "IN_PROGRESS",
    "BLOCKED",
    "WAITING_FOR_APPROVAL",
    "RESOLVED",
    "CLOSED",
  ];
  const priorities: WorkItemPriority[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const types: WorkItemType[] = [
    "CUSTOMER_ISSUE",
    "ENGINEERING",
    "PAYMENT",
    "INCIDENT",
    "COMPLIANCE",
    "OPERATIONS",
  ];

  const titles = [
    "Customer unable to complete KYC upload",
    "Payout batch stuck in pending state",
    "Production 5xx spike on checkout",
    "Refund reversal discrepancy",
    "Vendor SLA breach follow-up",
    "Login lockout after password reset",
    "Invoice PDF generation timeout",
    "Webhook retries exhausting queue",
    "Card tokenization failure from bank",
    "Data retention policy exception",
    "On-call rotation coverage gap",
    "Chargeback evidence package",
    "Support macro producing wrong reply",
    "Database failover drill findings",
    "Suspicious login cluster from new ASN",
    "Settlement file missing records",
    "Feature flag leftover in production",
    "Customer escalation: delayed shipment ops",
    "PCI questionnaire evidence collection",
    "Nightly job missed due-date window",
  ];

  const teamCycle = [support, engineering, payments, compliance, ops];
  const memberCycle = [
    [ananya, priya, karan],
    [rahul, vikram, arjun],
    [sana, meera],
    [nisha, meera],
    [ananya, priya],
  ];

  const now = Date.now();
  const createdItems = [];

  for (let i = 0; i < 52; i++) {
    const team = teamCycle[i % teamCycle.length];
    const members = memberCycle[i % memberCycle.length];
    const assignee = i % 7 === 0 ? null : members[i % members.length];
    const reporter = members[(i + 1) % members.length];
    const dueOffsetDays = (i % 11) - 5;
    const dueDate =
      i % 9 === 0 ? null : new Date(now + dueOffsetDays * 24 * 60 * 60 * 1000);
    const item = await prisma.workItem.create({
      data: {
        title: `${titles[i % titles.length]} (${i + 1})`,
        description: [
          `Operational summary for item ${i + 1}.`,
          "",
          "Impact:",
          "- Customers or internal operators are blocked on a downstream process.",
          "- This item was created from the scattered email/chat workflow OpsFlow replaces.",
          "",
          "Next step:",
          "Confirm owner, update status, and record decisions in comments.",
        ].join("\n"),
        status: statuses[i % statuses.length],
        priority: priorities[i % priorities.length],
        type: types[i % types.length],
        teamId: team.id,
        reporterId: reporter.id,
        assigneeId: assignee?.id ?? null,
        dueDate,
        version: 1,
      },
    });
    createdItems.push(item);

    await prisma.auditLog.create({
      data: {
        workItemId: item.id,
        actorId: reporter.id,
        action: "CREATED",
        metadata: { title: item.title, status: item.status, priority: item.priority },
      },
    });
    if (assignee) {
      await prisma.auditLog.create({
        data: {
          workItemId: item.id,
          actorId: reporter.id,
          action: "ASSIGNED",
          metadata: { field: "assigneeId", oldValue: null, newValue: assignee.id },
        },
      });
    }
    if (i % 3 === 0) {
      await prisma.comment.create({
        data: {
          workItemId: item.id,
          authorId: reporter.id,
          body: "Initial triage complete. Please keep the timeline updated as you work this.",
        },
      });
      await prisma.auditLog.create({
        data: {
          workItemId: item.id,
          actorId: reporter.id,
          action: "COMMENT_ADDED",
          metadata: {},
        },
      });
    }
    if (assignee && i % 4 === 0) {
      await prisma.notification.create({
        data: {
          userId: assignee.id,
          type: "ASSIGNED",
          title: "Work assigned to you",
          message: `${item.title} was assigned during seed.`,
          workItemId: item.id,
          sourceEventId: `seed-assign-${item.id}`,
        },
      });
    }
  }

  const restricted = await prisma.workItem.create({
    data: {
      title: "Confidential vendor investigation",
      description: "Restricted to the Audit Cell. Members of other teams must not be able to open this by ID.",
      status: "IN_PROGRESS",
      priority: "HIGH",
      type: "COMPLIANCE",
      teamId: isolatedTeam.id,
      reporterId: nisha.id,
      assigneeId: isolated.id,
    },
  });
  await prisma.auditLog.create({
    data: {
      workItemId: restricted.id,
      actorId: nisha.id,
      action: "CREATED",
      metadata: { restricted: true },
    },
  });

  console.log("Seed complete.");
  console.log("Demo logins (password: Password123!):");
  console.log("  admin@opsflow.local     ADMIN");
  console.log("  ananya@opsflow.local    Support / Ops lead");
  console.log("  rahul@opsflow.local     Engineering lead");
  console.log("  priya@opsflow.local     Member");
  console.log("  isolated@opsflow.local  Restricted team only");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
