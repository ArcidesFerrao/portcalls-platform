The architecture at the highest level
PORTCALLS PLATFORM
│
┌───────────────┴───────────────┐
│ │
CONTROL PLANE DATA PLANE
Evolure-owned Customer-specific
│ │
┌──────────┼──────────┐ ┌─────────┼──────────┐
│ │ │ │ │ │
Accounts Billing Licensing Database Storage Integrations
Tenants Plans Provision Data Files SharePoint
Contracts Payments Access PortCalls Documents Microsoft 365
Support Usage Features
│
└──────────────┬────────────────┘
│
PortCalls App
│
Customer Users

This distinction is extremely useful.

Control Plane:

The infrastructure knows:

- who the customer is
- what plan they have
- whether they have paid
- how many users they have
- which features they have
- subscription status
- license status
- onboarding status
- support status

Data Plane:

The customer's actual operational information lives here:

- PortCalls
- documents
- operational records
- users
- company-specific configuration
- SharePoint references

For an enterprise customer, this data plane can even live entirely inside their infrastructure.

2. Customer architecture

For a SaaS customer:

                     PORTCALLS CLOUD
                           │
                    ┌──────▼──────┐
                    │ Application │
                    └──────┬──────┘
                           │
                ┌──────────┴──────────┐
                │                     │
          Tenant Database        Integration Layer
                │                     │
                │                     ▼
                │                 SharePoint
                │                     │
                │                     ▼
                │                 Documents
                │
                ▼
         PortCalls Data

For an enterprise customer:

                 CUSTOMER INFRASTRUCTURE

        ┌───────────────────────────────────┐
        │                                   │
        │          PortCalls                │
        │             │                     │
        │      ┌──────┴──────┐              │
        │      │             │              │
        │   Database     Integration        │
        │                     │              │
        │                     ▼              │
        │                 SharePoint        │
        │                                   │
        └───────────────────────────────────┘

Same application.

Different deployment model.

3. SharePoint is not part of the core domain

This is an important architectural principle.

Your business model should not think:

PortCall → SharePointFile

It should think:

PortCall → Document

Then:

Document
│
└── StorageProvider
│
├── SharePoint
├── S3
├── Azure Blob
├── MinIO
└── Other

So your core application doesn't care where a document physically lives.

                    DOCUMENT
                       │
               Storage Abstraction
                       │
          ┌────────────┼────────────┐
          │            │            │
     SharePoint       S3         MinIO

For your current customer:

Document
↓
SharePoint
↓
Existing shared library/folder

For another customer:

Document
↓
Azure Blob

For an on-premise customer:

Document
↓
MinIO / NAS / SharePoint

That makes the platform considerably more reusable.

4. The core domain

The center of the system should be the Port Call, not users, documents or billing.

I'd structure the domain approximately like this:

PortCall
│
├── Vessel / Ship
│
├── Client
│
├── Process
│
├── Milestones
│
├── Documents
│
├── Authority Allowances
│
├── Invoices
│
├── Activities
│
├── Comments
│
└── Audit History

Then separate the commercial domain:

Customer
│
├── Subscription
├── Plan
├── Contract
├── License
├── Billing
└── Usage

And identity:

Identity
│
├── User
├── Organization
├── Role
├── Permission
└── Session

These domains should interact through well-defined interfaces rather than becoming one giant database model.

5. Domain architecture

A modular architecture:

PortCalls
│
├── Identity
│
├── Organizations
│
├── Port Operations
│ ├── PortCalls
│ ├── Vessels
│ ├── Clients
│ ├── Milestones
│ └── Processes
│
├── Documents
│
├── Finance
│ ├── Invoices
│ └── Payments
│
├── Notifications
│
├── Reporting
│
├── Integrations
│ └── SharePoint
│
├── Administration
│
├── Licensing
│
└── Billing

This is much better than organizing the entire application around UI pages.

6. Multi-tenancy

For SaaS, every customer is an Organization/Tenant.

Tenant
│
├── Users
├── PortCalls
├── Clients
├── Documents
├── Invoices
├── Settings
└── Integrations

Every tenant-owned record contains a tenant boundary:

PortCall
├── id
├── tenantId
├── ...

Same for:

Document
Invoice
Client
Milestone
Activity

Then the most important security rule in the entire platform becomes:

USER
↓
IDENTITY
↓
TENANT MEMBERSHIP
↓
AUTHORIZATION
↓
TENANT DATA

A user must never be able to access data simply because they know another record's ID.

7. Tenant isolation

For SaaS, I would initially use:

Shared application
PortCalls
│
┌───────────┼───────────┐
│ │ │
Tenant A Tenant B Tenant C

