import "react-native-get-random-values";
import { Buffer } from "buffer";
global.Buffer = Buffer;
import { registerRootComponent } from "expo";
import React from "react";
import App from "./src/App";

const PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID ?? "";

function Root() {
  if (!PRIVY_APP_ID) return <App />;

  // Lazy require so native Privy modules are only loaded in dev/production
  // builds where the native code is actually linked — not in Expo Go.
  try {
    const { PrivyProvider } = require("@privy-io/expo");
    return (
      <PrivyProvider appId={PRIVY_APP_ID}>
        <App />
      </PrivyProvider>
    );
  } catch {
    return <App />;
  }
}

registerRootComponent(Root);
