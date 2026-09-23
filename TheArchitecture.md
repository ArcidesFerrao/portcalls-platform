================================================================
PORTCALLS — ARQUITETURA GERAL
================================================================

1.  DIVISÃO DE ALTO NÍVEL

                         PORTCALLS
                             │
              ┌──────────────┼──────────────┐
              ▼              ▼              ▼
           PRODUCT       PLATFORM      INFRASTRUCTURE
              │              │              │
        Port Operations   Control Plane   Database
        Documents         Onboarding      Queue
        Finance           Licensing       Cache
        Reporting         Billing         Storage
        Notifications     Tenants         Observability

2.  CONTROL PLANE vs DATA PLANE

                    CONTROL PLANE                    DATA PLANE
                    Evolure-owned                  Customer-specific
                         │                               │
          ┌──────────────┼──────────────┐    ┌───────────┼───────────┐
          ▼              ▼              ▼    ▼           ▼           ▼

    Tenants Billing Licensing Database Storage Integrations
    Contracts Plans Provision PortCalls Documents SharePoint/M365
    Support Payments Access
    Usage Features

3.  DOMÍNIO CENTRAL

Vessel (entidade persistente)
│
│ 1:N
▼
PortCall (escala específica)
│
├── Process (1:N — pode haver múltiplos processos por escala)
│ │
│ ├── Milestone
│ │ status: pending | in_progress | cleared | overdue
│ │ authority: Alfândega | Capitania | Sanidade | ...
│ │
│ └── AuthorityClearance (1:1 com Milestone)
│ requires: Document[]
│
├── Client
├── Invoice
├── Activity
├── Comment
└── Document (anexado a Milestone ou Process)

4. ARQUITETURA MODULAR (BOUNDED CONTEXTS)

PortCalls
│
├── Identity
│ User, Organization, Role, Permission, Session
│
├── Port Operations
│ Vessel, PortCall, Process, Milestone, AuthorityClearance, Client
│
├── Documents
│ Document, StorageAdapter
│
├── Finance
│ Invoice, Payment
│
├── Notifications
│
├── Reporting
│
├── Audit
│ AuditEvent
│
├── Integrations
│ SharePoint, Payments, Email/WhatsApp
│
├── Control Plane
│ Tenants, Billing, Licensing, Onboarding, Provisioning
│
└── Shared Kernel
TenantContext, Outbox, DomainEvents

5. MULTI-TENANCY E ISOLAMENTO

Tenant
│
├── Users
├── PortCalls
├── Clients
├── Documents
├── Invoices
└── Settings

USER → IDENTITY → TENANT MEMBERSHIP → AUTHORIZATION → TENANT DATA

Aplicação: filtro por tenantId em toda query +
Base de dados: Row-Level Security (RLS)

CREATE POLICY tenant_isolation ON portcalls
USING (tenant_id = current_setting('app.tenant_id')::uuid);

        +

Object storage: isolamento por tenant +
(Enterprise) Database/Storage/Aplicação dedicados, sem redesign

6. AUTORIZAÇÃO (PERMISSÕES)

portcall:create / read / update / close
document:read / upload / delete
invoice:read / create
user:manage
billing:manage
settings:manage

Admin → _
Operations → portcall:_, document:_
Finance → invoice:_, document:read
Viewer → \*.read

7.  DOCUMENT SERVICE

                  DOCUMENT SERVICE
                         │
             ┌───────────┴───────────┐
             ▼                       ▼
         Metadata                Storage Adapter
             │                       │
        PostgreSQL      ┌────────────┼────────────┐
                         ▼            ▼            ▼
                    SharePoint       S3          MinIO

Integration Service
│
├── Circuit Breaker (abre após N falhas consecutivas)
├── Cache local de metadados (leitura mesmo com SharePoint em baixo)
└── Fila de retry com idempotência

Document
├── id, tenantId
├── entityType, entityId
├── filename, mimeType, size, checksum
├── storageProvider, storageObjectId
└── createdBy, createdAt

8. CONSISTÊNCIA ENTRE DOMÍNIOS (OUTBOX)

Transação única:
┌───────────────────────────────┐
│ UPDATE portcall SET status=... │
│ INSERT INTO outbox_events │
└───────────────────────────────┘
│
▼
Relay assíncrono
│
▼
Queue
│
┌────────┼────────┐
▼ ▼ ▼
Audit Invoice Notification

Eventos: PortCallCreated, PortCallClosed, MilestoneCompleted,
MilestoneOverdue, DocumentUploaded, DocumentDeleted,
InvoiceCreated, InvoicePaid

9. IDENTIDADE

Identity
│
├── Authentication "Quem és tu?"
└── Authorization "O que podes fazer?"

User
│
└── Membership
├── Organization
└── Role

10. SEGURANÇA (ZERO TRUST)

Every request
│
▼
Authenticate
│
▼
Identify Tenant
│
▼
Authorize Action
│
▼
Validate Input
│
▼
Execute
│
▼
Audit

Encryption in transit / at rest, secret management,
least privilege, rate limiting, CSRF protection,
input/file validation, malware scanning, backup

11. UPLOAD DE FICHEIROS

