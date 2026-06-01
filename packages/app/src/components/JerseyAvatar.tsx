import React from "react";
import { View } from "react-native";
import Svg, { Path, Text as SvgText } from "react-native-svg";
import { avatarColorFromPubkey } from "../hooks/useLeaderboard";

interface Props {
  pubkey: string;
  /** Render diameter in px — used for both width and aspect-ratio scaling. */
  size?: number;
  /** Optional override for the character on the back. Defaults to first char of pubkey. */
  character?: string;
}

/**
 * Football-jersey-shaped avatar with the wallet's first character on the back.
 *
 * Replaces the round-circle-with-emoji avatars. Each wallet gets a stable
 * "kit colour" via avatarColorFromPubkey(pubkey), and the first base58 char
 * of the pubkey is printed centre-back like a player name plate.
 *
 * Implementation: single SVG path for the jersey silhouette (torso + two
 * short sleeves + V-neck cutout) plus a centred SvgText element. No raster
 * assets, no platform-specific rendering quirks.
 */
export function JerseyAvatar({ pubkey, size = 36, character }: Props) {
  const fill = avatarColorFromPubkey(pubkey);
  const label = (character ?? pubkey.slice(0, 1) ?? "?").toUpperCase();

  // Jersey path on a 100x100 viewBox. Key points (left → right):
  //   neck base left  (32, 18)
  //   shoulder left   (16, 28)
  //   sleeve tip      (4, 46)
  //   sleeve in       (24, 56)
  //   torso bottom L  (24, 92)
  //   torso bottom R  (76, 92)
  //   sleeve in R     (76, 56)
  //   sleeve tip R    (96, 46)
  //   shoulder right  (84, 28)
  //   neck base right (68, 18)
  //   V-neck curve back to (32, 18)
  const jerseyPath =
    "M 32 18 L 16 28 L 4 46 L 24 56 L 24 92 L 76 92 L 76 56 L 96 46 L 84 28 L 68 18 Q 50 32 32 18 Z";

  return (
    <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }}>
      <Svg width={size} height={size} viewBox="0 0 100 100">
        {/* Jersey body */}
        <Path d={jerseyPath} fill={fill} stroke="rgba(0,0,0,0.25)" strokeWidth={1.2} />
        {/* Number / character on the back */}
        <SvgText
          x={50}
          y={70}
          fontSize={42}
          fontWeight="bold"
          fill="#ffffff"
          textAnchor="middle"
          // Most platforms render Helvetica/Arial out-of-the-box; the system
          // default fallback handles the rest.
          fontFamily="Helvetica"
        >
          {label}
        </SvgText>
      </Svg>
    </View>
  );
}
