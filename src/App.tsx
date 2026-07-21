import { useCallback, useEffect, useMemo, useState } from 'react'
import Fuse from 'fuse.js'
import { hasSupabaseConfig, supabase } from './lib/supabase'
import { generateGroupCode } from './lib/groupCode'
import AuthPanel, { type AuthMode } from './components/AuthPanel'
import type {
  AttendanceRecord,
  AttendanceSession,
  Bus,
  Group,
  PublicCheckInResult,
  PublicSessionPayload,
  SessionStats,
  Student,
  UserProfile,
  UUID,
} from './types'
import './App.css'

type AdminTab = 'dashboard' | 'roster' | 'buses' | 'sessions'
type Notice = { type: 'success' | 'error'; message: string } | null
type ConfirmDialog = {
  title: string
  message: string
  confirmLabel: string
  danger?: boolean
  onConfirm: () => void | Promise<void>
} | null

const POLL_INTERVAL_MS = 5000

const normalizeName = (value: string) => value.trim().toLowerCase().replace(/\s+/g, ' ')

const formatDateTime = (value: string | null | undefined) => {
  if (!value) return 'Not set'
  return new Date(value).toLocaleString()
}

const parseCsvNames = (csvText: string) => {
  const rows = csvText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  const names = rows.map((row) => row.split(',')[0]?.replace(/^"|"$/g, '').trim() ?? '')
  const withoutHeader = names[0]?.toLowerCase() === 'name' ? names.slice(1) : names
  const seen = new Set<string>()

  return withoutHeader.filter((name) => {
    const normalized = normalizeName(name)
    if (!normalized || seen.has(normalized)) return false
    seen.add(normalized)
    return true
  })
}

const buildStats = (students: Student[], attendance: AttendanceRecord[]): SessionStats => {
  const checkedIds = new Set(attendance.map((record) => record.student_id))
  const registered = students.filter((student) => student.registered_for_programme)
  const checkedInRegistered = registered.filter((student) => checkedIds.has(student.id)).length
  const walkOnsCheckedIn = students.filter(
    (student) => !student.registered_for_programme && checkedIds.has(student.id)
  ).length

  return {
    totalRegistered: registered.length,
    checkedInRegistered,
    missingRegistered: registered.length - checkedInRegistered,
    walkOnsCheckedIn,
  }
}

const getRecordForStudent = (records: AttendanceRecord[], studentId: UUID) =>
  records.find((record) => record.student_id === studentId) ?? null

