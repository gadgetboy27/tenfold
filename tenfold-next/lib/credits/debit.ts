import { db, type DrizzleClient } from '@/db';
import { creditAccounts, creditTransactions } from '@/db/schema';
import { eq } from 'drizzle-orm';
import { CREDIT_COSTS, type CreditCostKey } from './costs';

export async function debitCredits(
  workspaceId: string,
  jobId: string,
  type: CreditCostKey,
  client: DrizzleClient = db,
): Promise<{ success: boolean; newBalance: number }> {
  return client.transaction(async (tx) => {
    const cost = CREDIT_COSTS[type];

    const [account] = await tx
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.workspaceId, workspaceId))
      .for('update');

    if (!account || account.cachedBalance < cost) {
      return { success: false, newBalance: account?.cachedBalance ?? 0 };
    }

    const newBalance = account.cachedBalance - cost;

    await tx.insert(creditTransactions).values({
      workspaceId,
      jobId,
      type: 'spend',
      amount: -cost,
      balanceAfter: newBalance,
      description: `${type} job`,
    });

    await tx
      .update(creditAccounts)
      .set({ cachedBalance: newBalance, updatedAt: new Date() })
      .where(eq(creditAccounts.workspaceId, workspaceId));

    return { success: true, newBalance };
  });
}
