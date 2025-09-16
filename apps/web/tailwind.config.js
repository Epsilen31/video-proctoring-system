/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx,js,jsx}'],
  theme: {
    extend: {
      colors: {
        focus: {
          success: '#16a34a',
          warning: '#f59e0b',
          danger: '#dc2626',
        },
      },
    },
  },
  plugins: [require('@tailwindcss/forms')],
};
