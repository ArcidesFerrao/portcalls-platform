portcalls/
├── apps/
│ ├── web/
│ │ ├── app/
│ │ │ ├── (dashboard)/
│ │ │ │ ├── portcalls/
│ │ │ │ ├── vessels/
│ │ │ │ ├── clients/
│ │ │ │ ├── documents/
│ │ │ │ ├── invoices/
│ │ │ │ ├── settings/
│ │ │ │ └── admin/
│ │ │ ├── (auth)/
│ │ │ ├── api/
│ │ │ │ ├── v1/
│ │ │ │ └── webhooks/
│ │ │ └── layout.tsx
│ │ └── components/
│ │
│ └── workers/
│ ├── sharepoint-sync/
│ ├── outbox-relay/
│ ├── notifications/
│ └── report-generation/
│
├── packages/
│ ├── domain/
│ │ ├── identity/
│ │ │ ├── entities/ # User, Organization, Role, Permission, Session
│ │ │ ├── services/
│ │ │ └── repositories/
│ │ │
│ │ ├── port-operations/
│ │ │ ├── entities/ # Vessel, PortCall, Process, Milestone, AuthorityClearance, Client
│ │ │ ├── services/
│ │ │ ├── events/ # PortCallCreated, PortCallClosed, MilestoneCompleted, MilestoneOverdue
│ │ │ └── repositories/
│ │ │
│ │ ├── documents/
│ │ │ ├── entities/ # Document
│ │ │ ├── storage-adapters/ # sharepoint, s3, minio
│ │ │ ├── services/
│ │ │ └── repositories/
│ │ │
│ │ ├── finance/
│ │ │ ├── entities/ # Invoice, Payment
│ │ │ ├── services/
│ │ │ └── repositories/
│ │ │
│ │ ├── notifications/
│ │ ├── reporting/
│ │ ├── audit/
│ │ │ └── entities/ # AuditEvent
│ │ │
│ │ └── shared-kernel/
│ │ ├── tenant-context/
│ │ ├── outbox/
│ │ └── events/
│ │
│ ├── control-plane/
│ │ ├── tenants/
│ │ ├── billing/
│ │ │ └── entities/ # Subscription, Plan, Entitlement, Usage
│ │ ├── licensing/
│ │ │ ├── entities/ # License
│ │ │ ├── signing/
│ │ │ └── lifecycle/ # grace-period, renewal, revocation
│ │ ├── onboarding/
│ │ │ └── state-machine/
│ │ └── provisioning/
│ │
│ ├── integrations/
│ │ ├── sharepoint/
│ │ │ ├── graph-client/
│ │ │ ├── circuit-breaker/
│ │ │ └── cache/
│ │ ├── payments/
│ │ └── notifications-channel/ # email, whatsapp
│ │
│ ├── infra/
│ │ ├── database/
│ │ │ ├── prisma/
│ │ │ │ └── schema.prisma
│ │ │ └── rls-policies/
│ │ ├── queue/
│ │ ├── cache/
│ │ ├── storage/
│ │ └── observability/
│ │ ├── logging/
│ │ ├── metrics/
│ │ └── alerts/
│ │
│ └── shared/
│ ├── auth/
│ ├── permissions/
│ └── types/
│
├── docs/
│ ├── architecture/
│ └── slos/
│
└── infra-as-code/
├── deployment/
└── secrets/
