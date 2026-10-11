import { Suspense } from "react";
import { Profile } from "@/components/Profile";

export default function Me() {
  return (
    <Suspense>
      <Profile />
    </Suspense>
  );
}
