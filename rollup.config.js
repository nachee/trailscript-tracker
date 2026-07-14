import resolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';

const production = !process.env.ROLLUP_WATCH;

export default {
  input: 'src/index.js',
  output: {
    file: 'dist/tracker.min.js',
    format: 'iife',
    name: '__trailscript',
    sourcemap: true,
  },
  plugins: [
    resolve({ browser: true }),
    production && terser({
      compress: { passes: 2 },
      mangle: true,
    }),
  ],
};
