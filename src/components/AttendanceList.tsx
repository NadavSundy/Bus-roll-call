import type { FC } from 'react'
import type { AttendanceRecord, Student, UUID } from '../types'

interface AttendanceListProps {
  students: Student[]
  records: AttendanceRecord[]
  onCheckIn: (studentId: UUID) => void
  onCheckOut: (studentId: UUID) => void
  loading: boolean
  disabled?: boolean
}

const AttendanceList: FC<AttendanceListProps> = ({ students, records, onCheckIn, onCheckOut, loading, disabled = false }) => {
  const recordsByStudent = new Map(records.map((record) => [record.student_id, record]))

  return (
    <div className="panel attendance-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Attendance</p>
          <h2>Session check-ins</h2>
        </div>
        <p className="section-note">Attendance is stored per session, not on roster rows.</p>
      </div>

      {loading ? (
        <div className="loader">Loading attendance...</div>
      ) : students.length === 0 ? (
        <div className="empty-state">No students are loaded for this programme yet.</div>
      ) : (
        <ul className="attendance-list">
          {students.map((student) => {
            const record = recordsByStudent.get(student.id)
            return (
              <li key={student.id} className="attendance-item">
                <button
                  type="button"
                  className="attendance-button"
                  onClick={() => (record ? onCheckOut(student.id) : onCheckIn(student.id))}
                  disabled={disabled}
                >
                  <span className="student-name">{student.name}</span>
                  <span className={`status-pill ${record ? 'checked' : 'not-checked'}`}>
                    {record ? record.bus_label_snapshot : 'Missing'}
                  </span>
                </button>
                {!student.registered_for_programme ? <span className="manual-tag">Walk-on</span> : null}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

export default AttendanceList
