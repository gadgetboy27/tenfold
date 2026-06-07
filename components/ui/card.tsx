export function Card({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={`rounded-lg border border-gray-200 bg-white shadow ${className}`}>
      {children}
    </div>
  );
}
