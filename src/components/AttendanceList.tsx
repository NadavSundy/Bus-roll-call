import type { FC } from 'react'
import type { Student } from '../types'

interface AttendanceListProps {
  students: Student[]
  onToggleChecked: (studentId: number, checked: boolean) => void
  loading: boolean
}

const AttendanceList: FC<AttendanceListProps> = ({ students, onToggleChecked, loading }) => {
  return (
    <div className="panel attendance-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Step 2</p>
          <h2>Tick students off</h2>
        </div>
        <p className="section-note">Click any student to mark them present or absent.</p>
      </div>

      {loading ? (
        <div className="loader">Loading attendance...</div>
      ) : students.length === 0 ? (
        <div className="empty-state">No students are loaded for this bus yet.</div>
      ) : (
        <ul className="attendance-list">
          {students.map((student) => (
            <li key={student.id} className="attendance-item">
              <button
                type="button"
                className="attendance-button"
                onClick={() => onToggleChecked(student.id, !student.checked_in)}
              >
                <span className="student-name">{student.name}</span>
                <span
                  className={`status-pill ${student.checked_in ? 'checked' : 'not-checked'}`}
                >
                  {student.checked_in ? 'Present' : 'Not present'}
                </span>
              </button>
              {student.is_added_manually ? <span className="manual-tag">Added</span> : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default AttendanceList
