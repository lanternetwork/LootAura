import type { Config } from "tailwindcss"
export default {
  content: [
    "./app/**/*.{ts,tsx}", 
    "./components/**/*.{ts,tsx}",
  ],
  safelist: [
    // Grid column classes to ensure they're not purged
    'grid-cols-1',
    'grid-cols-2', 
    'grid-cols-3',
    'grid-cols-4',
    'sm:grid-cols-1',
    'sm:grid-cols-2',
    'sm:grid-cols-3',
    'md:grid-cols-1',
    'md:grid-cols-2',
    'md:grid-cols-3',
    'md:grid-cols-4',
    'lg:grid-cols-1',
    'lg:grid-cols-2', 
    'lg:grid-cols-3',
    'lg:grid-cols-4',
    'xl:grid-cols-1',
    'xl:grid-cols-2',
    'xl:grid-cols-3',
    'xl:grid-cols-4',
    '2xl:grid-cols-1',
    '2xl:grid-cols-2',
    '2xl:grid-cols-3',
    '2xl:grid-cols-4'
  ],
  theme: { 
    extend: {
      fontFamily: {
        sans: ['Poppins', 'sans-serif'],
      },
      gridTemplateColumns: {
        '70/30': '70% 28%',
      },
    }
  },
  plugins: []
} satisfies Config
