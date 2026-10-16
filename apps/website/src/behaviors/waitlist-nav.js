// Reuse the existing menu link markup so every page can reach the waitlist.
export function initWaitlistNav() {
  const localWaitlist = new URL('/', window.location.origin)
  localWaitlist.port = '5175'
  const href = import.meta.env.VITE_WAITLIST_URL || (import.meta.env.DEV ? localWaitlist.href : 'https://waitlist.openfutures.xyz/')
  document.querySelectorAll('.framer-3sfwr9-container nav').forEach((nav) => {
    if (nav.querySelector('[data-waitlist-link]')) return
    const source = nav.querySelector('a[href="/contact"]')
    if (!source) return
    const link = source.cloneNode(true)
    link.href = href
    link.dataset.waitlistLink = 'true'
    const labels = link.querySelectorAll('p')
    if (labels[0]) labels[0].textContent = '-- 005.'
    if (labels[1]) labels[1].textContent = 'Waitlist'
    const wrapper = source.parentElement.cloneNode(false)
    wrapper.append(link)
    source.parentElement.parentElement.append(wrapper)
  })
}
