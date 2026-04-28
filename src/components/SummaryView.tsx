import type { FC } from 'react'
import type { Student } from '../types'

interface SummaryViewProps {
  checkedIn: Student[]
  notCheckedIn: Student[]
  addedUsers: Student[]
}

const SummaryView: FC<SummaryViewProps> = ({ checkedIn, notCheckedIn, addedUsers }) => {
  return (
    <div className="panel summary-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Summary</p>
          <h2>Attendance overview</h2>
        </div>
        <p className="section-note">Totals combine every bus and any manually added students.</p>
      </div>

      <div className="summary-grid">
        <article className="summary-card">
          <h3>Checked in</h3>
          <p className="summary-count">{checkedIn.length}</p>
          <ul>
            {checkedIn.slice(0, 8).map((student) => (
              <li key={student.id}>{student.name} (Bus {student.bus_number})</li>
            ))}
          </ul>
        </article>

        <article className="summary-card">
          <h3>Not checked in</h3>
          <p className="summary-count">{notCheckedIn.length}</p>
          <ul>
            {notCheckedIn.slice(0, 8).map((student) => (
              <li key={student.id}>{student.name} (Bus {student.bus_number})</li>
            ))}
          </ul>
        </article>

        <article className="summary-card">
          <h3>Added users</h3>
          <p className="summary-count">{addedUsers.length}</p>
          <ul>
            {addedUsers.slice(0, 8).map((student) => (
              <li key={student.id}>{student.name} (Bus {student.bus_number})</li>
            ))}
          </ul>
        </article>
      </div>
    </div>
  )
}

export default SummaryView
