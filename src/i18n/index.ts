import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { ar } from './ar'
import { fr } from './fr'

/*
 * i18next with `ar` as the active language (Phase 8). `fr` is kept in resources
 * as a fallback so any untranslated key degrades to French rather than showing
 * the raw key. No language detector: this app has one active language.
 */
void i18n.use(initReactI18next).init({
  resources: { ar, fr },
  lng: 'ar',
  fallbackLng: 'fr',
  interpolation: {
    // React escapes for us.
    escapeValue: false,
  },
})

export default i18n