But enforce isolation at multiple levels:

Application authorization +
Database tenant filtering +
Database-level policies where appropriate +
Object-storage isolation

For larger enterprise customers, you can later offer:

Dedicated Database
Dedicated Storage
Dedicated Application

without redesigning the product.

8. Identity architecture

Identity
│
├── Authentication
│ "Who are you?"
│
└── Authorization
"What are you allowed to do?"

Then:

User
│
└── Membership
│
├── Organization
└── Role

Example:

John
│
└── ABC Shipping
│
└── Operations Manager

This allows one person eventually to belong to multiple organizations.

9. Authorization

Don't hard-code:

if user.role === "admin"

everywhere.

Use permissions:

portcall:create
portcall:read
portcall:update
portcall:close

document:read
document:upload
document:delete

invoice:read
invoice:create

user:manage
billing:manage
settings:manage

Roles become collections of permissions.

Admin
├── \*

Operations
├── portcall:_
├── document:_

Finance
├── invoice:\*
└── document:read

Viewer
└── \*.read

This will save you a lot of pain when enterprise customers start asking for weird-but-reasonable permission structures.

10. Document architecture

This deserves its own subsystem.

                  DOCUMENT SERVICE
                         │
             ┌───────────┴───────────┐
             │                       │
         Metadata                Storage
             │                       │
        PostgreSQL             Storage Adapter
                                     │
                    ┌────────────────┼───────────────┐
                    │                │               │
               SharePoint          S3              MinIO

The database stores:

Document
├── id
├── tenantId
├── entityType
├── entityId
├── filename
├── mimeType
├── size
├── checksum
├── storageProvider
├── storageObjectId
├── createdBy
└── createdAt

The actual file stays outside the database.

11. SharePoint integration

For a specific customer:

PortCalls
│
▼
Integration Service
│
▼
Microsoft Graph
│
▼
SharePoint
│
▼
Existing Document Library

The customer configures:

SharePoint Site
Document Library
Root Folder

But the system should ideally resolve those into stable identifiers:

siteId
driveId
folderId

rather than repeatedly depending on human-readable URLs.

So configuration becomes:

SharePointConnection
├── tenantId
├── provider
├── siteId
├── driveId
├── rootFolderId
└── credentialsReference

This is considerably more robust.

12. Don't store Microsoft credentials casually

Never make the customer enter something like:

username
password

and then store it in your database.

Instead use an application identity / OAuth-based authorization mechanism appropriate to the customer's Microsoft 365 environment.

The architecture should look like:

PortCalls
│
▼
Identity / Credential Manager
│
▼
Microsoft Authorization
│
▼
Graph API
│
▼
SharePoint

Secrets should be encrypted and preferably kept in a dedicated secret-management system rather than ordinary application tables.

13. API architecture

I'd use an API-first internal architecture even if the first UI is a web application.

                 Client Applications
                 │        │        │
                 ▼        ▼        ▼
               Web      Mobile    API
                 │        │        │
                 └────┬───┴────────┘
                      ▼
                 API Gateway
                      │
        ┌─────────────┼─────────────┐
        ▼             ▼             ▼

Port Calls Documents Identity
│ │
▼ ▼
Database Storage

This gives me a future path toward:

Mobile app
Customer integrations
Partner API
Automation
AI

without rebuilding the core.

14. Synchronous vs asynchronous work

This is critical for making the platform feel fast.

Don't make the user wait for everything.

Synchronous

Things that should happen immediately:

Create PortCall
Edit PortCall
Change status
Read dashboard
Read details
Asynchronous

Things that should happen in the background:

Large file upload
SharePoint synchronization
Email
WhatsApp
Report generation
Document indexing
Data imports
Analytics
Billing events
Scheduled notifications

Architecture:

User
│
▼
API
│
├── Immediate operation ───────► Database
│
└── Background operation
│
▼
Queue
│
┌─────┼─────┐
▼ ▼ ▼
Worker Worker Worker
│
▼
External systems

15. Event architecture

I'd introduce domain events early, even if you don't initially build a huge event-driven system.

For example:

PortCallCreated
PortCallUpdated
PortCallClosed

DocumentUploaded
DocumentDeleted

InvoiceCreated
InvoicePaid

MilestoneCompleted
MilestoneOverdue

Then:

PortCallClosed
│
├── Audit
├── Notification
├── Analytics
└── Integration

The PortCall service doesn't need to know that five other things happen after closing a process.

16. Audit architecture

Every important action should generate an audit event.

AuditEvent
├── id
├── tenantId
├── actorId
├── action
├── entityType
├── entityId
├── timestamp
├── IP
└── metadata

Example:

John Smith
23 Sep 2026 10:42

