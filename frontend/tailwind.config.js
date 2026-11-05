/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: '#2563EB',
        background: '#FFFFFF',
        secondaryBg: '#F8F9FA',
        success: '#16A34A',
        warning: '#F59E0B',
        error: '#DC2626',
        border: '#E5E7EB',
        textPrimary: '#111827',
        textSecondary: '#6B7280',
      },
      fontFamily: {
        sans: ['Inter', 'Poppins', 'Roboto', 'sans-serif'],
      }
    },
  },
  plugins: [],
}

