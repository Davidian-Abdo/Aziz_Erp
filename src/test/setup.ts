import '@testing-library/jest-dom/vitest'
// The real i18n bundle must be loaded — test assertions match against actual
// rendered copy, not key echoes. Tests run in French (the fallback) so existing
// string matchers require no change. Arabic/RTL correctness is a browser check
// (Phase 8 exit criterion), not a unit-test concern.
import i18n from '@/i18n'
await i18n.changeLanguage('fr')
