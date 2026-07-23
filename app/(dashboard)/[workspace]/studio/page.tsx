import { redirect } from "next/navigation";

// Studio is now the main site — /<workspace> renders it directly. This route
// redirects so old bookmarks/links to the original hidden-preview URL still work.
export default async function StudioRedirect({
  params,
}: {
  params: Promise<{ workspace: string }>;
}) {
  const { workspace } = await params;
  redirect(`/${workspace}`);
}
