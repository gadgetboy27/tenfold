/**
 * Renders JSON-LD into the page.
 *
 * Deliberately a plain server component with no "use client": the markup only
 * has to exist in the HTML crawlers receive, and shipping it as client JS
 * would both bloat the bundle and hide it from anything that doesn't execute
 * JavaScript.
 */
export function StructuredData({
  data,
}: {
  data: Record<string, unknown> | Record<string, unknown>[];
}) {
  const blocks = Array.isArray(data) ? data : [data];
  return (
    <>
      {blocks.map((block, i) => (
        <script
          key={i}
          type="application/ld+json"
          // Schema is built from our own constants, never user input.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(block) }}
        />
      ))}
    </>
  );
}
