/* craco.config.js - exclude @yudiel/react-qr-scanner from source-map-loader warnings */

module.exports = {
  webpack: {
    configure: (webpackConfig) => {
      const excludeEntry = /node_modules[\\/]|node_modules[\\\\]@yudiel[\\\\]react-qr-scanner/; // Windows + POSIX

      const isSourceMapLoader = (rule) => {
        if (!rule) return false;
        const checkUse = (use) => {
          if (!use) return false;
          if (typeof use === 'string') return use.includes('source-map-loader');
          if (Array.isArray(use)) return use.some(checkUse);
          return !!(use.loader && use.loader.includes('source-map-loader'));
        };
        return (
          (rule.loader && rule.loader.includes('source-map-loader')) ||
          checkUse(rule.use)
        );
      };

      const visitRules = (rules) => {
        if (!Array.isArray(rules)) return;
        for (const r of rules) {
          if (!r) continue;
          if (isSourceMapLoader(r)) {
            const pkgRegex = /node_modules[\\/]|node_modules[\\\\]@yudiel[\\\\]react-qr-scanner/;
            if (!r.exclude) r.exclude = [pkgRegex];
            else if (Array.isArray(r.exclude)) r.exclude.push(pkgRegex);
            else r.exclude = [r.exclude, pkgRegex];
          }
          if (Array.isArray(r.oneOf)) visitRules(r.oneOf);
          if (Array.isArray(r.rules)) visitRules(r.rules);
        }
      };

      visitRules(webpackConfig.module && webpackConfig.module.rules);

      // Also ignore the warnings explicitly to keep console clean
      const ignoreMatcher = (warning) => {
        const msg = (warning && (warning.message || warning)) + '';
        return msg.includes('@yudiel/react-qr-scanner') && msg.includes('Failed to parse source map');
      };
      if (!webpackConfig.ignoreWarnings) webpackConfig.ignoreWarnings = [ignoreMatcher];
      else webpackConfig.ignoreWarnings.push(ignoreMatcher);

      return webpackConfig;
    },
  },
};
