import { useState, useRef, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Search, Bell, ChevronDown, Menu, User, KeyRound, LogOut,
  CheckCheck, Calendar, Clock, AlertCircle, XCircle,
} from 'lucide-react'
import { useAuthStore } from '../../store/authStore'
import { ROLE_LABELS } from '../../config/permissions'
import IconButton from '../ui/IconButton'
import Avatar from '../ui/Avatar'
import {
  fetchUserNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
  type InAppNotification,
} from '../../services/notificationService'

function getNotificationVisuals(type: InAppNotification['type']) {
  switch (type) {
    case 'approved':
    case 'confirmed':
      return { icon: <CheckCheck size={14} />, color: 'var(--color-emerald)' }
    case 'reminder':
      return { icon: <Clock size={14} />, color: 'var(--color-info)' }
    case 'info':
      return { icon: <AlertCircle size={14} />, color: 'var(--color-amber)' }
    case 'cancelled':
    case 'rejected':
      return { icon: <XCircle size={14} />, color: 'var(--color-danger)' }
    case 'submitted':
    default:
      return { icon: <Calendar size={14} />, color: 'var(--color-emerald)' }
  }
}

interface NavbarProps {
  onMenuClick: () => void
}

// ─── Navbar (top header) ──────────────────────────────────────────────────────
// 72px ivory sticky bar: menu toggle + search on the left, notifications bell
// and user menu on the right.
export default function Navbar({ onMenuClick }: NavbarProps) {
  const navigate = useNavigate()
  const user   = useAuthStore(s => s.user)
  const logout = useAuthStore(s => s.logout)
  const [searchValue, setSearchValue] = useState('')
  const [notifOpen, setNotifOpen] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [notifications, setNotifications] = useState<InAppNotification[]>([])

  const notifRef = useRef<HTMLDivElement>(null)
  const profileRef = useRef<HTMLDivElement>(null)

  const unreadCount = notifications.filter(n => !n.read).length

  function handleSignOut() {
    logout()
    navigate('/login', { replace: true })
  }

  const refreshNotifications = useCallback(async () => {
    if (!user) {
      setNotifications([])
      return
    }
    try {
      const items = await fetchUserNotifications(user)
      setNotifications(items)
    } catch {
      setNotifications([])
    }
  }, [user?.id, user?.role, user?.name])

  useEffect(() => {
    refreshNotifications()
    const interval = setInterval(refreshNotifications, 20_000)
    const handleUpdate = () => { refreshNotifications() }
    window.addEventListener('portal_appointments_updated', handleUpdate)
    window.addEventListener('storage', handleUpdate)
    return () => {
      clearInterval(interval)
      window.removeEventListener('portal_appointments_updated', handleUpdate)
      window.removeEventListener('storage', handleUpdate)
    }
  }, [refreshNotifications])

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false)
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false)
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const markAllRead = () => {
    if (!user) return
    markAllNotificationsAsRead(user.id, notifications.map(n => n.id))
    setNotifications(prev => prev.map(n => ({ ...n, read: true })))
  }

  const handleNotificationClick = (n: InAppNotification) => {
    if (user) {
      markNotificationAsRead(user.id, n.id)
      setNotifications(prev => prev.map(item => item.id === n.id ? { ...item, read: true } : item))
    }
    if (n.appointmentId) {
      setNotifOpen(false)
      navigate(`/appointments/${n.appointmentId}`)
    }
  }

  const [mobileSearchOpen, setMobileSearchOpen] = useState(false)
  const mobileSearchInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (mobileSearchOpen) {
      mobileSearchInputRef.current?.focus()
    }
  }, [mobileSearchOpen])

  return (
    <>
      <header
        className="navbar-header"
        style={{
          position: 'sticky', top: 0, zIndex: 30,
          height: '72px', flexShrink: 0,
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          backgroundColor: 'var(--color-ivory)',
          borderBottom: '1px solid var(--color-sage)',
          width: '100%', maxWidth: '100vw', boxSizing: 'border-box',
        }}
      >
        {/* Menu toggle (collapse on desktop, drawer on mobile) */}
        <IconButton aria-label="Toggle navigation" onClick={onMenuClick}>
          <Menu size={20} aria-hidden="true" />
        </IconButton>

        {/* Desktop Search (>= 640px) */}
        <div className="navbar-search-desktop" style={{ flex: 1, maxWidth: '560px', minWidth: 0, position: 'relative' }}>
          <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%',
            transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
          <input
            type="text"
            value={searchValue}
            onChange={e => setSearchValue(e.target.value)}
            placeholder="Search by appointment ID, name or authority"
            className="input"
            style={{ paddingLeft: '2.25rem', fontSize: 'var(--text-sm)', width: '100%' }}
            aria-label="Search"
          />
        </div>

        {/* Right cluster */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'auto', flexShrink: 0 }}>
          {/* Mobile search toggle (< 640px) */}
          <div className="navbar-search-toggle-btn">
            <IconButton
              aria-label={mobileSearchOpen ? 'Close search' : 'Open search'}
              onClick={() => setMobileSearchOpen(o => !o)}
              style={{ color: mobileSearchOpen ? 'var(--color-emerald)' : 'var(--color-charcoal)' }}
            >
              <Search size={20} aria-hidden="true" />
            </IconButton>
          </div>

          {/* Notifications */}
          <div style={{ position: 'relative' }} ref={notifRef}>
            <IconButton
              aria-label={`Notifications${unreadCount > 0 ? `, ${unreadCount} unread` : ''}`}
              onClick={() => { setNotifOpen(o => !o); setProfileOpen(false) }}
              style={{ position: 'relative' }}
            >
              <Bell size={20} aria-hidden="true" />
              {unreadCount > 0 && (
                <span aria-hidden="true" className="tnum" style={{ position: 'absolute', top: '6px', right: '6px',
                  minWidth: '16px', height: '16px', borderRadius: '8px', backgroundColor: 'var(--color-danger)',
                  color: '#ffffff', fontSize: '11px', fontFamily: 'var(--font-sans)', fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px', lineHeight: 1,
                  border: '1.5px solid var(--color-ivory)' }}>
                  {unreadCount}
                </span>
              )}
            </IconButton>

            {notifOpen && (
              <div
                style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                  width: 'min(320px, calc(100vw - 24px))',
                  maxWidth: 'calc(100vw - 24px)',
                  backgroundColor: 'var(--color-ivory)', border: '1px solid var(--color-sage)',
                  borderRadius: 'var(--radius-lg)', boxShadow: 'var(--elevation-2)', overflow: 'hidden', zIndex: 50,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '12px 16px', borderBottom: '1px solid var(--color-sage)' }}>
                  <h3 style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-sm)', fontWeight: 600, color: 'var(--color-charcoal)', margin: 0 }}>
                    Notifications
                  </h3>
                  {unreadCount > 0 && (
                    <button onClick={markAllRead} className="btn-ghost btn-sm" style={{ fontSize: 'var(--text-xs)', padding: '2px 8px' }}>
                      Mark all read
                    </button>
                  )}
                </div>
                <div style={{ maxHeight: '288px', overflowY: 'auto' }}>
                  {notifications.length === 0 ? (
                    <div style={{ padding: '24px 16px', textAlign: 'center' }}>
                      <div
                        aria-hidden="true"
                        style={{
                          width: '36px', height: '36px', borderRadius: '50%',
                          backgroundColor: 'var(--color-sage)',
                          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                          color: 'var(--color-text-secondary)', marginBottom: '8px',
                        }}
                      >
                        <Bell size={18} />
                      </div>
                      <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-charcoal)', margin: 0 }}>
                        No notifications
                      </p>
                      <p style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--color-text-secondary)', margin: '4px 0 0 0', lineHeight: 1.4 }}>
                        You're all caught up. Updates on your appointments will appear here.
                      </p>
                    </div>
                  ) : (
                    notifications.map(n => {
                      const visuals = getNotificationVisuals(n.type)
                      return (
                        <button
                          key={n.id}
                          onClick={() => handleNotificationClick(n)}
                          style={{
                            width: '100%', display: 'flex', gap: 'var(--space-3)', alignItems: 'flex-start',
                            padding: '12px 16px', textAlign: 'left', border: 'none', cursor: 'pointer',
                            borderBottom: '1px solid var(--color-sage)',
                            backgroundColor: n.read ? 'transparent' : 'rgb(15 128 107 / 0.04)',
                          }}
                          onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-cream)')}
                          onMouseLeave={e => (e.currentTarget.style.backgroundColor = n.read ? 'transparent' : 'rgb(15 128 107 / 0.04)')}
                        >
                          <div
                            aria-hidden="true"
                            style={{
                              width: '28px', height: '28px', borderRadius: 'var(--radius-sm)',
                              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '2px',
                              backgroundColor: 'var(--color-sage)', color: visuals.color,
                            }}
                          >
                            {visuals.icon}
                          </div>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '4px' }}>
                              <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 600,
                                color: 'var(--color-charcoal)', margin: 0 }}>{n.title}</p>
                              {!n.read && (
                                <span
                                  style={{
                                    width: '6px', height: '6px', borderRadius: '50%',
                                    backgroundColor: 'var(--color-emerald)', flexShrink: 0,
                                  }}
                                  aria-label="Unread"
                                />
                              )}
                            </div>
                            <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)',
                              color: 'var(--color-text-secondary)', margin: '2px 0 0 0', lineHeight: 1.4 }}>{n.message}</p>
                            <p className="tnum" style={{ fontFamily: 'var(--font-sans)', fontSize: '11px',
                              color: 'var(--color-text-secondary)', margin: '4px 0 0 0' }}>{n.time}</p>
                          </div>
                        </button>
                      )
                    })
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Divider */}
          <div className="navbar-divider" style={{ width: '1px', height: '24px', backgroundColor: 'var(--color-sage)', margin: '0 var(--space-1)' }} />

          {/* User menu */}
          <div style={{ position: 'relative' }} ref={profileRef}>
            <button
              onClick={() => { setProfileOpen(o => !o); setNotifOpen(false) }}
              aria-label="User menu"
              aria-expanded={profileOpen}
              style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: '6px 8px',
                borderRadius: 'var(--radius-md)', background: 'transparent', border: 'none', cursor: 'pointer',
                transition: 'background-color var(--motion-fast) var(--ease-out)' }}
              onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-sage)')}
              onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
            >
              <Avatar name={user?.name ?? 'AU'} size={28} />
              <div style={{ textAlign: 'left' }} className="navbar-user-text">
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 600,
                  color: 'var(--color-charcoal)', margin: 0, lineHeight: 1.3 }}>
                  {user?.name ?? 'Signed out'}
                </p>
                <p style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--color-text-secondary)', margin: 0 }}>
                  {user ? ROLE_LABELS[user.role] : ''}
                </p>
              </div>
              <ChevronDown size={14} aria-hidden="true" className="navbar-user-chevron" style={{ color: 'var(--color-text-secondary)',
                transform: profileOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform var(--motion-slow) var(--ease-out)' }} />
            </button>

            {profileOpen && (
              <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 8px)',
                width: 'min(200px, calc(100vw - 24px))', maxWidth: 'calc(100vw - 24px)',
                backgroundColor: 'var(--color-ivory)', border: '1px solid var(--color-sage)',
                borderRadius: 'var(--radius-lg)', boxShadow: 'var(--elevation-2)', overflow: 'hidden', zIndex: 50 }}>
                <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--color-sage)' }}>
                  <p style={{ fontFamily: 'var(--font-sans)', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--color-charcoal)', margin: 0 }}>
                    {user?.name ?? 'Signed out'}
                  </p>
                  <p className="tnum" style={{ fontFamily: 'var(--font-sans)', fontSize: '11px', color: 'var(--color-text-secondary)', margin: '2px 0 0 0' }}>
                    {user?.employeeId ?? ''}
                  </p>
                </div>
                {[
                  { icon: <User size={14} />, label: 'My profile', path: '/settings' },
                  { icon: <KeyRound size={14} />, label: 'Change password', path: '/settings' },
                ].map(item => (
                  <button key={item.label} onClick={() => { navigate(item.path); setProfileOpen(false) }}
                    style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px',
                      textAlign: 'left', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-sans)',
                      color: 'var(--color-charcoal)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--color-cream)')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>{item.icon}</span>
                    {item.label}
                  </button>
                ))}
                <div style={{ borderTop: '1px solid var(--color-sage)' }} />
                <button onClick={() => { setProfileOpen(false); handleSignOut() }}
                  style={{ width: '100%', display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 16px',
                    textAlign: 'left', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-sans)',
                    color: 'var(--color-danger)', background: 'transparent', border: 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#fce8e6')}
                  onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}>
                  <LogOut size={14} aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Expandable Mobile Search Row (< 640px) */}
      {mobileSearchOpen && (
        <div
          className="navbar-mobile-search-row"
          style={{
            position: 'sticky', top: '72px', zIndex: 29,
            padding: '8px 16px 12px 16px',
            backgroundColor: 'var(--color-ivory)',
            borderBottom: '1px solid var(--color-sage)',
            width: '100%', boxSizing: 'border-box',
          }}
        >
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={16} aria-hidden="true" style={{ position: 'absolute', left: '12px', top: '50%',
              transform: 'translateY(-50%)', color: 'var(--color-text-secondary)', pointerEvents: 'none' }} />
            <input
              ref={mobileSearchInputRef}
              type="text"
              value={searchValue}
              onChange={e => setSearchValue(e.target.value)}
              placeholder="Search appointments, IDs..."
              className="input"
              style={{ paddingLeft: '2.25rem', fontSize: 'var(--text-sm)', width: '100%' }}
              aria-label="Search mobile"
            />
          </div>
        </div>
      )}

      <style>{`
        .navbar-header {
          padding: 0 var(--space-4);
        }
        .navbar-search-toggle-btn {
          display: none;
        }
        @media (max-width: 768px) {
          .navbar-user-text { display: none; }
        }
        @media (max-width: 640px) {
          .navbar-header {
            padding: 0 var(--space-3);
          }
          .navbar-search-desktop {
            display: none !important;
          }
          .navbar-search-toggle-btn {
            display: flex;
          }
          .navbar-user-chevron {
            display: none;
          }
          .navbar-divider {
            display: none;
          }
        }
      `}</style>
    </>
  )
}
