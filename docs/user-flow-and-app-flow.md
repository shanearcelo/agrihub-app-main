# AgriHub User Flow and App Flow

This document describes the current user journeys and navigation structure implemented in AgriHub. It is based on the Expo Router screens and layouts in `src/app`.

## 1. User flow

### Entry, onboarding, and account access

```mermaid
flowchart TD
    A[Open AgriHub] --> B{Existing session?}
    B -- Yes --> C[Load profile and role]
    B -- No --> D[Onboarding]
    D --> E[Sign in]
    D --> F[Create account]
    E --> G{Authentication succeeds?}
    G -- No --> E
    G -- Yes --> C
    E --> H[Forgot password]
    H --> E
    F --> I[Choose Campus Buyer or Student Seller]
    I --> J[Enter account details or continue with Google]
    J --> K[Create account]
    K --> L{ID verification required?}
    C --> L
    L -- Yes --> M[Submit student or employee ID]
    M --> N{Seller account?}
    L -- No --> N
    N -- Buyer --> O[Buyer home]
    N -- Seller --> P[Seller dashboard]
    N -- Admin --> Q[Admin overview]
```

The app restores the Supabase session and loads the user's profile before routing. Buyers may be asked to verify an ID when their profile requires it; seller access requires ID information. Admin accounts enter the admin area directly.

### Buyer journey

```mermaid
flowchart TD
    A[Buyer home] --> B[Search and filter harvests]
    A --> C[Browse featured or recent harvests]
    A --> D[View nearby pickup locations]
    B --> E[Harvest details]
    C --> E
    E --> F{Next action}
    F -- Save --> G[Favorites]
    F -- Add to cart --> H[Cart]
    F -- Buy or reserve --> I[Checkout]
    H --> I
    I --> J[Choose pickup venue, date, time, and payment]
    J --> K[Place order]
    K --> L[Order confirmation and pickup QR pass]
    L --> M[View orders]
    L --> N[Open pickup map]
    L --> O[Message seller]
    M --> P[Show QR pass or order details]
    M --> Q[Reorder, rate, or review when available]
    A --> R[Notifications]
    A --> S[Messages]
    A --> T[Profile and settings]
    T --> U[Edit profile, preferences, favorites, history, security]
```

### Seller journey

```mermaid
flowchart TD
    A[Seller dashboard] --> B[Create harvest listing]
    B --> C[Add crop, quantity, pricing, pickup, and payment details]
    C --> D{Save draft or publish?}
    D -- Save draft --> E[Draft listing]
    D -- Publish --> F[Active harvest listing]
    A --> G[Manage pre-orders]
    A --> H[View orders]
    H --> I[Review order and payment details]
    I --> J{Order action}
    J -- GCash --> K[Review uploaded receipt]
    J -- Prepare --> L[Mark ready and notify buyer]
    K --> L
    L --> M[Verify buyer QR pass or enter order code]
    M --> N[Mark order claimed]
    A --> O[Message buyers]
    A --> P[Digital booth subscription and payment history]
    A --> Q[Seller profile]
```

### Admin journey

```mermaid
flowchart TD
    A[Admin overview] --> B[Verify or reject sellers]
    A --> C[Review seller booth-fee payments]
    A --> D[Manage sponsor ads and featured listings]
    A --> E[View analytics and export reports]
    A --> F[Admin profile]
```

## 2. App flow and route structure

```mermaid
flowchart TD
    ROOT[src/app/_layout.tsx<br/>Session and profile bootstrap] --> PUBLIC[Public auth routes]
    ROOT --> BUYER[Buyer tabs]
    ROOT --> SELLER[Seller tabs]
    ROOT --> ADMIN[Admin tabs]

    PUBLIC --> ONBOARD[/auth/onboarding]
    PUBLIC --> LOGIN[/auth/login]
    PUBLIC --> REGISTER[/auth/register]
    PUBLIC --> RESET[/auth/reset-password]
    PUBLIC --> VERIFY[/auth/verify-id]

    LOGIN --> ROLE{Loaded profile role}
    REGISTER --> ROLE
    VERIFY --> ROLE
    ROLE -- buyer --> BUYER
    ROLE -- seller --> SELLER
    ROLE -- admin --> ADMIN

    BUYER --> BHOME[/buyer]
    BUYER --> BSEARCH[/buyer/search]
    BUYER --> BCART[/buyer/cart]
    BUYER --> BMESSAGE[/buyer/message]
    BUYER --> BPROFILE[/buyer/profile]
    BHOME --> BDETAIL[/buyer/harvest/[id]]
    BSEARCH --> BDETAIL
    BDETAIL --> BCART
    BDETAIL --> CHECKOUT[/buyer/checkout]
    BCART --> CHECKOUT
    CHECKOUT --> SUCCESS[/buyer/order-success/[id]]
    BPROFILE --> BSECOND[History, favorites, map, settings,<br/>security, and notifications]

    SELLER --> SHOME[/seller]
    SELLER --> SORDERS[/seller/orders]
    SELLER --> SPOST[/seller/post-harvest]
    SELLER --> SPROFILE[/seller/profile]
    SHOME --> SPRE[/seller/pre-orders]
    SHOME --> SMESSAGE[/seller/messages]
    SHOME --> SSUB[/seller/subscription]

    ADMIN --> AHOME[/admin]
    ADMIN --> AVERIFY[/admin/verification]
    ADMIN --> APAY[/admin/payments]
    ADMIN --> AMON[/admin/monetization]
    ADMIN --> AANALYTICS[/admin/analytics]
    ADMIN --> APROFILE[/admin/profile]

    BUYER -. order conversation .-> CHAT[/chat/[orderId]]
    BPROFILE -. edit account .-> EDIT[/profile/edit]
    SPROFILE -. edit account .-> EDIT
    EDIT -. return to role home .-> ROLE
```

### Navigation notes

- The root layout restores the Supabase session, fetches the profile role, and directs signed-in users to their role area. Unauthenticated users arriving at the app root are sent to onboarding.
- Buyer, seller, and admin areas use bottom-tab navigation. Several buyer and seller screens are nested routes rather than visible tabs.
- The seller layout checks that the current user has the seller role and required ID information before rendering seller tabs.
- Buyer checkout leads to an order confirmation screen with order details and a pickup QR pass. Order/payment options depend on the listing and checkout state.
- `auth/role-select` provides role selection (Campus Buyer or Student Seller), department assignment, and profile completion for newly authenticated Google users before granting access to role dashboards.
