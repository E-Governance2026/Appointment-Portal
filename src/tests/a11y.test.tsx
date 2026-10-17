import { describe, it, expect, afterEach } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { axe } from 'vitest-axe'
import * as matchers from 'vitest-axe/matchers'
import { expect as vexpect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Landing from '../pages/Landing'
import Login from '../pages/Login'
import Layout from '../components/layout/Layout'
import { Routes, Route } from 'react-router-dom'
import { ToastProvider } from '../components/ui/Toast'

vexpect.extend(matchers)

function withProviders(ui: React.ReactNode, initialPath = '/') {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <ToastProvider>
        <MemoryRouter initialEntries={[initialPath]}>{ui}</MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  )
}

afterEach(() => cleanup())

describe('accessibility (axe)', () => {
  it('landing page has no detectable violations', async () => {
    const { container } = withProviders(<Landing />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('login page has no detectable violations', async () => {
    const { container } = withProviders(<Login />)
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })

  it('dashboard shell (layout chrome) has no detectable violations', async () => {
    // Render the authenticated shell with an empty content route so we exercise
    // the sidebar + header chrome without a page's data dependencies.
    const { container } = withProviders(
      <Routes>
        <Route element={<Layout />}>
          <Route path="/dashboard" element={<div><h1>Dashboard</h1></div>} />
        </Route>
      </Routes>,
      '/dashboard',
    )
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
