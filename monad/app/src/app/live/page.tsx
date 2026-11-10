import { GameDay } from "@/components/GameDay";

export default async function Live({ searchParams }: { searchParams: Promise<{ fan?: string }> }) {
  const { fan } = await searchParams;
  return <GameDay fan={fan && /^0x[0-9a-fA-F]{40}$/.test(fan) ? fan : undefined} />;
}