function App() {
  const urlParams = useMemo(() => new URLSearchParams(window.location.search), [])
  const initialSessionId = urlParams.get('sessionId')
  const initialToken = urlParams.get('token')
  const authRoute = urlParams.get('auth')
  const isPublicLink = Boolean(initialSessionId && initialToken)
  const isResetPasswordRoute = authRoute === 'reset-password'
  const initialHelperName =
    isPublicLink && initialSessionId ? window.localStorage.getItem(`bus-role-call:${initialSessionId}:helper`) ?? '' : ''

  const [user, setUser] = useState<UserProfile | null>(null)
  const [authMode, setAuthMode] = useState<AuthMode>(isResetPasswordRoute ? 'set-new-password' : 'sign-in')
  const [notice, setNotice] = useState<Notice>(null)
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialog>(null)
  const [loading, setLoading] = useState(false)
  const [adminTab, setAdminTab] = useState<AdminTab>('dashboard')

  const [groups, setGroups] = useState<Group[]>([])
  const [selectedGroupId, setSelectedGroupId] = useState<UUID | null>(null)
  const [buses, setBuses] = useState<Bus[]>([])
  const [students, setStudents] = useState<Student[]>([])
  const [sessions, setSessions] = useState<AttendanceSession[]>([])
  const [records, setRecords] = useState<AttendanceRecord[]>([])
  const [selectedSessionId, setSelectedSessionId] = useState<UUID | null>(null)

  const [newGroupName, setNewGroupName] = useState('')
  const [newStudentName, setNewStudentName] = useState('')
  const [newStudentRegistered, setNewStudentRegistered] = useState(true)
  const [newBusLabel, setNewBusLabel] = useState('')
  const [newSessionName, setNewSessionName] = useState('Departure')

  const [publicPayload, setPublicPayload] = useState<PublicSessionPayload | null>(null)
  const [publicLoading, setPublicLoading] = useState(false)
  const [helperNameDraft, setHelperNameDraft] = useState(initialHelperName)
  const [helperName, setHelperName] = useState(initialHelperName)
  const [selectedPublicBusId, setSelectedPublicBusId] = useState<UUID | ''>('')
  const [publicBusFilterId, setPublicBusFilterId] = useState<UUID | 'all'>('all')
  const [publicSearch, setPublicSearch] = useState('')
  const [walkOnName, setWalkOnName] = useState('')
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)
  const [pendingOverride, setPendingOverride] = useState<{
    studentId: UUID
    busId: UUID
    conflict: PublicCheckInResult
  } | null>(null)

  const selectedGroup = groups.find((group) => group.id === selectedGroupId) ?? null
  const selectedSession = sessions.find((session) => session.id === selectedSessionId) ?? null
  const activeSession = sessions.find((session) => session.status === 'open') ?? null
  const activeOrSelectedSession = selectedSession ?? activeSession
  const adminStats = useMemo(() => buildStats(students, records), [students, records])

  const publicStats = useMemo(
    () => buildStats(publicPayload?.students ?? [], publicPayload?.attendance ?? []),
    [publicPayload]
  )

  const publicRecordsByStudent = useMemo(() => {
    const map = new Map<UUID, AttendanceRecord>()
    publicPayload?.attendance.forEach((record) => map.set(record.student_id, record))
    return map
  }, [publicPayload])

  const publicFuse = useMemo(() => {
    return new Fuse(publicPayload?.students ?? [], {
      keys: ['name'],
      threshold: 0.35,
      ignoreLocation: true,
    })
  }, [publicPayload])

  const publicVisibleStudents = useMemo(() => {
    const source = publicSearch.trim()
      ? publicFuse.search(publicSearch.trim()).map((result) => result.item)
      : publicPayload?.students ?? []

    if (publicBusFilterId === 'all') return source

    return source.filter((student) => publicRecordsByStudent.get(student.id)?.bus_id === publicBusFilterId)
  }, [publicBusFilterId, publicFuse, publicPayload, publicRecordsByStudent, publicSearch])

  const showNotice = useCallback((type: 'success' | 'error', message: string) => {
    setNotice({ type, message })
  }, [])

  const ensureSupabaseConfig = useCallback(() => {
    if (hasSupabaseConfig) return true
    showNotice('error', 'Missing Supabase config. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY.')
    return false
  }, [showNotice])

  const loadAuth = useCallback(async () => {
    if (!ensureSupabaseConfig()) return
    const { data, error } = await supabase.auth.getSession()
    if (error) {
      showNotice('error', error.message)
      return
    }

    const profile = data.session?.user
    setUser(profile ? { id: profile.id, email: profile.email ?? null } : null)
  }, [ensureSupabaseConfig, showNotice])

  const loadGroups = useCallback(async () => {
    if (!ensureSupabaseConfig() || !user) return
    const { data, error } = await supabase.from('groups').select('*').order('created_at', { ascending: false })
    if (error) {
      showNotice('error', error.message)
      setGroups([])
      return
    }

    const groupData = (data ?? []) as Group[]
    setGroups(groupData)
    setSelectedGroupId((current) => current ?? groupData[0]?.id ?? null)
  }, [ensureSupabaseConfig, showNotice, user])

  const loadAdminData = useCallback(async () => {
    if (!ensureSupabaseConfig() || !selectedGroupId) return

    const [busResponse, studentResponse, sessionResponse] = await Promise.all([
      supabase.from('buses').select('*').eq('group_id', selectedGroupId).order('sort_order').order('label'),
      supabase.from('students').select('*').eq('group_id', selectedGroupId).order('name'),
      supabase
        .from('attendance_sessions')
        .select('*')
        .eq('group_id', selectedGroupId)
        .order('started_at', { ascending: false }),
    ])

    if (busResponse.error || studentResponse.error || sessionResponse.error) {
      showNotice(
        'error',
        busResponse.error?.message ?? studentResponse.error?.message ?? sessionResponse.error?.message ?? 'Load failed'
      )
      return
    }

    const sessionData = (sessionResponse.data ?? []) as AttendanceSession[]
    setBuses((busResponse.data ?? []) as Bus[])
    setStudents((studentResponse.data ?? []) as Student[])
    setSessions(sessionData)
    setSelectedSessionId((current) => {
      if (current && sessionData.some((session) => session.id === current)) return current
      return sessionData.find((session) => session.status === 'open')?.id ?? sessionData[0]?.id ?? null
    })
  }, [ensureSupabaseConfig, selectedGroupId, showNotice])

  const loadAdminRecords = useCallback(async () => {
    if (!ensureSupabaseConfig() || !selectedSessionId) {
      setRecords([])
      return
    }

    const { data, error } = await supabase
      .from('attendance_records')
      .select('*')
      .eq('session_id', selectedSessionId)
      .order('checked_in_at', { ascending: false })

    if (error) {
      showNotice('error', error.message)
      setRecords([])
      return
    }

    setRecords((data ?? []) as AttendanceRecord[])
  }, [ensureSupabaseConfig, selectedSessionId, showNotice])

  const refreshPublicSession = useCallback(async (quiet = false) => {
    if (!ensureSupabaseConfig() || !initialSessionId || !initialToken) return
    if (!quiet) setPublicLoading(true)

    const { data, error } = await supabase.rpc('public_get_session_for_checkin', {
      session_id: initialSessionId,
      public_checkin_token: initialToken,
    })

    if (error) {
      showNotice('error', error.message)
    } else {
      const payload = data as PublicSessionPayload
      setPublicPayload(payload)
      setLastUpdated(new Date())
      const storedBus = window.localStorage.getItem(`bus-role-call:${payload.session.id}:bus`)
      if (storedBus && !selectedPublicBusId) setSelectedPublicBusId(storedBus)
    }

    setPublicLoading(false)
  }, [ensureSupabaseConfig, initialSessionId, initialToken, selectedPublicBusId, showNotice])

  useEffect(() => {
    void Promise.resolve().then(loadAuth)

    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY') {
        setAuthMode('set-new-password')
      }

      const profile = session?.user
      setUser(profile ? { id: profile.id, email: profile.email ?? null } : null)
    })

    return () => data.subscription.unsubscribe()
  }, [loadAuth])

  useEffect(() => {
    if (user) void Promise.resolve().then(loadGroups)
  }, [loadGroups, user])

  useEffect(() => {
    void Promise.resolve().then(loadAdminData)
  }, [loadAdminData])

  useEffect(() => {
    void Promise.resolve().then(loadAdminRecords)
  }, [loadAdminRecords])

  useEffect(() => {
    if (!isPublicLink) return
    void Promise.resolve().then(() => refreshPublicSession())
  }, [initialSessionId, isPublicLink, refreshPublicSession])

  useEffect(() => {
    if (!isPublicLink) return
    const interval = window.setInterval(() => {
      void refreshPublicSession(true)
    }, POLL_INTERVAL_MS)
    return () => window.clearInterval(interval)
  }, [isPublicLink, refreshPublicSession])

  useEffect(() => {
    if (!user || !selectedGroupId) return
    const channel = supabase
      .channel(`admin-refresh-${selectedGroupId}-${selectedSessionId ?? 'none'}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'buses', filter: `group_id=eq.${selectedGroupId}` }, () => {
        void loadAdminData()
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'students', filter: `group_id=eq.${selectedGroupId}` }, () => {
        void loadAdminData()
      })
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_sessions', filter: `group_id=eq.${selectedGroupId}` },
        () => {
          void loadAdminData()
        }
      )

    if (selectedSessionId) {
      channel.on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'attendance_records', filter: `session_id=eq.${selectedSessionId}` },
        () => {
          void loadAdminRecords()
        }
      )
    }

    channel.subscribe()
    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadAdminData, loadAdminRecords, selectedGroupId, selectedSessionId, user])

  const signOut = async () => {
    await supabase.auth.signOut()
    setUser(null)
    setGroups([])
    setSelectedGroupId(null)
  }

  const createGroup = async () => {
    if (!ensureSupabaseConfig()) return
    const name = newGroupName.trim()
    if (!name) return

    setLoading(true)
    const { data: authData, error: authError } = await supabase.auth.getUser()
    const currentUser = authData.user

    if (authError || !currentUser) {
      setLoading(false)
      showNotice('error', 'You must be signed in to create a programme.')
      return
    }

    const { data, error } = await supabase.rpc('create_group_with_owner', {
      programme_name: name,
      requested_group_code: generateGroupCode(),
    })
    setLoading(false)

    if (error) {
      showNotice('error', error.message)
      return
    }

    const group = data as Group
    setNewGroupName('')
    setGroups((current) => [group, ...current])
    setSelectedGroupId(group.id)
    showNotice('success', 'Programme created.')
  }

  const addStudent = async () => {
    if (!ensureSupabaseConfig() || !selectedGroupId) return
    const name = newStudentName.trim()
    if (!name) return

    setLoading(true)
    const { error } = await supabase.from('students').insert({
      group_id: selectedGroupId,
      name,
      normalized_name: normalizeName(name),
      registered_for_programme: newStudentRegistered,
      created_by: user?.id ?? null,
    })
    setLoading(false)

    if (error) showNotice('error', error.message)
    else {
      setNewStudentName('')
      showNotice('success', 'Student added.')
      void loadAdminData()
    }
  }

  const importCsv = async (file: File | null) => {
    if (!ensureSupabaseConfig() || !selectedGroupId || !file) return
    const names = parseCsvNames(await file.text())
    const existing = new Set(students.map((student) => student.normalized_name))
    const newNames = names.filter((name) => !existing.has(normalizeName(name)))

    if (newNames.length === 0) {
      showNotice('error', 'No new names found. Duplicate roster names were skipped.')
      return
    }

    setLoading(true)
    const { error } = await supabase.from('students').insert(
      newNames.map((name) => ({
        group_id: selectedGroupId,
        name,
        normalized_name: normalizeName(name),
        registered_for_programme: true,
        imported_at: new Date().toISOString(),
        imported_by: user?.id ?? null,
      }))
    )
    setLoading(false)

    if (error) showNotice('error', error.message)
    else {
      showNotice('success', `Imported ${newNames.length} students. Skipped ${names.length - newNames.length} duplicates.`)
      void loadAdminData()
    }
  }

  const removeStudent = (student: Student) => {
    setConfirmDialog({
      title: 'Remove student?',
      message: `Remove ${student.name} from this programme roster?`,
      confirmLabel: 'Remove',
      danger: true,
      onConfirm: async () => {
        const { error } = await supabase.from('students').delete().eq('id', student.id)
        if (error) showNotice('error', error.message)
        else {
          showNotice('success', 'Student removed.')
          void loadAdminData()
        }
      },
    })
  }

  const addBus = async () => {
    if (!ensureSupabaseConfig() || !selectedGroupId) return
    const label = newBusLabel.trim()
    if (!label) return

    const { error } = await supabase.from('buses').insert({
      group_id: selectedGroupId,
      label,
      sort_order: buses.length + 1,
      active: true,
    })

    if (error) showNotice('error', error.message)
    else {
      setNewBusLabel('')
      showNotice('success', 'Bus added.')
      void loadAdminData()
    }
  }

  const toggleBusActive = async (bus: Bus) => {
    const { error } = await supabase.from('buses').update({ active: !bus.active }).eq('id', bus.id)
    if (error) showNotice('error', error.message)
    else {
      showNotice('success', bus.active ? 'Bus deactivated.' : 'Bus reactivated.')
      void loadAdminData()
    }
  }

  const deleteOrDeactivateBus = async (bus: Bus) => {
    const { count, error: countError } = await supabase
      .from('attendance_records')
      .select('id', { count: 'exact', head: true })
      .eq('bus_id', bus.id)

    if (countError) {
      showNotice('error', countError.message)
      return
    }

    if ((count ?? 0) > 0) {
      await supabase.from('buses').update({ active: false }).eq('id', bus.id)
      showNotice('success', 'Bus has attendance history, so it was deactivated.')
    } else {
      await supabase.from('buses').delete().eq('id', bus.id)
      showNotice('success', 'Unused bus deleted.')
    }
    void loadAdminData()
  }

  const startSession = async () => {
    if (!ensureSupabaseConfig() || !selectedGroupId || !user) return
    const name = newSessionName.trim()
    if (!name) return

    const { data, error } = await supabase
      .from('attendance_sessions')
      .insert({ group_id: selectedGroupId, name, created_by: user.id })
      .select()
      .single()

    if (error) {
      showNotice('error', error.message)
      return
    }

    const session = data as AttendanceSession
    setSelectedSessionId(session.id)
    showNotice('success', 'Attendance session started.')
    void loadAdminData()
  }

  const resetSession = () => {
    if (!activeOrSelectedSession || activeOrSelectedSession.status !== 'open') return
    setConfirmDialog({
      title: 'Reset this open session?',
      message: 'This clears attendance records only for the selected open session. The roster and closed sessions stay unchanged.',
      confirmLabel: 'Reset attendance',
      danger: true,
      onConfirm: async () => {
        const { error } = await supabase.rpc('admin_reset_open_session', { session_id: activeOrSelectedSession.id })
        if (error) showNotice('error', error.message)
        else {
          showNotice('success', 'Open session attendance reset.')
          void loadAdminRecords()
        }
      },
    })
  }

  const endSession = () => {
    if (!activeOrSelectedSession || activeOrSelectedSession.status !== 'open') return
    setConfirmDialog({
      title: 'End session?',
      message: 'This locks the session as read-only. Helpers will only see the summary after it is closed.',
      confirmLabel: 'End session',
      danger: true,
      onConfirm: async () => {
        const { error } = await supabase.rpc('admin_end_session', { session_id: activeOrSelectedSession.id })
        if (error) showNotice('error', error.message)
        else {
          showNotice('success', 'Session closed.')
          void loadAdminData()
        }
      },
    })
  }

  const publicCheckIn = async (studentId: UUID, overrideExisting = false) => {
    if (!initialSessionId || !initialToken || !selectedPublicBusId) {
      showNotice('error', 'Choose a bus before checking students in.')
      return
    }

    const { data, error } = await supabase.rpc('public_check_in_student', {
      session_id: initialSessionId,
      public_checkin_token: initialToken,
      student_id: studentId,
      bus_id: selectedPublicBusId,
      helper_name: helperName,
      override_existing: overrideExisting,
    })

    if (error) {
      showNotice('error', error.message)
      return
    }

    const result = data as PublicCheckInResult
    if (result.status === 'conflict') {
      setPendingOverride({ studentId, busId: selectedPublicBusId, conflict: result })
      return
    }

    showNotice('success', result.status === 'move' ? 'Student moved to selected bus.' : 'Student checked in.')
    setPublicSearch('')
    await refreshPublicSession(true)
  }

  const publicCheckOut = async (studentId: UUID) => {
    if (!initialSessionId || !initialToken) return
    const { error } = await supabase.rpc('public_check_out_student', {
      session_id: initialSessionId,
      public_checkin_token: initialToken,
      student_id: studentId,
      helper_name: helperName,
    })

    if (error) showNotice('error', error.message)
    else {
      showNotice('success', 'Check-in undone.')
      await refreshPublicSession(true)
    }
  }

  const addWalkOn = async () => {
    if (!initialSessionId || !initialToken || !selectedPublicBusId) {
      showNotice('error', 'Choose a bus before adding a walk-on.')
      return
    }

    const { error } = await supabase.rpc('public_add_walk_on_student', {
      session_id: initialSessionId,
      public_checkin_token: initialToken,
      name: walkOnName,
      bus_id: selectedPublicBusId,
      helper_name: helperName,
    })

    if (error) showNotice('error', error.message)
    else {
      setWalkOnName('')
      showNotice('success', 'Walk-on added and checked in.')
      await refreshPublicSession(true)
    }
  }

  const saveHelperName = () => {
    const cleanName = helperNameDraft.trim()
    if (!cleanName || !publicPayload) return
    window.localStorage.setItem(`bus-role-call:${publicPayload.session.id}:helper`, cleanName)
    setHelperName(cleanName)
  }

  const setPublicBus = (busId: UUID) => {
    setSelectedPublicBusId(busId)
    if (publicPayload) window.localStorage.setItem(`bus-role-call:${publicPayload.session.id}:bus`, busId)
  }

  const copySessionLink = async (session: AttendanceSession) => {
    if (!session.public_checkin_token) {
      showNotice('error', 'This session does not expose a public token in the current query.')
      return
    }

    const link = `${window.location.origin}${window.location.pathname}?sessionId=${session.id}&token=${session.public_checkin_token}`
    await navigator.clipboard.writeText(link)
    showNotice('success', 'Public check-in link copied.')
  }

  const copyWhatsAppSummary = async () => {
    if (!selectedGroup || !activeOrSelectedSession) return
    const lines = buildSummaryLines(selectedGroup.name, activeOrSelectedSession, buses, students, records)
    await navigator.clipboard.writeText(lines.join('\n'))
    showNotice('success', 'WhatsApp summary copied.')
  }

  const downloadCsv = () => {
    if (!activeOrSelectedSession) return
    const checkedByStudent = new Map(records.map((record) => [record.student_id, record]))
    const rows = [
      ['session name', 'student name', 'registered_for_programme', 'checked_in', 'bus', 'checked_in_at', 'checked_in_by'],
      ...students.map((student) => {
        const record = checkedByStudent.get(student.id)
        return [
          activeOrSelectedSession.name,
          student.name,
          String(student.registered_for_programme),
          String(Boolean(record)),
          record?.bus_label_snapshot ?? '',
          record?.checked_in_at ?? '',
          record?.checked_in_by_name ?? '',
        ]
      }),
    ]

    const csv = rows.map((row) => row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `${activeOrSelectedSession.name.replace(/\s+/g, '-').toLowerCase()}-attendance.csv`
    link.click()
    URL.revokeObjectURL(url)
  }

  const renderPublicCheckIn = () => {
    if (!publicPayload) {
      return (
        <main className="app-shell compact-shell">
          <div className="panel centered-panel">
            <h1>Loading check-in link</h1>
            <p className="muted">Validating the session token...</p>
          </div>
        </main>
      )
    }

    const isClosed = publicPayload.session.status === 'closed'
    const activeBuses = publicPayload.buses.filter((bus) => bus.active)

    return (
      <main className="app-shell">
        <section className="hero-card operations-hero">
          <div>
            <p className="eyebrow">Bus check-in</p>
            <h1>{publicPayload.group.name}</h1>
            <p className="hero-description">{publicPayload.session.name}</p>
          </div>
          <div className="hero-actions">
            <span className={`status-chip ${isClosed ? 'closed' : 'open'}`}>{isClosed ? 'Closed' : 'Open'}</span>
            <button type="button" className="secondary-button" onClick={() => refreshPublicSession()} disabled={publicLoading}>
              Refresh
            </button>
            <p className="muted small-text">Last updated {lastUpdated ? lastUpdated.toLocaleTimeString() : 'never'}</p>
          </div>
        </section>

        {notice ? <div className={`toast ${notice.type}`}>{notice.message}</div> : null}

        {!helperName && !isClosed ? (
          <section className="panel helper-panel">
            <h2>Your name / bus helper name</h2>
            <div className="inline-form">
              <input value={helperNameDraft} onChange={(event) => setHelperNameDraft(event.target.value)} placeholder="e.g. Sarah at Bus 1" />
              <button type="button" className="primary-button" onClick={saveHelperName} disabled={!helperNameDraft.trim()}>
                Start checking in
              </button>
            </div>
          </section>
        ) : null}

        <StatsGrid stats={publicStats} />

        <section className="checkin-layout">
          <aside className="panel sticky-tools">
            <h2>Bus controls</h2>
            <label>
              Check-in bus
              <select value={selectedPublicBusId} onChange={(event) => setPublicBus(event.target.value)} disabled={isClosed}>
                <option value="">Choose bus</option>
                {activeBuses.map((bus) => (
                  <option key={bus.id} value={bus.id}>
                    {bus.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              View filter
              <select value={publicBusFilterId} onChange={(event) => setPublicBusFilterId(event.target.value as UUID | 'all')}>
                <option value="all">All buses</option>
                {publicPayload.buses.map((bus) => (
                  <option key={bus.id} value={bus.id}>
                    {bus.label}
                  </option>
                ))}
              </select>
            </label>
            {!isClosed ? (
              <div className="walkon-box">
                <h3>Add walk-on</h3>
                <input value={walkOnName} onChange={(event) => setWalkOnName(event.target.value)} placeholder="Unregistered student name" />
                <button type="button" className="secondary-button" onClick={addWalkOn} disabled={!walkOnName.trim() || !helperName}>
                  Add and check in
                </button>
              </div>
            ) : null}
          </aside>

          <section className="panel">
            <div className="section-title-row">
              <div>
                <p className="eyebrow">Roster</p>
                <h2>{isClosed ? 'Read-only session summary' : 'Search and check in'}</h2>
              </div>
              <input
                className="search-input"
                value={publicSearch}
                onChange={(event) => setPublicSearch(event.target.value)}
                placeholder="Search every student"
              />
            </div>

            <StudentRows
              students={publicVisibleStudents}
              records={publicPayload.attendance}
              buses={publicPayload.buses}
              selectedBusId={selectedPublicBusId}
              disabled={isClosed || !helperName}
              onCheckIn={(studentId) => publicCheckIn(studentId)}
              onCheckOut={publicCheckOut}
            />
          </section>
        </section>

        {pendingOverride ? (
          <div className="modal-backdrop">
            <div className="modal">
              <h2>Move student?</h2>
              <p>
                This student is already checked in on {pendingOverride.conflict.current_bus_label}. Move them to{' '}
                {pendingOverride.conflict.requested_bus_label}?
              </p>
              <div className="modal-actions">
                <button type="button" className="secondary-button" onClick={() => setPendingOverride(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="primary-button"
                  onClick={async () => {
                    const override = pendingOverride
                    setPendingOverride(null)
                    await publicCheckIn(override.studentId, true)
                  }}
                >
                  Move student
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </main>
    )
  }

  if (isPublicLink) return renderPublicCheckIn()

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div>
          <p className="eyebrow">Camp operations</p>
          <h1>Bus Role Call</h1>
          <p className="hero-description">
            Manage programme rosters, buses, live check-ins, locked session summaries, and bus-count exports.
          </p>
        </div>
        <div className="home-actions">
          <div className="home-action-card">
            <strong>Join existing group / check in students</strong>
            <p className="muted">Open the public check-in link shared by the programme admin.</p>
          </div>
          <div className="home-action-card">
            <strong>Admin sign in / create account</strong>
            <p className="muted">Use the account form below to manage programmes.</p>
          </div>
        </div>
      </section>

      {notice ? <div className={`toast ${notice.type}`}>{notice.message}</div> : null}

      <AuthPanel
        user={user}
        mode={authMode}
        onModeChange={setAuthMode}
        onAuthChanged={(message) => {
          if (message) showNotice('success', message)
          void loadAuth()
        }}
        onSignOut={signOut}
        loading={loading}
      />

      {user ? (
        <section className="admin-grid">
          <aside className="panel admin-sidebar">
            <h2>Programmes</h2>
            <select value={selectedGroupId ?? ''} onChange={(event) => setSelectedGroupId(event.target.value || null)}>
              <option value="">Select programme</option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
            <div className="stacked-form">
              <input value={newGroupName} onChange={(event) => setNewGroupName(event.target.value)} placeholder="Grade 7 Shabbaton 2026" />
              <button type="button" className="primary-button" onClick={createGroup} disabled={!newGroupName.trim()}>
                Create programme
              </button>
            </div>
            {selectedGroup ? <p className="muted">Group code: {selectedGroup.group_code}</p> : <p className="empty-state">No groups yet.</p>}
          </aside>

          <section className="admin-main">
            <div className="tabs">
              {(['dashboard', 'roster', 'buses', 'sessions'] as AdminTab[]).map((tab) => (
                <button key={tab} type="button" className={adminTab === tab ? 'active' : ''} onClick={() => setAdminTab(tab)}>
                  {tab}
                </button>
              ))}
            </div>

            {!selectedGroup ? (
              <div className="panel empty-state">Create or select a programme to begin.</div>
            ) : adminTab === 'dashboard' ? (
              <DashboardPanel
                group={selectedGroup}
                session={activeOrSelectedSession}
                buses={buses}
                students={students}
                records={records}
                stats={adminStats}
                onCopySummary={copyWhatsAppSummary}
                onDownloadCsv={downloadCsv}
              />
            ) : adminTab === 'roster' ? (
              <section className="panel">
                <div className="section-title-row">
                  <div>
                    <p className="eyebrow">Roster</p>
                    <h2>Students and walk-ons</h2>
                  </div>
                  <label className="file-label">
                    Import CSV
                    <input type="file" accept=".csv,text/csv" onChange={(event) => void importCsv(event.target.files?.[0] ?? null)} />
                  </label>
                </div>
                <div className="inline-form">
                  <input value={newStudentName} onChange={(event) => setNewStudentName(event.target.value)} placeholder="Student name" />
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={newStudentRegistered}
                      onChange={(event) => setNewStudentRegistered(event.target.checked)}
                    />
                    Registered
                  </label>
                  <button type="button" className="primary-button" onClick={addStudent} disabled={!newStudentName.trim()}>
                    Add
                  </button>
                </div>
                <RosterTable students={students} onRemove={removeStudent} />
              </section>
            ) : adminTab === 'buses' ? (
              <section className="panel">
                <div className="section-title-row">
                  <div>
                    <p className="eyebrow">Buses</p>
                    <h2>Manage bus labels</h2>
                  </div>
                  <div className="inline-form compact-form">
                    <input value={newBusLabel} onChange={(event) => setNewBusLabel(event.target.value)} placeholder="Bus 1" />
                    <button type="button" className="primary-button" onClick={addBus} disabled={!newBusLabel.trim()}>
                      Add bus
                    </button>
                  </div>
                </div>
                <BusTable buses={buses} onToggle={toggleBusActive} onDelete={deleteOrDeactivateBus} />
              </section>
            ) : (
              <section className="panel">
                <div className="section-title-row">
                  <div>
                    <p className="eyebrow">Sessions</p>
                    <h2>Start, share, reset, close</h2>
                  </div>
                  <div className="inline-form compact-form">
                    <input value={newSessionName} onChange={(event) => setNewSessionName(event.target.value)} placeholder="Departure" />
                    <button type="button" className="primary-button" onClick={startSession} disabled={Boolean(activeSession)}>
                      Start session
                    </button>
                  </div>
                </div>
                <div className="session-actions">
                  <button type="button" className="secondary-button" onClick={resetSession} disabled={activeOrSelectedSession?.status !== 'open'}>
                    Reset selected open session
                  </button>
                  <button type="button" className="danger-button" onClick={endSession} disabled={activeOrSelectedSession?.status !== 'open'}>
                    End selected session
                  </button>
                </div>
                <SessionTable
                  sessions={sessions}
                  selectedSessionId={selectedSessionId}
                  onSelect={setSelectedSessionId}
                  onCopyLink={copySessionLink}
                />
              </section>
            )}
          </section>
        </section>
      ) : null}

      <ConfirmModal dialog={confirmDialog} onClose={() => setConfirmDialog(null)} />
    </main>
  )
}

interface StatsGridProps {
  stats: SessionStats
}

function StatsGrid({ stats }: StatsGridProps) {
  return (
    <section className="stats-grid">
      <article className="stat-card">
        <span>Total registered</span>
        <strong>{stats.totalRegistered}</strong>
      </article>
      <article className="stat-card">
        <span>Checked in</span>
        <strong>{stats.checkedInRegistered}</strong>
      </article>
      <article className="stat-card">
        <span>Missing</span>
        <strong>{stats.missingRegistered}</strong>
      </article>
      <article className="stat-card">
        <span>Walk-ons checked in</span>
        <strong>{stats.walkOnsCheckedIn}</strong>
      </article>
    </section>
  )
}

interface StudentRowsProps {
  students: Student[]
  records: AttendanceRecord[]
  buses: Bus[]
  selectedBusId: UUID | ''
  disabled: boolean
  onCheckIn: (studentId: UUID) => void
  onCheckOut: (studentId: UUID) => void
}

function StudentRows({ students, records, buses, selectedBusId, disabled, onCheckIn, onCheckOut }: StudentRowsProps) {
  const busById = new Map(buses.map((bus) => [bus.id, bus]))

  if (students.length === 0) return <div className="empty-state">No students match this view.</div>

  return (
    <ul className="student-list">
      {students.map((student) => {
        const record = getRecordForStudent(records, student.id)
        const targetBus = selectedBusId ? busById.get(selectedBusId)?.label : null
        return (
          <li key={student.id} className="student-row">
            <div>
              <strong>{student.name}</strong>
              <p className="muted small-text">
                {student.registered_for_programme ? 'Registered' : 'Walk-on'}
                {record ? ` · Checked in on ${record.bus_label_snapshot}` : ' · Missing'}
              </p>
            </div>
            <div className="row-actions">
              {record ? (
                <>
                  {selectedBusId && record.bus_id !== selectedBusId ? (
                    <button type="button" className="secondary-button" onClick={() => onCheckIn(student.id)} disabled={disabled}>
                      Move to {targetBus}
                    </button>
                  ) : null}
                  <button type="button" className="ghost-button" onClick={() => onCheckOut(student.id)} disabled={disabled}>
                    Undo
                  </button>
                </>
              ) : (
                <button type="button" className="primary-button" onClick={() => onCheckIn(student.id)} disabled={disabled || !selectedBusId}>
                  Check in
                </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

interface DashboardPanelProps {
  group: Group
  session: AttendanceSession | null
  buses: Bus[]
  students: Student[]
  records: AttendanceRecord[]
  stats: SessionStats
  onCopySummary: () => void
  onDownloadCsv: () => void
}

function DashboardPanel({ group, session, buses, students, records, stats, onCopySummary, onDownloadCsv }: DashboardPanelProps) {
  const checkedIds = new Set(records.map((record) => record.student_id))
  const missing = students.filter((student) => student.registered_for_programme && !checkedIds.has(student.id))

  return (
    <section className="panel">
      <div className="section-title-row">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>{group.name}</h2>
        </div>
        <span className={`status-chip ${session?.status === 'open' ? 'open' : 'closed'}`}>{session?.status ?? 'No session'}</span>
      </div>
      <StatsGrid stats={stats} />
      <div className="dashboard-columns">
        <div>
          <h3>Per-bus counts</h3>
          <ul className="summary-list">
            {buses.map((bus) => (
              <li key={bus.id}>
                <span>{bus.label}</span>
                <strong>{records.filter((record) => record.bus_id === bus.id).length}</strong>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h3>Missing registered students</h3>
          <ul className="summary-list names">
            {missing.slice(0, 30).map((student) => (
              <li key={student.id}>{student.name}</li>
            ))}
          </ul>
        </div>
      </div>
      <div className="session-actions">
        <button type="button" className="secondary-button" onClick={onCopySummary} disabled={!session}>
          Copy WhatsApp summary
        </button>
        <button type="button" className="secondary-button" onClick={onDownloadCsv} disabled={!session}>
          Download CSV
        </button>
      </div>
    </section>
  )
}

function buildSummaryLines(
  programmeName: string,
  session: AttendanceSession,
  buses: Bus[],
  students: Student[],
  records: AttendanceRecord[]
) {
  const stats = buildStats(students, records)
  const checkedIds = new Set(records.map((record) => record.student_id))
  const missing = students.filter((student) => student.registered_for_programme && !checkedIds.has(student.id))

  return [
    `Programme: ${programmeName}`,
    `Session: ${session.name}`,
    `Status: ${session.status}`,
    `Total registered: ${stats.totalRegistered}`,
    `Checked in: ${stats.checkedInRegistered}`,
    `Missing: ${stats.missingRegistered}`,
    'Bus counts:',
    ...buses.map((bus) => `- ${bus.label}: ${records.filter((record) => record.bus_id === bus.id).length}`),
    `Unregistered/walk-ons: ${stats.walkOnsCheckedIn}`,
    'Missing:',
    ...(missing.length ? missing.map((student) => `- ${student.name}`) : ['- None']),
  ]
}

interface RosterTableProps {
  students: Student[]
  onRemove: (student: Student) => void
}

function RosterTable({ students, onRemove }: RosterTableProps) {
  if (students.length === 0) return <div className="empty-state">No students yet. Import a CSV or add names manually.</div>
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Added</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {students.map((student) => (
            <tr key={student.id}>
              <td>{student.name}</td>
              <td>{student.registered_for_programme ? 'Registered' : 'Walk-on'}</td>
              <td>{formatDateTime(student.created_at)}</td>
              <td>
                <button type="button" className="ghost-button" onClick={() => onRemove(student)}>
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

interface BusTableProps {
  buses: Bus[]
  onToggle: (bus: Bus) => void
  onDelete: (bus: Bus) => void
}

function BusTable({ buses, onToggle, onDelete }: BusTableProps) {
  if (buses.length === 0) return <div className="empty-state">No buses yet. Add at least one bus before sharing check-in links.</div>
  return (
    <div className="card-list">
      {buses.map((bus) => (
        <article key={bus.id} className="mini-card">
          <div>
            <strong>{bus.label}</strong>
            <p className="muted">{bus.active ? 'Active' : 'Inactive'}</p>
          </div>
          <div className="row-actions">
            <button type="button" className="secondary-button" onClick={() => onToggle(bus)}>
              {bus.active ? 'Deactivate' : 'Reactivate'}
            </button>
            <button type="button" className="ghost-button" onClick={() => onDelete(bus)}>
              Delete
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

interface SessionTableProps {
  sessions: AttendanceSession[]
  selectedSessionId: UUID | null
  onSelect: (sessionId: UUID) => void
  onCopyLink: (session: AttendanceSession) => void
}

function SessionTable({ sessions, selectedSessionId, onSelect, onCopyLink }: SessionTableProps) {
  if (sessions.length === 0) return <div className="empty-state">No sessions yet. Start one when buses are ready.</div>
  return (
    <div className="card-list">
      {sessions.map((session) => (
        <article key={session.id} className={`mini-card ${selectedSessionId === session.id ? 'selected' : ''}`}>
          <div>
            <strong>{session.name}</strong>
            <p className="muted">
              {session.status} · Started {formatDateTime(session.started_at)}
              {session.ended_at ? ` · Ended ${formatDateTime(session.ended_at)}` : ''}
            </p>
          </div>
          <div className="row-actions">
            <button type="button" className="secondary-button" onClick={() => onSelect(session.id)}>
              View
            </button>
            <button type="button" className="primary-button" onClick={() => onCopyLink(session)} disabled={session.status !== 'open'}>
              Copy link
            </button>
          </div>
        </article>
      ))}
    </div>
  )
}

interface ConfirmModalProps {
  dialog: ConfirmDialog
  onClose: () => void
}

function ConfirmModal({ dialog, onClose }: ConfirmModalProps) {
  if (!dialog) return null
  return (
    <div className="modal-backdrop">
      <div className="modal">
        <h2>{dialog.title}</h2>
        <p>{dialog.message}</p>
        <div className="modal-actions">
          <button type="button" className="secondary-button" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={dialog.danger ? 'danger-button' : 'primary-button'}
            onClick={async () => {
              await dialog.onConfirm()
              onClose()
            }}
          >
            {dialog.confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default App
