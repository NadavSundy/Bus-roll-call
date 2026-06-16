export type UUID = string

export type SessionStatus = 'open' | 'closed'
export type MemberRole = 'owner' | 'admin' | 'helper'

export interface Group {
  id: UUID
  name: string
  group_code: string
  owner_id: UUID | null
  created_at: string | null
  updated_at?: string | null
}

export interface GroupMember {
  id: UUID
  group_id: UUID
  user_id: UUID
  role: MemberRole
  inserted_at: string | null
}

export interface Bus {
  id: UUID
  group_id: UUID
  label: string
  sort_order: number
  active: boolean
  created_at?: string | null
  updated_at?: string | null
}

export interface Student {
  id: UUID
  group_id: UUID
  name: string
  normalized_name: string
  registered_for_programme: boolean
  imported_at: string | null
  imported_by?: UUID | null
  created_by?: UUID | null
  created_by_name?: string | null
  created_at: string | null
  updated_at?: string | null
}

export interface AttendanceSession {
  id: UUID
  group_id: UUID
  name: string
  status: SessionStatus
  public_checkin_token?: string
  started_at: string | null
  ended_at: string | null
  created_by?: UUID | null
  created_at?: string | null
  updated_at?: string | null
}

export interface AttendanceRecord {
  id: UUID
  session_id: UUID
  student_id: UUID
  bus_id: UUID
  bus_label_snapshot: string
  checked_in_at: string | null
  checked_in_by_user?: UUID | null
  checked_in_by_name?: string | null
  updated_at: string | null
}

export interface PublicSessionPayload {
  group: Pick<Group, 'id' | 'name' | 'group_code'>
  session: Omit<AttendanceSession, 'public_checkin_token'>
  buses: Bus[]
  students: Student[]
  attendance: AttendanceRecord[]
  server_time: string
}

export interface PublicCheckInResult {
  status: 'check_in' | 'move' | 'conflict' | 'checked_out' | 'walk_on_added'
  student_id?: UUID
  bus_id?: UUID
  bus_label?: string
  current_bus_id?: UUID
  current_bus_label?: string
  requested_bus_id?: UUID
  requested_bus_label?: string
}

export interface UserProfile {
  id: UUID
  email: string | null
}

export interface SessionStats {
  totalRegistered: number
  checkedInRegistered: number
  missingRegistered: number
  walkOnsCheckedIn: number
}
