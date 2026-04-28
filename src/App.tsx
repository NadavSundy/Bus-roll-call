import { useEffect, useMemo, useState } from 'react'
import Fuse from 'fuse.js'
import { supabase } from './lib/supabase'
import type { Student } from './types'
import BusSelector from './components/BusSelector'
import StudentSearch from './components/StudentSearch'
import AttendanceList from './components/AttendanceList'
import SummaryView from './components/SummaryView'
import './App.css'

const busNumbers = [1, 2, 3]

function App() {
  const [page, setPage] = useState<'home' | 'manage' | 'search' | 'stats'>('home')
  const [selectedBus, setSelectedBus] = useState(1)
  const [students, setStudents] = useState<Student[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [manualAddName, setManualAddName] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    loadStudents()
  }, [])

  const loadStudents = async () => {
    setLoading(true)
    setError(null)

    const response = await supabase
      .from('students')
      .select('*')
      .order('name', { ascending: true })

    if (response.error) {
      setError(response.error.message)
      setStudents([])
    } else {
      setStudents((response.data as Student[]) ?? [])
    }

    setLoading(false)
  }

  const pendingStudents = useMemo(
    () => students.filter((student) => !student.checked_in),
    [students]
  )

  const summaryCheckedIn = useMemo(
    () => students.filter((student) => student.checked_in),
    [students]
  )
  const summaryNotCheckedIn = useMemo(
    () => students.filter((student) => !student.checked_in),
    [students]
  )
  const summaryAdded = useMemo(
    () => students.filter((student) => student.is_added_manually),
    [students]
  )

  const fuse = useMemo(
    () =>
      new Fuse(pendingStudents, {
        keys: ['name'],
        threshold: 0.35,
        ignoreLocation: true,
      }),
    [pendingStudents]
  )

  const suggestions = useMemo(() => {
    const trimmed = searchQuery.trim()
    if (!trimmed) return []
    return fuse.search(trimmed).map((result) => result.item).slice(0, 8)
  }, [searchQuery, fuse])

  const handleToggleStudent = async (studentId: number, checked: boolean) => {
    setLoading(true)
    setError(null)

    const response = await supabase
      .from('students')
      .update({
        checked_in: checked,
        bus_number: checked ? selectedBus : null,
      })
      .eq('id', studentId)
      .select()
      .single()

    if (response.error) {
      setError(response.error.message)
    } else if (response.data) {
      const updatedStudent = response.data as Student
      setStudents((current) =>
        current.map((student) => (student.id === updatedStudent.id ? updatedStudent : student))
      )
    }

    setLoading(false)
  }

  const handleSelectSuggestion = async (student: Student) => {
    if (!student.checked_in) {
      await handleToggleStudent(student.id, true)
    }
    setSearchQuery('')
  }

  const handleManualAddStudent = async (
    name: string,
    options: { clearSearch?: boolean; checkedIn?: boolean; busNumber?: number } = {}
  ) => {
    const trimmed = name.trim()
    if (!trimmed) return

    setLoading(true)
    setError(null)

    const response = await supabase
      .from('students')
      .insert([
        {
          name: trimmed,
          checked_in: options.checkedIn ?? false,
          bus_number: options.checkedIn ? options.busNumber ?? selectedBus : null,
          is_added_manually: true,
        },
      ])
      .select()
      .single()

    if (response.error) {
      setError(response.error.message)
    } else if (response.data) {
      setStudents((current) => [...current, response.data as Student])
      setManualAddName('')
      if (options.clearSearch) {
        setSearchQuery('')
      }
    }

    setLoading(false)
  }

  const canAddNewStudent = useMemo(() => {
    const trimmed = searchQuery.trim()
    if (!trimmed) return false
    return !students.some(
      (student) => student.name.toLowerCase() === trimmed.toLowerCase()
    )
  }, [searchQuery, students])

  const parseCsvText = (csvText: string) => {
    const rows = csvText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)

    if (rows.length === 0) {
      return []
    }

    const names = rows.map((row) => {
      const firstColumn = row.split(',')[0].trim()
      const cleaned = firstColumn.replace(/^"|"$/g, '').trim()
      return cleaned
    })

    const maybeHeader = names[0]?.toLowerCase()
    const filteredNames = maybeHeader === 'name' ? names.slice(1) : names

    return Array.from(
      new Set(
        filteredNames
          .map((name) => name.trim())
          .filter((name) => name.length > 0)
      )
    )
  }

  const handleCsvUpload = async (file: File | null) => {
    if (!file) return

    const text = await file.text()
    const names = parseCsvText(text)
    if (names.length === 0) {
      setError('No valid student names found in CSV.')
      return
    }

    const existingNames = new Set(students.map((student) => student.name.toLowerCase()))
    const newNames = names.filter(
      (name) => !existingNames.has(name.toLowerCase())
    )

    if (newNames.length === 0) {
      setError('All CSV names already exist in the roster.')
      return
    }

    setLoading(true)
    setError(null)

    const response = await supabase
      .from('students')
      .insert(
        newNames.map((name) => ({
          name,
          checked_in: false,
          bus_number: null,
          is_added_manually: false,
        }))
      )
      .select()

    if (response.error) {
      setError(response.error.message)
    } else if (response.data) {
      setStudents((current) => [...current, ...(response.data as Student[])])
    }

    setLoading(false)
  }

  const handleResetAttendance = async () => {
    const confirmed = window.confirm(
      'Reset attendance for everyone? This will mark all CSV-imported students as not checked in, clear any bus assignments, and remove manually added users.'
    )

    if (!confirmed) return

    setLoading(true)
    setError(null)

    const deleteResponse = await supabase
      .from('students')
      .delete()
      .eq('is_added_manually', true)

    if (deleteResponse.error) {
      setError(deleteResponse.error.message)
      setLoading(false)
      return
    }

    const resetResponse = await supabase
      .from('students')
      .update({ checked_in: false, bus_number: null })
      .eq('is_added_manually', false)
      .select()

    if (resetResponse.error) {
      setError(resetResponse.error.message)
    } else if (resetResponse.data) {
      setStudents(resetResponse.data as Student[])
    }

    setLoading(false)
  }

  return (
    <div className="app-shell">
      <header className="hero-card">
        <div className="hero-copy-block">
          <p className="eyebrow">Camp Bus Role Call</p>
          <h1>Track student boarding across bus 1–3</h1>
          <p className="hero-description">
            Search names with fuzzy suggestions, tick students off as they board,
            or add new riders directly to the current bus.
          </p>
        </div>

        <div className="hero-stats">
          <div className="stat-card">
            <span className="stat-label">All students</span>
            <strong className="stat-value">{students.length}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Checked in</span>
            <strong className="stat-value">{summaryCheckedIn.length}</strong>
          </div>
          <div className="stat-card">
            <span className="stat-label">Added users</span>
            <strong className="stat-value">{summaryAdded.length}</strong>
          </div>
        </div>
      </header>

      <div className="page-nav-wrapper">
        <div className="page-nav">
          <button type="button" className={page === 'home' ? 'nav-active' : ''} onClick={() => setPage('home')}>
            Home
          </button>
          <button type="button" className={page === 'manage' ? 'nav-active' : ''} onClick={() => setPage('manage')}>
            Add / Reset
          </button>
          <button type="button" className={page === 'search' ? 'nav-active' : ''} onClick={() => setPage('search')}>
            Search / Tick
          </button>
          <button type="button" className={page === 'stats' ? 'nav-active' : ''} onClick={() => setPage('stats')}>
            Stats
          </button>
        </div>
        {page !== 'home' ? (
          <div className="page-back">
            <button type="button" onClick={() => setPage('home')}>
              ← Back to home
            </button>
          </div>
        ) : null}
      </div>

      {page === 'home' ? (
        <div className="content-grid home-grid">
          <div className="action-card" onClick={() => setPage('manage')}>
            <h2>Add / Reset</h2>
            <p>Import roster via CSV, manually add students, or reset attendance.</p>
          </div>
          <div className="action-card" onClick={() => setPage('search')}>
            <h2>Search / Tick Off</h2>
            <p>Find students and mark them present on the current bus.</p>
          </div>
          <div className="action-card" onClick={() => setPage('stats')}>
            <h2>View Statistics</h2>
            <p>See attendance totals and manually added names.</p>
          </div>
        </div>
      ) : page === 'manage' ? (
        <div className="content-grid">
          <aside className="sidebar">
            <div className="panel csv-panel">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Import</p>
                  <h2>Load roster from CSV</h2>
                </div>
                <p className="section-note">Upload names to add students without checking them in.</p>
              </div>

              <label className="file-label">
                <input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={(event) => handleCsvUpload(event.target.files?.[0] ?? null)}
                />
                Choose CSV file
              </label>
              <p className="csv-help">First column should contain names. Existing names are skipped.</p>
            </div>

            <div className="panel add-panel">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Manual add</p>
                  <h2>Add a student</h2>
                </div>
                <p className="section-note">Add a student to the roster before boarding.</p>
              </div>

              <label htmlFor="manual-add" className="sr-only">
                Add student name
              </label>
              <input
                id="manual-add"
                value={manualAddName}
                onChange={(event) => setManualAddName(event.target.value)}
                className="search-input"
                placeholder="Type a student name"
              />
              <button
                type="button"
                className="add-button"
                onClick={() => handleManualAddStudent(manualAddName)}
                disabled={!manualAddName.trim() || loading}
              >
                Add student
              </button>
            </div>

            <button type="button" className="reset-button" onClick={handleResetAttendance}>
              Reset attendance
            </button>
          </aside>

          <main className="main-content">
            {error ? <div className="toast error">{error}</div> : null}

            <StudentSearch
              query={searchQuery}
              onQueryChange={setSearchQuery}
              suggestions={suggestions}
              onSelectSuggestion={handleSelectSuggestion}
              selectedBus={selectedBus}
              allowAdd={false}
            />
          </main>
        </div>
      ) : page === 'search' ? (
        <div className="content-grid">
          <aside className="sidebar">
            <div className="bus-info-card">
              <p className="bus-info-label">Current bus</p>
              <strong>Bus {selectedBus}</strong>
              <p className="bus-tip">
                Any student can board any bus. A student is assigned to the current bus only when checked in.
              </p>
            </div>
          </aside>

          <main className="main-content">
            {error ? <div className="toast error">{error}</div> : null}

            <div className="panel summary-panel">
              <div className="section-header">
                <div>
                  <p className="eyebrow">Routing</p>
                  <h2>Switch buses</h2>
                </div>
                <p className="section-note">Choose which bus you're currently working on.</p>
              </div>

              <BusSelector
                buses={busNumbers}
                selectedBus={selectedBus}
                onChange={setSelectedBus}
              />
            </div>

            <StudentSearch
              query={searchQuery}
              onQueryChange={setSearchQuery}
              suggestions={suggestions}
              onSelectSuggestion={handleSelectSuggestion}
              onAddNew={(name) => handleManualAddStudent(name, {
                clearSearch: true,
                checkedIn: true,
                busNumber: selectedBus,
              })}
              canAddNew={canAddNewStudent}
              selectedBus={selectedBus}
              allowAdd={true}
            />

            <AttendanceList
              students={pendingStudents}
              onToggleChecked={handleToggleStudent}
              loading={loading}
            />
          </main>
        </div>
      ) : (
        <div className="content-grid stats-grid">
          <main className="main-content">
            {error ? <div className="toast error">{error}</div> : null}
            <SummaryView
              checkedIn={summaryCheckedIn}
              notCheckedIn={summaryNotCheckedIn}
              addedUsers={summaryAdded}
            />
          </main>
        </div>
      )}
    </div>
  )
}

export default App
