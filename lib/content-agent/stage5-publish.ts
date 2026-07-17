import { SupabaseClient } from '@supabase/supabase-js';
import { ayrsharePost } from '@/lib/ayrshare/client';
import { ScheduleItem, PublishOutput } from './types';

interface PublishContext {
  workspaceId: string;
  profileKey: string;
  userId: string;
  db: SupabaseClient;
}

export async function publishToAyrshare(
  scheduleItems: ScheduleItem[],
  context: PublishContext,
): Promise<PublishOutput> {
  const published: PublishOutput['published'] = [];
  const failed: PublishOutput['failed'] = [];

  for (const item of scheduleItems) {
    try {
      const scheduledDate = new Date(item.scheduledAt);
      const now = new Date();

      let scheduleDate: string | undefined;
      if (scheduledDate > now) {
        scheduleDate = item.scheduledAt.split('T')[0];
      }

      const payload = {
        post: item.content,
        platforms: [item.platform],
        mediaUrls: [],
        scheduleDate,
        hashtags: [],
        shortenLinks: false,
      };

      // Throws with the platform's reason if the post doesn't land, so getting
      // here IS the success case — the catch below records the failure. The old
      // status check couldn't see a per-platform rejection anyway: Ayrshare
      // answers HTTP 200 on failure and puts the reason in the body.
      const result = await ayrsharePost(context.profileKey, payload);

      const { data: publishRecord } = await context.db
        .from('publish_records')
        .insert({
          workspace_id: context.workspaceId,
          platforms: [item.platform],
          caption: item.content,
          scheduled_at: item.scheduledAt,
          status: 'scheduled',
          ayrshare_post_id: result.id,
          platform_results: { [item.platform]: result },
        })
        .select('id')
        .single();

      published.push({
        platform: item.platform,
        scheduledAt: item.scheduledAt,
        ayrsharePostId: result.id,
        publishRecordId: publishRecord?.id,
      });
    } catch (error) {
      failed.push({
        platform: item.platform,
        scheduledAt: item.scheduledAt,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  return { published, failed };
}
