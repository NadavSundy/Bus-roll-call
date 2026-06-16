import type { FC } from 'react'

interface GroupJoinPanelProps {
  joinCode: string
  onJoinCodeChange: (value: string) => void
  onJoinGroup: () => void
  loading: boolean
}

const GroupJoinPanel: FC<GroupJoinPanelProps> = ({ joinCode, onJoinCodeChange, onJoinGroup, loading }) => {
  return (
    <div className="panel join-panel">
      <div className="section-header">
        <div>
          <p className="eyebrow">Join a group</p>
          <h2>Enter a 6-character group code</h2>
        </div>
      </div>

      <div className="group-code-row">
        <input
          type="text"
          value={joinCode}
          onChange={(event) => onJoinCodeChange(event.target.value.toUpperCase())}
          placeholder="ABC123"
          maxLength={6}
          className="search-input"
        />
        <button type="button" className="primary-button" onClick={onJoinGroup} disabled={joinCode.trim().length !== 6 || loading}>
          Join
        </button>
      </div>

      <p className="section-note">Share this group code with others to let them open the same group directly.</p>
    </div>
  )
}

export default GroupJoinPanel
