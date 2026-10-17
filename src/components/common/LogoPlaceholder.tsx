// LogoPlaceholder is retained as a thin alias of the canonical Logo so existing
// imports keep working. One logo implementation lives in components/ui/Logo.
import Logo from '../ui/Logo'

export default function LogoPlaceholder() {
  return <Logo size="md" variant="light" />
}
