import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

const rawAndCssImportPlugin = {
  name: 'vite-raw-and-css-import',
  setup(build) {
    build.onResolve({ filter: /\.css$/ }, (args) => {
      return {
        path: args.path,
        namespace: 'css-stub',
      };
    });

    build.onLoad({ filter: /.*/, namespace: 'css-stub' }, () => {
      return {
        contents: 'export default {};',
        loader: 'js',
      };
    });

    build.onResolve({ filter: /\?raw$/ }, (args) => {
      const cleanPath = args.path.replace(/\?raw$/, '');
      if (cleanPath.includes('standaloneAppBundle')) {
        return {
          path: 'standalone-bundle-self-stub',
          namespace: 'raw-stub',
        };
      }
      let resolvedPath;
      if (cleanPath.startsWith('.')) {
        resolvedPath = path.resolve(args.resolveDir, cleanPath);
      } else {
        resolvedPath = require.resolve(cleanPath, { paths: [args.resolveDir, process.cwd()] });
      }
      return {
        path: resolvedPath,
        namespace: 'raw-file',
      };
    });

    build.onLoad({ filter: /.*/, namespace: 'raw-stub' }, () => {
      return {
        contents: 'export default "";',
        loader: 'js',
      };
    });

    build.onLoad({ filter: /.*/, namespace: 'raw-file' }, (args) => {
      const text = fs.readFileSync(args.path, 'utf8');
      return {
        contents: `export default ${JSON.stringify(text)};`,
        loader: 'js',
      };
    });
  },
};

async function buildBundle() {
  const outFile = path.resolve(process.cwd(), 'src/generated/standaloneAppBundle.js');
  await esbuild.build({
    entryPoints: [path.resolve(process.cwd(), 'src/main.tsx')],
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: ['es2020'],
    minify: true,
    outfile: outFile,
    plugins: [rawAndCssImportPlugin],
    define: {
      'process.env.NODE_ENV': '"production"',
    },
  });
  const stat = fs.statSync(outFile);
  console.log(`[standalone-bundle] Built ${outFile} (${(stat.size / 1024).toFixed(1)} KB)`);
}

buildBundle().catch((err) => {
  console.error(err);
  process.exit(1);
});