UPDATE_PORTCALL

PortCall:
PC-2026-0015

Status:
OPEN → CLOSED

This becomes essential for enterprise customers.

17. Billing architecture

Billing should be independent from PortCall operations.

Billing
│
├── Customer
├── Plan
├── Subscription
├── Invoice
├── Payment
├── Entitlement
└── Usage

The application should ask:

"Does this tenant have permission to use feature X?"

rather than:

"Is this customer on the €299 plan?"

That's a subtle but very important architectural difference.

18. Entitlements

Example:

Tenant
│
▼
Subscription
│
▼
Entitlements
│
├── portcalls
├── users
├── billing
├── reports
├── api
├── integrations
└── advanced_analytics

Then:

€99 plan
↓
basic entitlements

€299 plan
↓
professional entitlements

€799 plan
↓
enterprise entitlements

On-premise licenses can use exactly the same entitlement system.

19. Commercial platform architecture

The sales process you described should actually be its own domain.

Sales
│
├── Lead
├── Opportunity
├── Demo
├── Qualification
├── Proposal
├── Contract
└── Customer

Then:

Customer
│
├── Subscription
├── Tenant
├── License
└── Onboarding

This means you can eventually manage the entire PortCalls business from an internal admin platform.

20. Onboarding engine

Instead of manually configuring every customer, build an onboarding state machine.

LEAD
↓
QUALIFIED
↓
DEMO
↓
PROPOSAL
↓
ACCEPTED
↓
PAYMENT_PENDING
↓
PAID
↓
PROVISIONING
↓
CONFIGURATION
↓
INTEGRATION
↓
USER_SETUP
↓
TRAINING
↓
READY
↓
LIVE

Every state has required conditions.

For example:

PROVISIONING
│
├── Tenant created
├── Database ready
└── Subscription active

CONFIGURATION
│
├── Company configured
└── SharePoint connected

READY
│
├── Admin created
├── Users created
├── Integration tested
└── Training completed

This prevents onboarding from becoming a collection of WhatsApp messages and spreadsheets.

21. Provisioning

When payment succeeds:

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

Then the customer receives:

"Your PortCalls environment is ready."

with a setup link.

22. SaaS vs On-Premise

The beautiful part is that the business architecture stays the same.

SaaS
Evolure
│
├── PortCalls Application
├── Control Plane
├── Customer Tenant
├── Database
└── Integration
↓
Customer SharePoint

On-Premise
Customer
│
├── PortCalls Application
├── Database
└── Integration
↓
Customer SharePoint

The control plane can remain outside the customer's environment for:

license management
subscription management
updates
support

or, for extremely sensitive customers, those capabilities can be packaged differently.

23. On-premise licensing

I would make the license a signed capability document.

Conceptually:

License
├── customerId
├── product
├── deploymentType
├── issuedAt
├── expiresAt
├── maxUsers
├── features
└── signature

The application verifies the signature using a public key.

The private signing key never exists in the customer installation.

24. Security architecture

I'd design around zero trust rather than "the customer is inside our network, therefore everything is trusted."

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

And:

Encryption in transit
Encryption at rest
Secret management
Least privilege
Tenant isolation
Rate limiting
CSRF protection where applicable
Secure headers
Input validation
File validation
Malware scanning where required
Audit logging
Backup
Restore testing 25. File security

Because PortCalls handles business documents, I'd have:

Upload
↓
Validate MIME
↓
Validate extension
↓
Validate size
↓
Generate safe storage identifier
↓
Optional malware scan
↓
Store
↓
Create metadata

Never trust:

invoice.pdf
../../something
evil.exe

just because the filename says so.

26. Database architecture

I would not make the database a giant collection of unrelated tables.

Use bounded domains:

Identity
Organizations
Operations
Documents
Finance
Billing
Audit
Integrations
Notifications

Conceptually:

                    DATABASE
                       │
       ┌───────────────┼────────────────┐
       │               │                │
    Identity       Operations        Documents
       │               │                │
    Users          PortCalls         Metadata
    Roles          Milestones
    Tenants        Clients
                       │
                 ┌─────┴─────┐
                 │           │
              Finance      Audit

27. Caching

Not everything needs to hit PostgreSQL.

Cache things such as:

Tenant configuration
Feature entitlements
Dashboard aggregates
Reference data
Integration metadata

But don't prematurely cache transactional data.

The rule should be:

Database is the source of truth; cache is an optimization.

28. Dashboard architecture

The dashboard should not calculate everything from thousands of PortCalls every time the user opens it.

Eventually:

PortCalls
│
▼
Events
│
▼
Analytics/Aggregation
│
▼
Dashboard Metrics

