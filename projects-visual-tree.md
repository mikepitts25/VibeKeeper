# Mike Pitts — Project Portfolio Visual Tree

## Mindmap View

```mermaid
mindmap
  root((Mike Pitts<br/>Portfolio))
    🟢 Testing — Ship First
      🧳 Travel
        TravelTipCalc
    🟡 Almost Ready
      🧳 Travel
        DestinationPacker
      🎓 Education
        Colombian-Spanish
      💻 Tech
        FluentIT
      🛠️ Utility
        QuickConvert
      🌶️ Lifestyle
        SpiceSync
      💰 Business
        AImoney
    🔵 In Progress
      🔒 Cybersecurity
        PenTestCollab
    🔴 Decide or Kill
      🧠 Productivity
        MindFlow
      🎮 Games
        GravityFlip
        StackHeist
      💀 Dead
        VibeKeeper
        SkillShareApp
```

## Flowchart View — Status & Dependencies

```mermaid
flowchart TD
    subgraph TESTING["🟢 TESTING — SHIP THESE FIRST"]
        TTC[TravelTipCalc<br/>🧳 TestFlight — Closest to $]
    end

    subgraph ALMOST["🟡 ALMOST READY — Final Polish"]
        DP[DestinationPacker<br/>🧳 Travel packing]
        CS[Colombian-Spanish<br/>🎓 Language learning]
        FI[FluentIT<br/>💻 IT/Tech app]
        QC[QuickConvert<br/>🛠️ Utility converter]
        SS[SpiceSync<br/>🌶️ Lifestyle/Spice]
        AM[AImoney<br/>💰 AI business concept]
    end

    subgraph PROGRESS["🔵 IN PROGRESS — Early Dev"]
        PTC[PenTestCollab<br/>🔒 Just started]
    end

    subgraph STALLED["🔴 STALLED / NOT STARTED"]
        MF[MindFlow<br/>🧠 Productivity]
        GF[GravityFlip<br/>🎮 Game]
        SH[StackHeist<br/>🎮 Game]
    end

    subgraph DEAD["💀 DEAD PROJECTS"]
        VK[VibeKeeper<br/>📊 Tracking]
        SA[SkillShareApp<br/>👥 Social]
    end

    TESTING --> REVENUE["💵 Revenue Stream"]
    ALMOST --> REVENUE
    PROGRESS --> REVENUE
    STALLED --> DECIDE{"❓ Keep or Kill?"}
    DECIDE -- Keep --> BACKLOG["📋 Backlog"]
    DECIDE -- Kill --> ARCHIVE["🗄️ Archive"]
    DEAD --> ARCHIVE

    style TESTING fill:#32CD32,stroke:#006400,stroke-width:3px
    style ALMOST fill:#90EE90,stroke:#228B22,stroke-width:2px
    style PROGRESS fill:#87CEEB,stroke:#4169E1,stroke-width:2px
    style STALLED fill:#FF6B6B,stroke:#DC143C,stroke-width:2px
    style DEAD fill:#808080,stroke:#404040,stroke-width:2px
    style REVENUE fill:#98FB98,stroke:#228B22,stroke-width:2px
```

## Timeline View — Suggested Launch Order

```mermaid
timeline
    title 🚀 Suggested Launch Sequence
    section NOW
        This Week : TravelTipCalc
                  : Submit to App Store
    section Q2 2026
        Week 1-2 : DestinationPacker
                 : Colombian-Spanish
                 : QuickConvert
        Week 3-4 : FluentIT
                 : SpiceSync
                 : AImoney landing page
    section Q3 2026
        July : PenTestCollab MVP
        August : Decide on MindFlow
               : Decide on GravityFlip
               : Decide on StackHeist
    section Q4 2026
        October : Archive or revive stalled projects
                : Double down on winners
```

## Category Breakdown

```mermaid
pie title Projects by Category
    "Travel" : 2
    "Education" : 1
    "Tech/IT" : 1
    "Utility" : 1
    "Lifestyle" : 1
    "Business/AI" : 1
    "Cybersecurity" : 1
    "Productivity" : 1
    "Games" : 2
    "Dead/Archive" : 2
```

## Dependency / Shared Resources Map

```mermaid
flowchart LR
    subgraph SHARED["🔧 Shared Components"]
        UI[UI Kit / Design System]
        API[Backend API]
        AUTH[Auth System]
        PAY[Payments]
    end

    subgraph TRAVEL["🧳 Travel Apps"]
        TTC2[TravelTipCalc]
        DP2[DestinationPacker]
    end

    subgraph EDU["🎓 Education"]
        CS2[Colombian-Spanish]
        FI2[FluentIT]
    end

    subgraph UTIL["🛠️ Utilities"]
        QC2[QuickConvert]
        SS2[SpiceSync]
    end

    UI --> TTC2 & DP2 & CS2 & FI2 & QC2 & SS2
    API --> TTC2 & DP2
    AUTH --> TTC2 & DP2 & CS2
    PAY --> TTC2 & DP2 & AM2[AImoney]

    style SHARED fill:#E6E6FA,stroke:#9370DB,stroke-width:2px
```
