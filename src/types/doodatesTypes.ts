// Types pour système visites guidées (doodates)

export interface Tour {
  id: string
  guideId: string // Always 'all-guides' (tous guides accèdent)
  title: string
  date: string // ISO datetime
  durationMinutes: number
  startLocationLat: number
  startLocationLng: number
  capacity: number
  labels: string[] // Free tags: ['nature', 'architecture', 'enfants']
  status: 'upcoming' | 'ongoing' | 'completed'
  createdAt: string
  updatedAt: string
  deletedAt?: string
  batchDeleteExecuted?: boolean // Idempotency: batch delete already ran
}

export interface Registration {
  id: string
  tourId: string
  email: string
  firstName: string
  lastName: string
  companionFirstName?: string
  companionLastName?: string
  status: 'attente_validation' | 'confirmé' | 'présent' | 'absent' | 'annulé'
  validationToken?: string
  validationExpiresAt?: string
  confirmedAt?: string
  attendedAt?: string
  cancelledAt?: string
  reminder7dSent?: boolean // Q2: Idempotency for 7d reminder
  validation1dSent?: boolean // Q15: Idempotency for 1d validation
  validationDeadline?: string // Q15: Auto-cancel deadline
  createdAt: string
  deletedAt?: string
}

export interface Waitlist {
  id: string
  tourId: string
  email: string
  firstName: string
  lastName: string
  companionFirstName?: string
  companionLastName?: string
  position: number // Q4: Ordering for sequential processing
  invitationToken?: string
  invitationExpiresAt?: string
  invitationSentAt?: string // Q5: Track when offer was sent
  rejectedAt?: string // Q5: Mark if rejected after 24H
  createdAt: string
  deletedAt?: string
}

export interface Attendance {
  id: string
  registrationId: string
  tourId: string
  present: boolean
  markedAt: string
  markedByGuide: string // Always 'all-guides'
}

export interface GuideAccessCode {
  id: string
  code: string
  createdAt: string
  renewalDate: string // Annual renewal Q11
  active: boolean
}

export interface AuditLog {
  id: string
  action: string // 'gdpr_request', 'batch_delete_post_tour', 'guide_code_revoked', 'email_failure_alert'
  details: Record<string, any>
  timestamp: string
}

export type RegistrationStatus = Registration['status']
export type TourStatus = Tour['status']

// Input types for creation
export interface TourCreateInput {
  title: string
  date: string
  durationMinutes: number
  startLocationLat: number
  startLocationLng: number
  capacity: number
  labels: string[]
  guideId?: string
  status?: 'upcoming' | 'ongoing'
}

export interface RegistrationCreateInput {
  tourId: string
  email: string
  firstName: string
  lastName: string
  companionFirstName?: string
  companionLastName?: string
  status?: RegistrationStatus
  validationToken?: string
  validationExpiresAt?: string
}

export interface WaitlistCreateInput {
  tourId: string
  email: string
  firstName: string
  lastName: string
  companionFirstName?: string
  companionLastName?: string
  position: number
  invitationToken?: string
  invitationExpiresAt?: string
}