For example:

Total Port Calls
Open Port Calls
Completed
Overdue
Average Processing Time
Invoices Pending

can be maintained as optimized aggregates.

29. Observability

You need to know when something breaks before the customer tells you.

The platform should have:

Logs
Metrics
Traces
Health Checks
Alerts

Monitor:

API latency
Database latency
Error rate
Queue failures
SharePoint failures
File upload failures
Authentication failures
Payment failures
Background jobs

Then:

SharePoint API
X
│
▼
Alert
│
▼
Operations team

instead of discovering it three hours later from a customer email.

30. Backup architecture

For customer operational data:

Primary Database
│
├── Automated backups
├── Point-in-time recovery
└── Disaster recovery

But remember:

SharePoint documents are a separate concern.

Your platform should clearly define whether the customer's existing Microsoft 365/SharePoint policies constitute the document backup strategy.

You don't want the contract to ambiguously imply:

"PortCalls backs up your SharePoint."

unless you actually provide that service.

31. Deployment architecture

For SaaS:

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
           Cache         Object/File
                         Storage

External integrations:

                  Integration Layer
                         │
          ┌──────────────┼──────────────┐
          ▼              ▼              ▼
     SharePoint       Email          Payments

33. Recommended complete architecture

Putting everything together:

                         ┌─────────────────────┐
                         │      WEBSITE        │
                         │ Demo / Pricing      │
                         └──────────┬──────────┘
                                    │
                                    ▼
                         ┌─────────────────────┐
                         │   SALES / CRM       │
                         │ Leads / Proposals   │
                         └──────────┬──────────┘
                                    │
                              Contract/Payment
                                    │
                                    ▼

┌─────────────────────────────────────────────────────────┐
│ CONTROL PLANE │
│ │
│ Identity │ Tenants │ Billing │ Licensing │ Onboarding │
│ │
└──────────────────────────┬──────────────────────────────┘
│
Provisioning
│
▼
┌─────────────────────────────────────────────────────────┐
│ PORTCALLS PLATFORM │
│ │
│ ┌───────────┐ ┌────────────┐ ┌─────────────┐ │
│ │ Identity │ │ Operations │ │ Documents │ │
│ └───────────┘ └────────────┘ └─────────────┘ │
│ │
│ ┌───────────┐ ┌────────────┐ ┌─────────────┐ │
│ │ Finance │ │ Reporting │ │ Notifications│ │
│ └───────────┘ └────────────┘ └─────────────┘ │
│ │
│ ┌─────────────────────────────────────────────────────┐ │
│ │ Integration Layer │ │
│ └─────────────────────────────────────────────────────┘ │
└──────────────────────────┬──────────────────────────────┘
│
┌─────────────┼─────────────┐
│ │ │
▼ ▼ ▼
PostgreSQL SharePoint External APIs
Customer Data Documents Payments/etc.

34. The customer journey inside this architecture

The entire process you described becomes:

1. REQUEST DEMO
   ↓
2. LEAD
   ↓
3. QUALIFICATION
   ↓
4. DEMO
   ↓
5. TECHNICAL DISCOVERY
   ↓
6. PLAN SELECTION
   ↓
7. PROPOSAL
   ↓
8. CONTRACT
   ↓
9. PAYMENT
   ↓
10. CUSTOMER CREATED
    ↓
11. TENANT PROVISIONED
    ↓
12. SETUP WIZARD
    ↓
13. SHAREPOINT CONNECTED
    ↓
14. USERS CONFIGURED
    ↓
15. DATA IMPORT / INITIAL CONFIG
    ↓
16. TRAINING
    ↓
17. GO LIVE
    ↓
18. DAILY OPERATIONS
    ↓
19. BILLING
    ↓
20. SUPPORT
    ↓
21. RENEWAL

The key is that each arrow represents a controlled state transition, rather than a manual collection of unrelated steps.

35. The three products you're actually building

One reason this architecture matters is that PortCalls is really three systems:

1. The product
   PortCalls

What the customer uses every day.

2. The platform
   Tenants
   Identity
   Billing
   Licensing
   Provisioning
   Integrations

What allows you to sell PortCalls repeatedly.

3. The infrastructure
   Database
   Storage
   Queues
   Backups
   Monitoring
   Deployment

What makes the platform reliable.

So the actual architecture is:

                 PORTCALLS
                     │
        ┌────────────┼────────────┐
        ▼            ▼            ▼
     PRODUCT      PLATFORM    INFRASTRUCTURE
        │            │            │

Operations SaaS Deployment
Documents Billing Database
Processes License Storage
Dashboard Tenants Backups
Users Monitoring
Onboarding

That is the architecture I would build toward.
