import { AlertCircle, Inbox } from "lucide-react";

export function EmptyState({ text }: { text: string }) {
  return (
    <div className="flex min-h-36 flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-600">
      <Inbox className="mb-3 h-7 w-7" />
      {text}
    </div>
  );
}
export function ErrorState({
  text,
  retry,
}: {
  text: string;
  retry?: () => void;
}) {
  return (
    <div className="atelier-panel p-7 text-center">
      <AlertCircle className="mx-auto mb-3 h-8 w-8 text-red-400" />
      <p className="text-sm text-zinc-300">{text}</p>
      {retry && (
        <button onClick={retry} className="atelier-button mt-4">
          تلاش دوباره
        </button>
      )}
    </div>
  );
}
export function LoadingState() {
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {[1, 2, 3, 4].map((id) => (
        <div
          key={id}
          className="h-32 animate-pulse rounded-2xl border border-zinc-900 bg-zinc-950"
        />
      ))}
    </div>
  );
}
