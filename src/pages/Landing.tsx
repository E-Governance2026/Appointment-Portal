import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Menu, FileText, Bell, ClipboardList, History,
  UserRound, Users, ShieldCheck, Settings2,
} from 'lucide-react'
import Container from '../components/layout/Container'
import Section from '../components/layout/Section'
import MobileNavDrawer from '../components/common/MobileNavDrawer'
import Logo from '../components/ui/Logo'
import Button from '../components/ui/Button'
import { useAuthStore } from '../store/authStore'

// ─── Nav + content data ───────────────────────────────────────────────────────
const NAV_LINKS = [
  { label: 'Home',         href: '#top'     },
  { label: 'How it works', href: '#process' },
  { label: 'About',        href: '#about'   },
  { label: 'Contact',      href: '#contact' },
]

const FEATURES = [
  { icon: <FileText size={20} aria-hidden="true" />,      label: 'Online request form',  desc: 'Submit one request with its details and documents.' },
  { icon: <ClipboardList size={20} aria-hidden="true" />, label: 'Approval tracking',    desc: 'See where each request stands.' },
  { icon: <Bell size={20} aria-hidden="true" />,          label: 'In-app notifications', desc: 'Get an update when the status changes.' },
  { icon: <History size={20} aria-hidden="true" />,       label: 'Appointment history',  desc: 'Review past requests and their timeline.' },
]

const STEPS = [
  { numeral: '1', title: 'Choose type and purpose', description: 'Select the appointment type, then the purpose that applies.' },
  { numeral: '2', title: 'Select an authority',     description: 'Choose from the authorities available for that type.' },
  { numeral: '3', title: 'Pick a date and time',    description: 'Select an available slot. A slot does not confirm the appointment.' },
  { numeral: '4', title: 'Submit and track',        description: 'Submit the request. You are notified when it is approved and confirmed.' },
]

const ROLES_USING = [
  { icon: <UserRound size={18} aria-hidden="true" />,   role: 'Requesters',            desc: 'Staff who submit and track appointment requests.' },
  { icon: <ShieldCheck size={18} aria-hidden="true" />, role: 'Coordinators / Authorities', desc: 'Review requests, approve them and confirm appointments.' },
  { icon: <Users size={18} aria-hidden="true" />,       role: 'Admin dispatchers',     desc: 'Act on assigned requests and record visitor check-in and check-out.' },
  { icon: <Settings2 size={18} aria-hidden="true" />,   role: 'Administrators',        desc: 'Manage departments, authorities and approval rules.' },
]

const CONTACT_ROWS = [
  { term: 'Email',   detail: 'To be confirmed', href: undefined as string | undefined },
  { term: 'Phone',   detail: 'To be confirmed', href: undefined as string | undefined },
  { term: 'Address', detail: 'To be confirmed', href: undefined as string | undefined },
]

const FONT_SANS  = 'var(--font-sans)'
const FONT_SERIF = 'var(--font-serif)'
const SECTION_IDS = ['top', 'process', 'about', 'contact']

