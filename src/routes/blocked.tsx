import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/blocked")({
  head: () => ({
    meta: [
      { title: "Desktop Required — Prarambh" },
      {
        name: "description",
        content:
          "The Prarambh entrance exam requires a laptop or desktop computer. Mobile devices and tablets are not supported.",
      },
      { property: "og:title", content: "Desktop Required — Prarambh" },
      {
        property: "og:description",
        content:
          "The Prarambh entrance exam requires a laptop or desktop computer. Mobile devices and tablets are not supported.",
      },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BlockedPage,
});

function BlockedPage() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-6">
      <div className="max-w-md text-center">
        {/* Icon */}
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-destructive/10">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            className="h-10 w-10 text-destructive"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636"
            />
          </svg>
        </div>

        {/* Title */}
        <h1 className="text-3xl font-bold text-foreground">Desktop Required</h1>

        {/* Description */}
        <p className="mt-4 text-base text-slate leading-relaxed">
          The Prarambh entrance exam requires a{" "}
          <strong className="text-foreground">laptop or desktop computer</strong> with a stable
          internet connection.
        </p>

        <p className="mt-3 text-sm text-slate">
          Mobile devices and tablets are not supported to ensure exam integrity and the best testing
          experience.
        </p>

        {/* Instructions */}
        <div className="mt-8 rounded-xl border border-border bg-card/50 p-6 text-left">
          <h2 className="font-semibold text-foreground mb-3">
            Please switch to a desktop computer:
          </h2>
          <ul className="space-y-2 text-sm text-slate">
            <li className="flex items-start gap-2">
              <span className="text-deep-green mt-0.5">✓</span>
              <span>Use a Windows PC, Mac, or Linux computer</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-deep-green mt-0.5">✓</span>
              <span>Ensure you have a stable internet connection</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-deep-green mt-0.5">✓</span>
              <span>Use Chrome, Firefox, Edge, or Safari browser</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-deep-green mt-0.5">✓</span>
              <span>Allow fullscreen mode for the exam</span>
            </li>
          </ul>
        </div>

        {/* Footer */}
        <p className="mt-6 text-xs text-slate">Need help? Contact the exam coordinator.</p>
      </div>
    </div>
  );
}
