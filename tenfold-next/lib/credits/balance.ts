import { db } from '@/db';
import { creditAccounts, creditTransactions } from '@/db/schema';
import { eq, desc } from 'drizzle-orm';

export async function getBalance(workspaceId: string): Promise<number> {
  const account = await db.query.creditAccounts.findFirst({
    where: eq(creditAccounts.workspaceId, workspaceId),
  });
  return account?.cachedBalance ?? 0;
}

export async function getBalanceWithHistory(workspaceId: string) {
  const [account, transactions] = await Promise.all([
    db.query.creditAccounts.findFirst({
      where: eq(creditAccounts.workspaceId, workspaceId),
    }),
    db
      .select()
      .from(creditTransactions)
      .where(eq(creditTransactions.workspaceId, workspaceId))
      .orderBy(desc(creditTransactions.createdAt))
      .limit(20),
  ]);

  return {
    balance: account?.cachedBalance ?? 0,
    transactions,
  };
}
