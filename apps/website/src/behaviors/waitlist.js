// Browser-only prototype. No requests, email delivery or production account logic.
const STORAGE_KEY = 'openfutures-waitlist-preview-v1'
const PENDING_KEY = 'openfutures-waitlist-preview-pending'
const DEMO_CODE = '123456'
const $ = (id) => document.getElementById(id)
const page = document.body.dataset.waitlistPage
let storageAvailable = true
let state = { members: [], session: null, attribution: null }
let pending = null
let signIn = new URLSearchParams(location.search).get('mode') === 'signin'
let expandedBoard = false
let toastTimer
const sampleMembers = [
  { id: 'sample-1', username: 'perp.queen', code: 'OPENPERP', count: 18 },
  { id: 'sample-2', username: 'deltaneutral', code: 'OPENDELT', count: 12 },
  { id: 'sample-3', username: 'satoshi.sol', code: 'OPENSATO', count: 8 },
  { id: 'sample-4', username: 'nightowl', code: 'OPENNITE', count: 5 },
  { id: 'sample-5', username: 'maven', code: 'OPENMAVN', count: 3 },
  { id: 'sample-6', username: 'basisbob', code: 'OPENBASE', count: 1 },
  { id: 'sample-7', username: 'vol.smile', code: 'OPENVOLS', count: 0 },
].map((member, index) => ({ ...member, verifiedAt: index + 1, sample: true }))

