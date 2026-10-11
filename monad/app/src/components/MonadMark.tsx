/** The Monad mark, cropped to a circle, wherever the app says "Monad". */
export function MonadMark({ size = 18 }: { size?: number }) {
  return <img src="/monad.png" alt="Monad" width={size} height={size} style={{ borderRadius: "50%", flex: "none" }} />;
}
