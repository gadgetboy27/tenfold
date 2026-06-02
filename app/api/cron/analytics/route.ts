import { NextResponse } from 'next/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { generateAnalyticsReport, sendAnalyticsEmail } from '@/lib/content-agent/stage6-analytics';

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('Authorization');
    const expectedToken = `Bearer ${process.env.CRON_SECRET || 'dev-secret'}`;

    if (authHeader !== expectedToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const admin = createSupabaseAdminClient();

    const { data: workspaces } = await admin
      .from('workspaces')
      .select('id, owner_id, ayrshare_profile_key')
      .not('ayrshare_profile_key', 'is', null);

    if (!workspaces || workspaces.length === 0) {
      return NextResponse.json({ processed: 0 });
    }

    let processed = 0;

    for (const workspace of workspaces) {
      try {
        const { data: owner } = await admin
          .from('workspace_members')
          .select('*')
          .eq('workspace_id', workspace.id)
          .eq('user_id', workspace.owner_id)
          .single();

        if (!owner) {
          console.error(`No owner found for workspace ${workspace.id}`);
          continue;
        }

        const { data: profile } = await admin.auth.admin.getUserById(workspace.owner_id);

        if (!profile?.user?.email) {
          console.error(`No email found for workspace owner ${workspace.owner_id}`);
          continue;
        }

        const weekEnding = new Date();
        weekEnding.setDate(weekEnding.getDate() - weekEnding.getDay());

        const report = await generateAnalyticsReport(
          {
            workspaceId: workspace.id,
            profileKey: workspace.ayrshare_profile_key!,
            userEmail: profile.user.email,
            db: admin,
          },
          weekEnding,
        );

        await sendAnalyticsEmail(report, profile.user.email);
        processed++;
      } catch (error) {
        console.error(`Failed to process analytics for workspace ${workspace.id}:`, error);
      }
    }

    return NextResponse.json({ processed, total: workspaces.length });
  } catch (error) {
    console.error('Analytics cron error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
