// Custom Jest transform — uses esbuild (bundled with tsx) to handle .ts files.
const { transformSync } = require('esbuild');

module.exports = {
  process(sourceText, sourcePath) {
    if (/\.tsx?$/.test(sourcePath)) {
      const { code } = transformSync(sourceText, {
        loader:  'ts',
        format:  'cjs',
        target:  'node18',
        sourcefile: sourcePath,
      });
      return { code };
    }
    return { code: sourceText };
  },
};
