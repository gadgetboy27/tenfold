import { ContentReview } from "@/components/content/ContentReview";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function ContentResultPage({ params }: Props) {
  const { id } = await params;

  return (
    <main className="mx-auto max-w-4xl px-4 py-8">
      <ContentReview submissionId={id} />
    </main>
  );
}
