import { useNavigate } from 'react-router-dom'
import { useDashboardStats, useTodaysAppointments } from '../../hooks/useDashboard'
import { useAuthStore } from '../../store/authStore'
import type { Role } from '../../config/permissions'
import Button from '../ui/Button'
import Skeleton from '../ui/Skeleton'

function firstNameOf(name: string): string {
  return name.trim().split(/\s+/)[0] ?? ''
}

function greeting(): string {
  const h = new Date().getHours()
  return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'
}

function longDate(): string {
  return new Date().toLocaleDateString('en-IN', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  })
}

function fmtTime(hhmm: string): string {
  const [h, m] = hhmm.split(':').map(Number)
  const suffix = h >= 12 ? 'PM' : 'AM'
  const h12 = h % 12 === 0 ? 12 : h % 12
  return `${h12}:${String(m).padStart(2, '0')} ${suffix}`
}

// Role-aware waiting line. n comes from the scoped summary; never invented.
function waitingLine(role: Role, n: number): string {
  if (n === 0) return 'Nothing is waiting for you.'
  const plural = n === 1 ? '' : 's'
  switch (role) {
    case 'requester':
      return `${n} of your request${plural} ${n === 1 ? 'is' : 'are'} awaiting approval.`
    case 'coordinator_authority':
    case 'admin_dispatcher':
      return `${n} request${plural} ${n === 1 ? 'is' : 'are'} waiting for your decision.`
    case 'super_admin':
      return `${n} request${plural} ${n === 1 ? 'is' : 'are'} waiting for approval across departments.`
    default:
      return 'Nothing is waiting for you.'
  }
}

// ─── HeroBanner ───────────────────────────────────────────────────────────────
export default function HeroBanner() {
  const navigate = useNavigate()
  const user = useAuthStore(s => s.user)
  const role = user?.role ?? 'requester'

  const { data: stats, isLoading: statsLoading } = useDashboardStats()
  const { data: todayApts = [] } = useTodaysAppointments()

  // Everyone counts what is awaiting approval in their scope.
  const n = stats?.awaitingApproval ?? 0

  // Next appointment later than now, confirmed or approved, in the viewer's scope.
  const now = new Date()
  const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const nextApt = todayApts
    .filter(a => (a.status === 'confirmed' || a.status === 'approved') && a.time > nowHHMM)
    .sort((a, b) => a.time.localeCompare(b.time))[0] ?? null

  // Staff care about the requester; a requester cares about the authority.
  const nextPerson = role === 'requester' ? nextApt?.authority : nextApt?.requester

  return (
    <div className="hero-banner">
      {/* Left */}
      <div className="hero-content">
        <p className="tnum" style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
          color: 'rgb(255 255 255 / 0.7)', margin: 0 }}>
          {longDate()}
        </p>
        <h1 className="hero-title">
          {greeting()}, {firstNameOf(user?.name ?? '')}
        </h1>
        {statsLoading ? (
          <Skeleton width="260px" height={18} style={{ backgroundColor: 'rgb(255 255 255 / 0.2)' }} />
        ) : (
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
            color: 'rgb(255 255 255 / 0.78)', margin: 0 }}>
            {waitingLine(role, n)}
          </p>
        )}
      </div>

      {/* Right: next appointment card */}
      <div className="hero-next-card">
        <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)',
          color: 'var(--color-text-secondary)', margin: 0 }}>
          Next appointment
        </p>

        {nextApt ? (
          <>
            <p className="tnum" style={{ fontFamily: 'var(--font-serif)', fontWeight: 600,
              fontSize: 'var(--text-2xl)', color: 'var(--color-charcoal)', margin: 0, lineHeight: 1.2 }}>
              {fmtTime(nextApt.time)}
            </p>
            <p style={{ fontFamily: 'var(--font-sans)', fontWeight: 600, fontSize: 'var(--text-base)',
              color: 'var(--color-charcoal)', margin: 0, lineHeight: 1.4 }}>
              {nextPerson}
            </p>
            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
              color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.4 }}>
              {nextApt.appointmentType}
            </p>
            <Button variant="secondary" size="sm" style={{ alignSelf: 'flex-start', marginTop: 'var(--space-1)' }}
              onClick={() => navigate(`/my-appointments/${nextApt.id}`)}>
              View details
            </Button>
          </>
        ) : (
          <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)',
            color: 'var(--color-text-secondary)', margin: 0, lineHeight: 1.5 }}>
            No upcoming appointments today.
          </p>
        )}
      </div>

      <style>{`
        .hero-banner {
          background-color: var(--color-forest);
          border-radius: var(--radius-xl);
          min-height: 128px;
          padding: var(--space-4);
          display: flex;
          flex-direction: column;
          align-items: stretch;
          gap: var(--space-4);
          width: 100%;
          box-sizing: border-box;
          min-width: 0;
        }
        .hero-content {
          flex: 1;
          min-width: 0;
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
        }
        .hero-title {
          font-family: var(--font-serif);
          font-weight: 600;
          font-size: clamp(1.4rem, 4.5vw, var(--text-4xl));
          line-height: 1.25;
          color: #ffffff;
          margin: 0;
          text-wrap: balance;
          word-break: break-word;
        }
        .hero-next-card {
          width: 100%;
          min-width: 0;
          background-color: var(--color-ivory);
          border-radius: var(--radius-lg);
          border: 1px solid var(--color-sage);
          padding: var(--space-4);
          display: flex;
          flex-direction: column;
          gap: var(--space-2);
          box-sizing: border-box;
        }
        @media (min-width: 768px) {
          .hero-banner {
            flex-direction: row;
            align-items: center;
            justify-content: space-between;
            padding: 28px 32px;
            gap: var(--space-6);
          }
          .hero-next-card {
            width: auto;
            min-width: 280px;
            max-width: 340px;
            flex-shrink: 0;
          }
        }
      `}</style>
    </div>
  )
}
