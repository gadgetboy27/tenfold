import { RepurposeOutput, ScheduleItem } from './types';

const NZST_OFFSET_HOURS = 12;

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function setTimeNZST(date: Date, hours: number, minutes: number = 0): Date {
  const utcDate = new Date(date);
  utcDate.setUTCHours(hours - NZST_OFFSET_HOURS, minutes, 0, 0);
  return utcDate;
}

function getNextOccurrence(
  baseDate: Date,
  targetDayOfWeek: number,
  hoursNZST: number,
  minutesNZST: number = 0,
): Date {
  const current = new Date(baseDate);
  const currentDayOfWeek = current.getDay();

  let daysToAdd = targetDayOfWeek - currentDayOfWeek;
  if (daysToAdd <= 0) {
    daysToAdd += 7;
  }

  const nextDate = addDays(current, daysToAdd);
  return setTimeNZST(nextDate, hoursNZST, minutesNZST);
}

export function scheduleContent(
  repurposeOutput: RepurposeOutput,
  baseDate: Date = new Date(),
): ScheduleItem[] {
  const items: ScheduleItem[] = [];

  const sundayLunch = getNextOccurrence(baseDate, 0, 8, 0);
  const mondayMorning = getNextOccurrence(baseDate, 1, 7, 0);
  const tuesdayMorning = getNextOccurrence(baseDate, 2, 8, 0);
  const tuesdayEvening = getNextOccurrence(baseDate, 2, 17, 0);
  const wednesdayEvening = getNextOccurrence(baseDate, 3, 18, 0);
  const thursdayMorning = getNextOccurrence(baseDate, 4, 9, 0);
  const fridayEvening = getNextOccurrence(baseDate, 5, 17, 0);
  const saturdayEvening = getNextOccurrence(baseDate, 6, 18, 0);

  items.push(
    {
      platform: 'linkedin',
      formatKey: 'linkedinPost',
      content: repurposeOutput.linkedinPost,
      scheduledAt: tuesdayMorning.toISOString(),
    },
    {
      platform: 'linkedin',
      formatKey: 'linkedinPost',
      content: repurposeOutput.linkedinPost,
      scheduledAt: thursdayMorning.toISOString(),
    },
    {
      platform: 'twitter',
      formatKey: 'twitterThread',
      content: repurposeOutput.twitterThread.join('\n\n'),
      scheduledAt: mondayMorning.toISOString(),
    },
    {
      platform: 'instagram',
      formatKey: 'instagramCaption',
      content: repurposeOutput.instagramCaption,
      scheduledAt: wednesdayEvening.toISOString(),
    },
    {
      platform: 'instagram',
      formatKey: 'instagramCaption',
      content: repurposeOutput.instagramCaption,
      scheduledAt: saturdayEvening.toISOString(),
    },
    {
      platform: 'tiktok',
      formatKey: 'tiktokScript',
      content: repurposeOutput.tiktokScript,
      scheduledAt: tuesdayEvening.toISOString(),
    },
    {
      platform: 'tiktok',
      formatKey: 'tiktokScript',
      content: repurposeOutput.tiktokScript,
      scheduledAt: fridayEvening.toISOString(),
    },
  );

  return items;
}
