const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");

const prisma = new PrismaClient();

/**
 * Creates the first ADMIN account so the app has someone who can publish forms.
 * Safe to re-run: it exits early when the admin already exists.
 * @returns {Promise<void>}
 */
async function main() {
  const adminEmail = "admin@example.com";
  const adminPassword = "admin123"; // change this after first login in a real deployment

  const existing = await prisma.user.findUnique({ where: { email: adminEmail } });
  if (existing) {
    console.log("Admin already exists, skipping seed.");
    return;
  }

  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  await prisma.user.create({
    data: {
      name: "Admin",
      email: adminEmail,
      password: hashedPassword,
      role: "ADMIN",
    },
  });

  console.log(`Admin user created: ${adminEmail} / ${adminPassword}`);
}

/**
 * Creates the sandboxed demo pair. They have random unusable passwords: the only
 * way in is the demo buttons on the sign-in screen.
 * @returns {Promise<void>}
 */
async function seedDemoAccounts() {
  const demos = [
    { email: "demo.admin@example.com", name: "Demo Admin", role: "ADMIN" },
    { email: "demo.user@example.com", name: "Demo User", role: "USER" },
  ];

  for (const demo of demos) {
    const existing = await prisma.user.findUnique({ where: { email: demo.email } });
    if (existing) {
      console.log(`${demo.name} already exists, skipping.`);
      continue;
    }

    await prisma.user.create({
      data: {
        ...demo,
        password: await bcrypt.hash(require("crypto").randomBytes(24).toString("hex"), 10),
        isDemo: true,
      },
    });
    console.log(`${demo.name} created (no password, use the demo button).`);
  }
}

main()
  .then(seedDemoAccounts)
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });