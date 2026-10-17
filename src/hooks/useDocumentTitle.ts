import { useEffect } from 'react'

// Sets the document title to "{page} | Appointment Portal" for the lifetime of
// the mounting component. Pure side-effect; no render output.
export function useDocumentTitle(page: string) {
  useEffect(() => {
    const previous = document.title
    document.title = page ? `${page} | Appointment Portal` : 'Appointment Portal'
    return () => { document.title = previous }
  }, [page])
}
