import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth/session';
import { db } from '@/db';
import { creditAccounts, creditTransactions } from '@/db/schema';
import { eq } from 'drizzle-orm';

const GRANT_AMOUNT = 200;

export async function POST(req: Request) {
  try {
    const session = await getSession(req);

    await db.transaction(async (tx) => {
      const [account] = await tx
        .select()
        .from(creditAccounts)
        .where(eq(creditAccounts.workspaceId, session.workspaceId))
        .for('update');

      if (!account) throw new Error('Credit account not found');

      const newBalance = account.cachedBalance + GRANT_AMOUNT;

      await tx.insert(creditTransactions).values({
        workspaceId: session.workspaceId,
        type: 'grant',
        amount: GRANT_AMOUNT,
        balanceAfter: newBalance,
        description: 'Test credit top-up',
      });

      await tx
        .update(creditAccounts)
        .set({ cachedBalance: newBalance })
        .where(eq(creditAccounts.workspaceId, session.workspaceId));
    });

    return NextResponse.json({ granted: GRANT_AMOUNT });
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    const status = msg === 'Unauthorized' ? 401 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
