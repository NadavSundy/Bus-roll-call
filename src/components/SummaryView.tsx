import type { FC } from 'react'
import type { AttendanceRecord, Bus, Student } from '../types'

interface SummaryViewProps {
  students: Student[]
  records: AttendanceRecord[]
  buses: Bus[]
}

const SummaryView: FC<SummaryViewProps> = ({ students, records, buses }) => {
  const checkedStudentIds = new Set(records.map((record) => record.student_id))
  const registered = students.filter((student) => student.registered_for_programme)
  const missing = registered.filter((student) => !checkedStudentIds.has(student.id))
  const walkOns = students.filter((student) => !student.registered_for_programme && checkedStudentIds.has(student.id))

  return (
    <div className="panel summary-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Summary</p>
          <h2>Attendance overview</h2>
        </div>
        <p className="section-note">Totals are calculated from session attendance records.</p>
      </div>

      <div className="summary-grid">
        <article className="summary-card">
          <h3>Checked in</h3>
          <p className="summary-count">{registered.length - missing.length}</p>
          <ul>
            {records.slice(0, 8).map((record) => {
              const student = students.find((item) => item.id === record.student_id)
              return <li key={record.id}>{student?.name ?? 'Unknown'} ({record.bus_label_snapshot})</li>
            })}
          </ul>
        </article>

        <article className="summary-card">
          <h3>Missing</h3>
          <p className="summary-count">{missing.length}</p>
          <ul>
            {missing.slice(0, 8).map((student) => (
              <li key={student.id}>{student.name}</li>
            ))}
          </ul>
        </article>

        <article className="summary-card">
          <h3>Bus counts</h3>
          <p className="summary-count">{records.length}</p>
          <ul>
            {buses.map((bus) => (
              <li key={bus.id}>{bus.label}: {records.filter((record) => record.bus_id === bus.id).length}</li>
            ))}
            <li>Walk-ons: {walkOns.length}</li>
          </ul>
        </article>
      </div>
    </div>
  )
}

export default SummaryView
