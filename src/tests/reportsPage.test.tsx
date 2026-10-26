import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import '@testing-library/jest-dom/vitest'
import { axe } from 'vitest-axe'
import * as matchers from 'vitest-axe/matchers'
import { expect as vexpect } from 'vitest'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import Reports from '../pages/Reports'
import * as reportsHooks from '../hooks/useReports'
import { useAuthStore } from '../store/authStore'
import type { ReportSummary } from '../data/reportTypes'

vexpect.extend(matchers)

const mockSummary: ReportSummary = {
  total: 5,
  completedCount: 2,
  rejectedCount: 1,
  notReportedCount: 1,
  statusBreakdown: [
    { status: 'completed', label: 'Completed', count: 2 },
    { status: 'approved', label: 'Approved', count: 1 },
    { status: 'rejected', label: 'Rejected', count: 1 },
    { status: 'not-reported', label: 'Not reported', count: 1 },
  ],
  byDepartment: [
    { key: 'academic', label: 'Academic Affairs', count: 3 },
    { key: 'finance', label: 'Finance', count: 2 },
  ],
  byAuthority: [
    { key: 'auth-ss', label: 'Prof. Sneha Shah', count: 3 },
    { key: 'auth-pd', label: 'Ms. Priya Desai', count: 2 },
  ],
  byType: [
    { key: 'acad', label: 'Academic Consultation', count: 3 },
    { key: 'fin', label: 'Fee Clearance', count: 2 },
  ],
  dailyVolume: [
    { date: '2026-10-01', count: 2 },
    { date: '2026-10-02', count: 3 },
  ],
  completionRate: 0.4,
  rejectionRate: 0.2,
  noShowRate: 0.2,
  avgTurnaroundHours: 3.5,
  medianTurnaroundHours: 3.0,
  decidedCount: 3,
}

function renderReports(initialUrl = '/reports') {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
    },
  })
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[initialUrl]}>
        <Reports />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('Reports page — frontend states and accessibility', () => {
  beforeEach(() => {
    useAuthStore.setState({
      user: {
        id: 'u-sup',
        name: 'Super Admin',
        role: 'super_admin',
        department: 'MIS Department',
        employeeId: 'PU-2010-000',
      },
    })
    vi.restoreAllMocks()
  })

  it('renders header with Print, Export CSV, and last updated time', () => {
    vi.spyOn(reportsHooks, 'useReportOverview').mockReturnValue({
      data: mockSummary,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any)

    renderReports()

    expect(screen.getByRole('heading', { level: 1, name: 'Reports' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /print/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument()
    expect(screen.getByText(/showing 5 appointments from/i)).toBeInTheDocument()
    expect(screen.getByText(/last updated/i)).toBeInTheDocument()
  })

  it('disables export and shows tooltip when there are 0 rows', () => {
    const emptySummary: ReportSummary = {
      ...mockSummary,
      total: 0,
      completedCount: 0,
      rejectedCount: 0,
      notReportedCount: 0,
      statusBreakdown: [],
      byDepartment: [],
      byAuthority: [],
      byType: [],
      dailyVolume: [],
    }

    vi.spyOn(reportsHooks, 'useReportOverview').mockReturnValue({
      data: emptySummary,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any)

    renderReports()

    const exportBtn = screen.getByRole('button', { name: /export csv/i })
    expect(exportBtn).toBeDisabled()
    expect(exportBtn.closest('div')).toHaveAttribute('title', 'No rows to export')
    expect(screen.getByText('No appointments match the selected filters.')).toBeInTheDocument()
  })

  it('shows skeletons during loading state matching layout', () => {
    vi.spyOn(reportsHooks, 'useReportOverview').mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as any)

    const { container } = renderReports()

    const skeletons = container.querySelectorAll('.ui-skeleton')
    expect(skeletons.length).toBeGreaterThan(0)
  })

  it('shows isolated error card with retry button on failure without blanking page', async () => {
    const mockRefetch = vi.fn()
    vi.spyOn(reportsHooks, 'useReportOverview').mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch: mockRefetch,
    } as any)

    renderReports()

    expect(screen.getByText('Could not load overview report.')).toBeInTheDocument()
    const retryBtn = screen.getByRole('button', { name: /retry/i })
    expect(retryBtn).toBeInTheDocument()

    fireEvent.click(retryBtn)
    expect(mockRefetch).toHaveBeenCalledTimes(1)
  })

  it('renders all 5 tabs and switches active tab', () => {
    vi.spyOn(reportsHooks, 'useReportOverview').mockReturnValue({
      data: mockSummary,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any)

    vi.spyOn(reportsHooks, 'useReportTable').mockReturnValue({
      data: { rows: [], total: 0, page: 1, pageSize: 10 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any)

    renderReports()

    const tabs = screen.getAllByRole('tab')
    expect(tabs).toHaveLength(5)
    expect(tabs[0]).toHaveTextContent('Overview')
    expect(tabs[1]).toHaveTextContent('Appointment register')
    expect(tabs[2]).toHaveTextContent('Pending approvals')
    expect(tabs[3]).toHaveTextContent('Approval turnaround')
    expect(tabs[4]).toHaveTextContent('Rescheduled and cancelled')

    // Switch tab to Appointment register
    fireEvent.click(tabs[1])
    expect(tabs[1]).toHaveAttribute('aria-selected', 'true')
  })

  it('satisfies axe accessibility standards with no detectable violations', async () => {
    vi.spyOn(reportsHooks, 'useReportOverview').mockReturnValue({
      data: mockSummary,
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as any)

    const { container } = renderReports()
    const results = await axe(container)
    expect(results).toHaveNoViolations()
  })
})
