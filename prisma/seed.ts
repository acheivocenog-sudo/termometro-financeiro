import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_EMAIL || "demo@termometro.com";
  const password = process.env.SEED_PASSWORD || "demo123";
  const name = "Demo User";

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await prisma.user.upsert({
    where: { email },
    update: {},
    create: { name, email, passwordHash },
  });

  console.log(`Usuário demo: ${email} / ${password}`);

  // Saldo inicial
  await prisma.balance.upsert({
    where: { userId: user.id },
    update: {},
    create: { userId: user.id, amount: 3500 },
  });

  const today = new Date();
  const y = today.getFullYear();
  const m = today.getMonth();

  // Receitas
  await prisma.income.createMany({
    data: [
      { userId: user.id, description: "Salário", amount: 6000, date: new Date(y, m, 5), recurring: true },
      { userId: user.id, description: "Freelance", amount: 1000, date: new Date(y, m, 20), recurring: false },
    ],
    skipDuplicates: true,
  });

  // Despesas fixas
  await prisma.fixedExpense.createMany({
    data: [
      { userId: user.id, description: "Aluguel", amount: 1200, dueDay: 10, recurring: true },
      { userId: user.id, description: "Internet", amount: 100, dueDay: 15, recurring: true },
      { userId: user.id, description: "Academia", amount: 150, dueDay: 20, recurring: true },
      { userId: user.id, description: "Energia", amount: 300, dueDay: 25, recurring: true },
    ],
    skipDuplicates: true,
  });

  // Alguns gastos variáveis
  const daysAgo = (n: number) => { const d = new Date(); d.setDate(d.getDate() - n); return d; };
  await prisma.variableExpense.createMany({
    data: [
      { userId: user.id, description: "Almoço", category: "Alimentação", amount: 45, date: daysAgo(0) },
      { userId: user.id, description: "Uber", category: "Transporte", amount: 22, date: daysAgo(1) },
      { userId: user.id, description: "iFood", category: "Alimentação", amount: 68, date: daysAgo(2) },
      { userId: user.id, description: "Farmácia", category: "Saúde", amount: 35, date: daysAgo(3) },
    ],
    skipDuplicates: true,
  });

  console.log("Dados de exemplo criados com sucesso!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
