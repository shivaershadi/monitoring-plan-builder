/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  // Built from data at runtime (competency id, progress state), so the scanner cannot see them written out.
  safelist: ['dot-done', 'dot-part', 'cc-ss', 'cc-edu', 'cc-wash', 'cc-icla', 'cc-pfv', 'cc-mpc', 'act-ss', 'act-edu', 'act-wash'],
  theme: {
    extend: {
      colors: {
        nrc: { DEFAULT: '#ff7602', ink: '#8a3d00', soft: '#fff1e6' },
        cc: { ss: '#ff7602', edu: '#2563eb', wash: '#0e9f8f', icla: '#7c3aed', pfv: '#b91c1c', mpc: '#047857' },
      },
    },
  },
  plugins: [],
}
