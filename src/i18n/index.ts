import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import { fr } from './fr'

/*
 * i18next with `fr` only (plan §1.2, Q4). No language detector: v1.0 has one
 * language, and a detector would only introduce a way for the app to come up in
 * a language that has no strings.
 */
void i18n.use(initReactI18next).init({
  resources: { fr },
  lng: 'fr',
  fallbackLng: 'fr',
  interpolation: {
    // React escapes for us.
    escapeValue: false,
  },
})

export default i18n
