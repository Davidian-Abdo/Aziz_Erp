import '@testing-library/jest-dom/vitest'
// The UI is French-only (plan §1.2, Q4), and asserting on rendered copy means
// the real bundle has to be loaded, not a stub that echoes keys back.
import '@/i18n'
