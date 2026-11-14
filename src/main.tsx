import { createRoot } from 'react-dom/client'
// The one display face, served from here (no third-party request): Fraunces, OFL.
import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/fraunces/full-italic.css'
import { Root } from './Root'

createRoot(document.getElementById('root')!).render(<Root />)