Upload → Validate MIME → Validate extension → Validate size
→ Safe storage identifier → Malware scan (opcional)
→ Store → Create metadata

12. LICENCIAMENTO (ON-PREMISE)

License
├── customerId, product, deploymentType
├── issuedAt, expiresAt
├── gracePeriodDays
├── renewalPolicy: auto | manual
├── maxUsers, features
└── signature (verificada com chave pública; chave privada nunca sai do Evolure)

ACTIVE → EXPIRING_SOON → GRACE_PERIOD (offline) → EXPIRED (read-only) → REVOKED

13. ENTITLEMENTS

Tenant → Subscription → Entitlements
├── portcalls
├── users
├── reports
├── api
├── integrations
└── advanced_analytics

€99 → basic | €299 → professional | €799 → enterprise
(mesmo sistema para licenças on-premise)

14. ONBOARDING (STATE MACHINE)

LEAD → QUALIFIED → DEMO → PROPOSAL → ACCEPTED → PAYMENT_PENDING
→ PAID → PROVISIONING → CONFIGURATION → INTEGRATION
→ USER_SETUP → TRAINING → READY → LIVE

PROVISIONING: Tenant criado, DB pronta, subscrição ativa
CONFIGURATION: Empresa configurada, SharePoint ligado
READY: Admin criado, utilizadores criados, integração testada, treino concluído

15. PROVISIONAMENTO

Payment Confirmed
│
▼
Provisioning Service
│
├── Create Tenant
├── Create Environment
├── Create Admin
├── Create Entitlements
├── Initialize Configuration
└── Create Onboarding

16. SAAS vs ON-PREMISE

SaaS: On-Premise:
Evolure Customer Infrastructure
│ │
├── PortCalls Application ├── PortCalls Application
├── Control Plane ├── Database
├── Customer Tenant └── Integration → SharePoint
├── Database
└── Integration → Customer SharePoint

(Control plane permanece fora do ambiente do cliente:
licenciamento, subscrição, updates, suporte)

17. CRM / VENDAS (EXTERNO)

CRM externo (HubSpot / Pipedrive)
│
▼ webhook "contract signed"
Provisioning Service (dentro do Control Plane)

18. TRABALHO SÍNCRONO vs ASSÍNCRONO

Síncrono: Create/Edit PortCall, mudança de estado, leitura de dashboard
Assíncrono: upload grande, sync SharePoint, email/WhatsApp,
geração de relatórios, indexação, imports, billing events

User → API → Immediate operation ────────► Database
└─ Background operation → Queue → Worker → External systems

19. OBSERVABILIDADE (COM SLOs)

SLO: 99.5% dos PortCalls criados em <500ms
SLO: 99.9% disponibilidade da API (excluindo SharePoint)
SLO: Sincronização SharePoint em <2min, p95
SLO: Zero eventos de outbox perdidos (reconciliação diária)

Logs, Metrics, Traces, Health Checks, Alerts
Monitorar: latência API/DB, taxa de erro, falhas de queue,
falhas SharePoint, falhas de upload, falhas de autenticação/pagamento

20. DEPLOYMENT

                   Internet
                      │
                 CDN / WAF
                      │
                Load Balancer
                      │
              Application Layer
                │          │
                ▼          ▼
              API       Workers
                │          │
                └────┬─────┘
                     ▼
                  Database
                     │
              ┌──────┴──────┐
              ▼             ▼
           Cache      Object/File Storage

                  Integration Layer
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼

    SharePoint Email Payments

21. ARQUITETURA CONSOLIDADA

                             ┌─────────────────────┐
                             │      WEBSITE        │
                             └──────────┬──────────┘
                                        ▼
                             ┌─────────────────────┐
                             │   CRM EXTERNO       │
                             └──────────┬──────────┘
                                  Contract/Payment
                                        ▼

    ┌─────────────────────────────────────────────────────────┐
    │ CONTROL PLANE │
    │ Identity │ Tenants │ Billing │ Licensing │ Onboarding │
    └──────────────────────────┬──────────────────────────────┘
    Provisioning
    ▼
    ┌─────────────────────────────────────────────────────────┐
    │ PORTCALLS PLATFORM │
    │ ┌───────────┐ ┌────────────┐ ┌─────────────┐ │
    │ │ Identity │ │ Operations │ │ Documents │ │
    │ └───────────┘ └────────────┘ └─────────────┘ │
    │ ┌───────────┐ ┌────────────┐ ┌─────────────┐ │
    │ │ Finance │ │ Reporting │ │Notifications│ │
    │ └───────────┘ └────────────┘ └─────────────┘ │
    │ ┌───────────┐ ┌────────────────────────────┐ │
    │ │ Audit │ │ Outbox / Event Relay │ │
    │ └───────────┘ └────────────────────────────┘ │
    │ ┌─────────────────────────────────────────────────────┐ │
    │ │ Integration Layer (Circuit Breaker + Cache) │ │
    │ └─────────────────────────────────────────────────────┘ │
    │ RLS enforced em todas as tabelas com tenantId │
    └──────────────────────────┬──────────────────────────────┘
    ┌──────────────┼──────────────┐
    ▼ ▼ ▼
    PostgreSQL SharePoint External APIs
