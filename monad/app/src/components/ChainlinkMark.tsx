/** The Chainlink mark, cropped to a circle: on everything Chainlink settles or keeps sealed. */
export function ChainlinkMark({ size = 12 }: { size?: number }) {
  return <img src="/chainlink.png" alt="Chainlink" width={size} height={size} style={{ borderRadius: "50%", flex: "none", background: "#fff" }} />;
}
