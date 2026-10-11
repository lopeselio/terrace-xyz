/** The Terrace logo (white T, green dot) on its rounded dark tile. */
export function TerraceMark({ size = 32, round = false }: { size?: number; round?: boolean }) {
  return <img src="/terrace.png" alt="Terrace" width={size} height={size} style={{ borderRadius: round ? "50%" : size * 0.22, flex: "none" }} />;
}
