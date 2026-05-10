# Mike Pitts — Project Portfolio Visual Tree

## Mindmap View

```mermaid
mindmap
  root((Mike Pitts<br/>Portfolio))
    🟢 Ship Now
      🧳 Travel
        DestinationPacker
        TravelTipCalc
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
    🟡 In Progress
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
    subgraph ALMOST["🟢 ALMOST READY — Ship These First"]
        DP[DestinationPacker<br/>🧳 Travel packing app]
        CS[Colombian-Spanish<br/>🎓 Language learning]
        FI[FluentIT<br/>💻 IT/Tech app]
        QC[QuickConvert<br/>🛠️ Utility converter]
        SS[SpiceSync<br/>🌶️ Lifestyle/Spice]
        AM[AImoney<br/>💰 AI business concept]
    end

    subgraph TEST["🟡 TESTING / EARLY"]
        TTC[TravelTipCalc<br/>🧳 TestFlight]
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

    ALMOST --> REVENUE["💵 Revenue Stream"]
    TEST --> REVENUE
    STALLED --> DECIDE{"❓ Keep or Kill?"}
    DECIDE -- Keep --> BACKLOG["📋 Backlog"]
    DECIDE -- Kill --> ARCHIVE["🗄️ Archive"]
    DEAD --> ARCHIVE

    style ALMOST fill:#90EE90,stroke:#228B22,stroke-width:2px
    style TEST fill:#FFD700,stroke:#DAA520,stroke-width:2px
    style STALLED fill:#FF6B6B,stroke:#DC143C,stroke-width:2px
    style DEAD fill:#808080,stroke:#404040,stroke-width:2px
    style REVENUE fill:#98FB98,stroke:#228B22,stroke-width:2px
```

## Timeline View — Suggested Launch Order

```mermaid
timeline
    title 🚀 Suggested Launch Sequence
    section Q2 2026
        Week 1-2 : DestinationPacker
                 : Colombian-Spanish
                 : QuickConvert
        Week 3-4 : FluentIT
                 : SpiceSync
                 : AImoney landing page
    section Q3 2026
        July : TravelTipCalc v1.0
             : PenTestCollab MVP
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
        DP2[DestinationPacker]
        TTC2[TravelTipCalc]
    end

    subgraph EDU["🎓 Education"]
        CS2[Colombian-Spanish]
        FI2[FluentIT]
    end

    subgraph UTIL["🛠️ Utilities"]
        QC2[QuickConvert]
        SS2[SpiceSync]
    end

    UI --> DP2 & TTC2 & CS2 & FI2 & QC2 & SS2
    API --> DP2 & TTC2
    AUTH --> DP2 & TTC2 & CS2
    PAY --> DP2 & TTC2 & AM2[AImoney]

    style SHARED fill:#E6E6FA,stroke:#9370DB,stroke-width:2px
```
