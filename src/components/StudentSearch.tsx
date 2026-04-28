import type { FC } from 'react'
import type { Student } from '../types'

interface StudentSearchProps {
  query: string
  onQueryChange: (value: string) => void
  suggestions: Student[]
  onSelectSuggestion: (student: Student) => void
  onAddNew?: (name: string) => void
  canAddNew?: boolean
  selectedBus: number
  allowAdd?: boolean
}

const StudentSearch: FC<StudentSearchProps> = ({
  query,
  onQueryChange,
  suggestions,
  onSelectSuggestion,
  onAddNew,
  canAddNew = false,
  selectedBus,
  allowAdd = false,
}) => {
  return (
    <div className="panel search-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Step 1</p>
          <h2>Search a student</h2>
        </div>
        <p className="section-note">Type the name to see suggestions or add a new rider.</p>
      </div>

      <label htmlFor="student-search" className="sr-only">
        Search student by name
      </label>
      <input
        id="student-search"
        value={query}
        onChange={(event) => onQueryChange(event.target.value)}
        className="search-input"
        placeholder="Search or add a student"
        autoComplete="off"
      />

      <div className="suggestions-card">
        {query.trim().length === 0 ? (
          <div className="suggestion-empty">
            <p>Start typing a student name to see fuzzy suggestions for Bus {selectedBus}.</p>
          </div>
        ) : suggestions.length > 0 ? (
          <ul className="suggestions-list">
            {suggestions.map((student) => (
              <li key={student.id}>
                <button
                  type="button"
                  className="suggestion-button"
                  onClick={() => onSelectSuggestion(student)}
                >
                  <span>{student.name}</span>
                  <span className="suggestion-meta">
                    {student.checked_in ? 'Already ticked' : 'Tick off'}
                    {student.is_added_manually ? ' · added' : ''}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="suggestion-empty">
            <p>No matching names found for bus {selectedBus}.</p>
          </div>
        )}

        {allowAdd && canAddNew && query.trim().length > 1 ? (
          <button
            type="button"
            className="add-button"
            onClick={() => onAddNew?.(query.trim())}
          >
            Add "{query.trim()}" to the roster
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default StudentSearch
