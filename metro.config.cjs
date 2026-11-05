const { getDefaultConfig } = require('expo/metro-config');
const config = getDefaultConfig(__dirname);
config.resolver.assetExts = [...new Set([...config.resolver.assetExts, 'wasm', 'txt'])];
const resolve = config.resolver.resolveRequest;
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // The browser resolver picks pdf-lib's legacy ESM helpers, which do not
  // interoperate with Metro's tslib default import. Use its shipped CJS entry.
  const target = platform === 'web' && moduleName === 'pdf-lib' ? 'pdf-lib/cjs/index.js' : moduleName;
  return resolve ? resolve(context, target, platform) : context.resolveRequest(context, target, platform);
};
config.server.enhanceMiddleware = middleware => (req, res, next) => {
  res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  return middleware(req, res, next);
};
module.exports = config;
