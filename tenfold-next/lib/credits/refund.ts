import { db, type DrizzleClient } from '@/db';
import { creditAccounts, creditTransactions, creativeJobs } from '@/db/schema';
import { eq } from 'drizzle-orm';

export async function refundCredits(
  jobId: string,
  client: DrizzleClient = db,
): Promise<void> {
  const job = await client.query.creativeJobs.findFirst({
    where: eq(creativeJobs.id, jobId),
  });

  if (!job || job.creditsCharged === 0) return;

  await client.transaction(async (tx) => {
    const [account] = await tx
      .select()
      .from(creditAccounts)
      .where(eq(creditAccounts.workspaceId, job.workspaceId))
      .for('update');

    if (!account) return;

    const newBalance = account.cachedBalance + job.creditsCharged;

    await tx.insert(creditTransactions).values({
      workspaceId: job.workspaceId,
      jobId,
      type: 'refund',
      amount: job.creditsCharged,
      balanceAfter: newBalance,
      description: `refund for failed ${job.type} job`,
    });

    await tx
      .update(creditAccounts)
      .set({ cachedBalance: newBalance, updatedAt: new Date() })
      .where(eq(creditAccounts.workspaceId, job.workspaceId));
  });
}