export default function Landing() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  const [activeSection, setActiveSection] = useState('top')

  function goLogin() {
    if (user) {
      navigate('/dashboard')
    } else {
      navigate('/login', { state: { returnTo: '/dashboard' } })
    }
  }
  function goTrack() { navigate('/track') }

  const prefersReducedMotion = typeof window !== 'undefined'
    && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

  function handleNavClick(e: React.MouseEvent<HTMLAnchorElement>, href: string) {
    e.preventDefault()
    const behavior: ScrollBehavior = prefersReducedMotion ? 'auto' : 'smooth'
    if (href === '#top') { window.scrollTo({ top: 0, behavior }); return }
    document.getElementById(href.replace('#', ''))?.scrollIntoView({ behavior, block: 'start' })
  }

  // Header border appears after scrolling.
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  // Highlight the section currently in view.
  useEffect(() => {
    const observer = new IntersectionObserver(
      entries => {
        const visible = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)
        if (visible[0]) setActiveSection(visible[0].target.id)
      },
      { rootMargin: '-40% 0px -55% 0px', threshold: [0, 0.25, 0.5, 1] },
    )
    SECTION_IDS.forEach(id => { const el = document.getElementById(id); if (el) observer.observe(el) })
    return () => observer.disconnect()
  }, [])

  return (
    <div
      id="top"
      style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh',
        backgroundColor: 'var(--color-cream)', overflowX: 'hidden', scrollMarginTop: '88px' }}
    >
      {/* Header */}
      <header style={{ position: 'sticky', top: 0, zIndex: 100, height: '72px',
        backgroundColor: 'var(--color-ivory)',
        borderBottom: scrolled ? '1px solid var(--color-sage)' : '1px solid transparent',
        transition: 'border-color var(--motion-fast) var(--ease-out)' }}>
        <Container style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1.5rem' }}>
          <a href="#top" onClick={e => handleNavClick(e, '#top')} aria-label="Appointment Portal home" style={{ display: 'inline-flex' }}>
            <Logo size="md" variant="light" />
          </a>

          <nav aria-label="Primary navigation" className="hidden-mobile" style={{ display: 'flex', alignItems: 'center', gap: '2rem' }}>
            {NAV_LINKS.map(link => {
              const active = activeSection === link.href.replace('#', '')
              return (
                <a key={link.label} href={link.href} onClick={e => handleNavClick(e, link.href)}
                  aria-current={active ? 'true' : undefined}
                  className="landing-nav-link"
                  style={{ fontFamily: FONT_SANS, fontWeight: active ? 600 : 500, fontSize: '16px',
                    color: active ? 'var(--color-emerald)' : 'var(--color-charcoal)', textDecoration: 'none',
                    paddingBottom: '2px', borderBottom: active ? '2px solid var(--color-emerald)' : '2px solid transparent' }}>
                  {link.label}
                </a>
              )
            })}
          </nav>

          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
            <span className="hidden-mobile">
              <Button variant="primary" size="sm" onClick={goLogin}>{user ? 'Dashboard' : 'Login'}</Button>
            </span>
            <button className="show-mobile" onClick={() => setDrawerOpen(true)}
              aria-label="Open navigation menu" aria-expanded={drawerOpen}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '44px', height: '44px',
                borderRadius: 'var(--radius-md)', backgroundColor: 'transparent', border: '1px solid var(--color-sage)',
                color: 'var(--color-charcoal)', cursor: 'pointer' }}>
              <Menu size={20} aria-hidden="true" />
            </button>
          </div>
        </Container>
      </header>

      <MobileNavDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} links={NAV_LINKS} onLoginClick={goLogin} />

      {/* Hero */}
      <Section>
        <Container>
          <div className="hero-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '3rem', alignItems: 'center', overflow: 'hidden' }}>
            <div>
              <h1 style={{ fontFamily: FONT_SERIF, fontWeight: 600, fontSize: 'clamp(2rem, 4vw, 3rem)',
                lineHeight: 1.17, color: 'var(--color-charcoal)', margin: '0 0 1.25rem 0', textWrap: 'balance' }}>
                Request an appointment with university authorities
              </h1>
              <p style={{ fontFamily: FONT_SANS, fontSize: '18px', lineHeight: '30px',
                color: 'var(--color-text-secondary)', margin: '0 0 2rem 0', maxWidth: '520px' }}>
                Choose an appointment type, select an authority and a time, and track your request until it is confirmed.
              </p>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', alignItems: 'center' }}>
                <Button variant="primary" size="lg" onClick={goLogin}>Book appointment</Button>
                <Button variant="secondary" size="lg" onClick={goTrack}>Track appointment</Button>
              </div>
            </div>

            <div className="hero-image" style={{ flex: '0 0 auto', width: '45%', minWidth: '280px', maxWidth: '480px', borderRadius: '12px', overflow: 'hidden', backgroundColor: '#EBF4F0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src="/images/campus-naac.jpg"
                alt="Parul University — India's youngest NAAC A++ accredited university"
                style={{ width: '100%', height: 'auto', display: 'block', objectFit: 'contain' }}
              />
            </div>
          </div>
        </Container>
      </Section>

      {/* Features */}
      <div style={{ borderTop: '1px solid var(--color-sage)', borderBottom: '1px solid var(--color-sage)',
        backgroundColor: 'var(--color-ivory)', paddingTop: '2.5rem', paddingBottom: '2.5rem' }}>
        <Container>
          <ul role="list" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '1.5rem', margin: 0, padding: 0, listStyle: 'none' }}>
            {FEATURES.map(feat => (
              <li key={feat.label} style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                <span aria-hidden="true" style={{ width: '40px', height: '40px', borderRadius: 'var(--radius-md)',
                  backgroundColor: '#DCEFE9', color: 'var(--color-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {feat.icon}
                </span>
                <span style={{ fontFamily: FONT_SANS, fontWeight: 600, fontSize: '16px', color: 'var(--color-charcoal)', lineHeight: 1.4 }}>
                  {feat.label}
                </span>
                <span style={{ fontFamily: FONT_SANS, fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>
                  {feat.desc}
                </span>
              </li>
            ))}
          </ul>
        </Container>
      </div>

      {/* How it works */}
      <Section id="process" style={{ scrollMarginTop: '88px' }}>
        <Container>
          <h2 style={sectionHeading}>How it works</h2>
          <p style={{ ...sectionLead, margin: '0 0 2.5rem 0' }}>Four steps from request to confirmation.</p>

          <ul role="list" className="steps-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
            gap: '1.25rem', margin: 0, padding: 0, listStyle: 'none', alignItems: 'stretch' }}>
            {STEPS.map((step, i) => (
              <li key={step.numeral} className="step-card" style={{ position: 'relative', backgroundColor: 'var(--color-ivory)',
                border: '1px solid var(--color-sage)', borderRadius: '12px', padding: '24px',
                display: 'flex', flexDirection: 'column', gap: '0.75rem', height: '100%' }}>
                {/* Connector line to the next numeral (desktop only). */}
                {i < STEPS.length - 1 && (
                  <span aria-hidden="true" className="step-connector" style={{ position: 'absolute', top: '40px',
                    left: 'calc(100% + 1px)', width: '1.25rem', height: '1px', backgroundColor: 'var(--color-sage)' }} />
                )}
                <span aria-hidden="true" className="tnum" style={{ fontFamily: FONT_SERIF, fontWeight: 600, fontSize: '32px',
                  color: 'var(--color-emerald)', lineHeight: 1 }}>
                  {step.numeral}
                </span>
                <h3 style={{ fontFamily: FONT_SERIF, fontWeight: 600, fontSize: '20px', color: 'var(--color-charcoal)', margin: 0, lineHeight: 1.25 }}>
                  {step.title}
                </h3>
                <p style={{ fontFamily: FONT_SANS, fontSize: '16px', color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.6 }}>
                  {step.description}
                </p>
              </li>
            ))}
          </ul>
        </Container>
      </Section>

      {/* About */}
      <Section id="about" style={{ backgroundColor: 'var(--color-ivory)', borderTop: '1px solid var(--color-sage)',
        borderBottom: '1px solid var(--color-sage)', scrollMarginTop: '88px' }}>
        <Container>
          <div className="about-grid" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '3rem', alignItems: 'center' }}>
            <div>
              <h2 style={{ ...sectionHeading, margin: '0 0 1.25rem 0' }}>About Appointment Portal</h2>
              <p style={{ fontFamily: FONT_SANS, fontSize: '16px', lineHeight: 1.75, color: 'var(--color-text-secondary)', maxWidth: '60ch', margin: '0 0 2rem 0' }}>
                Appointment Portal is the departmental system for requesting appointments with university authorities.
                Each request follows the approval workflow set by the department.
              </p>
              <div style={{ backgroundColor: 'var(--color-cream)', border: '1px solid var(--color-sage)', borderRadius: '12px', padding: '24px' }}>
                <h3 style={{ fontFamily: FONT_SERIF, fontWeight: 600, fontSize: '18px', color: 'var(--color-charcoal)', margin: '0 0 1rem 0' }}>
                  Who uses the portal
                </h3>
                <ul role="list" style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', margin: 0, padding: 0, listStyle: 'none' }}>
                  {ROLES_USING.map(r => (
                    <li key={r.role} style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                      <span aria-hidden="true" style={{ width: '32px', height: '32px', flexShrink: 0, borderRadius: 'var(--radius-md)',
                        backgroundColor: '#DCEFE9', color: 'var(--color-emerald)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        {r.icon}
                      </span>
                      <span>
                        <span style={{ display: 'block', fontFamily: FONT_SANS, fontWeight: 600, fontSize: '15px', color: 'var(--color-charcoal)' }}>{r.role}</span>
                        <span style={{ display: 'block', fontFamily: FONT_SANS, fontSize: '14px', color: 'var(--color-text-secondary)', lineHeight: 1.5 }}>{r.desc}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Right column: full-bleed accredited campus photo */}
            <div style={{ borderRadius: '16px', overflow: 'hidden', width: '100%' }}>
              <img
                src="/images/campus-accredited.jpg"
                alt="Parul University — India's youngest NAAC A++ accredited university"
                style={{ width: '100%', height: 'auto', objectFit: 'cover', display: 'block', aspectRatio: '4 / 3' }}
              />
            </div>
          </div>
        </Container>
      </Section>

      {/* Contact */}
      <Section id="contact" style={{ scrollMarginTop: '88px', paddingBottom: 0 }}>
        <Container>
          <h2 style={{ ...sectionHeading, margin: '0 0 1rem 0' }}>Contact</h2>
          <p style={{ ...sectionLead, margin: '0 0 1.75rem 0' }}>Contact details are to be confirmed by the university.</p>

          <dl style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', margin: 0 }}>
            {CONTACT_ROWS.map(row => (
              <div key={row.term} style={{ display: 'grid', gridTemplateColumns: '100px 1fr', gap: '0.5rem',
                padding: '0.75rem 1rem', backgroundColor: 'var(--color-ivory)', border: '1px solid var(--color-sage)', borderRadius: 'var(--radius-lg)' }}>
                <dt style={{ fontFamily: FONT_SANS, fontWeight: 600, fontSize: '15px', color: 'var(--color-charcoal)' }}>{row.term}</dt>
                <dd style={{ fontFamily: FONT_SANS, fontSize: '15px', color: 'var(--color-text-secondary)', margin: 0 }}>
                  {row.href ? <a href={row.href} style={{ color: 'var(--color-emerald)' }}>{row.detail}</a> : row.detail}
                </dd>
              </div>
            ))}
          </dl>
        </Container>
      </Section>

      {/* CTA band — exactly one standard section's spacing above */}
      <div style={{ paddingTop: 'clamp(4rem, 8vw, 6rem)', backgroundColor: 'var(--color-cream)' }}>
        <div style={{ backgroundColor: 'var(--color-forest)', paddingTop: '72px', paddingBottom: '72px' }}>
          <Container>
            <div className="cta-band" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '2rem' }}>
              <div style={{ flex: '1 1 320px', minWidth: 0 }}>
                <h2 style={{ fontFamily: FONT_SERIF, fontWeight: 600, fontSize: 'clamp(1.375rem, 3vw, 1.75rem)', color: '#ffffff', margin: '0 0 0.5rem 0', lineHeight: 1.25 }}>
                  Ready to request an appointment?
                </h2>
                <p style={{ fontFamily: FONT_SANS, fontSize: '16px', color: 'rgb(255 255 255 / 0.85)', margin: 0, lineHeight: 1.6 }}>
                  Log in with your university account to start a request.
                </p>
              </div>
              <div className="cta-buttons" style={{ display: 'flex', flexWrap: 'wrap', gap: '0.875rem', flexShrink: 0 }}>
                <Button variant="accent" size="md" onDark onClick={goLogin}>Book appointment</Button>
                <button onClick={goTrack} className="on-dark" style={{ fontFamily: FONT_SANS, fontWeight: 600, fontSize: '1rem',
                  minHeight: '44px', padding: '0 1.375rem', backgroundColor: 'transparent', color: '#ffffff',
                  border: '1.5px solid #ffffff', borderRadius: 'var(--radius-md)', cursor: 'pointer',
                  transition: 'background-color var(--motion-fast) var(--ease-out)' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'rgb(255 255 255 / 0.1)')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  Track appointment
                </button>
              </div>
            </div>
          </Container>
        </div>
      </div>

      {/* Footer */}
      <footer style={{ marginTop: 'auto', backgroundColor: 'var(--color-charcoal)', paddingTop: '40px', paddingBottom: '40px' }}>
        <Container style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
          <p style={{ fontFamily: FONT_SANS, fontSize: '14px', color: 'rgb(255 255 255 / 0.65)', margin: 0 }}>
            {'\u00A9 2026 Parul University, MIS Department. All rights reserved.'}
          </p>
          <nav aria-label="Footer navigation">
            <ul style={{ display: 'flex', flexWrap: 'wrap', gap: '1.5rem', margin: 0, padding: 0, listStyle: 'none' }}>
              {NAV_LINKS.map(link => (
                <li key={link.label}>
                  <a href={link.href} onClick={e => handleNavClick(e, link.href)} className="landing-footer-link"
                    style={{ fontFamily: FONT_SANS, fontSize: '14px', color: 'rgb(255 255 255 / 0.65)', textDecoration: 'none' }}>
                    {link.label}
                  </a>
                </li>
              ))}
              <li>
                <a href="/login" onClick={e => { e.preventDefault(); goLogin() }} className="landing-footer-link"
                  style={{ fontFamily: FONT_SANS, fontSize: '14px', color: 'rgb(255 255 255 / 0.65)', textDecoration: 'none' }}>
                  Login
                </a>
              </li>
            </ul>
          </nav>
        </Container>
      </footer>

      <style>{`
        @media (max-width: 767px) {
          .hidden-mobile { display: none !important; }
          .show-mobile   { display: flex !important; }
          .hero-grid     { grid-template-columns: 1fr !important; }
          .hero-image    { order: 2; }
          .about-grid    { grid-template-columns: 1fr !important; }
          .step-connector { display: none !important; }
        }
        @media (min-width: 768px) {
          .hidden-mobile { display: flex !important; }
          .show-mobile   { display: none !important; }
        }
        .landing-nav-link:hover { color: var(--color-emerald) !important; }
        .landing-footer-link:hover { color: #ffffff !important; }
      `}</style>
    </div>
  )
}

const sectionHeading: React.CSSProperties = {
  fontFamily: FONT_SERIF, fontWeight: 600, fontSize: 'clamp(1.5rem, 3vw, 2rem)',
  color: 'var(--color-charcoal)', margin: '0 0 0.5rem 0',
}
const sectionLead: React.CSSProperties = {
  fontFamily: FONT_SANS, fontSize: '16px', color: 'var(--color-text-secondary)', lineHeight: 1.6,
}
