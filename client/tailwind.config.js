export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Deep teal - clinical/calm/trustworthy, deliberately distinct from
        // the generic SaaS blue-indigo. This is the app's one accent color;
        // amber/emerald/red stay purely semantic (warning/success/danger).
        brand: {
          50: '#EFFCFA',
          100: '#D7F4F0',
          200: '#AFE8E1',
          300: '#7DD8CE',
          400: '#45BFB2',
          500: '#1E9E92',
          600: '#157E76',
          700: '#11635D',
          800: '#0F4E49',
          900: '#0C3C39',
        },
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Sora', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px 0 rgb(15 23 42 / 0.04), 0 1px 3px 0 rgb(15 23 42 / 0.06)',
        elevated: '0 4px 12px -2px rgb(15 23 42 / 0.08), 0 2px 4px -2px rgb(15 23 42 / 0.06)',
      },
      borderRadius: {
        xl: '0.875rem',
      },
    },
  },
  plugins: [],
};
