import "server-only";

/** Fetches a Google font as TTF for the image renderer; falls back to the default face if offline. */
export async function font(family: string, weight: number) {
  try {
    const css = await (await fetch(`https://fonts.googleapis.com/css2?family=${family.replace(/ /g, "+")}:wght@${weight}`, { headers: { "user-agent": "curl/8" } })).text();
    const url = css.match(/src: url\((.+?)\) format\('(?:truetype|opentype)'\)/)?.[1];
    return url ? await (await fetch(url)).arrayBuffer() : null;
  } catch {
    return null;
  }
}
