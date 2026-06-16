import type { FC } from 'react'
import type { AttendanceRecord, Student, UUID } from '../types'

interface StudentSearchProps {
  query: string
  onQueryChange: (value: string) => void
  suggestions: Student[]
  records: AttendanceRecord[]
  selectedBusId: UUID | ''
  selectedBusLabel: string
  onSelectSuggestion: (student: Student) => void
  onAddWalkOn?: (name: string) => void
  canAddWalkOn?: boolean
  disabled?: boolean
}

const StudentSearch: FC<StudentSearchProps> = ({
  query,
  onQueryChange,
  suggestions,
  records,
  selectedBusId,
  selectedBusLabel,
  onSelectSuggestion,
  onAddWalkOn,
  canAddWalkOn = false,
  disabled = false,
}) => {
  const checkedStudentIds = new Set(records.map((record) => record.student_id))

  return (
    <div className="panel search-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Roster search</p>
          <h2>Search a student</h2>
        </div>
        <p className="section-note">
          {selectedBusId ? `Selected bus: ${selectedBusLabel}` : 'Choose a bus before checking in.'}
        </p>
      </div>

      <label htmlFor="student-search" className="sr-only">
        Search student by name
      </label>
      <input
        id="student-search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        className="search-input"
        placeholder="Search registered students and walk-ons"
        autoComplete="off"
        disabled={disabled}
      />

      <div className="suggestions-card">
        {query.trim().length === 0 ? (
          <div className="suggestion-empty">
            <p>Start typing a student name to see matches.</p>
          </div>
        ) : suggestions.length > 0 ? (
          <ul className="suggestions-list">
            {suggestions.map((student) => (
              <li key={student.id}>
                <button
                  type="button"
                  className="suggestion-button"
                  onClick={() => onSelectSuggestion(student)}
                  disabled={disabled || !selectedBusId}
                >
                  <span>{student.name}</span>
                  <span className="suggestion-meta">
                    {checkedStudentIds.has(student.id) ? 'Checked in' : 'Missing'}
                    {!student.registered_for_programme ? ' · walk-on' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="suggestion-empty">
            <p>No matching names found.</p>
          </div>
        )}

        {canAddWalkOn && query.trim().length > 1 ? (
          <button type="button" className="add-button" onClick={() => onAddWalkOn?.(query.trim())} disabled={disabled || !selectedBusId}>
            Add "{query.trim()}" as walk-on
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default StudentSearch
