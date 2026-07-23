import { redirect } from "next/navigation";

// The standalone gallery page has been folded into Studio's front door (the
// Gallery section now has a Projects tab AND an Images tab, reachable by
// clicking the Tenfold logo at /<workspace>). Redirect so old bookmarks/links
// still land somewhere useful instead of a stale page.
export default async function GalleryRedirect({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  redirect(`/${workspace}`);
}
