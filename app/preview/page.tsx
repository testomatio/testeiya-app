import { notFound } from "next/navigation";
import PreviewClient from "./preview-client";

// Dev-only route — `notFound()` returns a 404 page in production builds so
// this gallery never ships to end users. Toggle via NEXT_PUBLIC_ENABLE_PREVIEW
// if you need to demo it against a production build.
// Note: no `dynamic = "force-dynamic"` here — `output: "export"` forbids it.
// The gating below runs at build time, statically rendering 404 in production.

export default function PreviewPage() {
  const allowed =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ENABLE_PREVIEW === "1";
  if (!allowed) notFound();
  return <PreviewClient />;
}
