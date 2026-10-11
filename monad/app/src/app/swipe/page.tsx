import { SwipeDeck } from "@/components/SwipeDeck";

export default function Swipe() {
  return (
    <>
      <h1 style={{ marginTop: 4 }}>Swipe the takes.</h1>
      <p className="lede">Right to back it, left to fade it, up to open the room, down to skip.</p>
      <SwipeDeck />
    </>
  );
}
