// Stamped by build.ts via esbuild `define`; absent under tsx (tests, harnesses).
declare const __CDP_BUILD__: { version: string; commit: string; builtAt: string };

export const BUILD: { version: string; commit: string; builtAt: string } =
  typeof __CDP_BUILD__ === "undefined"
    ? { version: "dev", commit: "dev", builtAt: "" }
    : __CDP_BUILD__;
