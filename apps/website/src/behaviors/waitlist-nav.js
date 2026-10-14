// Reuse the existing menu link markup so every page can reach the waitlist.
export function initWaitlistNav() {
  document.querySelectorAll('.framer-3sfwr9-container nav').forEach((nav) => {
    if (nav.querySelector('a[href="/waitlist"]')) return
    const source = nav.querySelector('a[href="/contact"]')
    if (!source) return
    const link = source.cloneNode(true)
    link.href = '/waitlist'
    const labels = link.querySelectorAll('p')
    if (labels[0]) labels[0].textContent = '-- 005.'
    if (labels[1]) labels[1].textContent = 'Waitlist'
    const wrapper = source.parentElement.cloneNode(false)
    wrapper.append(link)
    source.parentElement.parentElement.append(wrapper)
    if (document.body.dataset.waitlistPage) {
      const home = nav.querySelector('a[href="/"]')
      if (home) {
        const inactiveHome = source.cloneNode(true)
        inactiveHome.href = '/'
        const homeLabels = inactiveHome.querySelectorAll('p')
        if (homeLabels[0]) homeLabels[0].textContent = '-- 001.'
        if (homeLabels[1]) homeLabels[1].textContent = 'Home'
        home.replaceWith(inactiveHome)
      }
      link.setAttribute('aria-current', 'page')
      link.dataset.framerName = 'Active'
    }
  })
}