try {
  const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null')
  if (stored && Array.isArray(stored.members)) {
    // Validate the fields this prototype needs before using persisted data.
    state = {
      members: stored.members.filter((m) => m && typeof m.id === 'string' && typeof m.email === 'string' && typeof m.username === 'string' && typeof m.code === 'string' && Array.isArray(m.referrals)),
      session: typeof stored.session === 'string' ? stored.session : null,
      attribution: stored.attribution && typeof stored.attribution.code === 'string' ? stored.attribution : null,
    }
  }
  const storedPending = JSON.parse(sessionStorage.getItem(PENDING_KEY) || 'null')
  if (storedPending && typeof storedPending.email === 'string' && typeof storedPending.username === 'string' && Number.isFinite(storedPending.sentAt)) pending = storedPending
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
} catch { storageAvailable = false }

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)) }
  catch { storageAvailable = false; toast('Preview changes cannot be saved in this browser.') }
}
function savePending() {
  try {
    if (pending) sessionStorage.setItem(PENDING_KEY, JSON.stringify(pending))
    else sessionStorage.removeItem(PENDING_KEY)
  } catch { /* In-memory preview still works when browser storage is blocked. */ }
}
function currentMember() { return state.members.find((member) => member.id === state.session) }
function toast(message) {
  clearTimeout(toastTimer)
  $('wl-toast').textContent = message
  $('wl-toast').hidden = false
  toastTimer = setTimeout(() => { $('wl-toast').hidden = true }, 3500)
}
function error(id, message = '') {
  $(id).textContent = message
  $(id).hidden = !message
}
function findCode(code) { return state.members.find((m) => m.code === code) || sampleMembers.find((m) => m.code === code) }
function captureReferral() {
  if (state.attribution && Date.now() - state.attribution.at > 30 * 86400000) state.attribution = null
  const incoming = new URLSearchParams(location.search).get('ref')?.toUpperCase()
  if (!state.attribution && incoming && findCode(incoming) && !currentMember()) {
    state.attribution = { code: incoming, at: Date.now() }
    save()
  }
}
function showAuth() {
  pending = null
  savePending()
  $('wl-auth').hidden = false
  $('wl-verification').hidden = true
  $('wl-existing').hidden = true
  $('wl-username-field').hidden = signIn
  const username = $('wl-signup-form').elements.username
  username.required = !signIn
  username.disabled = signIn
  $('wl-auth-title').textContent = signIn ? 'Welcome back.' : 'Join the waitlist'
  $('wl-auth-copy').textContent = signIn ? 'Sign in with your email to find your referral link and progress.' : 'Create your account to get a personal referral link and track your place.'
  $('wl-submit-label').textContent = signIn ? 'Send sign-in code' : 'Join the waitlist'
  $('wl-switch-copy').textContent = signIn ? 'New to OpenFutures?' : 'Already on the list?'
  $('wl-switch-mode').textContent = signIn ? 'Join the waitlist' : 'Sign in'
  $('wl-storage-note').hidden = storageAvailable
  error('wl-auth-error')
  const referrer = findCode(state.attribution?.code)
  $('wl-referrer').hidden = signIn || !referrer
  if (referrer) $('wl-referrer').querySelector('span').textContent = `Invited by ${referrer.username}`
}
function showVerification() {
  $('wl-auth').hidden = true
  $('wl-existing').hidden = true
  $('wl-verification').hidden = false
  $('wl-verification-email').textContent = pending.email
  $('wl-verify-form').reset()
  error('wl-verify-error')
  $('wl-verify-form').elements.code.focus()
}
function uniqueCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code
  do {
    const bytes = crypto.getRandomValues(new Uint8Array(8))
    code = Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join('')
  } while (findCode(code))
  return code
}
function verify() {
  if (!pending) { showAuth(); return }
  if (Date.now() - pending.sentAt > 10 * 60000) { error('wl-verify-error', 'This preview code expired. Request a new code below.'); return }
  if ($('wl-verify-form').elements.code.value !== DEMO_CODE) { error('wl-verify-error', 'That code doesn’t match. Use 123456 for this preview.'); return }
  let member = state.members.find((m) => m.email === pending.email)
  if (!member) {
    member = { id: crypto.randomUUID(), username: pending.username, email: pending.email, code: uniqueCode(), verifiedAt: Date.now(), referrals: [], referredBy: pending.referrer || null }
    state.members.push(member)
    const referrer = state.members.find((m) => m.code === member.referredBy && m.id !== member.id)
    if (referrer && !referrer.referrals.some((referral) => referral.id === member.id)) {
      referrer.referrals.push({ id: member.id, at: Date.now(), simulated: false })
    }
  }
  state.session = member.id
  state.attribution = null
  pending = null
  savePending()
  save()
  // Normally use a clean navigation. Keep the memory-only prototype usable too.
  if (storageAvailable) location.assign('/waitlist/dashboard')
  else {
    toast('This browser blocks storage. Allow it to continue to the dashboard.')
    $('wl-verification').hidden = true
    $('wl-existing').hidden = false
  }
}
function leaderboard() {
  return [...sampleMembers, ...state.members.map((member) => ({ ...member, count: member.referrals.length }))]
    .sort((a, b) => b.count - a.count || a.verifiedAt - b.verifiedAt || a.id.localeCompare(b.id))
}
function renderDashboard() {
  const member = currentMember()
  if (!member) { location.replace('/waitlist?mode=signin'); return }
  $('wl-dashboard-loading').hidden = true
  $('wl-dashboard').hidden = false
  $('wl-member-name').textContent = member.username
  $('wl-avatar').textContent = member.username.slice(0, 2).toUpperCase()
  $('wl-count').textContent = member.referrals.length
  const board = leaderboard()
  $('wl-rank').textContent = `#${board.findIndex((entry) => entry.id === member.id) + 1}`
  $('wl-code').textContent = member.code
  const shareLink = new URL(`/waitlist?ref=${member.code}`, location.origin).href
  $('wl-link').value = shareLink
  $('wl-share-x').href = `https://x.com/intent/post?text=${encodeURIComponent('I’m on the OpenFutures waitlist. Join me:')}&url=${encodeURIComponent(shareLink)}`
  $('wl-share-telegram').href = `https://t.me/share/url?url=${encodeURIComponent(shareLink)}&text=${encodeURIComponent('Join me on the OpenFutures waitlist.')}`
  const activity = $('wl-activity-list')
  activity.replaceChildren()
  if (!member.referrals.length) {
    activity.innerHTML = '<div class="wl-empty"><span class="wl-empty-icon" aria-hidden="true">↗</span><h3>Your first invite starts here.</h3><p>Share your link with a friend. You’ll see a verified signup here when they join.</p></div>'
  } else {
    [...member.referrals].reverse().slice(0, 5).forEach((referral) => {
      const row = document.createElement('div')
      row.className = 'wl-activity-row'
      const name = document.createElement('b')
      name.textContent = referral.simulated ? 'Preview referral verified' : 'New referral verified'
      const when = document.createElement('span')
      when.textContent = new Date(referral.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
      row.append(name, when)
      activity.append(row)
    })
  }
  const tbody = $('wl-board-body')
  tbody.replaceChildren()
  const shown = expandedBoard ? board : board.slice(0, 5)
  if (!shown.some((entry) => entry.id === member.id)) shown.push(member)
  shown.forEach((entry) => {
    const row = document.createElement('tr')
    const rank = document.createElement('td')
    rank.textContent = String(board.findIndex((item) => item.id === entry.id) + 1).padStart(2, '0')
    const name = document.createElement('td')
    name.textContent = entry.username
    if (entry.id === member.id) {
      row.className = 'wl-you'
      const badge = document.createElement('span')
      badge.className = 'wl-you-label'
      badge.textContent = 'YOU'
      name.append(badge)
    }
    const count = document.createElement('td')
    count.textContent = entry.count ?? entry.referrals.length
    row.append(rank, name, count)
    tbody.append(row)
  })
  $('wl-board-toggle').textContent = expandedBoard ? 'Show top members' : 'Show all members'
}
function signOut() {
  state.session = null
  pending = null
  savePending()
  save()
}

if (page === 'signup') {
  captureReferral()
  const previousPending = pending
  showAuth()
  if (currentMember()) {
    $('wl-auth').hidden = true
    $('wl-existing').hidden = false
  } else if (previousPending) {
    pending = previousPending
    savePending()
    showVerification()
  }
  $('wl-switch-mode').addEventListener('click', () => { signIn = !signIn; showAuth() })
  $('wl-use-another').addEventListener('click', () => { signOut(); signIn = false; captureReferral(); showAuth() })
  $('wl-signup-form').addEventListener('submit', async (event) => {
    event.preventDefault()
    const form = event.currentTarget
    if (!form.reportValidity()) return
    error('wl-auth-error')
    const email = form.elements.email.value.trim().toLowerCase()
    const existing = state.members.find((member) => member.email === email)
    const username = form.elements.username.value.trim()
    if (signIn && !existing) { error('wl-auth-error', 'No preview account with this email yet. Join the waitlist first.'); return }
    if (!existing && state.members.some((member) => member.username.toLowerCase() === username.toLowerCase())) { error('wl-auth-error', 'That username is taken in this preview. Try another.'); return }
    const button = form.querySelector('button[type="submit"]')
    button.disabled = true
    $('wl-submit-label').textContent = 'Getting your code…'
    await new Promise((resolve) => setTimeout(resolve, 450))
    pending = { email, username: existing?.username || username, referrer: state.attribution?.code || null, sentAt: Date.now() }
    savePending()
    button.disabled = false
    showVerification()
  })
  $('wl-verify-form').addEventListener('submit', (event) => { event.preventDefault(); if (event.currentTarget.reportValidity()) verify() })
  $('wl-change-email').addEventListener('click', () => { showAuth(); $('wl-signup-form').elements.email.focus() })
  $('wl-resend-code').addEventListener('click', () => { if (pending) { pending.sentAt = Date.now(); savePending(); error('wl-verify-error'); toast('Preview code refreshed. Use 123456.'); } })
}
if (page === 'dashboard') {
  renderDashboard()
  $('wl-sign-out').addEventListener('click', () => { signOut(); location.assign('/waitlist?mode=signin') })
  $('wl-copy-link').addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText($('wl-link').value)
      toast('Referral link copied.')
    } catch {
      $('wl-link').focus()
      $('wl-link').select()
      toast('Select and copy your referral link above.')
    }
  })
  $('wl-simulate-referral').addEventListener('click', () => {
    const member = currentMember()
    member.referrals.push({ id: crypto.randomUUID(), at: Date.now(), simulated: true })
    save()
    renderDashboard()
    toast('Preview referral verified. Your progress is updated.')
  })
  $('wl-board-toggle').addEventListener('click', () => { expandedBoard = !expandedBoard; renderDashboard() })
}
window.addEventListener('storage', (event) => {
  if (event.key !== STORAGE_KEY) return
  // A second tab can complete a referred signup; refresh to show saved progress.
  location.reload()
})
