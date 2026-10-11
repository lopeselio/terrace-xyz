import { Suspense } from "react";
import { Markets } from "@/components/Markets";

export default function MarketsPage() {
  return (
    <Suspense>
      <Markets />
    </Suspense>
  );
}
