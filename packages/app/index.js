// CommonJS — no import statements so execution order is explicit and not hoisted.
// polyfills.js must run first: it sets up TextDecoder (patched) and crypto randoms
// before @privy-io/js-sdk-core is evaluated.
require("./src/polyfills");

var { Buffer } = require("buffer");
global.Buffer = Buffer;

// MWA requires window.isSecureContext and crypto.subtle (Web Crypto API).
if (typeof window !== "undefined" && !window.isSecureContext) {
  window.isSecureContext = true;
}

var { registerRootComponent } = require("expo");
var { LogBox } = require("react-native");
var React = require("react");
var { default: App } = require("./src/App");

// Privy internally calls expo-linking createURL without a scheme argument.
// In bare workflow the JS runtime doesn't see app.json at runtime; it falls
// back to the native package name ("com.terrace.app") which IS registered.
// These warnings are cosmetic — OAuth works correctly.
LogBox.ignoreLogs([
  "Linking requires a build-time setting",
  "The provided Linking scheme",
]);

var PRIVY_APP_ID = process.env.EXPO_PUBLIC_PRIVY_APP_ID || "";
var PRIVY_CLIENT_ID = process.env.EXPO_PUBLIC_PRIVY_CLIENT_ID || "";

function Root() {
  if (!PRIVY_APP_ID) return React.createElement(App, null);

  try {
    var { PrivyProvider } = require("@privy-io/expo");
    return React.createElement(
      PrivyProvider,
      {
        appId: PRIVY_APP_ID,
        clientId: PRIVY_CLIENT_ID || undefined,
        config: {
          embedded: {
            solana: { createOnLogin: 'users-without-wallets' },
          },
        },
      },
      React.createElement(App, null)
    );
  } catch (e) {
    console.warn("PrivyProvider failed to load:", e);
    return React.createElement(App, null);
  }
}

registerRootComponent(Root);
